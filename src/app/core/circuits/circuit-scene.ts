import { Orbit } from '../../features/galaxy/orbit';
import { Cable, Catalog, CELL_M, Cell, PlacedCircuit, PlacedPart } from './model';
import { portCell } from './route';

/**
 * The geometry a circuit scene needs, in metres, with no renderer attached.
 *
 * Everything upstream of here counts cells; a viewer counts metres. This is
 * the one place that converts, so the SVG renderer and the three.js view
 * cannot drift apart: they call the same `cablePoints` for a wire's thread and
 * the same `partTransform` for a block's place. Nothing here imports Angular
 * or three.js -- it is arithmetic, and it is tested as arithmetic.
 */

export interface Box3m {
  min: [number, number, number];
  max: [number, number, number];
  centre: [number, number, number];
  diagonal: number;
}

/** Centre of a cell in metres. Cell (0,0,0) spans 0..0.125, so its centre is 0.0625. */
function cellCentre(c: Cell): [number, number, number] {
  return [(c.x + 0.5) * CELL_M, (c.y + 0.5) * CELL_M, (c.z + 0.5) * CELL_M];
}

/**
 * How big an empty circuit's panel is, in cells. A circuit with no parts and
 * no cables leaves the bounds at +/-Infinity and every number downstream is
 * NaN; render-svg.ts falls back to the same 8x8 patch, so an empty page shows
 * a small panel in both views rather than a broken camera.
 */
const EMPTY_PANEL = 8;

/**
 * The box the parts and cables fill, plus `marginCells` of panel around them.
 *
 * The margin grows x and z only. It is panel, and the panel is the ground:
 * nothing is ever below y 0, and a box that dipped under it would aim the
 * home camera at a centre no geometry sits at.
 */
export function sceneBounds(placed: PlacedCircuit, marginCells = 0): Box3m {
  const lo = { x: Infinity, y: Infinity, z: Infinity };
  const hi = { x: -Infinity, y: -Infinity, z: -Infinity };
  const grow = (at: Cell, size: Cell) => {
    lo.x = Math.min(lo.x, at.x);
    lo.y = Math.min(lo.y, at.y);
    lo.z = Math.min(lo.z, at.z);
    hi.x = Math.max(hi.x, at.x + size.x);
    hi.y = Math.max(hi.y, at.y + size.y);
    hi.z = Math.max(hi.z, at.z + size.z);
  };
  const one = { x: 1, y: 1, z: 1 };
  for (const p of placed.parts) grow(p.at, p.size);
  for (const c of placed.cables) for (const cell of c.cells) grow(cell, one);
  if (!Number.isFinite(lo.x)) {
    lo.x = lo.y = lo.z = 0;
    hi.x = hi.z = EMPTY_PANEL;
    hi.y = 1;
  }
  lo.x -= marginCells;
  lo.z -= marginCells;
  hi.x += marginCells;
  hi.z += marginCells;

  const min: [number, number, number] = [lo.x * CELL_M, lo.y * CELL_M, lo.z * CELL_M];
  const max: [number, number, number] = [hi.x * CELL_M, hi.y * CELL_M, hi.z * CELL_M];
  return {
    min,
    max,
    centre: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
    diagonal: Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]),
  };
}

/**
 * Where a part's mesh goes and which way it faces.
 *
 * The engine turns a footprint by mapping (x, z) -> (depth-1-z, x), which
 * sends +z to -x; a +y rotation in three.js sends +z to +x. So a part rotated
 * by `rot` degrees in cells is a mesh rotated by -rot -- the same sign
 * render-svg.ts's `partMatrix` uses, for the same reason.
 */
export function partTransform(part: PlacedPart): {
  centre: [number, number, number];
  yRad: number;
} {
  return {
    centre: [
      (part.at.x + part.size.x / 2) * CELL_M,
      (part.at.y + part.size.y / 2) * CELL_M,
      (part.at.z + part.size.z / 2) * CELL_M,
    ],
    yRad: (-part.rot * Math.PI) / 180,
  };
}

/**
 * The points a cable is drawn through, in metres: a face point on the source
 * block, every cell centre, then a face point on the target.
 *
 * A face point is the midpoint of the port cell's centre and the neighbouring
 * cable cell's centre -- which is the middle of the block's face, because the
 * two cells share it. Drawing to the port cell's own centre would bury the end
 * of the wire inside the block instead.
 *
 * Empty for a touching cable: the game joins two abutting ports with no cable
 * at all, so there is nothing to draw.
 */
export function cablePoints(
  cable: Cable,
  placed: PlacedCircuit,
  catalog: Catalog,
): [number, number, number][] {
  if (!cable.cells.length) return [];
  const face = (ref: { part: string; port: string }, cell: Cell): [number, number, number] => {
    const part = placed.parts.find((p) => p.id === ref.part)!;
    const a = cellCentre(portCell(part, catalog.get(part.type)!, ref.port));
    const b = cellCentre(cell);
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  };
  return [
    face(cable.from, cable.cells[0]),
    ...cable.cells.map(cellCentre),
    face(cable.to, cable.cells.at(-1)!),
  ];
}

/**
 * Pitched down 75 degrees: the SVG `top` camera's angle, so switching between
 * the picture and the scene does not move the reader. Steeper angles are a
 * drag away.
 */
const HOME_PITCH = (75 * Math.PI) / 180;
/** Far enough back that the framed box fits a normal field of view with air around it. */
const HOME_FRAMING = 1.6;
const MIN_FRAMING = 0.4;
const MAX_FRAMING = 4;

/**
 * The framing the view opens on.
 *
 * Yaw is pi, not 0. `cameraPosition` puts the eye at z = d cos(pitch) cos(yaw),
 * so yaw 0 stands the reader at +z -- behind the circuit. Inputs face -z, and
 * the game shows a circuit read from its input side, so half a turn puts the
 * reader where the wires come in.
 */
export function homeOrbit(box: Box3m): Orbit {
  return { yaw: Math.PI, pitch: HOME_PITCH, distance: HOME_FRAMING * box.diagonal };
}

/**
 * How far out the reader may sit, in metres, as a multiple of the circuit's
 * own size. A fixed range would swallow a two-block circuit and strand a
 * fifty-block one, so the limits scale with what is on the panel.
 */
export function clampDistance(box: Box3m, distance: number): number {
  return Math.min(MAX_FRAMING * box.diagonal, Math.max(MIN_FRAMING * box.diagonal, distance));
}
