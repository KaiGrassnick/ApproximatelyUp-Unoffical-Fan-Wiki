import { CABLE_PART, CableKind, Catalog, CircuitStats, PlacedCircuit } from './model';

/**
 * The numbers under the picture.
 *
 * Mass is the parts' `_mass` plus every cable cell at the cable's own
 * `_mass`, because one inventory unit of cable is one cell and the prefab's
 * mass is per unit. Power is the running draw of the parts that have one;
 * every math block has none, so a pure signal circuit costs the batteries
 * nothing. Pools are what the game actually counts against stock: every
 * math block is one `MathBlock`, and a cable's cells are units of the cable.
 */
export function computeStats(placed: PlacedCircuit, catalog: Catalog): CircuitStats {
  const parts: Record<string, number> = {};
  const pools: Record<string, number> = {};
  const cableCells: Record<CableKind, number> = { data: 0, power: 0, nano: 0, plasma: 0 };
  let mass = 0;
  let power = 0;

  for (const p of placed.parts) {
    const spec = catalog.get(p.type)!;
    parts[p.type] = (parts[p.type] ?? 0) + 1;
    pools[spec.pool] = (pools[spec.pool] ?? 0) + 1;
    mass += spec.mass;
    power += spec.power;
  }
  for (const c of placed.cables) {
    if (!c.cells.length) continue;
    const cable = catalog.get(CABLE_PART[c.kind]);
    cableCells[c.kind] += c.cells.length;
    mass += c.cells.length * (cable?.mass ?? 0);
    const pool = cable?.pool ?? CABLE_PART[c.kind];
    pools[pool] = (pools[pool] ?? 0) + c.cells.length;
  }

  const round = (n: number) => Math.round(n * 1000) / 1000;
  return { mass: round(mass), power: round(power), parts, pools, cableCells };
}

/** Pool -> units, the shape `shortfalls` compares against a Stock. */
export function poolNeeds(stats: CircuitStats): Record<string, number> {
  return { ...stats.pools };
}
