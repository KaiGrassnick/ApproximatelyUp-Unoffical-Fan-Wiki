import { Cell, PlacedPart } from './model';
import { buildCatalog } from './parts';
import { exitCell, longestUnanchored, portCell, route } from './route';
import { FIXTURE } from './test-fixture';

const cat = buildCatalog(FIXTURE);
const abs = (id: string, x: number, z: number, rot: 0 | 90 | 180 | 270 = 0): PlacedPart => ({
  id,
  type: 'Abs',
  at: { x, y: 0, z },
  rot,
  size: { x: 2, y: 1, z: 2 },
});
const k = (c: Cell) => `${c.x},${c.y},${c.z}`;
const straight = (cells: Cell[]) =>
  cells.every((c, i) => i === 0 || (c.x === cells[0].x && c.y === 0 && c.z === cells[i - 1].z + 1));

describe('port cells', () => {
  it('finds the cell a port sits on and the cell a cable leaves from', () => {
    const a = abs('a', 10, 10);
    expect(portCell(a, cat.get('Abs')!, 'in')).toEqual({ x: 10, y: 0, z: 10 });
    expect(exitCell(a, cat.get('Abs')!, 'in')).toEqual({ x: 10, y: 0, z: 9 });
    expect(exitCell(a, cat.get('Abs')!, 'out')).toEqual({ x: 10, y: 0, z: 12 });
  });

  it('follows the rotation', () => {
    const a = abs('a', 10, 10, 90);
    expect(exitCell(a, cat.get('Abs')!, 'out')).toEqual({ x: 9, y: 0, z: 10 });
  });
});

describe('route', () => {
  it('runs a straight cable between two facing ports', () => {
    const { cables, findings } = route(
      [abs('a', 0, 0), abs('b', 0, 8)],
      [{ from: 'a:out', to: 'b:in' }],
      cat,
    );
    expect(findings).toEqual([]);
    expect(cables).toHaveLength(1);
    expect(cables[0].kind).toBe('data');
    expect(cables[0].cells.map(k)).toEqual(['0,0,2', '0,0,3', '0,0,4', '0,0,5', '0,0,6', '0,0,7']);
    expect(straight(cables[0].cells)).toBe(true);
  });

  it('bends when the target is offset', () => {
    const { cables } = route(
      [abs('a', 0, 0), abs('b', 6, 8)],
      [{ from: 'a:out', to: 'b:in' }],
      cat,
    );
    const cells = cables[0].cells;
    expect(cells[0]).toEqual({ x: 0, y: 0, z: 2 });
    expect(cells.at(-1)).toEqual({ x: 6, y: 0, z: 7 });
    // Every step is one axis-aligned cell.
    for (let i = 1; i < cells.length; i++) {
      const d =
        Math.abs(cells[i].x - cells[i - 1].x) +
        Math.abs(cells[i].y - cells[i - 1].y) +
        Math.abs(cells[i].z - cells[i - 1].z);
      expect(d).toBe(1);
    }
  });

  it('never puts two cables in one cell, and bridges over a cable in the way', () => {
    // a -> b runs straight along x=0 and is long enough that rounding either
    // end costs more than climbing over it; c -> d has to cross that line.
    const parts = [abs('a', 0, 0), abs('b', 0, 30), abs('c', -6, 15, 90), abs('d', 8, 15, 90)];
    const { cables, findings } = route(
      parts,
      [
        { from: 'a:out', to: 'b:in' },
        { from: 'c:out', to: 'd:in' },
      ],
      cat,
    );
    expect(findings).toEqual([]);
    const seen = new Set<string>();
    for (const c of cables)
      for (const cell of c.cells) {
        expect(seen.has(k(cell))).toBe(false);
        seen.add(k(cell));
      }
    // It climbs to the one level above the panel, and comes straight back
    // down after the cable it crossed rather than riding to the goal.
    const air = cables[1].cells.filter((c) => c.y > 0);
    expect(air.map(k)).toEqual(['-1,1,14', '0,1,14', '1,1,14']);
    expect(air.length).toBeLessThan(10);
  });

  it('recognises two ports that touch', () => {
    const { cables, findings } = route(
      [abs('a', 0, 0), abs('b', 0, 2)],
      [{ from: 'a:out', to: 'b:in' }],
      cat,
    );
    expect(findings).toEqual([]);
    expect(cables[0].cells).toEqual([]);
  });

  it('reports a port whose exit is blocked by another part', () => {
    const { cables, findings } = route(
      [abs('a', 0, 0), abs('b', 0, 2, 180), abs('c', 0, 8)],
      [{ from: 'a:out', to: 'c:in' }],
      cat,
    );
    expect(cables).toHaveLength(0);
    expect(findings).toEqual([
      { level: 'error', where: 'wire 1', message: 'a:out is blocked by b' },
    ]);
  });

  it('reports a port whose exit an earlier cable already uses', () => {
    // a -> b runs down x=0 first; c's output then opens straight onto it.
    const { cables, findings } = route(
      [abs('a', 0, 0), abs('b', 0, 8), abs('c', 1, 4, 90), abs('d', 6, 0)],
      [
        { from: 'a:out', to: 'b:in' },
        { from: 'c:out', to: 'd:in' },
      ],
      cat,
    );
    expect(cables).toHaveLength(1);
    expect(findings).toEqual([
      { level: 'error', where: 'wire 2', message: 'c:out is blocked by a cable' },
    ]);
  });

  it('reports two ports that cannot share a cable', () => {
    const cam: PlacedPart = {
      id: 'cam',
      type: 'Camera',
      at: { x: 0, y: 0, z: 0 },
      rot: 0,
      size: { x: 2, y: 2, z: 4 },
    };
    const { cables, findings } = route(
      [cam, abs('t', 0, 8)],
      [{ from: 'cam:pwr', to: 't:in' }],
      cat,
    );
    expect(cables).toEqual([]);
    expect(findings).toEqual([
      {
        level: 'error',
        where: 'wire 1',
        message: 'cam:pwr and t:in are not the same kind of port',
      },
    ]);
  });

  it('reports a wire to a part that was never placed', () => {
    // layout() drops a pinned part that overlaps another, so a wire can name
    // a part that is not in `parts`.
    const { cables, findings } = route([abs('a', 0, 0)], [{ from: 'a:out', to: 'gone:in' }], cat);
    expect(cables).toEqual([]);
    expect(findings).toEqual([
      { level: 'error', where: 'wire 1', message: 'gone:in names a part that was not placed' },
    ]);
  });
});

describe('unanchored cable', () => {
  // Routing cannot be made to hang a long run any more: a cell above a part is
  // anchored by the part under it, MARGIN always leaves a way round a wall, and
  // AIR now charges by the length of a flight. So the limit is checked here on
  // the function that enforces it, over a panel with one part at the origin.
  const solid = new Map<string, string>([['0,0,0', 'a']]);
  const line = (n: number, y: number, fromZ = 4) =>
    Array.from({ length: n }, (_, i) => ({ x: 0, y, z: fromZ + i }));

  it('counts a run of cells with nothing beside them', () => {
    expect(longestUnanchored(line(11, 1), solid)).toBe(11);
  });

  it('starts again wherever the cable touches down', () => {
    const path = [...line(4, 1), { x: 0, y: 0, z: 8 }, ...line(3, 1, 9)];
    expect(longestUnanchored(path, solid)).toBe(4);
  });

  it('counts a cell beside a part as anchored', () => {
    expect(longestUnanchored([{ x: 0, y: 1, z: 0 }], solid)).toBe(0);
  });
});
