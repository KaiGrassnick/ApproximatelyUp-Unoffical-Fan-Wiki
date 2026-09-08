import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { WorldService } from '../../core/world.service';
import { Placed3, Scene3, place } from '../../core/galaxy-scene';
import { Planet } from '../../core/models';
import {
  HOME,
  MAX_DISTANCE,
  MIN_DISTANCE,
  Orbit,
  cameraPosition,
  clampPitch,
  dolly,
  orbitFrom,
  wrapYaw,
  zoomLabel,
} from './orbit';

/**
 * Which universe a body sits in.
 *
 * A null index means "every one of them": the black hole has one position and
 * is in both worlds at once, which is the whole point of it.
 */
const worldOf = (b: Planet): string | null => b.wormhole;

/** Pointer travel, in px, past which a press is an orbit and not a click. */
const DRAG_SLOP = 4;

/**
 * One body's hit area, in CSS pixels over the canvas.
 *
 * The spheres are WebGL; the things you can hover, click, tab to and read are
 * ordinary DOM anchors laid over them, projected onto the canvas every frame.
 * That is deliberate: it keeps every planet a real <a routerLink> with a real
 * label, so the map stays keyboard-reachable and its links behave like links,
 * instead of being pixels that need a raycaster to answer "what did I click".
 */
export interface Marker {
  id: string;
  x: number;
  y: number;
  size: number;
  isStar: boolean;
  isBlackHole: boolean;
  known: boolean;
  /** Painter's-order z-index: nearer bodies take the hover and the click. */
  order: number;
}

interface Gfx {
  three: typeof import('three');
  renderer: import('three').WebGLRenderer | null;
  scene: import('three').Scene;
  camera: import('three').PerspectiveCamera;
  /** Everything built from the current plan, disposed together on rebuild. */
  built: import('three').Object3D[];
  disposables: { dispose(): void }[];
}

@Component({
  selector: 'galaxy-map',
  imports: [RouterLink],
  templateUrl: './galaxy-map.html',
  styleUrl: './galaxy-map.scss',
})
export class GalaxyMap {
  readonly data = inject(DataService);
  readonly world = inject(WorldService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  readonly orbit = signal<Orbit>(HOME);
  /** A button is held down on the map. */
  readonly pressed = signal(false);
  /** That press has travelled far enough to be an orbit and not a click. */
  readonly dragging = signal(false);
  readonly hovered = signal<string>('');
  readonly markers = signal<Marker[]>([]);

  /** Resolves once three.js has loaded and the scene exists. Tests await it. */
  readonly ready: Promise<void>;
  private settle!: () => void;

  readonly zoom = computed(() => zoomLabel(this.orbit().distance));
  readonly atRest = computed(() => {
    const o = this.orbit();
    return o.yaw === HOME.yaw && o.pitch === HOME.pitch && o.distance === HOME.distance;
  });

  /**
   * Which universe is on screen.
   *
   * `wormhole` on a body is not a flag but a world index: 12 bodies sit in
   * world "0", and 5 more — Ascensia, Ashbelt, Goldtwin, Pinktwin, Tenebra —
   * in world "1", the space the story's black hole leads to. Each world's
   * coordinates are its own, so drawing them in one scene put five planets at
   * positions that mean nothing relative to the Sun. They get their own view.
   */
  readonly world_ = signal('0');

  /** Bodies, not stations: the 18 stations are not on the map. */
  private readonly allBodies = computed(() =>
    this.data
      .planets()
      .filter((p) => p.type === 'planet' || p.type === 'star' || p.type === 'blackhole'),
  );

  /**
   * The universes the reader may know about: home always, and the far side of
   * the wormhole once their save has been there. With no save loaded both are
   * offered — the wiki is a plain reference then.
   */
  readonly worlds = computed(() => {
    const ids = [...new Set(this.allBodies().map(worldOf))].filter((id) => id !== null).sort();
    return ids.filter(
      (id) =>
        id === '0' || this.allBodies().some((b) => worldOf(b) === id && this.world.isKnown(b)),
    );
  });

  /** The world actually shown; a save can withdraw the one that was selected. */
  readonly activeWorld = computed(() =>
    this.worlds().includes(this.world_()) ? this.world_() : '0',
  );

  readonly bodies = computed(() =>
    this.allBodies().filter((b) => worldOf(b) === null || worldOf(b) === this.activeWorld()),
  );

  /**
   * What to build: where the bodies go, plus which of them the reader's save
   * says they have never been to. Both feed one rebuild, because a world
   * being dropped in changes materials, not geometry, and 17 spheres are
   * cheaper to rebuild than to diff.
   */
  readonly plan = computed(() => ({
    scene: place(this.bodies()),
    unknown: new Set(
      this.bodies()
        .filter((b) => !this.world.isKnown(b))
        .map((b) => b.id),
    ),
  }));

  readonly hoveredBody = computed(() => this.data.planetById().get(this.hovered()));

  /**
   * Whether the reader's save says they have been to the body under the
   * pointer. With no save loaded everything is known, so the wiki stays a
   * plain reference; with one, an unvisited body gives up neither its name
   * nor its figures, on the map or in the readout.
   */
  readonly hoveredKnown = computed(() => {
    const h = this.hoveredBody();
    return !!h && this.world.isKnown(h);
  });

  readonly hoveredName = computed(() => {
    const h = this.hoveredBody();
    if (!h) return '';
    return this.hoveredKnown() ? h.id : 'unknown';
  });

  /**
   * The "?" on an unvisited body, sized to the sphere it sits on so it grows
   * with the zoom instead of swamping the small bodies and disappearing on
   * the large ones. Floored, because the far side of the galaxy gets small.
   */
  glyphPx(size: number): number {
    return Math.max(9, size * 0.5);
  }

  protected readonly minZoom = zoomLabel(MAX_DISTANCE);
  protected readonly maxZoom = zoomLabel(MIN_DISTANCE);

  private gfx: Gfx | null = null;
  private frame = 0;

  constructor() {
    this.ready = new Promise<void>((r) => {
      this.settle = r;
    });

    // The scene is rebuilt whenever the data or the loaded world changes, and
    // redrawn whenever the camera does. Both are effects rather than calls
    // from the input handlers so a late-arriving planets.json lands too.
    effect(() => {
      const p = this.plan();
      if (this.gfx) this.build(p);
    });
    effect(() => {
      this.orbit();
      this.schedule();
    });

    afterNextRender(() => this.init());

    this.destroyRef.onDestroy(() => this.teardown());
  }

  // ------------------------------------------------------------------- scene
  private async init(): Promise<void> {
    // Loaded on demand: three.js is a third of a megabyte, and the home page
    // this map sits at the bottom of should paint its text without it.
    const three = await import('three');
    const scene = new three.Scene();
    const camera = new three.PerspectiveCamera(38, 1.6, 0.01, 100);

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
      // markers below still project, so the map degrades to labelled hit
      // areas over the panel rather than to a blank box that eats clicks.
      renderer = null;
    }

    this.gfx = { three, renderer, scene, camera, built: [], disposables: [] };
    this.build(this.plan());

    // Guarded: jsdom has no ResizeObserver, and the map is exercised there.
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(() => this.schedule());
      ro.observe(this.stage().nativeElement);
      this.destroyRef.onDestroy(() => ro.disconnect());
    }

    this.schedule();
    this.settle();
  }

  private build(plan: { scene: Scene3; unknown: Set<string> }): void {
    const g = this.gfx;
    if (!g) return;
    const { three } = g;

    for (const o of g.built) g.scene.remove(o);
    for (const d of g.disposables) d.dispose();
    g.built = [];
    g.disposables = [];
    if (!plan.scene.placed.length) {
      this.schedule();
      return;
    }

    // A dim fill so the night side reads as unlit rock rather than a hole.
    const ambient = new three.AmbientLight(0x4a6a94, 0.55);
    g.scene.add(ambient);
    g.built.push(ambient);

    // Galaxy 2 has no star in it at all, so nothing would light its five
    // planets and the view would be very nearly black. A stand-in sun goes
    // at the origin — where Galaxy 1's real one sits, so the two views are
    // lit from the same place — and is a light only: no sphere, no marker,
    // nothing claiming a body is there.
    if (!plan.scene.placed.some((b) => b.isStar)) {
      const standIn = new three.PointLight(0xfff1d4, 2.6, 0, 0);
      g.scene.add(standIn);
      g.built.push(standIn);
    }

    const geometry = new three.SphereGeometry(1, 48, 32);
    g.disposables.push(geometry);

    for (const b of plan.scene.placed) {
      const known = !plan.unknown.has(b.id);
      const material = this.materialFor(b, known);
      g.disposables.push(material);
      const mesh = new three.Mesh(geometry, material);
      mesh.position.set(b.pos.x, b.pos.y, b.pos.z);
      mesh.scale.setScalar(b.radius);
      g.scene.add(mesh);
      g.built.push(mesh);

      // Stars light the system from where they actually are. decay 0 because
      // the scene is a galaxy squeezed into a 2-unit box: real inverse-square
      // falloff over that leaves everything past the inner planets black.
      if (b.isStar && !b.isBlackHole) {
        const light = new three.PointLight(b.id === 'Sun' ? 0xfff1d4 : 0xff9a72, 2.6, 0, 0);
        light.position.copy(mesh.position);
        g.scene.add(light);
        g.built.push(light);
      }
    }

    this.schedule();
  }

  private materialFor(b: Placed3, known: boolean): import('three').Material {
    const { three } = this.gfx!;
    if (!known) {
      // Never visited in the loaded save: a featureless dark body under the
      // "?" the overlay draws. Its size and place are still the truth.
      //
      // Tested before isBlackHole, and that order is the point. An unlit
      // black sphere is not anonymous — it is unmistakably the black hole,
      // so treating it as a special case first told the reader exactly what
      // the missing label was withholding. Undiscovered, it wears the same
      // dark body as everything else undiscovered; the overlay drops its
      // ring to match.
      return new three.MeshStandardMaterial({ color: 0x1b2433, roughness: 1, metalness: 0 });
    }
    if (b.isBlackHole) {
      // Unlit and black, because that is what it is. The map says it is
      // there with the ring the overlay draws — a black sphere on a black
      // panel is otherwise nothing at all.
      return new three.MeshBasicMaterial({ color: 0x000000 });
    }
    const map = new three.TextureLoader().load(this.data.globeMapUrl(b.id), () => this.schedule());
    map.colorSpace = three.SRGBColorSpace;
    this.gfx!.disposables.push(map);
    // A star is emissive: it is not lit by the scene, it lights the scene.
    return b.isStar
      ? new three.MeshBasicMaterial({ map })
      : new three.MeshStandardMaterial({ map, roughness: 1, metalness: 0 });
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
    const { w, h } = this.box();
    if (w > 0 && h > 0) {
      g.camera.aspect = w / h;
      g.camera.updateProjectionMatrix();
      g.renderer?.setSize(w, h, false);
    }
    const eye = cameraPosition(this.orbit());
    g.camera.position.set(eye.x, eye.y, eye.z);
    g.camera.lookAt(0, 0, 0);
    // lookAt only sets the quaternion. The renderer would refresh the world
    // matrix on its way to drawing, but project() below reads it too, and
    // must not be left projecting through last frame's camera — nor through
    // an unset one when there is no renderer at all.
    g.camera.updateMatrixWorld();
    g.renderer?.render(g.scene, g.camera);
    this.markers.set(this.project(w, h));
  }

  /**
   * Screen positions and radii for the overlay anchors.
   *
   * The radius is measured, not derived: the same sphere is wider on screen
   * when it is near the camera than when it is far, and only the projection
   * knows by how much. Projecting a second point one radius up from the
   * centre and taking the distance gets it right for free.
   */
  private project(w: number, h: number): Marker[] {
    const g = this.gfx;
    if (!g || !w || !h) return [];
    const { three } = g;
    const plan = this.plan();
    const centre = new three.Vector3();
    const edge = new three.Vector3();
    const up = new three.Vector3();

    const out: Marker[] = [];
    for (const b of plan.scene.placed) {
      centre.set(b.pos.x, b.pos.y, b.pos.z);
      const depth = centre.distanceTo(g.camera.position);
      up.copy(g.camera.up).applyQuaternion(g.camera.quaternion).multiplyScalar(b.radius);
      edge.copy(centre).add(up);
      centre.project(g.camera);
      edge.project(g.camera);
      // Behind the camera: NDC flips through infinity and the marker would
      // land in the wrong corner of the map.
      if (centre.z > 1) continue;
      const x = (centre.x * 0.5 + 0.5) * w;
      const y = (-centre.y * 0.5 + 0.5) * h;
      const ex = (edge.x * 0.5 + 0.5) * w;
      const ey = (-edge.y * 0.5 + 0.5) * h;
      out.push({
        id: b.id,
        x,
        y,
        size: Math.max(14, 2 * Math.hypot(ex - x, ey - y)),
        isStar: b.isStar,
        isBlackHole: b.isBlackHole,
        known: !plan.unknown.has(b.id),
        order: Math.round(1000 - depth * 100),
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
    this.gfx = null;
  }

  // ------------------------------------------------------------------ orbiting
  private origin = { x: 0, y: 0 };
  private start: Orbit = HOME;

  onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    this.origin = { x: e.clientX, y: e.clientY };
    this.start = this.orbit();
    this.pressed.set(true);
    // Capture on the pressed element, not on the map: capturing on an
    // ancestor retargets the mouse events that follow and would break a
    // plain click through to the body's own page.
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  onPointerMove(e: PointerEvent): void {
    if (!this.pressed()) return;
    const dx = e.clientX - this.origin.x;
    const dy = e.clientY - this.origin.y;
    // Below the slop the press is still a click in waiting: turning the
    // galaxy by the pixel or two a click jitters would make bodies hard to
    // open. Past it, bodies stop taking pointer events for the rest of the
    // drag (see the .dragging rule in the stylesheet), so releasing over one
    // lands on the map instead of navigating away from the page.
    if (!this.dragging() && Math.hypot(dx, dy) < DRAG_SLOP) return;
    this.dragging.set(true);
    this.orbit.set(orbitFrom(this.start, dx, dy, this.box()));
  }

  onPointerUp(e: PointerEvent): void {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    this.pressed.set(false);
    this.dragging.set(false);
  }

  /**
   * Ctrl/⌘ + wheel, not bare wheel: the map is a section of the home page, and
   * swallowing every wheel event over it would trap the reader's page scroll.
   * A trackpad pinch arrives as a ctrl-wheel, so pinch-to-zoom works too.
   */
  onWheel(e: WheelEvent): void {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    this.dollyBy(e.deltaY < 0 ? 1 : -1);
  }

  dollyBy(steps: number): void {
    this.orbit.update((o) => ({ ...o, distance: dolly(o.distance, steps) }));
  }

  reset(): void {
    this.orbit.set(HOME);
  }

  /** Switching universe reframes: the old camera suited the old scene. */
  showWorld(id: string): void {
    this.world_.set(id);
    this.reset();
  }

  /**
   * What the toggle calls a world. The index is 0-based and there is a third
   * one in the black hole's parameters, so this counts rather than naming the
   * two we happen to have bodies for today.
   */
  worldName(id: string): string {
    return `Galaxy ${Number(id) + 1}`;
  }

  /** Arrows orbit, +/− dolly, 0 resets — the map is reachable without a mouse. */
  onKeydown(e: KeyboardEvent): void {
    const step = (e.shiftKey ? 0.25 : 0.08) * Math.PI;
    switch (e.key) {
      case 'ArrowLeft':
        this.turn(step, 0);
        break;
      case 'ArrowRight':
        this.turn(-step, 0);
        break;
      case 'ArrowUp':
        this.turn(0, step);
        break;
      case 'ArrowDown':
        this.turn(0, -step);
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

  private box(): { w: number; h: number; left: number; top: number } {
    const r = this.stage().nativeElement.getBoundingClientRect();
    return { w: r.width, h: r.height, left: r.left, top: r.top };
  }
}
