import { computeAvailability, poolsNeeded } from './availability';
import { Comp, Objective, World } from './models';
import comps from '../../../data/components_full.json';
import objs from '../../../data/objectives.json';
import world from './__fixtures__/story-welt.world.json';
import expected from './__fixtures__/expected-availability.json';

// `comps`/`objs` are the live data/*.json, so a re-extraction after a game
// update can shift what these fixtures encode. If this parity test fails
// right after re-extracting, the fixture is stale, not this port — run
// `python tools/availability_fixture.py "Story-Welt"` to regenerate both
// __fixtures__ files and re-check before suspecting computeAvailability().

const COMPS = comps as unknown as Comp[];
const OBJS = objs as unknown as Objective[];
const WORLD = world as unknown as World;

describe('computeAvailability', () => {
  it('matches the Python engine exactly for the fixture world', () => {
    const av = computeAvailability(COMPS, OBJS, WORLD);
    expect([...av.have].sort()).toEqual(expected.have);
    expect(Object.fromEntries([...av.gate].sort())).toEqual(expected.gate);
    expect([...av.visited].sort((a, b) => a - b)).toEqual(expected.visited);
  });

  it('reports nothing held and nothing gated without a world', () => {
    const av = computeAvailability(COMPS, OBJS, null);
    expect(av.have.size).toBe(0);
    expect(av.gate.size).toBe(0);
    expect(av.visited.size).toBe(0);
  });

  it('still groups components into stock pools without a world', () => {
    const av = computeAvailability(COMPS, OBJS, null);
    expect(av.members.size).toBe(9);
    expect(av.members.get('Frame')!.length).toBeGreaterThan(1);
  });

  it('makes every member of a pool placeable when one member is stocked', () => {
    const av = computeAvailability(COMPS, OBJS, WORLD);
    const frames = av.members.get('Frame')!;
    const locked = frames.filter((id) => !av.have.has(id));

    // ...every member that spends nothing but frame stock. Frame Quarter
    // With Pipe also spends pipe stock, and this save has no pipes — the
    // game will not let you place it, which is what turned this rule up.
    expect(locked).toEqual(['FrameQuarterPipe']);
    expect(frames.length - locked.length).toBe(35);
  });

  it('counts every pool a part spends, not just the one it is made of', () => {
    const window = COMPS.find((c) => c.id === 'WindowDualA')!;
    const stats = Object.values(window.stats)[0];
    // A window is a frame AND a pane: `_scSecondaryGroup` says so.
    expect(poolsNeeded('WindowDualA', stats, 'Frame', window.class).sort()).toEqual([
      'Frame',
      'Glass',
    ]);

    const pipeFrame = COMPS.find((c) => c.id === 'FrameQuarterPipe')!;
    expect(
      poolsNeeded(
        'FrameQuarterPipe',
        Object.values(pipeFrame.stats)[0],
        'Frame',
        pipeFrame.class,
      ).sort(),
    ).toEqual(['Frame', 'Pipe']);

    // An ordinary frame spends frame stock and nothing else.
    const frame = COMPS.find((c) => c.id === 'FrameA')!;
    expect(poolsNeeded('FrameA', Object.values(frame.stats)[0], 'Frame', frame.class)).toEqual([
      'Frame',
    ]);
  });

  it('keeps the windows placeable in a save that has both frames and glass', () => {
    const av = computeAvailability(COMPS, OBJS, WORLD);
    expect(av.have.has('GlassA')).toBe(true);
    expect(av.have.has('WindowDualA')).toBe(true);
  });
});

// Synthetic fixtures for the two branches below. None of the 15 objectives in
// the real save have `_completed: 0` or share a reward component, so these
// branches are otherwise untested by the parity fixture alone.

function makeComp(id: string): Comp {
  return {
    id,
    prefab: id,
    name: id,
    desc: '',
    ports: [],
    in_build: true,
    class: '',
    stats: { [id]: {} },
  };
}

function makeObjective(
  partial: Partial<Objective> & { id: number; reward: Objective['reward'] },
): Objective {
  return {
    key: `key-${partial.id}`,
    type: 'Special',
    hidden: false,
    start: '',
    end: '',
    requires_components: [],
    dependencies: [],
    title: '',
    obj: '',
    desc: '',
    hints: '',
    ...partial,
  };
}

describe('computeAvailability — synthetic edge cases', () => {
  it('does not gate a reward whose objective is present in the save with _completed: 0', () => {
    // `_completed` is a key in `done` either way — the Python (and this port)
    // skip an objective from gate consideration because its id is IN `done`,
    // not because its value is truthy. A component held only by such an
    // objective must land in neither `have` nor `gate`.
    const comps = [makeComp('Widget')];
    const objs = [
      makeObjective({
        id: 500,
        title: 'Zero Objective',
        start: 'A',
        reward: [{ component: 'Widget', amount: 1 }],
      }),
    ];
    const world: World = {
      _name: 'synthetic',
      _objectives: { m_Keys: [500], m_Values: [{ _completed: 0 }] },
      _universeLocations: { m_Keys: [] },
    };

    const av = computeAvailability(comps, objs, world);

    expect(av.have.has('Widget')).toBe(false);
    expect(av.gate.has('Widget')).toBe(false);
  });

  it('gates a component by the first objective that rewards it, in objs order', () => {
    const comps = [makeComp('Gizmo')];
    const objs = [
      makeObjective({
        id: 100,
        title: 'First Objective',
        start: 'A',
        reward: [{ component: 'Gizmo', amount: 1 }],
      }),
      makeObjective({
        id: 200,
        title: 'Second Objective',
        start: 'B',
        reward: [{ component: 'Gizmo', amount: 1 }],
      }),
    ];
    const world: World = {
      _name: 'synthetic',
      _objectives: { m_Keys: [], m_Values: [] },
      _universeLocations: { m_Keys: [] },
    };

    const av = computeAvailability(comps, objs, world);

    expect(av.gate.get('Gizmo')).toBe('First Objective (A)');
  });
});

describe('computeAvailability — stock amounts', () => {
  it('sums starting stock and completed rewards into the pool they share', () => {
    const av = computeAvailability(COMPS, OBJS, WORLD);
    // FrameA starts with 500; this save has completed three objectives that
    // reward frame (180 + 150 + 300). Every frame shape draws on that one
    // 1130, which is why the figure is keyed by pool and not by component.
    expect(av.stock.get('Frame')).toBe(1130);
    expect(av.stock.get('Glass')).toBe(105);
  });

  it('adds up two starting amounts that land in the same pool', () => {
    // BasicControllers is the only pool in the build with two stocked
    // members: DataHub (2) and LeverVertical (15).
    const av = computeAvailability(COMPS, OBJS, WORLD);
    expect(av.stock.get('BasicControllers')).toBe(17);
  });

  it("keys an ungrouped part's stock by its own id", () => {
    const av = computeAvailability(COMPS, OBJS, WORLD);
    expect(av.stock.get('GimbalThruster')).toBe(6);
  });

  it('reports no stock for a pool the save has never been given', () => {
    const av = computeAvailability(COMPS, OBJS, WORLD);
    expect(av.stock.has('Pipe')).toBe(false);
  });

  it('records every pool a part spends, so a window reports both', () => {
    const av = computeAvailability(COMPS, OBJS, WORLD);
    expect(av.pools.get('WindowDualA')!.sort()).toEqual(['Frame', 'Glass']);
    expect(av.pools.get('FrameA')).toEqual(['Frame']);
    expect(av.pools.get('GimbalThruster')).toEqual(['GimbalThruster']);
  });
});

describe('computeAvailability — stock edge cases', () => {
  function stocked(id: string, amount: number, group?: string): Comp {
    const c = makeComp(id);
    c.stats[id] = { _availableAmount: amount, ...(group ? { _scGroup: `${group} (1)` } : {}) };
    return c;
  }

  it("leaves an uncompleted objective's reward out of the total", () => {
    const comps = [stocked('Widget', 5)];
    const objs = [
      makeObjective({ id: 1, reward: [{ component: 'Widget', amount: 100 }] }),
      makeObjective({ id: 2, reward: [{ component: 'Widget', amount: 7 }] }),
    ];
    const world: World = {
      _name: 'synthetic',
      _objectives: { m_Keys: [1, 2], m_Values: [{ _completed: 0 }, { _completed: 1 }] },
      _universeLocations: { m_Keys: [] },
    };

    expect(computeAvailability(comps, objs, world).stock.get('Widget')).toBe(12);
  });

  it('counts a reward once per completion, not once per pool member', () => {
    // Two shapes of one material. A reward names one of them and fills the
    // shared pool; it must not be added again for the sibling.
    const comps = [stocked('BlockA', 10, 'Block'), makeComp('BlockB')];
    comps[1].stats['BlockB'] = { _scGroup: 'Block (1)' };
    const objs = [makeObjective({ id: 1, reward: [{ component: 'BlockA', amount: 40 }] })];
    const world: World = {
      _name: 'synthetic',
      _objectives: { m_Keys: [1], m_Values: [{ _completed: 1 }] },
      _universeLocations: { m_Keys: [] },
    };

    const av = computeAvailability(comps, objs, world);
    expect(av.stock.get('Block')).toBe(50);
    expect(av.pools.get('BlockB')).toEqual(['Block']);
  });

  it('reports no stock at all without a world', () => {
    expect(computeAvailability(COMPS, OBJS, null).stock.size).toBe(0);
  });
});
