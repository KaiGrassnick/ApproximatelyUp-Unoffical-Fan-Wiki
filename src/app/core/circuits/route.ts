import { DIR_VEC, add, footprint, key, rotateCell, rotateDir } from './geometry';
import {
  Cable,
  CableKind,
  Catalog,
  Cell,
  Dir,
  Finding,
  MAX_UNANCHORED,
  PartSpec,
  PlacedPart,
  PortKind,
  SourceWire,
} from './model';
import { parsePortRef } from './schema';

/**
 * Cables on the cell grid.
 *
 * A cable in the game is a chain of 0.125 m cells, axis-aligned, straight or
 * elbowed, free to climb and to hang in the air for up to ten cells. That is
 * exactly a path on a 3D grid, so each wire is an A* search from the cell
 * outside its source port to the cell outside its target port, over the
 * cells nothing else occupies. Cost prefers a straight run on the panel:
 * a step costs 1, a step up or down 2 more, a change of direction 3 more,
 * and a cell in the air 1 more, which is what makes a cable go over another
 * only when it must, and come straight back down after it.
 *
 * Wires are routed in file order, and every routed cable blocks the next, so
 * the same file always gives the same picture -- which the manifest hash
 * depends on. An author who wants a different picture reorders the wires.
 */

const STEP = 1;
const CLIMB = 2;
const BEND = 3;
/**
 * Extra for every cell above the panel, so an airborne run pays by its length.
 * Without it a bridge never comes back down: descending costs a bend the
 * search can always defer, and the cable hangs on to the goal until it trips
 * MAX_UNANCHORED. A builder brings a cable down right after the obstacle, and
 * so does the game, which only carries an unsupported cable so far.
 */
const AIR = 1;
/** Air around the parts the search may use. */
const MARGIN = 6;
/** Layers above the panel a cable may climb to. One bridge level is enough. */
const HEIGHT = 2;

const ALL_DIRS: Dir[] = ['+x', '-x', '+y', '-y', '+z', '-z'];

export function portCell(part: PlacedPart, spec: PartSpec, portName: string): Cell {
  const p = spec.ports.find((q) => q.name === portName)!;
  return add(part.at, rotateCell(p.local, spec.size, part.rot));
}

export function exitCell(part: PlacedPart, spec: PartSpec, portName: string): Cell {
  const p = spec.ports.find((q) => q.name === portName)!;
  return add(portCell(part, spec, portName), DIR_VEC[rotateDir(p.dir, part.rot)]);
}

/** What kind of cable two port kinds want; null when they cannot share one. */
export function cableFor(a: PortKind, b: PortKind): CableKind | null {
  const data = (k: PortKind) => k === 'in' || k === 'out' || k === 'io';
  if (data(a) && data(b)) return 'data';
  if (a === 'pwr' && b === 'pwr') return 'power';
  if (a === 'plasma' && b === 'plasma') return 'plasma';
  return null;
}

export function route(
  parts: PlacedPart[],
  wires: SourceWire[],
  catalog: Catalog,
): { cables: Cable[]; findings: Finding[] } {
  const findings: Finding[] = [];
  const cables: Cable[] = [];
  const partById = new Map(parts.map((p) => [p.id, p]));
  const specOf = (p: PlacedPart) => catalog.get(p.type)!;

  const solid = new Map<string, string>(); // part cells
  for (const p of parts) for (const c of footprint(p.at, p.size)) solid.set(key(c), p.id);
  const taken = new Set<string>(); // cable cells

  const lo = { x: Infinity, z: Infinity };
  const hi = { x: -Infinity, z: -Infinity };
  for (const p of parts) {
    lo.x = Math.min(lo.x, p.at.x);
    lo.z = Math.min(lo.z, p.at.z);
    hi.x = Math.max(hi.x, p.at.x + p.size.x);
    hi.z = Math.max(hi.z, p.at.z + p.size.z);
  }
  const inside = (c: Cell) =>
    c.x >= lo.x - MARGIN &&
    c.x < hi.x + MARGIN &&
    c.z >= lo.z - MARGIN &&
    c.z < hi.z + MARGIN &&
    c.y >= 0 &&
    c.y < HEIGHT;

  wires.forEach((w, i) => {
    const where = `wire ${i + 1}`;
    const from = parsePortRef(w.from)!;
    const to = parsePortRef(w.to)!;
    const a = partById.get(from.part);
    const b = partById.get(to.part);
    // layout() drops a pinned part that overlaps another, so a wire that
    // parsed against the source can still name a part nothing placed.
    for (const [part, ref] of [
      [a, w.from],
      [b, w.to],
    ] as const) {
      if (!part) {
        findings.push({
          level: 'error',
          where,
          message: `${ref} names a part that was not placed`,
        });
      }
    }
    if (!a || !b) return;

    const pa = specOf(a).ports.find((p) => p.name === from.port)!;
    const pb = specOf(b).ports.find((p) => p.name === to.port)!;
    const kind = w.cable ?? cableFor(pa.kind, pb.kind);
    if (!kind) {
      findings.push({
        level: 'error',
        where,
        message: `${w.from} and ${w.to} are not the same kind of port`,
      });
      return;
    }
    const start = exitCell(a, specOf(a), from.port);
    const goal = exitCell(b, specOf(b), to.port);

    // Face to face: the game joins these with no cable at all.
    const touching =
      key(start) === key(portCell(b, specOf(b), to.port)) &&
      key(goal) === key(portCell(a, specOf(a), from.port));
    if (touching) {
      cables.push({ from, to, kind, cells: [] });
      return;
    }
    let blocked = false;
    for (const [cell, ref] of [
      [start, w.from],
      [goal, w.to],
    ] as const) {
      const by = solid.get(key(cell)) ?? (taken.has(key(cell)) ? 'a cable' : null);
      if (!by) continue;
      findings.push({ level: 'error', where, message: `${ref} is blocked by ${by}` });
      blocked = true;
    }
    if (blocked) return;

    const path = astar(start, goal, (c) => inside(c) && !solid.has(key(c)) && !taken.has(key(c)));
    if (!path) {
      findings.push({
        level: 'error',
        where,
        message: `no way to run a cable from ${w.from} to ${w.to}`,
      });
      return;
    }
    const hang = longestUnanchored(path, solid);
    if (hang > MAX_UNANCHORED) {
      findings.push({
        level: 'error',
        where,
        message: `${hang} cells hang unsupported; the game allows ${MAX_UNANCHORED}`,
      });
      return;
    }
    for (const c of path) taken.add(key(c));
    cables.push({ from, to, kind, cells: path });
  });

  return { cables, findings };
}

/** The longest run of cells above the panel with no part beside them. */
export function longestUnanchored(path: Cell[], solid: Map<string, string>): number {
  let run = 0;
  let worst = 0;
  for (const c of path) {
    const anchored = c.y === 0 || ALL_DIRS.some((d) => solid.has(key(add(c, DIR_VEC[d]))));
    run = anchored ? 0 : run + 1;
    worst = Math.max(worst, run);
  }
  return worst;
}

interface Node {
  cell: Cell;
  dir: Dir | null;
  g: number;
  f: number;
  prev: Node | null;
  seq: number;
}

function astar(start: Cell, goal: Cell, free: (c: Cell) => boolean): Cell[] | null {
  const h = (c: Cell) => Math.abs(c.x - goal.x) + Math.abs(c.y - goal.y) + Math.abs(c.z - goal.z);
  const open = new Heap();
  let seq = 0;
  open.push({ cell: start, dir: null, g: 0, f: h(start), prev: null, seq: seq++ });
  const best = new Map<string, number>();
  while (open.size) {
    const n = open.pop()!;
    if (key(n.cell) === key(goal)) {
      const out: Cell[] = [];
      for (let m: Node | null = n; m; m = m.prev) out.push(m.cell);
      return out.reverse();
    }
    const stateKey = `${key(n.cell)}|${n.dir ?? ''}`;
    if ((best.get(stateKey) ?? Infinity) < n.g) continue;
    for (const d of ALL_DIRS) {
      const next = add(n.cell, DIR_VEC[d]);
      if (!free(next)) continue;
      const g =
        n.g +
        STEP +
        (d === '+y' || d === '-y' ? CLIMB : 0) +
        (n.dir && n.dir !== d ? BEND : 0) +
        (next.y > 0 ? AIR : 0);
      const k = `${key(next)}|${d}`;
      if (g >= (best.get(k) ?? Infinity)) continue;
      best.set(k, g);
      open.push({ cell: next, dir: d, g, f: g + h(next), prev: n, seq: seq++ });
    }
  }
  return null;
}

/** A binary min-heap on (f, seq): ties break by insertion, so the search is deterministic. */
class Heap {
  private a: Node[] = [];
  get size() {
    return this.a.length;
  }
  push(n: Node) {
    this.a.push(n);
    let i = this.a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.less(this.a[i], this.a[p])) {
        [this.a[i], this.a[p]] = [this.a[p], this.a[i]];
        i = p;
      } else break;
    }
  }
  pop(): Node | undefined {
    const top = this.a[0];
    const last = this.a.pop()!;
    if (this.a.length) {
      this.a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.a.length && this.less(this.a[l], this.a[m])) m = l;
        if (r < this.a.length && this.less(this.a[r], this.a[m])) m = r;
        if (m === i) break;
        [this.a[i], this.a[m]] = [this.a[m], this.a[i]];
        i = m;
      }
    }
    return top;
  }
  private less(x: Node, y: Node) {
    return x.f !== y.f ? x.f < y.f : x.seq < y.seq;
  }
}
