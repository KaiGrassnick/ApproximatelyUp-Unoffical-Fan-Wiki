import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  Box3m,
  cablePoints,
  clampDistance as clampToBox,
  homeOrbit,
  partTransform,
  sceneBounds,
} from '../../core/circuits/circuit-scene';
import { MeshData, MeshFile } from '../../core/circuits/mesh-file';
import { CELL_M, Catalog, PlacedCircuit } from '../../core/circuits/model';
import { buildCatalog } from '../../core/circuits/parts';
import { LaidText, layoutTexts } from '../../core/circuits/text-layout';
import { DataService } from '../../core/data.service';
import { WorldService } from '../../core/world.service';
import { Orbit, cameraPosition, clampPitch, orbitFrom, wrapYaw } from '../galaxy/orbit';

/** Pointer travel, in px, past which a press is an orbit and not a click. */
const DRAG_SLOP = 4;
/** Cells of panel around the circuit, the SVG's margin. */
const MARGIN_CELLS = 3;
/** One grid line every this many cells, as the SVG rules its panel. */
const GRID_EVERY = 8;
/** Where the light comes from, relative to the circuit's centre: the SVG's LIGHT. */
const LIGHT = [-0.3, 1, -0.6] as const;
/** The game's glyph material renders near-black whatever its vertex colour. */
const GLYPH = 0x181818;
/** A part the mesh file does not know is drawn as a plain grey box. */
const FALLBACK_HEX = 'b3b3b3';
/** Each zoom step closes 18% of the distance, the galaxy's rate. */
const DOLLY_STEP = 0.82;
/** The camera's vertical field of view; a pan's pixel-to-metre rate comes from it. */
const FOV_DEG = 38;
/** How far the orbit target may wander from the circuit's centre, in bbox diagonals. */
const PAN_LIMIT = 1.5;
/** A key press pans this fraction of the camera distance. */
const PAN_KEY_STEP = 0.12;

type V3 = [number, number, number];

/**
 * The camera's screen axes for an orbit: what "right" and "up" on the canvas
 * mean in the world, so a pan moves the scene the way the pointer moved. The
 * eye is on the orbit sphere looking at its centre, so forward is minus the
 * eye direction and the rest is two cross products with world up.
 */
export function screenAxes(o: Orbit): { right: V3; up: V3 } {
  const e = cameraPosition(o);
  const len = Math.hypot(e.x, e.y, e.z) || 1;
  const f: V3 = [-e.x / len, -e.y / len, -e.z / len];
  // right = forward x worldUp, degenerate only when looking straight down,
  // which clampPitch already forbids.
  const r: V3 = [f[1] * 0 - f[2] * 1, f[2] * 0 - f[0] * 0, f[0] * 1 - f[1] * 0];
  const rl = Math.hypot(r[0], r[1], r[2]) || 1;
  const right: V3 = [r[0] / rl, r[1] / rl, r[2] / rl];
  const up: V3 = [
    right[1] * f[2] - right[2] * f[1],
    right[2] * f[0] - right[0] * f[2],
    right[0] * f[1] - right[1] * f[0],
  ];
  return { right, up };
}
/** Pixels of canvas per metre of text: 64 px for a glyph's line, plenty for a readout. */
const TEXT_PX = 64;
/** A text in the plane one millimetre above its surface, so it never z-fights the face it sits on. */
const TEXT_LIFT = 0.001;

const rad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * One part's hit area, in CSS pixels over the canvas.
 *
 * The blocks are WebGL; the things you can hover, click, tab to and read are
 * ordinary DOM anchors laid over them, projected onto the canvas every frame
 * -- the galaxy map's arrangement, for the same reasons: every part stays a
 * real <a routerLink> with a real label, so the scene is keyboard-reachable
 * and its links behave like links, with or without a GL context.
 */
export interface Marker {
  id: string;
  type: string;
  label: string;
  value: string;
  /** The author's note under the block in the picture, e.g. "ERR > 0". */
  tag: string;
  /** The part's mode, drawn under the note the way the picture draws it. */
  mode: string;
  /** The reader may see this part: it is named and linked. */
  listed: boolean;
  x: number;
  y: number;
  /** Painter's-order z-index: nearer parts take the hover and the click. */
  order: number;
  /** Nearly behind the camera: drawn dim so it does not claim a place it is not at. */
  far: boolean;
}

interface Gfx {
  three: typeof import('three');
  renderer: import('three').WebGLRenderer | null;
  scene: import('three').Scene;
  camera: import('three').PerspectiveCamera;
  /**
   * The circuit's root. Everything built goes under it, so one transform puts
   * the bounding-box centre at the orbit target and mirrors x (see build()).
   */
  root: import('three').Group;
  /** Where each part's centre is, world space, for the markers. */
  centres: {
    id: string;
    type: string;
    value: string;
    tag: string;
    mode: string;
    at: import('three').Vector3;
  }[];
  /** Everything built from the current inputs, disposed together on rebuild. */
  built: import('three').Object3D[];
  disposables: { dispose(): void }[];
}

@Component({
  selector: 'circuit-3d',
  imports: [RouterLink],
  templateUrl: './circuit-3d.html',
  styleUrl: './circuit-3d.scss',
})
export class Circuit3d {
  readonly placed = input.required<PlacedCircuit>();
  readonly meshes = input.required<MeshFile>();
  readonly title = input('');

  readonly data = inject(DataService);
  readonly world = inject(WorldService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  /** Set to the circuit's own home once the inputs are in; see the effect below. */
  readonly orbit = signal<Orbit>({ yaw: Math.PI, pitch: 1, distance: 1 });
  /**
   * Where the camera looks, as an offset from the circuit's centre. Zero is
   * home; a pan moves it, so the reader can look closely at one corner of a
   * big circuit instead of only turning about its middle.
   */
  readonly target = signal<V3>([0, 0, 0]);
  /** The press in progress is a pan (right or middle button, or shift), not an orbit. */
  private panning = false;
  /** A button is held down on the stage. */
  readonly pressed = signal(false);
  /** That press has travelled far enough to be an orbit and not a click. */
  readonly dragging = signal(false);
  readonly markers = signal<Marker[]>([]);
  /** The renderer could not be created: the labels work, the blocks do not draw. */
  readonly noGl = signal(false);
  /** The pills over the blocks; off, the scene is the game's own picture and nothing else. */
  readonly showLabels = signal(true);
  /**
   * The stage laid over the whole browser window. Not the browser's own
   * fullscreen: that takes the page's chrome away too, which is more than a
   * reader looking at one circuit asked for, and it needs a permission the
   * page may not have. Escape, or the button again, brings the page back.
   */
  readonly fullscreen = signal(false);

  /** Resolves once three.js has loaded and the scene exists. Tests await it. */
  readonly ready: Promise<void>;
  private settle!: () => void;

  /** The box the parts and cables fill, plus a margin of panel. */
  readonly box = computed<Box3m>(() => sceneBounds(this.placed(), MARGIN_CELLS));

  /**
   * What to build. The catalog is here because a cable's end points need the
   * port cells, and those come from the component stats, not the mesh file.
   */
  private readonly plan = computed(() => ({
    placed: this.placed(),
    meshes: this.meshes(),
    box: this.box(),
    catalog: buildCatalog(this.data.components()),
  }));

  /**
   * What each marker says. Reactive to the save and the reveal switches, as
   * the bill of materials is: a part the reader has not unlocked and not
   * asked to see is named for what it is not, and is not a link.
   */
  private readonly labels = computed(() => {
    const names = this.data.componentById();
    const out = new Map<string, { label: string; listed: boolean }>();
    for (const p of this.placed().parts) {
      if (out.has(p.type)) continue;
      const listed = this.world.isListed(p.type);
      out.set(p.type, {
        listed,
        label: listed ? (names.get(p.type)?.name ?? p.type) : 'a part you have not unlocked',
      });
    }
    return out;
  });

  private gfx: Gfx | null = null;
  private frame = 0;
  /** The view was destroyed; init() checks it after its await so a late three.js builds nothing. */
  private destroyed = false;

  constructor() {
    this.ready = new Promise<void>((r) => {
      this.settle = r;
    });

    // A new circuit (or a mesh file arriving) rebuilds the scene and reframes
    // it: the old camera suited the old circuit. Effects rather than calls
    // from the input handlers so a late-arriving mesh file lands too.
    effect(() => {
      const p = this.plan();
      untracked(() => {
        this.orbit.set(homeOrbit(p.box));
        this.target.set([0, 0, 0]);
        if (this.gfx) this.build(p);
      });
    });
    effect(() => {
      this.orbit();
      this.target();
      this.labels();
      this.schedule();
    });

    afterNextRender(() => this.init());

    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      // A stage left on the body would outlive its page.
      this.setFullscreen(false);
      this.teardown();
    });
  }

  // ------------------------------------------------------------------- scene
  private async init(): Promise<void> {
    // Loaded on demand, as the galaxy loads it: nothing is paid for a page
    // that never turns the 3D view on, and the chunk is shared with the map.
    const three = await import('three');
    // The toggle can go off again before the chunk arrives: the component is
    // gone by then, and a scene built now would never be torn down.
    if (this.destroyed) {
      this.settle();
      return;
    }
    const scene = new three.Scene();
    const camera = new three.PerspectiveCamera(FOV_DEG, 1.6, 0.01, 100);

    let renderer: import('three').WebGLRenderer | null;
    try {
      renderer = new three.WebGLRenderer({
        canvas: this.canvas().nativeElement,
        antialias: true,
        alpha: true,
      });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    } catch {
      // No WebGL (a headless test, a blocked context, an ancient GPU). The
      // markers below still project, so the view degrades to labelled hit
      // areas over the panel colour rather than to a blank box that eats
      // clicks.
      renderer = null;
      this.noGl.set(true);
    }

    const root = new three.Group();
    scene.add(root);
    this.gfx = { three, renderer, scene, camera, root, centres: [], built: [], disposables: [] };
    this.build(this.plan());

    // Guarded: jsdom has no ResizeObserver, and the view is exercised there.
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(() => this.schedule());
      ro.observe(this.stage().nativeElement);
      this.destroyRef.onDestroy(() => ro.disconnect());
    }

    this.schedule();
    this.settle();
  }

  private build(plan: {
    placed: PlacedCircuit;
    meshes: MeshFile;
    box: Box3m;
    catalog: Catalog;
  }): void {
    const g = this.gfx;
    if (!g) return;
    const { three, root } = g;

    for (const o of g.built) o.parent?.remove(o);
    for (const d of g.disposables) d.dispose();
    g.built = [];
    g.disposables = [];
    g.centres = [];

    // The mesh file, the port positions and the SVG are all in the game's
    // left-handed frame: seen from -z, +x is on the right. three.js is
    // right-handed, and from the same side puts +x on the left, so drawn as
    // they stand the blocks and every text on them would come out mirrored
    // against the picture. Flipping x on the root un-mirrors everything
    // built beneath it in one place; three notices the negative determinant
    // and turns the front faces round to match. The translation puts the
    // bounding-box centre at the origin, where the camera looks.
    const [cx, cy, cz] = plan.box.centre;
    root.scale.set(-1, 1, 1);
    root.position.set(cx, -cy, -cz);
    root.updateMatrixWorld(true);

    this.buildPanel(plan.box);
    this.buildLights(plan.box);
    this.buildParts(plan);
    this.buildCables(plan);

    root.updateMatrixWorld(true);
    g.centres = plan.placed.parts.map((p) => {
      const c = partTransform(p).centre;
      return {
        id: p.id,
        type: p.type,
        value: p.value ?? '',
        tag: p.label ?? '',
        mode: p.mode ?? '',
        at: root.localToWorld(new three.Vector3(c[0], c[1], c[2])),
      };
    });

    this.schedule();
  }

  /** Adds an object under the root and remembers it for teardown. */
  private keep<T extends import('three').Object3D>(o: T, parent?: import('three').Object3D): T {
    const g = this.gfx!;
    (parent ?? g.root).add(o);
    g.built.push(o);
    return o;
  }

  private buildPanel(box: Box3m): void {
    const g = this.gfx!;
    const { three } = g;
    const w = box.max[0] - box.min[0];
    const d = box.max[2] - box.min[2];
    const cx = (box.min[0] + box.max[0]) / 2;
    const cz = (box.min[2] + box.max[2]) / 2;

    const geometry = new three.PlaneGeometry(w, d);
    const material = new three.MeshLambertMaterial({ color: 0x45484d });
    g.disposables.push(geometry, material);
    const panel = this.keep(new three.Mesh(geometry, material));
    panel.rotation.x = -Math.PI / 2;
    panel.position.set(cx, 0, cz);

    // Grid lines on the panel's cell boundaries, so a reader can count cells
    // the way the picture lets them.
    const pts: number[] = [];
    const step = GRID_EVERY * CELL_M;
    for (let x = Math.ceil(box.min[0] / step) * step; x <= box.max[0] + 1e-9; x += step) {
      pts.push(x, 0.0005, box.min[2], x, 0.0005, box.max[2]);
    }
    for (let z = Math.ceil(box.min[2] / step) * step; z <= box.max[2] + 1e-9; z += step) {
      pts.push(box.min[0], 0.0005, z, box.max[0], 0.0005, z);
    }
    const grid = new three.BufferGeometry();
    grid.setAttribute('position', new three.Float32BufferAttribute(pts, 3));
    const lines = new three.LineBasicMaterial({ color: 0x4e5157 });
    g.disposables.push(grid, lines);
    this.keep(new three.LineSegments(grid, lines));
  }

  private buildLights(box: Box3m): void {
    const g = this.gfx!;
    const { three } = g;
    // On the scene, not the root: three reads a hemisphere light's direction
    // from its world position, and under the mirrored, translated root the
    // default (0,1,0) resolves to the circuit's own centre, tilting "up" by
    // tens of degrees differently for every circuit. Parented to the scene it
    // stays at (0,1,0), so the sky colour lands on the top faces. keep() still
    // does the bookkeeping: teardown removes an object from whatever parent it
    // was given.
    this.keep(new three.HemisphereLight(0xffffff, 0x666a70, 0.9), g.scene);
    // Under the root, so the mirror turns it the way it turns the blocks and
    // the faces the SVG lights are the faces lit here. Its target is the
    // world origin, which is where the root puts the circuit's centre.
    const sun = this.keep(new three.DirectionalLight(0xffffff, 0.8));
    const [cx, cy, cz] = box.centre;
    sun.position.set(cx + LIGHT[0], cy + LIGHT[1], cz + LIGHT[2]);
  }

  private buildParts(plan: { placed: PlacedCircuit; meshes: MeshFile }): void {
    const g = this.gfx!;
    const { three } = g;
    const geometries = new Map<string, import('three').BufferGeometry>();
    const geometryFor = (name: string): import('three').BufferGeometry | null => {
      const cached = geometries.get(name);
      if (cached) return cached;
      const data = plan.meshes.meshes[name];
      if (!data) return null;
      const geometry = this.geometry(data);
      geometries.set(name, geometry);
      g.disposables.push(geometry);
      return geometry;
    };
    // Two materials for every block: the game's vertex colours, and the
    // glyph material, which renders near-black whatever its colours say.
    const painted = new three.MeshLambertMaterial({ vertexColors: true });
    const glyph = new three.MeshLambertMaterial({ color: GLYPH });
    const fallback = new three.MeshLambertMaterial({ color: parseInt(FALLBACK_HEX, 16) });
    g.disposables.push(painted, glyph, fallback);
    const textures = new Map<string, import('three').CanvasTexture | null>();

    for (const part of plan.placed.parts) {
      const t = partTransform(part);
      const group = this.keep(new three.Group());
      group.position.set(t.centre[0], t.centre[1], t.centre[2]);
      group.rotation.y = t.yRad;

      const known = plan.meshes.parts[part.type];
      if (!known?.renderers.length) {
        // The mesh file has never heard of this part: a box of its footprint
        // says where it is and how big, which is what the marker needs.
        const geometry = new three.BoxGeometry(
          part.size.x * CELL_M,
          part.size.y * CELL_M,
          part.size.z * CELL_M,
        );
        g.disposables.push(geometry);
        this.keep(new three.Mesh(geometry, fallback), group);
        continue;
      }
      for (const r of known.renderers) {
        const geometry = geometryFor(r.mesh);
        if (!geometry) continue;
        const mesh = this.keep(
          new three.Mesh(geometry, r.material === 'CRPLitPaintable' ? glyph : painted),
          group,
        );
        mesh.position.set(r.position[0], r.position[1], r.position[2]);
        // Unity applies its Euler angles Z, then X, then Y; three's 'YXZ' is
        // the same sequence (checked against render-svg.ts's matrices: the
        // Adder's 180-degree port rings land on its -z face, the input side).
        mesh.rotation.set(rad(r.rotation[0]), rad(r.rotation[1]), rad(r.rotation[2]), 'YXZ');
        mesh.scale.set(r.scale[0], r.scale[1], r.scale[2]);
      }
      for (const l of layoutTexts(known.texts, part.value)) this.buildText(l, group, textures);
    }
  }

  /** A BufferGeometry from the mesh file's flat arrays; colours are hex without '#'. */
  private geometry(data: MeshData): import('three').BufferGeometry {
    const { three } = this.gfx!;
    const geometry = new three.BufferGeometry();
    geometry.setAttribute('position', new three.Float32BufferAttribute(data.vertices, 3));
    const n = data.vertices.length / 3;
    const colors = new Float32Array(n * 3);
    // The file's hex is sRGB, as any hex is. A material's colour goes through
    // three's colour management and comes out linear; a buffer attribute is
    // fed to the shader as written. Converting here keeps a block's grey the
    // same grey as the panel's, rather than a lighter one.
    const c = new three.Color();
    for (let i = 0; i < n; i++) {
      c.setHex(parseInt(data.colors[i] ?? FALLBACK_HEX, 16), three.SRGBColorSpace);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geometry.setAttribute('color', new three.BufferAttribute(colors, 3));
    geometry.setIndex(data.triangles);
    if (data.normals?.length === data.vertices.length) {
      geometry.setAttribute('normal', new three.Float32BufferAttribute(data.normals, 3));
    } else {
      geometry.computeVertexNormals();
    }
    return geometry;
  }

  /**
   * A text as a picture on a plane in the text's own plane -- flat on the
   * top face for a glyph, on a tilted screen for a datameter.
   *
   * The plane's x is the part's x and its "up" is +z, the axes render-svg.ts
   * projects; it faces +y, and the mirror on the root is what makes a plane
   * with those axes face up rather than down. `yMidM` runs down the plane, so
   * it moves the picture along -z; the anchor shifts it along x by half its
   * width. A readout's picture is its plate, text centred on it, so the plate
   * is exactly the SVG's.
   */
  private buildText(
    l: LaidText,
    group: import('three').Group,
    textures: Map<string, import('three').CanvasTexture | null>,
  ): void {
    const g = this.gfx!;
    const { three } = g;
    const key = `${l.readout ? 'r' : 't'}|${l.fontM}|${l.text}`;
    let texture = textures.get(key);
    if (texture === undefined) {
      texture = this.textTexture(l);
      textures.set(key, texture);
      if (texture) g.disposables.push(texture);
    }
    // jsdom's canvas cannot draw. The text is skipped, and nothing else is:
    // the marker code never asks whether the texts were drawn.
    if (!texture) return;

    // The canvas was drawn at TEXT_PX per glyph height, so its pixels convert
    // straight back to metres.
    const wM = (texture.image.width * l.heightM) / TEXT_PX;
    const hM = (texture.image.height * l.heightM) / TEXT_PX;
    const geometry = new three.PlaneGeometry(wM, hM);
    const material = new three.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      side: three.DoubleSide,
    });
    g.disposables.push(geometry, material);

    const pivot = this.keep(new three.Group(), group);
    pivot.position.set(l.position[0], l.position[1], l.position[2]);
    pivot.rotation.set(rad(l.rotation[0]), rad(l.rotation[1]), rad(l.rotation[2]), 'YXZ');

    const plane = this.keep(new three.Mesh(geometry, material), pivot);
    const centreX = l.plate
      ? l.plate[0] + l.plate[2] / 2
      : l.anchor === 'start'
        ? wM / 2
        : l.anchor === 'end'
          ? -wM / 2
          : 0;
    plane.position.set(centreX, TEXT_LIFT, -l.yMidM);
    // A PlaneGeometry lies in xy facing +z. A quarter turn about x stands its
    // y up along +z and its face along -y, which the root's mirror makes +y.
    plane.rotation.x = Math.PI / 2;
  }

  /**
   * Draws a text once into a canvas: the pale plate when it is a readout, the
   * text near-black in the wiki's monospace face. Null where the canvas
   * cannot draw (jsdom).
   */
  private textTexture(l: LaidText): import('three').CanvasTexture | null {
    const { three } = this.gfx!;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const pxPerM = TEXT_PX / l.heightM;
    const fontPx = l.fontM * pxPerM;
    const font = `bold ${fontPx}px "JetBrains Mono", monospace`;
    ctx.font = font;
    // A readout's picture is its plate; a plain text's is as wide as it measures.
    const wM = l.plate ? l.plate[2] : Math.max(ctx.measureText(l.text).width / pxPerM, 1e-3);
    const hM = l.plate ? l.plate[3] : l.heightM;
    canvas.width = Math.max(1, Math.ceil(wM * pxPerM));
    canvas.height = Math.max(1, Math.ceil(hM * pxPerM));
    // Resizing the canvas resets its state, so the font is set again.
    ctx.font = font;
    if (l.plate) {
      ctx.fillStyle = 'rgba(238, 238, 238, 0.92)';
      ctx.beginPath();
      ctx.roundRect(0, 0, canvas.width, canvas.height, fontPx * 0.15);
      ctx.fill();
    }
    ctx.fillStyle = '#181818';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(l.text, canvas.width / 2, canvas.height / 2);
    const texture = new three.CanvasTexture(canvas);
    texture.colorSpace = three.SRGBColorSpace;
    return texture;
  }

  private buildCables(plan: { placed: PlacedCircuit; catalog: Catalog }): void {
    const g = this.gfx!;
    const { three } = g;
    const material = new three.MeshLambertMaterial({ color: 0x292929 });
    const end = new three.SphereGeometry(0.035, 12, 8);
    g.disposables.push(material, end);
    for (const cable of plan.placed.cables) {
      const pts = cablePoints(cable, plan.placed, plan.catalog);
      // A touching cable has no cells and nothing to draw.
      if (pts.length < 2) continue;
      const v3 = pts.map(([x, y, z]) => new three.Vector3(x, y, z));
      // Centripetal and slack: the thread goes through every cell centre
      // without the overshoot at a corner a uniform spline would draw.
      const curve = new three.CatmullRomCurve3(v3, false, 'centripetal', 0.15);
      const tube = new three.TubeGeometry(curve, pts.length * 6, 0.03, 10, false);
      g.disposables.push(tube);
      this.keep(new three.Mesh(tube, material));
      // A bead where the wire meets each port, as the picture draws one.
      for (const p of [v3[0], v3[v3.length - 1]]) {
        this.keep(new three.Mesh(end, material)).position.copy(p);
      }
    }
  }

  private schedule(): void {
    if (this.frame || typeof requestAnimationFrame !== 'function') return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  /** One frame: aim the camera, render, then re-project the DOM hit areas. */
  private draw(): void {
    const g = this.gfx;
    if (!g) return;
    const { w, h } = this.box_();
    if (w > 0 && h > 0) {
      g.camera.aspect = w / h;
      g.camera.updateProjectionMatrix();
      g.renderer?.setSize(w, h, false);
    }
    const eye = cameraPosition(this.orbit());
    const [tx, ty, tz] = this.target();
    g.camera.position.set(eye.x + tx, eye.y + ty, eye.z + tz);
    g.camera.lookAt(tx, ty, tz);
    // lookAt only sets the quaternion. The renderer would refresh the world
    // matrix on its way to drawing, but project() below reads it too, and
    // must not be left projecting through last frame's camera -- nor through
    // an unset one when there is no renderer at all.
    g.camera.updateMatrixWorld();
    g.renderer?.render(g.scene, g.camera);
    this.markers.set(this.project(w, h));
  }

  /** Screen positions for the overlay anchors, one per part. */
  private project(w: number, h: number): Marker[] {
    const g = this.gfx;
    if (!g || !w || !h) return [];
    const labels = this.labels();
    const p = new g.three.Vector3();
    // Depth is ranked from the nearest part, and the z-index it becomes is
    // never allowed below 1. An absolute figure went negative past ten
    // metres, and a pill with a negative z-index paints under the canvas,
    // showing only where the canvas is transparent: beside the panel.
    const nearest = Math.min(...g.centres.map((c) => c.at.distanceTo(g.camera.position)));
    const out: Marker[] = [];
    for (const c of g.centres) {
      p.copy(c.at);
      const depth = p.distanceTo(g.camera.position);
      p.project(g.camera);
      // Behind the camera: NDC flips through infinity and the marker would
      // land in the wrong corner of the stage.
      if (p.z > 1) continue;
      const who = labels.get(c.type) ?? { label: c.type, listed: false };
      out.push({
        id: c.id,
        type: c.type,
        label: who.label,
        value: c.value,
        tag: c.tag,
        mode: c.mode,
        listed: who.listed,
        x: (p.x * 0.5 + 0.5) * w,
        y: (-p.y * 0.5 + 0.5) * h,
        order: Math.max(1, 1000 - Math.round((depth - nearest) * 100)),
        far: p.z > 0.999,
      });
    }
    return out;
  }

  private teardown(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    const g = this.gfx;
    if (!g) return;
    for (const d of g.disposables) d.dispose();
    g.renderer?.dispose();
    g.built = [];
    this.gfx = null;
  }

  // ---------------------------------------------------------------- orbiting
  // The handlers below are galaxy-map.ts's, copied rather than shared: they
  // are forty lines bound to component state, and lifting them into a base
  // class or a directive is a refactor of the galaxy this view does not do.
  private origin = { x: 0, y: 0 };
  private start: Orbit = this.orbit();
  private startTarget: V3 = [0, 0, 0];

  onPointerDown(e: PointerEvent): void {
    // Left drag orbits; right or middle drag, or shift + left, pans. Anything
    // else (a fourth button) is left to the browser.
    if (e.button > 2) return;
    this.panning = e.button !== 0 || e.shiftKey;
    this.origin = { x: e.clientX, y: e.clientY };
    this.start = this.orbit();
    this.startTarget = this.target();
    this.pressed.set(true);
    // Capture on the pressed element, not on the stage: capturing on an
    // ancestor retargets the mouse events that follow and would break a
    // plain click through to the part's own page.
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  onPointerMove(e: PointerEvent): void {
    if (!this.pressed()) return;
    const dx = e.clientX - this.origin.x;
    const dy = e.clientY - this.origin.y;
    // Below the slop the press is still a click in waiting. Past it, parts
    // stop taking pointer events for the rest of the drag (the .dragging
    // rule in the stylesheet), so releasing over one lands on the stage
    // instead of navigating away from the page.
    if (!this.dragging() && Math.hypot(dx, dy) < DRAG_SLOP) return;
    this.dragging.set(true);
    if (this.panning) this.panBy(dx, dy);
    else this.orbit.set(orbitFrom(this.start, dx, dy, this.box_()));
  }

  /** The right-click menu would open on every pan's release. */
  onContextMenu(e: Event): void {
    e.preventDefault();
  }

  /**
   * Move the target so the scene follows the pointer: a drag of one screen
   * height at this distance is one visible height of world, which is what
   * the camera's vertical field of view says.
   */
  private panBy(dx: number, dy: number): void {
    const { h } = this.box_();
    const o = this.start;
    const perPx = (2 * o.distance * Math.tan((FOV_DEG * Math.PI) / 360)) / Math.max(h, 1);
    const { right, up } = screenAxes(o);
    const t = this.startTarget;
    this.setTarget([
      t[0] - dx * perPx * right[0] + dy * perPx * up[0],
      t[1] - dx * perPx * right[1] + dy * perPx * up[1],
      t[2] - dx * perPx * right[2] + dy * perPx * up[2],
    ]);
  }

  /** Keeps the target within reach of the circuit, so a pan cannot lose it. */
  private setTarget(t: V3): void {
    const limit = PAN_LIMIT * this.box().diagonal;
    const len = Math.hypot(t[0], t[1], t[2]);
    const k = len > limit ? limit / len : 1;
    this.target.set([t[0] * k, t[1] * k, t[2] * k]);
  }

  /** A key pans along the panel: forward is the camera's heading flattened onto it. */
  private panKey(sideways: number, ahead: number): void {
    const o = this.orbit();
    const { right } = screenAxes(o);
    const e = cameraPosition(o);
    const fl = Math.hypot(e.x, e.z) || 1;
    const fwd: V3 = [-e.x / fl, 0, -e.z / fl];
    const step = o.distance * PAN_KEY_STEP;
    const t = this.target();
    this.setTarget([
      t[0] + step * (sideways * right[0] + ahead * fwd[0]),
      t[1],
      t[2] + step * (sideways * right[2] + ahead * fwd[2]),
    ]);
  }

  onPointerUp(e: PointerEvent): void {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    this.pressed.set(false);
    this.dragging.set(false);
  }

  /**
   * Ctrl/cmd + wheel, not bare wheel: the view sits in a page, and swallowing
   * every wheel event over it would trap the reader's scroll. A trackpad
   * pinch arrives as a ctrl-wheel, so pinch-to-zoom works too.
   */
  onWheel(e: WheelEvent): void {
    // Laid over the window there is no page to scroll, so a bare wheel is a zoom.
    if (!e.ctrlKey && !e.metaKey && !this.fullscreen()) return;
    e.preventDefault();
    this.dollyBy(e.deltaY < 0 ? 1 : -1);
  }

  /** Multiplicative, within the limits the circuit's own size sets. */
  dollyBy(steps: number): void {
    const box = this.box();
    this.orbit.update((o) => ({
      ...o,
      distance: clampToBox(box, o.distance * Math.pow(DOLLY_STEP, steps)),
    }));
  }

  reset(): void {
    this.orbit.set(homeOrbit(this.box()));
    this.target.set([0, 0, 0]);
  }

  toggleFullscreen(): void {
    this.setFullscreen(!this.fullscreen());
  }

  /** Where the stage came from, so it can go back after the overlay. */
  private seat: Comment | null = null;

  /**
   * A fixed box would be enough, except that the reader pane it sits in is
   * cut to the HUD's angled corners with a clip-path, and a clip applies to
   * fixed descendants as well. So the stage moves to the document body for
   * the duration and comes back to the comment left in its place. The
   * canvas keeps its drawing context across the move; Angular's bindings
   * are on the element and follow it.
   */
  private setFullscreen(on: boolean): void {
    if (on === this.fullscreen()) return;
    const el = this.stage().nativeElement;
    if (typeof document !== 'undefined') {
      if (on) {
        this.seat = document.createComment('circuit-3d stage');
        el.parentNode?.insertBefore(this.seat, el);
        document.body.appendChild(el);
      } else if (this.seat) {
        this.seat.parentNode?.insertBefore(el, this.seat);
        this.seat.remove();
        this.seat = null;
      }
    }
    this.fullscreen.set(on);
    el.focus?.();
    // The box changes size with the class after this renders; the resize
    // observer redraws then, and this covers a browser without one.
    this.schedule();
  }

  /** Arrows orbit, WASD pan, +/- dolly, 0 resets: the view is reachable without a mouse. */
  onKeydown(e: KeyboardEvent): void {
    const step = (e.shiftKey ? 0.25 : 0.08) * Math.PI;
    switch (e.key.toLowerCase()) {
      case 'arrowleft':
        this.turn(step, 0);
        break;
      case 'arrowright':
        this.turn(-step, 0);
        break;
      case 'arrowup':
        this.turn(0, step);
        break;
      case 'arrowdown':
        this.turn(0, -step);
        break;
      case 'w':
        this.panKey(0, 1);
        break;
      case 's':
        this.panKey(0, -1);
        break;
      case 'a':
        this.panKey(-1, 0);
        break;
      case 'd':
        this.panKey(1, 0);
        break;
      case '+':
      case '=':
        this.dollyBy(1);
        break;
      case '-':
      case '_':
        this.dollyBy(-1);
        break;
      case '0':
        this.reset();
        break;
      case 'escape':
        if (!this.fullscreen()) return;
        this.setFullscreen(false);
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  private turn(dyaw: number, dpitch: number): void {
    this.orbit.update((o) => ({
      yaw: wrapYaw(o.yaw + dyaw),
      pitch: clampPitch(o.pitch + dpitch),
      distance: o.distance,
    }));
  }

  /** The stage's size on screen. Named apart from box(), which is the scene's. */
  private box_(): { w: number; h: number } {
    const r = this.stage().nativeElement.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }
}
