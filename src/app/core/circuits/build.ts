import { layout } from './layout';
import { Catalog, CircuitSource, CircuitStats, Finding, PlacedCircuit, Stock } from './model';
import { MeshFile, renderSvg } from './render-svg';
import { route } from './route';
import { parseSource } from './schema';
import { computeStats, poolNeeds } from './stats';
import { shortfalls } from './stock';
import { validate } from './validate';

/**
 * The stages in order, with one rule about failure: a file that does not
 * parse produces findings and nothing else; a file that parses is always
 * laid out, routed, judged and drawn, so an author sees every problem at
 * once and a picture of what the tool made of it.
 */
export interface BuiltCircuit {
  source: CircuitSource;
  placed: PlacedCircuit;
  stats: CircuitStats;
  needs: Record<string, number>;
  findings: Finding[];
  newGame: boolean;
  bom: { id: string; count: number }[];
  svg: string;
}

export interface BuildContext {
  catalog: Catalog;
  meshes: MeshFile;
  newGame: Stock;
  everything: Stock;
}

export function isBuilt(r: BuiltCircuit | { findings: Finding[] }): r is BuiltCircuit {
  return 'svg' in r;
}

export function buildCircuit(
  json: unknown,
  ctx: BuildContext,
): BuiltCircuit | { findings: Finding[] } {
  const parsed = parseSource(json, ctx.catalog);
  if (!parsed.source) return { findings: parsed.findings };
  const source = parsed.source;
  const findings = [...parsed.findings];

  const laid = layout(source, ctx.catalog);
  findings.push(...laid.findings);
  const routed = route(laid.parts, source.wires, ctx.catalog);
  findings.push(...routed.findings);
  const placed: PlacedCircuit = { parts: laid.parts, cables: routed.cables };

  findings.push(...validate(source, placed, ctx.catalog));

  const stats = computeStats(placed, ctx.catalog);
  const needs = poolNeeds(stats);
  const shortNew = shortfalls(needs, ctx.newGame);
  for (const s of shortNew) {
    findings.push({
      level: 'warn',
      where: `pool ${s.pool}`,
      message: `needs ${s.need}, a new game holds ${s.have}`,
    });
  }
  for (const s of shortfalls(needs, ctx.everything)) {
    findings.push({
      level: 'error',
      where: `pool ${s.pool}`,
      message: `needs ${s.need}, the whole game only ever hands out ${s.have}`,
    });
  }

  // The same rule gen-guides.mjs applies to a guide's part chips: a file
  // that names a part a new game cannot place is telling the reader about
  // something they have not earned, and must say so in the list.
  if (source.spoiler === 'none') {
    const locked = [...new Set(source.parts.map((p) => p.type))]
      .filter((t) => !ctx.catalog.get(t)!.newGame)
      .sort();
    if (locked.length) {
      findings.push({
        level: 'error',
        where: 'file',
        message:
          `names ${locked.join(', ')}, which a new game cannot place, but declares "spoiler: none"` +
          ' -- it should be "spoiler: components"',
      });
    }
  }

  const bom = Object.entries(stats.parts)
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const svg = renderSvg(placed, ctx.catalog, ctx.meshes, {
    view: source.view,
    notes: source.notes,
  });

  return { source, placed, stats, needs, findings, newGame: shortNew.length === 0, bom, svg };
}
