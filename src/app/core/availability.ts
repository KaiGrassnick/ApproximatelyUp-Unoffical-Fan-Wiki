import { Comp, Objective, World } from './models';
import { scGroupOf } from './stats';

/**
 * A frame block with a pipe through it eats pipe stock as well as frame
 * stock. The prefab says so through `_pipeInventoryConsumePrefab`, a
 * reference to the pipe it consumes — a PPtr, which components.py drops
 * along with every other object reference, so the target is not in
 * components_full.json to read. There are exactly two such parts
 * (EPC_SCFramePipe: Frame Quarter With Pipe and its nanoframe twin) and
 * exactly two pipe pools, so the mapping is pinned by its own arity.
 * Confirmed against the game: with no pipes unlocked, neither is placeable,
 * though both sit in a frame pool that is full.
 *
 * Kept in step with PIPE_CONSUMERS in tools/availability.py.
 */
const PIPE_CONSUMERS: Record<string, Record<string, string>> = {
  EPC_SCFramePipe: { Frame: 'Pipe', Nanoframe: 'Nanopipe' },
};

/**
 * Every stock pool a component spends when it is placed.
 *
 * Three sources, all of them the game's own:
 *   - `_scGroup`, the pool the part is made of (its own id when ungrouped),
 *   - `_scSecondaryGroup`, a second material it also spends — set on the 20
 *     windows, which are a frame AND a pane,
 *   - the pipe a frame-with-pipe consumes, see PIPE_CONSUMERS.
 */
export function poolsNeeded(
  id: string,
  stats: Record<string, unknown>,
  group: string | null,
  cls: string | null,
): string[] {
  const out = new Set<string>([group ?? id]);
  const sec = ((stats['_scSecondaryGroup'] as string) || 'None (0)').split(' (')[0];
  if (sec !== 'None') out.add(sec);
  const consumes = cls ? PIPE_CONSUMERS[cls] : undefined;
  if (consumes && group && consumes[group]) out.add(consumes[group]);
  return [...out];
}

/**
 * Port of availability.compute_availability().
 *
 * The rule that matters: components sharing an `_scGroup` (Frame, Glass,
 * MathBlock, Pipe, ...) draw from ONE stock pool. A single reward of
 * "Frame Full x630" makes every frame shape placeable. Counting per-component
 * instead of per-pool badly undercuts what is buildable.
 *
 * Placeability asks only whether a pool is non-empty. `stock` additionally
 * carries how much went into it — the starting `_availableAmount` of every
 * member plus the amount on every reward from a completed objective. That is
 * what the save can tell us: units GRANTED, never units remaining, because a
 * .world file records no inventory at all.
 *
 * `_completed` in the save is an integer, not a boolean (values 1 and 2 both
 * appear). Any non-zero value counts as done, matching the Python.
 */
export interface Availability {
  have: Set<string>;
  /**
   * "{title or key} ({start})" — byte-identical to the Python and fixture-
   * pinned, `start` included. `start` is a raw internal location id (e.g.
   * "PlanetStation_Basalt_B02"), so this string is for the parity test only —
   * render `gateInfo` for anything user-facing.
   */
  gate: Map<string, string>;
  /** Same keys/values as `gate`, unformatted, so a caller can resolve `start` through locationName() instead of leaking the raw id. */
  gateInfo: Map<string, { title: string; start: string }>;
  members: Map<string, string[]>;
  group: Map<string, string | null>;
  /** pool id -> units granted. A pool with no entry has never been stocked. */
  stock: Map<string, number>;
  /** component id -> every pool it spends, from poolsNeeded(). */
  pools: Map<string, string[]>;
  done: Map<number, number>;
  visited: Set<number>;
}

export function computeAvailability(
  comps: Comp[],
  objs: Objective[],
  world: World | null,
): Availability {
  const byId = new Map(objs.map((o) => [o.id, o]));
  const av: Availability = {
    have: new Set(),
    gate: new Map(),
    gateInfo: new Map(),
    members: new Map(),
    group: new Map(),
    stock: new Map(),
    pools: new Map(),
    done: new Map(),
    visited: new Set(),
  };

  const stats = new Map<string, Record<string, unknown>>();
  const classOf = new Map<string, string | null>();
  for (const c of comps) {
    if (!c.in_build) continue;
    const st = Object.values(c.stats)[0] ?? {};
    stats.set(c.id, st);
    classOf.set(c.id, c.class);
    av.group.set(c.id, scGroupOf(st));
  }

  for (const [cid, g] of av.group) {
    if (!g) continue;
    const list = av.members.get(g) ?? [];
    list.push(cid);
    av.members.set(g, list);
  }
  for (const list of av.members.values()) list.sort();

  for (const [cid, st] of stats) {
    av.pools.set(cid, poolsNeeded(cid, st, av.group.get(cid) ?? null, classOf.get(cid) ?? null));
  }

  if (!world) return av;

  const keys = world._objectives.m_Keys;
  const values = world._objectives.m_Values;
  for (let i = 0; i < keys.length; i++) av.done.set(keys[i], values[i]._completed);
  for (const loc of world._universeLocations.m_Keys) av.visited.add(loc);

  const pool = (cid: string) => av.group.get(cid) ?? cid;
  const held = new Set<string>();

  const grant = (cid: string, amount: number) => {
    const p = pool(cid);
    held.add(p);
    av.stock.set(p, (av.stock.get(p) ?? 0) + amount);
  };

  for (const [cid, st] of stats) {
    const start = st['_availableAmount'];
    if (start) grant(cid, start as number);
  }
  for (const [oid, completed] of av.done) {
    if (!completed) continue;
    for (const r of byId.get(oid)?.reward ?? []) {
      if (stats.has(r.component)) grant(r.component, r.amount);
    }
  }

  // A part is placeable only when EVERY pool it draws on is non-empty — see
  // poolsNeeded(). Placing a window spends frame and glass both.
  for (const cid of stats.keys()) {
    if (av.pools.get(cid)!.every((p) => held.has(p))) av.have.add(cid);
  }

  for (const o of objs) {
    if (av.done.has(o.id)) continue;
    for (const r of o.reward) {
      if (!av.have.has(r.component) && !av.gate.has(r.component)) {
        av.gate.set(r.component, `${o.title || o.key} (${o.start})`);
        av.gateInfo.set(r.component, { title: o.title || o.key, start: o.start });
      }
    }
  }

  return av;
}
