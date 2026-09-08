import { TestBed } from '@angular/core/testing';
import { WorldService, parseWorld } from './world.service';
import { DataService } from './data.service';
import { SpoilerService } from './spoiler.service';
import { Comp, Objective, Planet } from './models';

describe('parseWorld', () => {
  it('accepts a real save shape', () => {
    const w = parseWorld(
      JSON.stringify({
        _name: 'Story-Welt',
        _objectives: { m_Keys: [1], m_Values: [{ _completed: 2 }] },
        _universeLocations: { m_Keys: [1, 2] },
        _worldSettings: { anything: true },
      }),
    );
    expect(w._name).toBe('Story-Welt');
    expect(w._universeLocations.m_Keys).toEqual([1, 2]);
  });

  it('rejects a file that is not a world save', () => {
    expect(() => parseWorld('{"hello":1}')).toThrowError(/not a .world save/);
  });

  it('rejects a save missing _universeLocations, even with valid _objectives', () => {
    expect(() =>
      parseWorld(
        JSON.stringify({
          _name: 'partial',
          _objectives: { m_Keys: [1], m_Values: [{ _completed: 2 }] },
        }),
      ),
    ).toThrowError(/not a .world save/);
  });

  it('rejects a save missing _objectives, even with valid _universeLocations', () => {
    expect(() =>
      parseWorld(
        JSON.stringify({
          _name: 'partial',
          _universeLocations: { m_Keys: [1, 2] },
        }),
      ),
    ).toThrowError(/not a .world save/);
  });

  it('rejects a save whose _objectives has m_Keys but no m_Values', () => {
    expect(() =>
      parseWorld(
        JSON.stringify({
          _name: 'partial',
          _objectives: { m_Keys: [1] },
          _universeLocations: { m_Keys: [1, 2] },
        }),
      ),
    ).toThrowError(/not a .world save/);
  });

  it('rejects a file that is not JSON', () => {
    expect(() => parseWorld('not json at all')).toThrowError(/could not be read/);
  });

  it('rejects _objectives with m_Values but no m_Keys, even with valid _universeLocations', () => {
    // The one missing isolation case: the other two clauses are already
    // covered above, this one is not.
    expect(() =>
      parseWorld(
        JSON.stringify({
          _name: 'partial',
          _objectives: { m_Values: [{ _completed: 2 }] },
          _universeLocations: { m_Keys: [1, 2] },
        }),
      ),
    ).toThrowError(/not a .world save/);
  });

  it('rejects non-array m_Keys/m_Values/m_Keys, even though they are truthy', () => {
    expect(() =>
      parseWorld(
        JSON.stringify({
          _objectives: { m_Keys: 1, m_Values: 1 },
          _universeLocations: { m_Keys: 1 },
        }),
      ),
    ).toThrowError(/not a .world save/);
  });

  it('rejects mismatched m_Keys/m_Values lengths', () => {
    expect(() =>
      parseWorld(
        JSON.stringify({
          _objectives: { m_Keys: [1, 2], m_Values: [{ _completed: 1 }] },
          _universeLocations: { m_Keys: [] },
        }),
      ),
    ).toThrowError(/not a .world save/);
  });

  it('rejects an m_Values entry that is not an object', () => {
    expect(() =>
      parseWorld(
        JSON.stringify({
          _objectives: { m_Keys: [1], m_Values: [3] },
          _universeLocations: { m_Keys: [] },
        }),
      ),
    ).toThrowError(/not a .world save/);
  });
});

/**
 * The reveal toggles, through the four predicates that hide things.
 *
 * The whole point of the toggles is that they widen what is LISTED and change
 * nothing about what the wiki reports, so each of these checks the honest
 * answer is still there underneath.
 */
describe('WorldService and the reveal toggles', () => {
  const planet = (id: string, object_id: number, type: Planet['type']): Planet =>
    ({
      id,
      object_id,
      full_id: `${type === 'station' ? 'PlanetStation' : 'Planet'}_${id}`,
      type,
      parent: null,
      radius: 1,
      gravity: 1,
      wormhole: null,
      position: { x: 0, y: 0, z: 0 },
    }) as unknown as Planet;

  const earth = planet('Earth', 1, 'planet');
  const basalt = planet('Basalt', 2, 'planet');
  const b02 = planet('Basalt_B02', 3, 'station');

  const comp = (id: string, available: number): Comp => ({
    id,
    prefab: id,
    name: id,
    desc: '',
    ports: [],
    in_build: true,
    class: `EPC_${id}`,
    stats: { [id]: { _availableAmount: available, _scGroup: `None (0)` } },
  });

  const objective = (id: number, hidden: boolean): Objective =>
    ({
      id,
      key: `obj${id}`,
      type: 'Delivery',
      hidden,
      start: basalt.full_id,
      end: basalt.full_id,
      requires_components: [],
      reward: [],
      dependencies: [],
    }) as unknown as Objective;

  const data = {
    planets: () => [earth, basalt, b02],
    components: () => [comp('Starter', 1), comp('Later', 0)],
    objectives: () => [objective(1, false), objective(2, true)],
    planetByFullId: () => new Map([earth, basalt, b02].map((p) => [p.full_id, p])),
    objectiveByKey: () => new Map(),
    locationName: () => '',
  } as unknown as DataService;

  function setup() {
    TestBed.resetTestingModule();
    localStorage.removeItem('approximately-up:world');
    localStorage.removeItem('approximately-up:reveal');
    TestBed.configureTestingModule({
      providers: [{ provide: DataService, useValue: data }],
    });
    return { world: TestBed.inject(WorldService), reveal: TestBed.inject(SpoilerService) };
  }

  afterEach(() => localStorage.removeItem('approximately-up:reveal'));

  it('hides everything a new game has not reached, with nothing revealed', () => {
    const { world } = setup();
    expect(world.isKnown(basalt)).toBe(false);
    expect(world.isKnown(b02)).toBe(false);
    expect(world.isListed('Later')).toBe(false);
    expect(world.isDiscovered(objective(2, true))).toBe(false);
  });

  it('the missions toggle discovers even a hidden objective', () => {
    const { world, reveal } = setup();
    reveal.set('missions', true);
    expect(world.isDiscovered(objective(2, true))).toBe(true);
    // ...and says nothing about whether the reader has done it.
    expect(world.isCompleted(2)).toBe(false);
  });

  it('the components toggle lists a locked part, which still reads locked', () => {
    const { world, reveal } = setup();
    reveal.set('components', true);
    expect(world.isListed('Later')).toBe(true);
    expect(world.stateOf('Later')).toBe('locked');
  });

  it('the planets toggle names planets and leaves stations hidden', () => {
    const { world, reveal } = setup();
    reveal.set('planets', true);
    expect(world.isKnown(basalt)).toBe(true);
    expect(world.isKnown(b02)).toBe(false);
    expect(world.isVisited(basalt.object_id)).toBe(false);
  });

  it('the stations toggle names stations and leaves planets hidden', () => {
    const { world, reveal } = setup();
    reveal.set('stations', true);
    expect(world.isKnown(b02)).toBe(true);
    expect(world.isKnown(basalt)).toBe(false);
  });

  it('one toggle does not reveal another kind', () => {
    const { world, reveal } = setup();
    reveal.set('planets', true);
    expect(world.isListed('Later')).toBe(false);
    expect(world.isDiscovered(objective(2, true))).toBe(false);
  });

  it('reveal everything opens all four', () => {
    const { world, reveal } = setup();
    reveal.setAll(true);
    expect(world.isKnown(basalt)).toBe(true);
    expect(world.isKnown(b02)).toBe(true);
    expect(world.isListed('Later')).toBe(true);
    expect(world.isDiscovered(objective(2, true))).toBe(true);
  });
});

/**
 * The black hole is a tracked body like any other: the game hides an
 * undiscovered one on its own galaxy map, so the wiki does too. Its id is
 * ObjectID.BlackHole = 999.
 */
describe('WorldService and the black hole', () => {
  const hole = {
    id: 'BlackHole',
    object_id: 999,
    full_id: 'BlackHole',
    type: 'blackhole',
    parent: null,
    radius: 600000,
    gravity: 1000,
    wormhole: null,
    position: { x: 0, y: 0, z: 0 },
  } as unknown as Planet;

  const earth = {
    id: 'Earth',
    object_id: 2,
    full_id: 'Planet_Earth',
    type: 'planet',
    parent: null,
    radius: 1,
    gravity: 1,
    wormhole: null,
    position: { x: 0, y: 0, z: 0 },
  } as unknown as Planet;

  const sun = {
    id: 'Sun',
    object_id: 1,
    full_id: 'Star_Sun',
    type: 'star',
    parent: null,
    radius: 1,
    gravity: 1,
    wormhole: null,
    position: { x: 0, y: 0, z: 0 },
  } as unknown as Planet;

  const data = {
    planets: () => [sun, earth, hole],
    components: () => [],
    objectives: () => [],
    planetByFullId: () => new Map([sun, earth, hole].map((p) => [p.full_id, p])),
    objectiveByKey: () => new Map(),
    locationName: () => '',
  } as unknown as DataService;

  /** A service constructed over a save holding `visited`, or over a new game. */
  function setup(visited?: number[]) {
    TestBed.resetTestingModule();
    localStorage.removeItem('approximately-up:reveal');
    if (visited) {
      localStorage.setItem(
        'approximately-up:world',
        JSON.stringify({
          _name: 'test world',
          _objectives: { m_Keys: [], m_Values: [] },
          _universeLocations: { m_Keys: visited },
        }),
      );
    } else {
      localStorage.removeItem('approximately-up:world');
    }
    TestBed.configureTestingModule({
      providers: [{ provide: DataService, useValue: data }],
    });
    return { world: TestBed.inject(WorldService), reveal: TestBed.inject(SpoilerService) };
  }

  afterEach(() => {
    localStorage.removeItem('approximately-up:world');
    localStorage.removeItem('approximately-up:reveal');
  });

  it('reports the black hole visit, unlike the Sun', () => {
    const { world } = setup();
    expect(world.tracksVisit('BlackHole')).toBe(true);
    expect(world.tracksVisit('Sun')).toBe(false);
  });

  it('hides it from a new game', () => {
    const { world } = setup();
    expect(world.isKnown(hole)).toBe(false);
    expect(world.isVisited(999)).toBe(false);
  });

  it('hides it from a save that has been elsewhere', () => {
    const { world } = setup([1, 2, 2999]);
    expect(world.isKnown(hole)).toBe(false);
    expect(world.isKnown(earth)).toBe(true);
  });

  it('names it once the save records 999', () => {
    const { world } = setup([1, 2, 999]);
    expect(world.isVisited(999)).toBe(true);
    expect(world.isKnown(hole)).toBe(true);
  });

  it('the planets toggle reveals it without claiming a visit', () => {
    const { world, reveal } = setup();
    reveal.set('planets', true);
    expect(world.isKnown(hole)).toBe(true);
    expect(world.isVisited(999)).toBe(false);
  });

  it('keeps the Sun exempt, because every save has it from world creation', () => {
    // B564E8ED-4A4DF12C-1CFC2F9E-9017D745.world was created and never loaded,
    // and already lists [1, 2, 2999].
    const { world } = setup([1, 2, 2999]);
    expect(world.isKnown(sun)).toBe(true);
    expect(world.tracksVisit('Sun')).toBe(false);
  });
});

describe('WorldService.stockOf', () => {
  const part = (id: string, stats: Record<string, unknown>): Comp => ({
    id,
    prefab: id,
    name: id,
    desc: '',
    ports: [],
    in_build: true,
    class: `EPC_${id}`,
    stats: { [id]: stats },
  });

  const data = {
    planets: () => [],
    components: () => [
      part('BlockA', { _availableAmount: 90, _scGroup: 'Block (1)' }),
      part('BlockB', { _scGroup: 'Block (1)' }),
      part('Pane', { _availableAmount: 12, _scGroup: 'Pane (2)' }),
      part('Window', { _scGroup: 'Block (1)', _scSecondaryGroup: 'Pane (2)' }),
      part('Thruster', { _availableAmount: 6, _scGroup: 'None (0)' }),
      part('Unstocked', { _scGroup: 'None (0)' }),
      part('Welder', { _availableAmount: 1000000, _scGroup: 'None (0)' }),
    ],
    objectives: () => [],
    planetByFullId: () => new Map(),
    objectiveByKey: () => new Map(),
    locationName: () => '',
  } as unknown as DataService;

  function setup() {
    TestBed.resetTestingModule();
    localStorage.removeItem('approximately-up:world');
    localStorage.removeItem('approximately-up:reveal');
    TestBed.configureTestingModule({
      providers: [{ provide: DataService, useValue: data }],
    });
    return TestBed.inject(WorldService);
  }

  it('names the pool when the stock is shared with other shapes', () => {
    expect(setup().stockOf('BlockA')).toEqual([{ pool: 'Block', amount: 90 }]);
  });

  it("gives a pool member its siblings' stock, not a count of its own", () => {
    // BlockB has no _availableAmount of its own. It is made of Block, so the
    // 90 is its stock too — that is the whole point of a pooled material.
    expect(setup().stockOf('BlockB')).toEqual([{ pool: 'Block', amount: 90 }]);
  });

  it('leaves the pool unnamed for a part that is its own pool', () => {
    // Naming it would just repeat the card's own title.
    expect(setup().stockOf('Thruster')).toEqual([{ pool: null, amount: 6 }]);
  });

  it('reports both pools a window spends, in the order it spends them', () => {
    expect(setup().stockOf('Window')).toEqual([
      { pool: 'Block', amount: 90 },
      { pool: 'Pane', amount: 12 },
    ]);
  });

  it('reports nothing for a part no pool of which has been stocked', () => {
    expect(setup().stockOf('Unstocked')).toEqual([]);
  });

  it("reports the game's unlimited marker as it is, for the view to format", () => {
    expect(setup().stockOf('Welder')).toEqual([{ pool: null, amount: 1000000 }]);
  });
});

describe('parseWorld type checks', () => {
  const good = {
    _name: 'Story-Welt',
    _objectives: { m_Keys: [1, 2], m_Values: [{ _completed: 1 }, { _completed: 2 }] },
    _universeLocations: { m_Keys: [1, 2] },
  };
  const parse = (patch: Record<string, unknown>) => () =>
    parseWorld(JSON.stringify({ ...good, ...patch }));

  it('rejects objective ids that are not numbers', () => {
    // The silent failure this closes: string ids validated fine, then matched
    // nothing, and the wiki looked like it had lost the reader's progress
    // rather than like it had refused the file.
    expect(
      parse({
        _objectives: { m_Keys: ['1', '2'], m_Values: good._objectives.m_Values },
      }),
    ).toThrowError(/not a .world save/);
  });

  it('rejects visited-location ids that are not numbers', () => {
    expect(parse({ _universeLocations: { m_Keys: ['Planet_Earth'] } })).toThrowError(
      /not a .world save/,
    );
  });

  it('rejects a _completed that is not a number', () => {
    expect(
      parse({
        _objectives: { m_Keys: [1], m_Values: [{ _completed: 'yes' }] },
      }),
    ).toThrowError(/not a .world save/);
  });

  it('accepts an objective entry with no _completed at all', () => {
    // Absent is not wrong — computeAvailability() reads any falsy value as
    // "not done". Only a value of the wrong TYPE means a wrong-shaped file.
    const w = parseWorld(
      JSON.stringify({
        ...good,
        _objectives: { m_Keys: [1], m_Values: [{}] },
      }),
    );
    expect(w._objectives.m_Keys).toEqual([1]);
  });

  it('accepts numeric ids this build has never heard of', () => {
    // A save from a newer game build may carry objectives our data/ does not
    // know. Refusing it would be worse than showing what we can resolve.
    const w = parseWorld(
      JSON.stringify({
        ...good,
        _objectives: { m_Keys: [99999999], m_Values: [{ _completed: 1 }] },
        _universeLocations: { m_Keys: [12345678] },
      }),
    );
    expect(w._universeLocations.m_Keys).toEqual([12345678]);
  });
});
