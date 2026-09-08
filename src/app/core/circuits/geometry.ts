import { Cell, Dir, Rot } from './model';

/** Unit step per direction. */
export const DIR_VEC: Record<Dir, Cell> = {
  '+x': { x: 1, y: 0, z: 0 },
  '-x': { x: -1, y: 0, z: 0 },
  '+y': { x: 0, y: 1, z: 0 },
  '-y': { x: 0, y: -1, z: 0 },
  '+z': { x: 0, y: 0, z: 1 },
  '-z': { x: 0, y: 0, z: -1 },
};

export function add(a: Cell, b: Cell): Cell {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function key(c: Cell): string {
  return `${c.x},${c.y},${c.z}`;
}

/**
 * A quarter turn about +y, applied to a cell inside a footprint whose min
 * corner is the origin. One turn maps (x, z) -> (depth - 1 - z, x), so that
 * the footprint's own corner stays at the origin and its width and depth
 * swap; rotateDir and rotatedSize are the same turn seen from the other two
 * sides, and the three must agree or a port leaves its block.
 */
export function rotateCell(c: Cell, size: Cell, rot: Rot): Cell {
  let { x, z } = c;
  let { x: w, z: d } = size;
  for (let turns = rot / 90; turns > 0; turns--) {
    [x, z] = [d - 1 - z, x];
    [w, d] = [d, w];
  }
  return { x, y: c.y, z };
}

export function rotateDir(dir: Dir, rot: Rot): Dir {
  const ring: Dir[] = ['+z', '-x', '-z', '+x'];
  const i = ring.indexOf(dir);
  if (i === -1) return dir;
  return ring[(i + rot / 90) % 4];
}

export function rotatedSize(size: Cell, rot: Rot): Cell {
  return rot === 90 || rot === 270 ? { x: size.z, y: size.y, z: size.x } : { ...size };
}

/** Every cell of a box with min corner `at` and extent `size`, in a stable order. */
export function footprint(at: Cell, size: Cell): Cell[] {
  const out: Cell[] = [];
  for (let x = 0; x < size.x; x++)
    for (let y = 0; y < size.y; y++)
      for (let z = 0; z < size.z; z++) out.push({ x: at.x + x, y: at.y + y, z: at.z + z });
  return out;
}
