import { Objective } from '../models';
import { computeStats, poolNeeds } from './stats';
import { shortfalls, stockEverything, stockNewGame } from './stock';
import { buildCatalog } from './parts';
import { FIXTURE } from './test-fixture';

const cat = buildCatalog(FIXTURE);

const placed = {
  parts: [
    { id: 'a', type: 'Abs', at: { x: 0, y: 0, z: 0 }, rot: 0 as const, size: { x: 2, y: 1, z: 2 } },
    {
      id: 'b',
      type: 'Adder',
      at: { x: 0, y: 0, z: 8 },
      rot: 0 as const,
      size: { x: 2, y: 1, z: 2 },
    },
    {
      id: 'cam',
      type: 'Camera',
      at: { x: 6, y: 0, z: 0 },
      rot: 0 as const,
      size: { x: 2, y: 2, z: 4 },
    },
  ],
  cables: [
    {
      from: { part: 'a', port: 'out' },
      to: { part: 'b', port: 'in1' },
      kind: 'data' as const,
      cells: [0, 1, 2, 3, 4, 5].map((z) => ({ x: 0, y: 0, z: z + 2 })),
    },
    {
      from: { part: 'cam', port: 'out' },
      to: { part: 'b', port: 'in2' },
      kind: 'data' as const,
      cells: [],
    },
  ],
};

describe('computeStats', () => {
  const s = computeStats(placed, cat);

  it('counts parts and pools', () => {
    expect(s.parts).toEqual({ Abs: 1, Adder: 1, Camera: 1 });
    expect(s.pools).toEqual({ MathBlock: 2, Camera: 1, DataCable: 6 });
  });

  it('weighs parts plus cable cells', () => {
    // 5 + 5 + 5 (the fixture's Camera is 5) + 6 cells x 0.5
    expect(s.mass).toBe(18);
  });

  it('sums the draw of the parts that draw', () => {
    expect(s.power).toBe(0.8);
  });

  it('counts cable cells by kind', () => {
    expect(s.cableCells).toEqual({ data: 6, power: 0, nano: 0, plasma: 0 });
  });

  it('expresses the same thing as pool needs', () => {
    expect(poolNeeds(s)).toEqual({ MathBlock: 2, Camera: 1, DataCable: 6 });
  });
});

describe('stock', () => {
  const objs: Objective[] = [
    {
      id: 1,
      key: 'k',
      type: 'Package',
      hidden: false,
      start: '',
      end: '',
      requires_components: [],
      reward: [
        { component: 'Adder', amount: 12 },
        { component: 'WirelessTransmitter', amount: 3 },
        { component: 'Nope', amount: 99 },
      ],
      dependencies: [],
      title: '',
      obj: '',
      desc: '',
      hints: '',
    },
  ];

  it('starts a new game with what the prefabs say', () => {
    const st = stockNewGame(FIXTURE);
    expect(st.get('MathBlock')).toBe(30);
    expect(st.get('DataCable')).toBe(1000);
    expect(st.get('Camera')).toBe(2);
    expect(st.has('WirelessTransmitter')).toBe(false);
  });

  it('adds every reward for everything', () => {
    const st = stockEverything(FIXTURE, objs);
    expect(st.get('MathBlock')).toBe(42);
    expect(st.get('WirelessTransmitter')).toBe(3);
    expect(st.has('Nope')).toBe(false);
  });

  it('lists what is short, and only what is short', () => {
    const st = stockNewGame(FIXTURE);
    expect(shortfalls({ MathBlock: 31, DataCable: 5, WirelessTransmitter: 1 }, st)).toEqual([
      { pool: 'MathBlock', need: 31, have: 30 },
      { pool: 'WirelessTransmitter', need: 1, have: 0 },
    ]);
  });
});
