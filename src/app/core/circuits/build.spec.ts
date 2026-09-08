import { buildCircuit, isBuilt } from './build';
import { buildCatalog } from './parts';
import { FIXTURE } from './test-fixture';
import { MeshFile } from './render-svg';
import { stockEverything, stockNewGame } from './stock';

const catalog = buildCatalog(FIXTURE);
const meshes: MeshFile = { cell: 0.125, meshes: {}, parts: {} };
const ctx = {
  catalog,
  meshes,
  newGame: stockNewGame(FIXTURE),
  everything: stockEverything(FIXTURE, []),
};

const json = {
  title: 'Two blocks',
  summary: 'A value through an absolute.',
  spoiler: 'none',
  updated: '2026-09-07',
  parts: [
    { id: 'v', type: 'LogicValue', value: '1' },
    { id: 'a', type: 'Abs' },
  ],
  wires: [{ from: 'v:out', to: 'a:in' }],
  notes: [{ kind: 'md', body: 'Some **notes**.' }],
};

describe('buildCircuit', () => {
  it('builds a valid file into everything the generator writes', () => {
    const r = buildCircuit(json, ctx);
    expect(isBuilt(r)).toBe(true);
    if (!isBuilt(r)) return;
    expect(r.placed.parts.map((p) => p.id)).toEqual(['v', 'a']);
    expect(r.placed.cables).toHaveLength(1);
    expect(r.stats.parts).toEqual({ LogicValue: 1, Abs: 1 });
    expect(r.needs['MathBlock']).toBe(2);
    expect(r.newGame).toBe(true);
    expect(r.bom).toEqual([
      { id: 'Abs', count: 1 },
      { id: 'LogicValue', count: 1 },
    ]);
    expect(r.svg.startsWith('<svg')).toBe(true);
    expect(r.findings.filter((f) => f.level === 'error')).toEqual([]);
  });

  it('stops at a schema error and returns only findings', () => {
    const r = buildCircuit({ ...json, parts: [{ id: 'x', type: 'Nope' }] }, ctx);
    expect(isBuilt(r)).toBe(false);
    expect(r.findings[0]).toMatchObject({ level: 'error', where: 'x' });
  });

  it('warns when a new game is short and errors when everything is', () => {
    const many = {
      ...json,
      parts: Array.from({ length: 31 }, (_, i) => ({ id: `p${i}`, type: 'Abs' })),
      wires: [],
    };
    const r = buildCircuit(many, ctx);
    expect(isBuilt(r)).toBe(true);
    if (!isBuilt(r)) return;
    expect(r.newGame).toBe(false);
    expect(r.findings).toContainEqual({
      level: 'warn',
      where: 'pool MathBlock',
      message: 'needs 31, a new game holds 30',
    });
    const tooMany = {
      ...json,
      parts: Array.from({ length: 31 }, (_, i) => ({ id: `w${i}`, type: 'WirelessTransmitter' })),
      wires: [],
    };
    const r2 = buildCircuit(tooMany, ctx);
    expect(isBuilt(r2)).toBe(true);
    if (!isBuilt(r2)) return;
    expect(r2.findings).toContainEqual({
      level: 'error',
      where: 'pool WirelessTransmitter',
      message: 'needs 31, the whole game only ever hands out 0',
    });
  });

  it('refuses "spoiler: none" on a circuit a new game cannot place', () => {
    const r = buildCircuit(
      { ...json, parts: [{ id: 'w', type: 'WirelessTransmitter' }], wires: [] },
      ctx,
    );
    expect(isBuilt(r)).toBe(true);
    if (!isBuilt(r)) return;
    expect(r.findings).toContainEqual({
      level: 'error',
      where: 'file',
      message:
        'names WirelessTransmitter, which a new game cannot place, but declares "spoiler: none" -- it should be "spoiler: components"',
    });
  });
});
