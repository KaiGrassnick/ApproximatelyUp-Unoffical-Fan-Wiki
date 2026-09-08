import { layout } from './layout';
import { CircuitSource, PlacedPart } from './model';
import { buildCatalog } from './parts';
import { FIXTURE } from './test-fixture';

const cat = buildCatalog(FIXTURE);

const src = (parts: CircuitSource['parts'], wires: CircuitSource['wires']): CircuitSource => ({
  title: 't',
  summary: 's',
  spoiler: 'none',
  updated: '2026-09-07',
  order: 100,
  view: 'top',
  parts,
  wires,
  notes: [],
});

const byId = (parts: PlacedPart[]) => new Map(parts.map((p) => [p.id, p]));

describe('layout', () => {
  it('lays a chain out along +z, in signal order, without overlap', () => {
    const { parts, findings } = layout(
      src(
        [
          { id: 'a', type: 'Abs' },
          { id: 'b', type: 'Abs' },
          { id: 'c', type: 'Abs' },
        ],
        [
          { from: 'a:out', to: 'b:in' },
          { from: 'b:out', to: 'c:in' },
        ],
      ),
      cat,
    );
    expect(findings).toEqual([]);
    const m = byId(parts);
    expect(m.get('a')!.at.z).toBeLessThan(m.get('b')!.at.z);
    expect(m.get('b')!.at.z).toBeLessThan(m.get('c')!.at.z);
    expect(m.get('b')!.at.z - m.get('a')!.at.z).toBeGreaterThanOrEqual(2 + 4);
    expect(parts.every((p) => p.at.y === 0 && p.rot === 0)).toBe(true);
  });

  it('spreads siblings of one layer along x', () => {
    const { parts } = layout(
      src(
        [
          { id: 'r', type: 'Router4' },
          { id: 'a', type: 'Abs' },
          { id: 'b', type: 'Abs' },
        ],
        [
          { from: 'r:out1', to: 'a:in' },
          { from: 'r:out2', to: 'b:in' },
        ],
      ),
      cat,
    );
    const m = byId(parts);
    expect(m.get('a')!.at.z).toBe(m.get('b')!.at.z);
    expect(m.get('b')!.at.x - m.get('a')!.at.x).toBeGreaterThanOrEqual(2 + 3);
  });

  it('survives a feedback loop', () => {
    const { parts, findings } = layout(
      src(
        [
          { id: 'a', type: 'Adder' },
          { id: 'b', type: 'Abs' },
        ],
        [
          { from: 'a:out', to: 'b:in' },
          { from: 'b:out', to: 'a:in1' },
        ],
      ),
      cat,
    );
    expect(findings).toEqual([]);
    expect(parts).toHaveLength(2);
    const m = byId(parts);
    expect(m.get('a')!.at.z).toBeLessThan(m.get('b')!.at.z);
  });

  it('keeps a pinned part where it was put and flows the rest around it', () => {
    const { parts, findings } = layout(
      src(
        [
          { id: 'a', type: 'Abs', at: [0, 0] },
          { id: 'b', type: 'Abs', at: [0, 6], rot: 180 },
          { id: 'c', type: 'Abs' },
        ],
        [{ from: 'a:out', to: 'c:in' }],
      ),
      cat,
    );
    expect(findings).toEqual([]);
    const m = byId(parts);
    expect(m.get('a')!.at).toEqual({ x: 0, y: 0, z: 0 });
    expect(m.get('b')!).toMatchObject({ at: { x: 0, y: 0, z: 6 }, rot: 180 });
    const c = m.get('c')!;
    // Not on top of either pinned part.
    for (const other of ['a', 'b']) {
      const o = m.get(other)!;
      const apart =
        c.at.x + 2 <= o.at.x ||
        o.at.x + 2 <= c.at.x ||
        c.at.z + 2 <= o.at.z ||
        o.at.z + 2 <= c.at.z;
      expect(apart).toBe(true);
    }
  });

  it('reports two pinned parts on the same cells', () => {
    const { findings } = layout(
      src(
        [
          { id: 'a', type: 'Abs', at: [0, 0] },
          { id: 'b', type: 'Abs', at: [1, 1] },
        ],
        [],
      ),
      cat,
    );
    expect(findings).toEqual([{ level: 'error', where: 'b', message: 'overlaps a' }]);
  });

  it('rotates a pinned footprint', () => {
    const { parts } = layout(src([{ id: 'r', type: 'Router4', at: [0, 0], rot: 90 }], []), cat);
    expect(parts[0].size).toEqual({ x: 2, y: 1, z: 4 });
  });
});
