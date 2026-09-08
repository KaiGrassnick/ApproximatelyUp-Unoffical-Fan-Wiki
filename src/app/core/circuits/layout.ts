import { footprint, key, rotatedSize } from './geometry';
import { Catalog, CircuitSource, Finding, PlacedPart } from './model';
import { parsePortRef } from './schema';

/**
 * Where the parts go.
 *
 * The game's blocks are built with their inputs on the -z edge and their
 * outputs on +z, so a signal reads bottom-to-top in the screenshots. The
 * layout follows that: parts are layered by how far a signal has travelled
 * to reach them, layer L sits further along +z than layer L-1, and within a
 * layer a part sits near the parts that feed it. It is a plain layered
 * layout, not Sugiyama -- the circuits this is for have a dozen blocks, and
 * the router bends cables around whatever this gets slightly wrong.
 *
 * A part with `at` is pinned: it stays, and auto-placed parts are nudged
 * along +x until they clear it. Two pinned parts on the same cells are the
 * author's mistake and are reported, not moved.
 */

/** Cells of air between layers: room for a cable to leave, bend, and arrive. */
const Z_GAP = 4;
/** Cells between siblings in one layer: room for a cable to pass between them. */
const X_GAP = 3;

export function layout(
  source: CircuitSource,
  catalog: Catalog,
): { parts: PlacedPart[]; findings: Finding[] } {
  const findings: Finding[] = [];
  const specOf = (id: string) => catalog.get(source.parts.find((p) => p.id === id)!.type)!;
  const placed = new Map<string, PlacedPart>();
  const occupied = new Map<string, string>(); // cell key -> part id

  const claim = (part: PlacedPart): string | null => {
    for (const c of footprint(part.at, part.size)) {
      const other = occupied.get(key(c));
      if (other) return other;
    }
    for (const c of footprint(part.at, part.size)) occupied.set(key(c), part.id);
    return null;
  };

  // Pinned first: they are the fixed points everything else flows around.
  for (const sp of source.parts) {
    if (!sp.at) continue;
    const rot = sp.rot ?? 0;
    const part: PlacedPart = {
      id: sp.id,
      type: sp.type,
      at: { x: sp.at[0], y: 0, z: sp.at[1] },
      rot,
      size: rotatedSize(specOf(sp.id).size, rot),
      ...display(sp),
    };
    const hit = claim(part);
    if (hit) findings.push({ level: 'error', where: sp.id, message: `overlaps ${hit}` });
    else placed.set(sp.id, part);
  }

  // Layer the unpinned parts by longest signal path, ignoring edges that
  // close a cycle: a feedback loop is a normal circuit, not an error, and the
  // part that closes it simply sits in the layer its forward inputs put it in.
  const free = source.parts.filter((p) => !p.at).map((p) => p.id);
  const freeSet = new Set(free);
  const edges: [string, string][] = [];
  for (const w of source.wires) {
    const a = parsePortRef(w.from)!.part;
    const b = parsePortRef(w.to)!.part;
    if (freeSet.has(a) && freeSet.has(b) && a !== b) edges.push([a, b]);
  }
  const forward = dropBackEdges(free, edges);
  const preds = new Map<string, string[]>(free.map((id) => [id, []]));
  for (const [a, b] of forward) preds.get(b)!.push(a);
  const layerOf = new Map<string, number>();
  const depth = (id: string): number => {
    if (layerOf.has(id)) return layerOf.get(id)!;
    const d = Math.max(-1, ...preds.get(id)!.map(depth)) + 1;
    layerOf.set(id, d);
    return d;
  };
  for (const id of free) depth(id);

  const layers: string[][] = [];
  for (const id of free) (layers[layerOf.get(id)!] ??= []).push(id);

  // Start past whatever is pinned so the flow does not begin inside it.
  let z = Math.max(0, ...[...placed.values()].map((p) => p.at.z + p.size.z + Z_GAP));
  const xCentre = new Map<string, number>();
  const widest = Math.max(
    0,
    ...layers.map((l) => l.reduce((w, id) => w + specOf(id).size.x + X_GAP, -X_GAP)),
  );

  for (const layer of layers) {
    // Order by the centre of what feeds each part, so a cable runs straight
    // where it can. Sources keep file order.
    const bary = (id: string) => {
      const ps = preds.get(id)!.filter((p) => xCentre.has(p));
      return ps.length
        ? ps.reduce((s, p) => s + xCentre.get(p)!, 0) / ps.length
        : Number.POSITIVE_INFINITY;
    };
    const ordered = [...layer].sort(
      (a, b) => bary(a) - bary(b) || layer.indexOf(a) - layer.indexOf(b),
    );
    const width = ordered.reduce((w, id) => w + specOf(id).size.x + X_GAP, -X_GAP);
    let x = Math.floor((widest - width) / 2);
    let depthOfLayer = 1;
    for (const id of ordered) {
      const sp = source.parts.find((p) => p.id === id)!;
      const size = rotatedSize(specOf(id).size, 0);
      const part: PlacedPart = {
        id,
        type: sp.type,
        at: { x, y: 0, z },
        rot: 0,
        size,
        ...display(sp),
      };
      while (claim(part)) part.at.x += 1;
      placed.set(id, part);
      xCentre.set(id, part.at.x + size.x / 2);
      x = part.at.x + size.x + X_GAP;
      depthOfLayer = Math.max(depthOfLayer, size.z);
    }
    z += depthOfLayer + Z_GAP;
  }

  return {
    parts: source.parts.map((p) => placed.get(p.id)).filter((p): p is PlacedPart => !!p),
    findings,
  };
}

function display(sp: { value?: string; label?: string; mode?: string }) {
  const out: { value?: string; label?: string; mode?: string } = {};
  if (sp.value !== undefined) out.value = sp.value;
  if (sp.label !== undefined) out.label = sp.label;
  if (sp.mode !== undefined) out.mode = sp.mode;
  return out;
}

/** The edges that do not close a cycle, found by a DFS in file order. */
function dropBackEdges(nodes: string[], edges: [string, string][]): [string, string][] {
  const out = new Map<string, string[]>(nodes.map((n) => [n, []]));
  for (const [a, b] of edges) out.get(a)!.push(b);
  const state = new Map<string, 'open' | 'done'>();
  const keep: [string, string][] = [];
  const visit = (n: string) => {
    state.set(n, 'open');
    for (const m of out.get(n)!) {
      if (state.get(m) === 'open') continue; // back edge
      keep.push([n, m]);
      if (!state.has(m)) visit(m);
    }
    state.set(n, 'done');
  };
  for (const n of nodes) if (!state.has(n)) visit(n);
  return keep;
}
