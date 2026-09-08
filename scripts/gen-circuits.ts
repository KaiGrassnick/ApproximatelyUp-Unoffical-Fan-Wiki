#!/usr/bin/env tsx
/**
 * Compiles content/circuits/*.json into data/circuits.json, data/circuits/<id>.svg
 * and data/circuits/<id>.json, plus data/circuit_parts.json for contributors
 * and data/circuit-meshes.json, the geometry the 3D view draws with.
 *
 * The engine lives in src/app/core/circuits/ and is plain TypeScript so the
 * page can run the same code against the reader's save; this script is the
 * thin Node shell around it, run through tsx because CI's Node 22 cannot
 * strip types itself.
 *
 * Two properties are load-bearing, as with gen-guides.mjs: output is
 * deterministic (sorted keys, stable layout and routing) because the manifest
 * hashes it; and an impossible circuit -- one that fails to route, breaks a
 * wiring rule, or needs more of a pool than the whole game hands out -- fails
 * the build rather than shipping.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from './lib/markdown.mjs';
import { BuiltCircuit, buildCircuit, isBuilt } from '../src/app/core/circuits/build';
import { Finding } from '../src/app/core/circuits/model';
import { buildCatalog, portTable } from '../src/app/core/circuits/parts';
import { MeshFile } from '../src/app/core/circuits/render-svg';
import { stockEverything, stockNewGame } from '../src/app/core/circuits/stock';
import { Comp, Objective } from '../src/app/core/models';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const SRC = join(ROOT, 'content', 'circuits');
const DATA = join(ROOT, 'data');
const OUT_DIR = join(DATA, 'circuits');

const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;
const comps = readJson<Comp[]>(join(DATA, 'components_full.json'));
const objs = readJson<Objective[]>(join(DATA, 'objectives.json'));
const meshes = readJson<MeshFile>(join(DATA, 'meshes.json'));
const catalog = buildCatalog(comps);
const ctx = {
  catalog,
  meshes,
  newGame: stockNewGame(comps),
  everything: stockEverything(comps, objs),
};

/** Stable JSON: sorted keys at every level, `indent=1` like the Python writer. */
function stable(v: unknown): string {
  const sort = (x: unknown): unknown =>
    Array.isArray(x)
      ? x.map(sort)
      : x && typeof x === 'object'
        ? Object.fromEntries(
            Object.keys(x as object)
              .sort()
              .map((k) => [k, sort((x as Record<string, unknown>)[k])]),
          )
        : x;
  return JSON.stringify(sort(v), null, 1) + '\n';
}

function show(file: string, findings: Finding[]): void {
  for (const f of findings)
    console.error(`  ${f.level.padEnd(5)} ${file} ${f.where}: ${f.message}`);
}

// Written first, and whatever happens to the circuits: it is the reference a
// contributor needs to fix the very error that would stop the rest.
const table: Record<string, unknown> = {};
for (const spec of catalog.values()) {
  if (spec.ports.length) table[spec.id] = { name: spec.name, ports: portTable(spec) };
}
writeFileSync(join(DATA, 'circuit_parts.json'), stable(table));

let files: string[];
try {
  files = readdirSync(SRC)
    .filter((f) => f.endsWith('.json'))
    .sort();
} catch {
  files = [];
}

const index: { order: number; entry: Record<string, unknown> }[] = [];
const outputs = new Map<string, { json: string; svg: string }>();
// Kept beside the serialised outputs so the mesh subset below can see which
// part types the shipped circuits actually place.
const built = new Map<string, BuiltCircuit>();
let failed = false;

for (const file of files) {
  const id = file.replace(/\.json$/, '');
  const json = readJson<Record<string, unknown>>(join(SRC, file));
  const r = buildCircuit(json, ctx);
  show(file, r.findings);
  if (!isBuilt(r) || r.findings.some((f) => f.level === 'error')) {
    failed = true;
    continue;
  }
  const notesHtml = r.source.notes
    .filter((n): n is { kind: 'md'; body: string } => n.kind === 'md')
    .map((n) => render(n.body))
    .join('');
  built.set(id, r);
  outputs.set(id, {
    svg: r.svg,
    json: stable({
      id,
      source: r.source,
      placed: r.placed,
      stats: r.stats,
      needs: r.needs,
      findings: r.findings,
      newGame: r.newGame,
      bom: r.bom,
      notesHtml,
    }),
  });
  index.push({
    order: r.source.order,
    entry: {
      id,
      title: r.source.title,
      summary: r.source.summary,
      spoiler: r.source.spoiler,
      updated: r.source.updated,
      stats: r.stats,
      needs: r.needs,
      newGame: r.newGame,
    },
  });
}

if (failed) {
  console.error('circuits: not written -- fix the errors above');
  process.exit(1);
}

index.sort(
  (a, b) => a.order - b.order || String(a.entry['id']).localeCompare(String(b.entry['id'])),
);

// Removed and rebuilt, so a deleted circuit does not linger as a served file.
rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });
for (const [id, o] of outputs) {
  writeFileSync(join(OUT_DIR, `${id}.svg`), o.svg);
  writeFileSync(join(OUT_DIR, `${id}.json`), o.json);
}
writeFileSync(join(DATA, 'circuits.json'), stable(index.map((i) => i.entry)));

// The scene needs geometry the page can fetch, and the full export is 2.6 MB
// of instruments no circuit uses. This is the slice the shipped circuits
// reference: it grows only when a circuit uses a new part.
const usedParts = new Set<string>();
for (const b of built.values()) for (const p of b.placed.parts) usedParts.add(p.type);
const usedMeshes = new Set<string>();
for (const t of usedParts) for (const r of meshes.parts[t]?.renderers ?? []) usedMeshes.add(r.mesh);
const subset: MeshFile = {
  cell: meshes.cell,
  meshes: Object.fromEntries([...usedMeshes].sort().map((m) => [m, meshes.meshes[m]])),
  parts: Object.fromEntries([...usedParts].sort().map((t) => [t, meshes.parts[t]])),
};
writeFileSync(join(DATA, 'circuit-meshes.json'), stable(subset));

console.log(
  `circuits: ${outputs.size} -> data/circuits.json + data/circuits/ + data/circuit-meshes.json`,
);
