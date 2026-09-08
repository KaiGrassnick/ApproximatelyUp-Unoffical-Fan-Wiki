import { Comp, Objective } from '../models';
import { scGroupOf } from '../stats';
import { Stock } from './model';

/**
 * How much of each pool a game can hold.
 *
 * The same arithmetic as computeAvailability() in ../availability.ts, for
 * two saves that do not exist as files: a new game (every part's starting
 * `_availableAmount`, summed by pool) and a finished one (that, plus every
 * reward of every objective). The reader's own save is the third stock, and
 * it comes from WorldService.availability().stock, which has this shape.
 */
function pools(comps: Comp[]): { id: string; pool: string; start: number }[] {
  return comps
    .filter((c) => c.in_build && Object.keys(c.stats).length)
    .map((c) => {
      const st = Object.values(c.stats)[0] ?? {};
      const start = st['_availableAmount'];
      return {
        id: c.id,
        pool: scGroupOf(st) ?? c.id,
        start: typeof start === 'number' ? start : 0,
      };
    });
}

export function stockNewGame(comps: Comp[]): Stock {
  const out: Stock = new Map();
  for (const p of pools(comps)) if (p.start > 0) out.set(p.pool, (out.get(p.pool) ?? 0) + p.start);
  return out;
}

export function stockEverything(comps: Comp[], objs: Objective[]): Stock {
  const out = stockNewGame(comps);
  const poolOf = new Map(pools(comps).map((p) => [p.id, p.pool]));
  for (const o of objs) {
    for (const r of o.reward) {
      const pool = poolOf.get(r.component);
      if (pool) out.set(pool, (out.get(pool) ?? 0) + r.amount);
    }
  }
  return out;
}

export function shortfalls(
  needs: Record<string, number>,
  stock: Stock,
): { pool: string; need: number; have: number }[] {
  return Object.entries(needs)
    .map(([pool, need]) => ({ pool, need, have: stock.get(pool) ?? 0 }))
    .filter((s) => s.need > s.have)
    .sort((a, b) => a.pool.localeCompare(b.pool));
}
