import { TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { MissionsList } from './missions-list';
import { DataService } from '../../core/data.service';
import { WorldService } from '../../core/world.service';
import { Objective, Planet } from '../../core/models';
import planetsJson from '../../../../data/planets.json';
import objectivesJson from '../../../../data/objectives.json';

const planets = planetsJson as unknown as Planet[];
const objectives = objectivesJson as unknown as Objective[];
const byId = (id: string) => planets.find((p) => p.id === id)!;

function stubData() {
  const all = signal(planets);
  const objs = signal(objectives);
  return {
    planets: all,
    objectives: objs,
    components: signal([]),
    buildableCount: computed(() => 0),
    planetById: computed(() => new Map(all().map((p) => [p.id, p]))),
    planetByFullId: computed(() => new Map(all().map((p) => [p.full_id, p]))),
    objectiveByKey: computed(() => new Map(objectives.map((o) => [o.key, o]))),
    objectivePlanet: (o: Objective) => {
      const at = all().find((p) => p.full_id === o.start);
      return at?.type === 'station' ? all().find((p) => p.id === at.parent) : at;
    },
    locationName: (fullId: string) => all().find((p) => p.full_id === fullId)?.id ?? '',
    locationLabel: (fullId: string) => {
      const at = all().find((p) => p.full_id === fullId);
      if (!at) return '';
      if (at.type !== 'station') return at.id;
      const parent = all().find((p) => p.id === at.parent);
      return parent ? `${parent.id} (${at.id})` : at.id;
    },
  } as unknown as DataService;
}

/** A loaded save in which the reader has been to exactly these bodies. */
function stubWorld(visited: string[], completed: number[] = []) {
  const ids = new Set(visited.map((id) => byId(id).object_id));
  const done = new Set(completed);
  return {
    hasWorld: () => true,
    isVisited: (objectId: number) => ids.has(objectId),
    // Mirrors WorldService.isKnown(): no reveal turned on, so a body is
    // known when its visit is untracked or the save has been there.
    isKnown: (p: Planet) => ids.has(p.object_id),
    isCompleted: (objectiveId: number) => done.has(objectiveId),
    // Mirrors WorldService.isDiscovered(): unplaceable objectives count as
    // discovered, so nothing is hidden for want of a location.
    // Mirrors WorldService.isDiscovered(): the exact start location — a
    // station, usually — then the prerequisites.
    isDiscovered: (o: Objective) => {
      if (done.has(o.id)) return true;
      if (o.hidden) return false;
      const at = planets.find((p) => p.full_id === o.start);
      if (at && !ids.has(at.object_id)) return false;
      return o.dependencies.every((dep) => {
        const other = objectives.find((x) => x.key === dep);
        if (other) return done.has(other.id);
        const place = planets.find((p) => p.full_id === dep);
        return !place || ids.has(place.object_id);
      });
    },
    name: () => 'test world',
  } as unknown as WorldService;
}

/**
 * A save with the whole game behind it: everywhere visited and everything
 * done. For tests about layout rather than about what is visible yet — a
 * mission can be held back by a prerequisite as well as by a place.
 */
const allSeen = () =>
  stubWorld(
    planets.map((p) => p.id),
    objectives.map((o) => o.id),
  );

function setup(world?: WorldService) {
  TestBed.configureTestingModule({
    imports: [MissionsList],
    providers: [
      { provide: DataService, useValue: stubData() },
      ...(world ? [{ provide: WorldService, useValue: world }] : []),
      provideRouter([]),
    ],
  });
  const fixture = TestBed.createComponent(MissionsList);
  fixture.detectChanges();
  return { fixture, list: fixture.componentInstance };
}

describe('MissionsList planet filter', () => {
  it('resolves a station mission to the planet it orbits', () => {
    // "PlanetStation_Basalt_CandyVein" is a mission on Basalt, not a
    // thirteenth entry in the filter bar.
    const { list } = setup();
    const at = list.planetByObjective();
    const station = objectives.find((o) => o.start === 'PlanetStation_Basalt_CandyVein')!;
    const planet = objectives.find((o) => o.start === 'Planet_Basalt')!;
    expect(at.get(station.id)).toBe('Basalt');
    expect(at.get(planet.id)).toBe('Basalt');
  });

  it('offers only planets that actually have missions', () => {
    const { list } = setup(allSeen());
    const offered = list.planets().filter((p) => p !== 'all');
    const withMissions = new Set(list.planetByObjective().values());

    expect(offered.length).toBeGreaterThan(0);
    expect(offered.every((p) => withMissions.has(p))).toBe(true);
    // The Sun has no missions on it; a filter that can only empty the page
    // has no business being offered.
    expect(offered).not.toContain('Sun');
    // Stations are not filter options — they collapse into their planet.
    expect(offered).not.toContain('CandyVein');
  });

  it('offers every mission-bearing planet once a save has seen them', () => {
    const { list } = setup(allSeen());
    const withMissions = [...new Set(list.planetByObjective().values())].sort();
    expect(list.planets()).toEqual(['all', ...withMissions]);
  });

  it('offers only the planets a loaded save has been to', () => {
    const { list } = setup(stubWorld(['Earth', 'Basalt', 'Sun']));
    // Sun is visited but has no missions; Moon has missions but is unvisited.
    expect(list.planets()).toEqual(['all', 'Basalt', 'Earth']);
  });

  it('narrows the list to the chosen planet, stations included', () => {
    const { list } = setup(allSeen());
    list.planet.set('Basalt');
    const at = list.planetByObjective();

    expect(list.shown().length).toBeGreaterThan(0);
    expect(list.shown().every((o) => at.get(o.id) === 'Basalt')).toBe(true);
    expect(list.shown().some((o) => o.start.startsWith('PlanetStation_Basalt'))).toBe(true);
  });

  it('combines with the type filter rather than replacing it', () => {
    const { list } = setup(allSeen());
    list.planet.set('Basalt');
    const type = list.shown()[0].type;
    list.kind.set(type);

    expect(list.shown().length).toBeGreaterThan(0);
    expect(list.shown().every((o) => o.type === type)).toBe(true);
    expect(list.shown().every((o) => list.planetByObjective().get(o.id) === 'Basalt')).toBe(true);
  });

  it('falls back to all when the chosen planet stops being offered', () => {
    // Picking a planet and then loading a save that has never seen it must
    // not leave the page filtered by a button that is no longer there.
    const { list } = setup(stubWorld(['Earth']));
    list.planet.set('Moon');

    expect(list.planets()).not.toContain('Moon');
    expect(list.activePlanet()).toBe('all');
    // "all" here means every planet the save has seen, not every planet:
    // undiscovered missions stay hidden and counted.
    expect(list.shown().length + list.toCome()).toBe(objectives.length);
  });

  it('groups the list by planet, keeping the game order within each', () => {
    const { list } = setup(allSeen());
    const at = list.planetByObjective();
    const seq = list.shown().map((o) => at.get(o.id) ?? '');

    // One run per planet: sorting by id alone leaves the story missions
    // grouped and then the side missions interleaved, 40 runs for 14 planets.
    const runs = seq.filter((p, i) => i === 0 || seq[i - 1] !== p);
    expect(runs.length).toBe(new Set(seq).size);
    expect(runs).toEqual([...runs].sort());

    // Inside a planet the ids still ascend, so a place's missions read in the
    // order the game gives them.
    for (const planet of new Set(seq)) {
      const ids = list
        .shown()
        .filter((o) => at.get(o.id) === planet)
        .map((o) => o.id);
      expect(ids).toEqual([...ids].sort((x, y) => x - y));
    }
  });

  it('names the planet, with the station in brackets when there is one', () => {
    const { fixture } = setup(allSeen());
    const rows = [...fixture.nativeElement.querySelectorAll('.list .where')].map((el: Element) =>
      el.textContent!.trim(),
    );

    // A station mission reads as its planet first — "Moon (Moonstep)", not
    // "Moonstep", which says nothing about where in the galaxy to go.
    expect(rows).toContain('Moon (Moonstep)');
    expect(rows).toContain('Basalt (CandyVein)');
    // A mission on the planet itself has nothing to bracket.
    expect(rows).toContain('Earth');
    expect(rows.some((r) => r === 'Moonstep')).toBe(false);
  });

  it('renders the filter rows, labelled', () => {
    // A save is loaded here, so all three rows are offered.
    const { fixture, list } = setup(allSeen());
    const rows = fixture.nativeElement.querySelectorAll('.filters .groups');
    expect([...rows].map((r: Element) => r.querySelector('.what')!.textContent!.trim())).toEqual([
      'type',
      'state',
      'planet',
    ]);
    expect(rows[2].querySelectorAll('button').length).toBe(list.planets().length);
  });

  it('offers no progress row without a save', () => {
    const { fixture } = setup();
    expect(
      [...fixture.nativeElement.querySelectorAll('.filters .what')].map((el: Element) =>
        el.textContent!.trim(),
      ),
    ).toEqual(['type', 'planet']);
  });
});

describe('MissionsList hiding undiscovered missions', () => {
  const planetOf = (o: Objective) => {
    const at = planets.find((p) => p.full_id === o.start);
    return at?.type === 'station' ? at.parent : at?.id;
  };
  const on = (...ids: string[]) => objectives.filter((o) => ids.includes(planetOf(o) ?? ''));

  it("shows only a new game's missions with no save loaded", () => {
    // Not even all of Earth's: "Wind Test" starts at Headquarters but waits
    // on a package from Aundara, so a new save does not have it yet.
    const { list } = setup();
    const shown = list.shown();

    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThan(on('Earth').length);
    expect(shown.every((o) => o.dependencies.length === 0)).toBe(true);
    expect(shown.some((o) => o.key === 'WindTest')).toBe(false);
    expect(list.shown().length + list.toCome()).toBe(objectives.length);
  });

  it('shows every mission once a save has been everywhere', () => {
    const { list } = setup(allSeen());
    expect(list.shown().length).toBe(objectives.length);
    expect(list.toCome()).toBe(0);
  });

  it('lists only missions on planets the save has been to', () => {
    const { list } = setup(stubWorld(['Earth', 'Moon']));
    expect(list.shown().length).toBeGreaterThan(0);
    expect(list.shown().every((o) => ['Earth', 'Moon'].includes(planetOf(o)!))).toBe(true);
    // Fewer than every mission on those two planets: some wait on work the
    // save has not done.
    expect(list.shown().length).toBeLessThan(on('Earth', 'Moon').length);
  });

  it('counts what it is hiding rather than listing it', () => {
    const { list } = setup(stubWorld(['Earth', 'Moon']));
    expect(list.shown().length + list.toCome()).toBe(objectives.length);
    // More than just the other planets': the locked ones on these two count.
    expect(list.toCome()).toBeGreaterThan(objectives.length - on('Earth', 'Moon').length);
  });

  it('counts only what the current filters would otherwise have shown', () => {
    // The row describes this view, not the whole game: filtering by a type
    // must not leave it advertising missions of another type.
    const { list } = setup(stubWorld(['Earth']));
    const type = list.shown()[0].type;
    list.kind.set(type);

    const ofType = objectives.filter((o) => o.type === type);
    expect(list.shown().length + list.toCome()).toBe(ofType.length);
  });

  it("still counts a visited planet's locked missions when it is selected", () => {
    // Being somewhere is not the same as having unlocked everything there:
    // Earth holds "Wind Test" behind a package from Aundara.
    const { list } = setup(stubWorld(['Earth']));
    list.planet.set('Earth');
    expect(list.shown().length + list.toCome()).toBe(on('Earth').length);
    expect(list.toCome()).toBeGreaterThan(0);
  });

  it('has nothing left to come when a selected planet is fully unlocked', () => {
    const { list } = setup(allSeen());
    list.planet.set('Earth');
    expect(list.shown().length).toBe(on('Earth').length);
    expect(list.toCome()).toBe(0);
  });

  it('renders no row when nothing is hidden', () => {
    const { fixture } = setup(allSeen());
    expect(fixture.nativeElement.querySelector('.to-come')).toBeNull();
  });

  it('renders the row as a count, naming nothing', () => {
    const { fixture, list } = setup(stubWorld(['Earth']));
    const row = fixture.nativeElement.querySelector('.to-come') as HTMLElement;

    expect(row).not.toBeNull();
    expect(row.textContent).toContain(String(list.toCome()));
    // Not a link, and nothing in it may name a place the reader has not been.
    expect(row.querySelector('a')).toBeNull();
    expect(row.textContent).not.toContain('Moon');
  });
});

describe('MissionsList completion label', () => {
  const onEarth = objectives.filter((o) => o.start.includes('Earth'));

  it('says nothing about progress until a save is loaded', () => {
    const { fixture } = setup();
    expect(fixture.nativeElement.querySelectorAll('status-pill').length).toBe(0);
  });

  it('labels each listed mission completed or open', () => {
    const { fixture, list } = setup(stubWorld(['Earth'], [onEarth[0].id]));
    const pills = [...fixture.nativeElement.querySelectorAll('.list status-pill')];

    expect(pills.length).toBe(list.shown().length);
    const texts = pills.map((p: Element) => p.textContent!.trim());
    expect(texts).toContain('completed');
    expect(texts).toContain('open');
    expect(texts.filter((t) => t === 'completed').length).toBe(1);
  });

  it('reads the completion straight off the save, not off the reward state', () => {
    const done = onEarth.slice(0, 2).map((o) => o.id);
    const { list } = setup(stubWorld(['Earth'], done));
    for (const o of list.shown()) {
      expect(list.world.isCompleted(o.id)).toBe(done.includes(o.id));
    }
  });
});

describe('MissionsList state filter', () => {
  const onEarth = objectives.filter((o) => o.start.includes('Earth'));
  const done = onEarth.slice(0, 2).map((o) => o.id);

  it('is not offered without a save, and does not apply either', () => {
    const { fixture, list } = setup();
    const openCount = list.shown().length;
    const labels = [...fixture.nativeElement.querySelectorAll('.filters .what')].map(
      (el: Element) => el.textContent!.trim(),
    );
    expect(labels).not.toContain('state');

    // Even set directly, it must not silently filter a page that offers no
    // way to unset it.
    list.state.set('completed');
    expect(list.shown().length).toBe(openCount);
  });

  it('appears with a save, as a third labelled row', () => {
    const { fixture } = setup(stubWorld(['Earth'], done));
    const labels = [...fixture.nativeElement.querySelectorAll('.filters .what')].map(
      (el: Element) => el.textContent!.trim(),
    );
    expect(labels).toEqual(['type', 'state', 'planet']);
  });

  it('narrows to completed or to open, and back to all', () => {
    const { list } = setup(stubWorld(['Earth'], done));
    const all = list.shown().length;

    list.state.set('completed');
    expect(
      list
        .shown()
        .map((o) => o.id)
        .sort(),
    ).toEqual([...done].sort());

    list.state.set('open');
    expect(list.shown().every((o) => !done.includes(o.id))).toBe(true);
    expect(list.shown().length).toBe(all - done.length);

    list.state.set('all');
    expect(list.shown().length).toBe(all);
  });

  it('combines with the other two filters', () => {
    const { list } = setup(stubWorld(['Earth'], done));
    list.planet.set('Earth');
    list.state.set('completed');
    const type = list.shown()[0].type;
    list.kind.set(type);

    expect(list.shown().length).toBeGreaterThan(0);
    for (const o of list.shown()) {
      expect(o.type).toBe(type);
      expect(list.planetByObjective().get(o.id)).toBe('Earth');
      expect(done).toContain(o.id);
    }
  });
});

describe('MissionsList prerequisites', () => {
  const windTest = objectives.find((o) => o.key === 'WindTest')!;
  const plasma = objectives.find((o) => o.key === 'Package_Aundara_Plasma')!;
  const candyflower = objectives.find((o) => o.key === 'Package_Basalt_CandyflowerA')!;

  it('holds back a mission whose prerequisite objective is not done', () => {
    // Its place is known — Headquarters, on Earth — but the game does not
    // offer it until the Aundara plasma package is delivered.
    const { list } = setup(stubWorld(['Earth', 'Headquarters']));
    expect(windTest.dependencies).toEqual([plasma.key]);
    expect(list.shown().some((o) => o.id === windTest.id)).toBe(false);
  });

  it('offers it once that objective is done', () => {
    const { list } = setup(stubWorld(['Earth', 'Headquarters'], [plasma.id]));
    expect(list.shown().some((o) => o.id === windTest.id)).toBe(true);
  });

  it('reads a location prerequisite as a place to have been', () => {
    // Basalt's candyflower packages depend on the CandyVein station, not on
    // another objective.
    expect(candyflower.dependencies).toEqual(['PlanetStation_Basalt_CandyVein']);
    const without = setup(stubWorld(['Basalt']));
    expect(without.list.shown().some((o) => o.id === candyflower.id)).toBe(false);
    TestBed.resetTestingModule();

    const withIt = setup(stubWorld(['Basalt', 'CandyVein']));
    expect(withIt.list.shown().some((o) => o.id === candyflower.id)).toBe(true);
  });

  it('never hides a mission the save has already completed', () => {
    // However it was reached, the reader plainly knows about it.
    const { list } = setup(stubWorld(['Earth'], [windTest.id]));
    expect(list.shown().some((o) => o.id === windTest.id)).toBe(true);
  });

  it('counts what it holds back, prerequisites included', () => {
    const { list } = setup(stubWorld(['Earth', 'Headquarters']));
    expect(list.shown().length + list.toCome()).toBe(objectives.length);
    expect(list.toCome()).toBeGreaterThan(0);
  });
});

describe('MissionsList start locations', () => {
  const depthDiver = objectives.find((o) => o.key === 'DropTheDepthDiver')!;

  it('waits for the station a mission starts at, not merely its planet', () => {
    // 27 of the 34 story missions are handed over at a station. Resolving to
    // the parent planet offered every Headquarters mission the moment Earth
    // was known — including this one, to a save still in the tutorial.
    expect(depthDiver.start).toBe('PlanetStation_Earth_Headquarters');

    const onEarth = setup(stubWorld(['Earth']));
    expect(onEarth.list.shown().some((o) => o.id === depthDiver.id)).toBe(false);
    TestBed.resetTestingModule();

    const atHq = setup(stubWorld(['Earth', 'Headquarters']));
    expect(atHq.list.shown().some((o) => o.id === depthDiver.id)).toBe(true);
  });

  it('shows a new game the two missions Earth itself carries, and no more', () => {
    const { list } = setup();
    expect(
      list
        .shown()
        .map((o) => o.key)
        .sort(),
    ).toEqual(['Package_Earth_LostInTheSnow', 'Package_Earth_LostInTransit']);
  });

  it('still files a station mission under its planet for the filter', () => {
    // Visibility asks about the station; grouping and filtering ask about the
    // planet. The two questions have different answers on purpose.
    const { list } = setup(stubWorld(['Earth', 'Headquarters']));
    expect(list.planetByObjective().get(depthDiver.id)).toBe('Earth');
  });
});

describe('MissionsList hidden objectives', () => {
  const hidden = objectives.filter((o) => o.hidden);

  it('keeps the four the game never puts in its own log out of the list', () => {
    // The Earth drumkit and Helirion's three lost packages: found by
    // stumbling over them, not by being told. Being everywhere is not enough.
    expect(hidden.length).toBe(4);
    const { list } = setup(stubWorld(planets.map((p) => p.id)));
    expect(list.shown().some((o) => o.hidden)).toBe(false);
  });

  it('lists them once the save has done them', () => {
    const { list } = setup(allSeen());
    expect(list.shown().filter((o) => o.hidden).length).toBe(hidden.length);
  });

  it('lists one the moment the save has completed it', () => {
    const one = hidden[0];
    const before = setup(stubWorld(planets.map((p) => p.id)));
    expect(before.list.shown().some((o) => o.id === one.id)).toBe(false);
    TestBed.resetTestingModule();

    const after = setup(
      stubWorld(
        planets.map((p) => p.id),
        [one.id],
      ),
    );
    expect(after.list.shown().some((o) => o.id === one.id)).toBe(true);
  });

  it('counts them among what is yet to come', () => {
    const { list } = setup(stubWorld(planets.map((p) => p.id)));
    expect(list.shown().length + list.toCome()).toBe(objectives.length);
    expect(list.toCome()).toBeGreaterThanOrEqual(hidden.length);
  });
});
