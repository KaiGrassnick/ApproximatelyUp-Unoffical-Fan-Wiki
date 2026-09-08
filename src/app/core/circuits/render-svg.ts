import { cablePoints } from './circuit-scene';
import { MeshData, MeshFile, RendererRef } from './mesh-file';
import {
  CableKind,
  Catalog,
  CELL_M,
  Cell,
  NoteColor,
  PlacedCircuit,
  PlacedPart,
  SourceNote,
} from './model';
import { layoutTexts } from './text-layout';

/**
 * The picture, as SVG.
 *
 * The game's blocks are a few dozen flat-coloured triangles each, and the
 * screenshots are close to orthographic, so this is a small software
 * renderer: an orthographic camera, flat shading from one light, and a
 * painter's sort of every triangle and cable segment by depth. Parts never
 * interpenetrate and cables never share a cell, which is what makes the
 * painter's algorithm correct here where it would not be in general.
 *
 * The sort has two known limits, both from sorting a whole thing by one
 * depth rather than per pixel. A part's glyph sorts against the nearest
 * vertex of its own part, and a highlight sorts against the segments it
 * touches -- so a cable passing directly in front of a block can paint under
 * that block's glyph, and a highlight can leak up to half a cell over a
 * block that occludes the dark stroke it surrounds. Both are acceptable for
 * the same reason the algorithm is: parts never interpenetrate and cables
 * never share a cell, so the overlap is bounded by one cell and never hides
 * anything a reader needs.
 *
 * Output is byte-stable for the same input: the manifest hashes it.
 */

export type { MeshData, RendererRef, TextRef, MeshFile } from './mesh-file';

type V3 = [number, number, number];
type M3 = [number, number, number, number, number, number, number, number, number];

/** Pixels per metre: a 0.25 m block is 60 px wide, about what the screenshots show. */
const SCALE = 240;
/**
 * `top` is steep on purpose: at 60 degrees a block's own body hides the blue
 * output ring on its +z edge, and the three real circuits lost every one. At
 * 75 the rings show as the slivers the screenshots have, and the -z face still
 * reads as a face.
 */
const CAMERAS = { top: { pitch: 75, yaw: 0 }, iso: { pitch: 35, yaw: 35 } };
const LIGHT: V3 = norm([-0.3, 1, -0.6]);

const PANEL = '#45484d';
const PANEL_LINE = '#4e5157';
const PANEL_EDGE = '#2f3236';
/** The game's glyph material renders near-black whatever its vertex colour. */
const GLYPH = '#181818';
const CABLE: Record<CableKind, string> = {
  data: '#292929',
  power: '#919191',
  nano: '#7d7d7d',
  plasma: '#dddddd',
};
const CABLE_HI = '#4a4a4a';
const NOTE: Record<NoteColor, string> = {
  magenta: '#ff2fd6',
  green: '#2fffb0',
  red: '#ff3b3b',
  yellow: '#ffd23c',
  cyan: '#4fd8ff',
};

function norm(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const addV = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mulM = (m: M3, v: V3): V3 => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];
const mulMM = (a: M3, b: M3): M3 => {
  const o = new Array(9).fill(0) as M3;
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      for (let k = 0; k < 3; k++) o[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c];
  return o;
};
const rad = (d: number) => (d * Math.PI) / 180;

/** Unity's left-handed rotations: +y turns +z towards +x. */
function rotX(d: number): M3 {
  const c = Math.cos(rad(d)),
    s = Math.sin(rad(d));
  return [1, 0, 0, 0, c, -s, 0, s, c];
}
function rotY(d: number): M3 {
  const c = Math.cos(rad(d)),
    s = Math.sin(rad(d));
  return [c, 0, s, 0, 1, 0, -s, 0, c];
}
function rotZ(d: number): M3 {
  const c = Math.cos(rad(d)),
    s = Math.sin(rad(d));
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}
/** Unity applies Euler angles as Z, then X, then Y. */
const euler = (r: number[]): M3 => mulMM(rotY(r[1]), mulMM(rotX(r[0]), rotZ(r[2])));

/**
 * The engine turns a footprint by mapping (x, z) -> (depth-1-z, x), which
 * sends +z to -x. Unity's +y rotation sends +z to +x, so a part rotated by
 * `rot` in cells is a mesh rotated by -rot degrees.
 */
const partMatrix = (rot: number): M3 => rotY(-rot);

interface Camera {
  right: V3;
  up: V3;
  forward: V3;
  pitch: number;
  yaw: number;
}
function camera(view: 'top' | 'iso'): Camera {
  const { pitch, yaw } = CAMERAS[view];
  const st = Math.sin(rad(pitch)),
    ct = Math.cos(rad(pitch));
  const sf = Math.sin(rad(yaw)),
    cf = Math.cos(rad(yaw));
  return {
    right: [cf, 0, -sf],
    up: [st * sf, ct, st * cf],
    forward: [ct * sf, -st, ct * cf],
    pitch,
    yaw,
  };
}
interface Pt {
  x: number;
  y: number;
  d: number;
}
const project = (cam: Camera, p: V3): Pt => ({
  x: dot(p, cam.right) * SCALE,
  y: -dot(p, cam.up) * SCALE,
  d: dot(p, cam.forward),
});

const f3 = (n: number) => (Math.round(n * 1000) / 1000 + 0).toFixed(3);
const f1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function shade(hex: string, n: V3): string {
  const k = 0.55 + 0.45 * Math.max(0, dot(n, LIGHT));
  const c = (i: number) =>
    Math.round(parseInt(hex.slice(i, i + 2), 16) * k)
      .toString(16)
      .padStart(2, '0');
  // The channels start at 1, 3 and 5: `hex` carries its leading '#'.
  return `#${c(1)}${c(3)}${c(5)}`;
}

/** A plain box the size of the part, for a part the mesh file does not know. */
function boxMesh(size: Cell): MeshData {
  const hx = (size.x * CELL_M) / 2,
    hy = (size.y * CELL_M) / 2,
    hz = (size.z * CELL_M) / 2;
  const faces: { n: V3; q: V3[] }[] = [
    {
      n: [0, 1, 0],
      q: [
        [-hx, hy, -hz],
        [hx, hy, -hz],
        [hx, hy, hz],
        [-hx, hy, hz],
      ],
    },
    {
      n: [0, -1, 0],
      q: [
        [-hx, -hy, hz],
        [hx, -hy, hz],
        [hx, -hy, -hz],
        [-hx, -hy, -hz],
      ],
    },
    {
      n: [0, 0, -1],
      q: [
        [-hx, -hy, -hz],
        [hx, -hy, -hz],
        [hx, hy, -hz],
        [-hx, hy, -hz],
      ],
    },
    {
      n: [0, 0, 1],
      q: [
        [hx, -hy, hz],
        [-hx, -hy, hz],
        [-hx, hy, hz],
        [hx, hy, hz],
      ],
    },
    {
      n: [1, 0, 0],
      q: [
        [hx, -hy, -hz],
        [hx, -hy, hz],
        [hx, hy, hz],
        [hx, hy, -hz],
      ],
    },
    {
      n: [-1, 0, 0],
      q: [
        [-hx, -hy, hz],
        [-hx, -hy, -hz],
        [-hx, hy, -hz],
        [-hx, hy, hz],
      ],
    },
  ];
  const m: MeshData = { vertices: [], normals: [], colors: [], triangles: [] };
  for (const f of faces) {
    const base = m.vertices.length / 3;
    for (const v of f.q) {
      m.vertices.push(...v);
      m.normals.push(...f.n);
      m.colors.push('b3b3b3');
    }
    m.triangles.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return m;
}

interface Prim {
  d: number;
  svg: string;
}

export function renderSvg(
  placed: PlacedCircuit,
  catalog: Catalog,
  meshes: MeshFile,
  opts: { view: 'top' | 'iso'; notes: SourceNote[] },
): string {
  const cam = camera(opts.view);
  const prims: Prim[] = [];
  /** Labels and mode tags, drawn after every prim: see `tag` below. */
  let tags = '';
  const pts: Pt[] = [];
  const partPts = new Map<string, Pt[]>();
  const note = (p: Pt) => {
    pts.push(p);
    return p;
  };

  const centreOf = (p: PlacedPart): V3 => [
    (p.at.x + p.size.x / 2) * CELL_M,
    (p.at.y + p.size.y / 2) * CELL_M,
    (p.at.z + p.size.z / 2) * CELL_M,
  ];

  // Parts: every visible triangle of every renderer, then the texts.
  for (const part of placed.parts) {
    const spec = catalog.get(part.type)!;
    const R = partMatrix(part.rot);
    const centre = centreOf(part);
    const own: Pt[] = [];
    partPts.set(part.id, own);
    const known = meshes.parts[part.type];
    const renderers: RendererRef[] = known?.renderers.length
      ? known.renderers
      : [
          {
            name: 'box',
            mesh: '',
            material: 'CRPLit',
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
          },
        ];

    for (const r of renderers) {
      const mesh = meshes.meshes[r.mesh] ?? boxMesh(spec.size);
      const RR = mulMM(R, euler(r.rotation));
      const off = mulM(R, r.position as V3);
      const world = (i: number): V3 => {
        const v: V3 = [
          mesh.vertices[3 * i] * r.scale[0],
          mesh.vertices[3 * i + 1] * r.scale[1],
          mesh.vertices[3 * i + 2] * r.scale[2],
        ];
        return addV(addV(centre, off), mulM(RR, v));
      };
      const normal = (i: number): V3 =>
        mulM(RR, [mesh.normals[3 * i], mesh.normals[3 * i + 1], mesh.normals[3 * i + 2]]);
      for (let t = 0; t < mesh.triangles.length; t += 3) {
        const idx = [mesh.triangles[t], mesh.triangles[t + 1], mesh.triangles[t + 2]];
        const n = norm(idx.reduce((s, i) => addV(s, normal(i)), [0, 0, 0] as V3));
        // Facing away, or edge-on: an edge-on face is a zero-area sliver
        // that would still draw as a hairline.
        if (dot(n, cam.forward) >= -1e-6) continue;
        const ps = idx.map((i) => note(project(cam, world(i))));
        own.push(...ps);
        const base =
          r.material === 'CRPLitPaintable' ? GLYPH : `#${mesh.colors[idx[0]] ?? 'b3b3b3'}`;
        // The hairline stroke in the fill colour closes the anti-aliasing seams
        // between neighbouring triangles, which otherwise show as a faint
        // wireframe over every plate.
        prims.push({
          d: (ps[0].d + ps[1].d + ps[2].d) / 3,
          svg: `<path data-part="${esc(part.id)}" fill="${shade(base, n)}" stroke="${shade(base, n)}" stroke-width="0.6" stroke-linejoin="round" d="M${f1(ps[0].x)} ${f1(ps[0].y)}L${f1(ps[1].x)} ${f1(ps[1].y)}L${f1(ps[2].x)} ${f1(ps[2].y)}Z"/>`,
        });
      }
    }

    // Every text of a part sorts in front of every triangle of that part: the
    // top face's near corner is closer to the camera than the glyph's centre,
    // so sorting a text at its own depth lets that triangle paint over it.
    const bodyD = own.length ? Math.min(...own.map((p) => p.d)) : Infinity;
    for (const l of layoutTexts(known?.texts ?? [], part.value)) {
      const p = note(project(cam, addV(centre, mulM(R, l.position))));
      own.push(p);
      // A text lies in its own plane -- flat on the top face for a glyph, on
      // a tilted screen for a datameter -- so its screen shape is that plane
      // projected: the plane's x and "up" axes become the matrix's columns.
      // One transform then covers the camera, the part's turn and the tilt.
      const RT = mulMM(R, euler(l.rotation));
      const axis = (v: V3): [number, number] => {
        const w = mulM(RT, v);
        return [dot(w, cam.right), -dot(w, cam.up)];
      };
      const [ax, ay] = axis([1, 0, 0]);
      const [ux, uy] = axis([0, 0, 1]);
      const fs = l.fontM * SCALE;
      const plate = l.plate
        ? `<rect x="${f1(l.plate[0] * SCALE)}" y="${f1(l.plate[1] * SCALE)}" width="${f1(l.plate[2] * SCALE)}" height="${f1(l.plate[3] * SCALE)}" rx="${f1(fs * 0.15)}" fill="#eeeeee" opacity="0.92"/>`
        : '';
      prims.push({
        d: Math.min(bodyD, p.d) - 0.01,
        svg: `<g data-part="${esc(part.id)}" transform="matrix(${f3(ax)} ${f3(ay)} ${f3(-ux)} ${f3(-uy)} ${f1(p.x)} ${f1(p.y)})">${plate}<text x="0" y="${f1(l.yMidM * SCALE)}" font-size="${f1(fs)}" font-weight="700" fill="${GLYPH}" text-anchor="${l.anchor}" dominant-baseline="middle">${esc(l.text)}</text></g>`,
      });
    }

    // Labels sit on the panel just below the part, the way the annotated
    // screenshot writes a name under a block.
    //
    // A label lies where the input cable enters, so sorting it at its own
    // depth left a cable painting over the middle of the word: 'ERR > 0' read
    // as 'E'. Labels are annotation, not geometry, so they leave the depth
    // sort entirely and go in a group drawn after every prim, in the order
    // the parts are placed. The halo in the panel colour then keeps them
    // legible over whatever runs beneath.
    // The halo is its own element under the coloured one rather than a
    // `paint-order` on a single text: renderers that ignore `paint-order`
    // stroke over the fill instead of under it, which turns a yellow label
    // into a grey blob. `paint-order` stays on the halo so a renderer that
    // does honour it draws the same thing.
    const below: V3 = [centre[0], 0.002, (part.at.z - 0.6) * CELL_M];
    const tag = (text: string, color: string, dz: number) => {
      const p = note(project(cam, addV(below, [0, 0, dz])));
      const at = `x="${f1(p.x)}" y="${f1(p.y)}" font-size="${f1(0.06 * SCALE)}" text-anchor="middle" font-family="Chakra Petch, sans-serif"`;
      tags +=
        `<text ${at} fill="none" paint-order="stroke" stroke="${PANEL}" stroke-width="3" stroke-linejoin="round">${esc(text)}</text>` +
        `<text ${at} fill="${color}">${esc(text)}</text>`;
    };
    if (part.label) tag(part.label, NOTE.yellow, 0);
    if (part.mode) tag(part.mode, NOTE.cyan, -0.9 * CELL_M);
  }

  // Cables: a polyline from the source port's face to the target's, drawn
  // segment by segment so each sorts with the blocks around it.
  placed.cables.forEach((cable, ci) => {
    if (!cable.cells.length) return;
    // Face point to face point through every cell -- the same thread the 3D
    // view draws, so a wire cannot land in one place here and another there.
    const line: V3[] = cablePoints(cable, placed, catalog);
    const sp = line.map((p) => note(project(cam, p)));
    const w = 0.06 * SCALE;
    // Segment i runs sp[i - 1] -> sp[i] and sorts at its midpoint's depth.
    const segD = sp.map((_, i) => (i ? (sp[i - 1].d + sp[i].d) / 2 : NaN));
    for (let i = 1; i < sp.length; i++) {
      const a = sp[i - 1],
        b = sp[i];
      const seg = `x1="${f1(a.x)}" y1="${f1(a.y)}" x2="${f1(b.x)}" y2="${f1(b.y)}" stroke-linecap="round"`;
      prims.push({
        d: segD[i],
        svg: `<line data-cable="${ci + 1}" ${seg} stroke="${CABLE[cable.kind]}" stroke-width="${f1(w)}"/>`,
      });
      // A highlight sorted only against its own segment falls behind the round
      // caps of the segments it joins, which chops the highlight into dashes at
      // every joint. Sort it in front of both neighbours as well as itself.
      const near = [
        segD[i],
        i > 1 ? segD[i - 1] : segD[i],
        i + 1 < sp.length ? segD[i + 1] : segD[i],
      ];
      const hiD = Math.min(...near) - 0.001;
      prims.push({
        d: hiD,
        svg: `<line ${seg} stroke="${CABLE_HI}" stroke-width="${f1(w / 3)}" opacity="0.6"/>`,
      });
    }
  });

  // The panel under everything: the bounding box of the circuit plus air.
  const lo = { x: Infinity, z: Infinity },
    hi = { x: -Infinity, z: -Infinity };
  const grow = (c: Cell, sx = 1, sz = 1) => {
    lo.x = Math.min(lo.x, c.x);
    lo.z = Math.min(lo.z, c.z);
    hi.x = Math.max(hi.x, c.x + sx);
    hi.z = Math.max(hi.z, c.z + sz);
  };
  for (const p of placed.parts) grow(p.at, p.size.x, p.size.z);
  for (const c of placed.cables) for (const cell of c.cells) grow(cell);
  for (const n of opts.notes)
    if (n.kind === 'callout') grow({ x: n.at[0], y: 0, z: n.at[1] }, 6, 1);
  // Nothing to draw: a circuit with no parts, no cables and no callouts leaves
  // the bounds at +/-Infinity, and every coordinate downstream is NaN. Fall
  // back to a small empty panel, which is at least a valid picture.
  if (!Number.isFinite(lo.x) || !Number.isFinite(lo.z)) {
    lo.x = 0;
    lo.z = 0;
    hi.x = 8;
    hi.z = 8;
  }
  lo.x -= 3;
  lo.z -= 3;
  hi.x += 3;
  hi.z += 3;
  const corner = (x: number, z: number) => note(project(cam, [x * CELL_M, 0, z * CELL_M]));
  const quad = [corner(lo.x, lo.z), corner(hi.x, lo.z), corner(hi.x, hi.z), corner(lo.x, hi.z)];
  let panel = `<path class="panel" fill="${PANEL}" stroke="${PANEL_EDGE}" stroke-width="2" d="M${quad.map((p) => `${f1(p.x)} ${f1(p.y)}`).join('L')}Z"/>`;
  for (let x = Math.ceil(lo.x / 8) * 8; x < hi.x; x += 8) {
    const a = corner(x, lo.z),
      b = corner(x, hi.z);
    panel += `<line x1="${f1(a.x)}" y1="${f1(a.y)}" x2="${f1(b.x)}" y2="${f1(b.y)}" stroke="${PANEL_LINE}" stroke-width="1.5"/>`;
  }
  for (let z = Math.ceil(lo.z / 8) * 8; z < hi.z; z += 8) {
    const a = corner(lo.x, z),
      b = corner(hi.x, z);
    panel += `<line x1="${f1(a.x)}" y1="${f1(a.y)}" x2="${f1(b.x)}" y2="${f1(b.y)}" stroke="${PANEL_LINE}" stroke-width="1.5"/>`;
  }

  // Annotations, over everything.
  let notes = '';
  for (const n of opts.notes) {
    if (n.kind === 'group') {
      const ps = n.parts.flatMap((id) => partPts.get(id) ?? []);
      if (!ps.length) continue;
      const pad = 0.08 * SCALE;
      const x0 = Math.min(...ps.map((p) => p.x)) - pad,
        x1 = Math.max(...ps.map((p) => p.x)) + pad;
      const y0 = Math.min(...ps.map((p) => p.y)) - pad,
        y1 = Math.max(...ps.map((p) => p.y)) + pad;
      pts.push({ x: x0, y: y0 - 0.1 * SCALE, d: 0 }, { x: x1, y: y1, d: 0 });
      notes += `<rect class="note-group" x="${f1(x0)}" y="${f1(y0)}" width="${f1(x1 - x0)}" height="${f1(y1 - y0)}" fill="none" stroke="${NOTE[n.color]}" stroke-width="2"/>`;
      notes += `<text x="${f1(x0)}" y="${f1(y0 - 6)}" font-size="${f1(0.075 * SCALE)}" fill="${NOTE[n.color]}" font-family="Chakra Petch, sans-serif">${esc(n.text)}</text>`;
    } else if (n.kind === 'callout') {
      const p = note(project(cam, [(n.at[0] + 0.5) * CELL_M, 0.002, (n.at[1] + 0.5) * CELL_M]));
      notes += `<text x="${f1(p.x)}" y="${f1(p.y)}" font-size="${f1(0.07 * SCALE)}" fill="${NOTE[n.color]}" font-family="Chakra Petch, sans-serif">${esc(n.text)}</text>`;
    }
  }

  prims.sort((a, b) => b.d - a.d);
  const pad = 20;
  const minX = Math.min(...pts.map((p) => p.x)) - pad,
    maxX = Math.max(...pts.map((p) => p.x)) + pad;
  const minY = Math.min(...pts.map((p) => p.y)) - pad,
    maxY = Math.max(...pts.map((p) => p.y)) + pad;
  const w = maxX - minX,
    h = maxY - minY;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f1(minX)} ${f1(minY)} ${f1(w)} ${f1(h)}" width="${f1(w)}" height="${f1(h)}" font-family="JetBrains Mono, ui-monospace, monospace">` +
    panel +
    prims.map((p) => p.svg).join('') +
    tags +
    notes +
    '</svg>\n'
  );
}
