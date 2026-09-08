import { Comp } from '../models';
import { scGroupOf } from '../stats';
import { Catalog, CELL_M, Cell, DIRS, PORT_KINDS, PartSpec, PortKind, PortSpec } from './model';

/**
 * What the engine knows about a part, read once off the prefab stats.
 *
 * The prefab measures in metres about the part's centre; the engine works in
 * cells from the part's min corner. A port at -0.0625 on a 0.25 span is in
 * cell 0, at +0.0625 in cell 1 -- the cell whose centre the port sits on,
 * which is what floor((p + span/2) / cell) says.
 */

/** The prefab fields that express a running draw, in P/s. Batteries and cables are not draws. */
const POWER_FIELDS = [
  '_powerConsumptionPerSec',
  '_consumptionPerSec',
  '_idlePowerConsumptionPerSec',
];

const BASE: Record<PortKind, string> = {
  in: 'in',
  out: 'out',
  pwr: 'pwr',
  io: 'io',
  plasma: 'plasma',
  unset: 'port',
};

/** The integer inside "Label (n)": the label is the extractor's, the integer is the game's. */
function enumInt(s: unknown): number {
  const m = /\((\d+)\)\s*$/.exec(String(s ?? ''));
  return m ? Number(m[1]) : NaN;
}

function num(v: unknown): number {
  return typeof v === 'number' ? v : 0;
}

interface RawPort {
  _position: { x: number; y: number; z: number };
  _direction: string;
  _type: string;
}

function toCell(pos: { x: number; y: number; z: number }, bounds: Cell): Cell {
  const f = (p: number, span: number) => Math.floor((p + span / 2) / CELL_M + 1e-6);
  return { x: f(pos.x, bounds.x), y: f(pos.y, bounds.y), z: f(pos.z, bounds.z) };
}

function ports(raw: RawPort[], descs: string[], bounds: Cell): PortSpec[] {
  const kinds = raw.map((p) => PORT_KINDS[enumInt(p._type)] ?? 'unset');
  const count = new Map<PortKind, number>();
  for (const k of kinds) count.set(k, (count.get(k) ?? 0) + 1);
  const seen = new Map<PortKind, number>();
  return raw.map((p, i) => {
    const kind = kinds[i];
    const n = (seen.get(kind) ?? 0) + 1;
    seen.set(kind, n);
    return {
      name: count.get(kind) === 1 ? BASE[kind] : `${BASE[kind]}${n}`,
      kind,
      index: i,
      desc: descs[i] ?? '',
      local: toCell(p._position, bounds),
      dir: DIRS[enumInt(p._direction)] ?? '-z',
    };
  });
}

export function buildCatalog(comps: Comp[]): Catalog {
  const inBuild = comps.filter((c) => c.in_build && Object.keys(c.stats).length);
  const statsOf = (c: Comp) => Object.values(c.stats)[0] ?? {};
  const poolOf = (c: Comp) => scGroupOf(statsOf(c)) ?? c.id;

  // A pool is stocked in a new game when any member starts with stock; that
  // is the rule availability.ts applies to a save with no objectives done.
  const stocked = new Set<string>();
  for (const c of inBuild) if (num(statsOf(c)['_availableAmount']) > 0) stocked.add(poolOf(c));

  const cat: Catalog = new Map();
  for (const c of inBuild) {
    const st = statsOf(c);
    const b = (st['_bounds'] as Cell | undefined) ?? { x: CELL_M, y: CELL_M, z: CELL_M };
    const size = {
      x: Math.max(1, Math.round(b.x / CELL_M)),
      y: Math.max(1, Math.round(b.y / CELL_M)),
      z: Math.max(1, Math.round(b.z / CELL_M)),
    };
    const spec: PartSpec = {
      id: c.id,
      name: c.name,
      size,
      ports: ports((st['_electricPorts'] as RawPort[] | undefined) ?? [], c.ports, b),
      mass: num(st['_mass']),
      power: POWER_FIELDS.reduce((sum, f) => sum + num(st[f]), 0),
      pool: poolOf(c),
      newGame: stocked.has(poolOf(c)),
    };
    cat.set(c.id, spec);
  }
  return cat;
}

/** The names a wire may use on this part, with the game's own description of each. */
export function portTable(spec: PartSpec): { name: string; kind: PortKind; desc: string }[] {
  return spec.ports.map(({ name, kind, desc }) => ({ name, kind, desc }));
}
