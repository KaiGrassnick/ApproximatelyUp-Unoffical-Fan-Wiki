import { buildCatalog, portTable } from './parts';
import { FIXTURE } from './test-fixture';

describe('the part catalog', () => {
  const cat = buildCatalog(FIXTURE);

  it('measures a math block as 2 x 1 x 2 cells with its ports on the z edges', () => {
    const abs = cat.get('Abs')!;
    expect(abs.size).toEqual({ x: 2, y: 1, z: 2 });
    expect(abs.ports).toEqual([
      { name: 'in', kind: 'in', index: 0, desc: 'port 0', local: { x: 0, y: 0, z: 0 }, dir: '-z' },
      {
        name: 'out',
        kind: 'out',
        index: 1,
        desc: 'port 1',
        local: { x: 0, y: 0, z: 1 },
        dir: '+z',
      },
    ]);
  });

  it('numbers ports only when a kind repeats', () => {
    expect(cat.get('Adder')!.ports.map((p) => p.name)).toEqual(['in1', 'in2', 'out']);
    expect(cat.get('Router4')!.ports.map((p) => p.name)).toEqual([
      'in',
      'out1',
      'out2',
      'out3',
      'out4',
    ]);
    expect(cat.get('WirelessTransmitter')!.ports.map((p) => p.name)).toEqual(['io']);
    expect(cat.get('Camera')!.ports.map((p) => p.name)).toEqual(['out', 'pwr']);
  });

  it("puts a wide block's four outputs on four cells", () => {
    expect(
      cat
        .get('Router4')!
        .ports.slice(1)
        .map((p) => p.local.x),
    ).toEqual([0, 1, 2, 3]);
  });

  it("reads a taller part's port height", () => {
    expect(cat.get('WirelessTransmitter')!.size).toEqual({ x: 2, y: 2, z: 2 });
    expect(cat.get('WirelessTransmitter')!.ports[0].local).toEqual({ x: 0, y: 0, z: 0 });
    expect(cat.get('Camera')!.size).toEqual({ x: 2, y: 2, z: 4 });
  });

  it('knows the pool, the mass, the power and the new-game state', () => {
    expect(cat.get('Abs')).toMatchObject({ pool: 'MathBlock', mass: 5, power: 0, newGame: true });
    expect(cat.get('Camera')).toMatchObject({ pool: 'Camera', power: 0.8, newGame: true });
    expect(cat.get('WirelessTransmitter')).toMatchObject({
      pool: 'WirelessTransmitter',
      newGame: false,
    });
  });

  it('leaves out what is not in the build', () => {
    expect(cat.has('Acosh')).toBe(false);
  });

  it('prints a port table a contributor can read', () => {
    expect(portTable(cat.get('Adder')!)).toEqual([
      { name: 'in1', kind: 'in', desc: 'port 0' },
      { name: 'in2', kind: 'in', desc: 'port 1' },
      { name: 'out', kind: 'out', desc: 'port 2' },
    ]);
  });
});
