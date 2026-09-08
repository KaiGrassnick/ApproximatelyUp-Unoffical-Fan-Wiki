import { cablePoints, clampDistance, homeOrbit, partTransform, sceneBounds } from './circuit-scene';
import { PlacedCircuit } from './model';
import { buildCatalog } from './parts';
import { FIXTURE } from './test-fixture';

const cat = buildCatalog(FIXTURE);
const placed: PlacedCircuit = {
  parts: [
    { id: 'a', type: 'Abs', at: { x: 0, y: 0, z: 0 }, rot: 0, size: { x: 2, y: 1, z: 2 } },
    { id: 'b', type: 'Abs', at: { x: 0, y: 0, z: 8 }, rot: 90, size: { x: 2, y: 1, z: 2 } },
  ],
  cables: [
    {
      from: { part: 'a', port: 'out' },
      to: { part: 'b', port: 'in' },
      kind: 'data',
      cells: [2, 3, 4, 5, 6, 7].map((z) => ({ x: 0, y: 0, z })),
    },
  ],
};

describe('circuit scene helpers', () => {
  it('bounds the parts and cables in metres with a margin', () => {
    const b = sceneBounds(placed, 0);
    expect(b.min).toEqual([0, 0, 0]);
    expect(b.max).toEqual([0.25, 0.125, 1.25]);
    expect(b.centre).toEqual([0.125, 0.0625, 0.625]);
    const m = sceneBounds(placed, 2);
    expect(m.min[0]).toBeCloseTo(-0.25, 9);
    expect(m.max[2]).toBeCloseTo(1.5, 9);
  });

  it('keeps the margin on the panel, not under it', () => {
    // The margin is panel around the circuit, so it grows x and z only:
    // nothing is ever below y 0, and a box that dipped under the panel would
    // aim the home camera at a centre no geometry sits at.
    const m = sceneBounds(placed, 4);
    expect(m.min[1]).toBe(0);
    expect(m.max[1]).toBe(0.125);
  });

  it('places a part at its box centre and turns it the way the engine did', () => {
    expect(partTransform(placed.parts[0]).centre).toEqual([0.125, 0.0625, 0.125]);
    expect(partTransform(placed.parts[1]).yRad).toBeCloseTo(-Math.PI / 2, 9);
  });

  it('threads a cable from face to face through its cells', () => {
    const pts = cablePoints(placed.cables[0], placed, cat);
    expect(pts).toHaveLength(8);
    expect(pts[0]).toEqual([0.0625, 0.0625, 0.25]); // between a's out cell (z 1) and the exit (z 2)
    expect(pts[1]).toEqual([0.0625, 0.0625, 0.3125]);
    // b sits at (0, 8) turned 90: its `in` port is local cell (0,0,0) facing
    // -z, and a quarter turn of a 2x2 footprint maps (x,z) -> (1-z, x), so the
    // port lands on cell (1,0,8) -- centre z (8 + 0.5) x 0.125 = 1.0625. The
    // cable's last cell is (0,0,7), centre z 0.9375, so the face point is
    // their midpoint: 1.0.
    expect(pts.at(-1)![2]).toBeCloseTo(1.0, 9);
    expect(pts.at(-1)![0]).toBeCloseTo(0.125, 9); // midpoint of x cells 1 and 0
  });

  it('draws nothing for a touching cable', () => {
    expect(cablePoints({ ...placed.cables[0], cells: [] }, placed, cat)).toEqual([]);
  });

  it('opens looking down from the near side, framed to the circuit', () => {
    const box = sceneBounds(placed, 3);
    const o = homeOrbit(box);
    // The SVG's `top` camera is 75 degrees down; the scene opens on the same
    // angle so the toggle does not move the reader.
    expect(o.pitch).toBeGreaterThan(0.8);
    expect(o.pitch).toBeCloseTo((75 * Math.PI) / 180, 9);
    expect(o.distance).toBeCloseTo(1.6 * box.diagonal, 9);
    expect(clampDistance(box, 0)).toBeCloseTo(0.4 * box.diagonal, 9);
    expect(clampDistance(box, 99)).toBeCloseTo(4 * box.diagonal, 9);
  });

  it('opens on the input side of the circuit', () => {
    // Inputs face -z, so the reader must stand at -z to read a circuit the way
    // the game shows it. cameraPosition puts the eye at +z for yaw 0.
    const box = sceneBounds(placed, 3);
    expect(homeOrbit(box).yaw).toBeCloseTo(Math.PI, 9);
  });

  it('falls back to a panel-sized box for a circuit with nothing in it', () => {
    const box = sceneBounds({ parts: [], cables: [] }, 0);
    expect(box.diagonal).toBeGreaterThan(0);
    expect(Number.isFinite(box.centre[0])).toBe(true);
  });
});
