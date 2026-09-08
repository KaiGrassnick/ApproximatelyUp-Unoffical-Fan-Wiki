import { TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { MissionDetail } from './mission-detail';
import { DataService } from '../../core/data.service';
import { WorldService } from '../../core/world.service';
import { Objective, Planet } from '../../core/models';
import planetsJson from '../../../../data/planets.json';
import objectivesJson from '../../../../data/objectives.json';

const planets = planetsJson as unknown as Planet[];
const objectives = objectivesJson as unknown as Objective[];
const byId = (id: string) => planets.find((p) => p.id === id)!;

/** The real leak this file exists to close: an open mission and its successor. */
const ROCK_OBSESSION = 2000014;
const FIND_OUTCAST = 2000018;

function stubData() {
  const all = signal(planets);
  return {
    planets: all,
    objectives: signal(objectives),
    components: signal([]),
    planetById: computed(() => new Map(all().map((p) => [p.id, p]))),
    planetByFullId: computed(() => new Map(all().map((p) => [p.full_id, p]))),
    objectiveById: computed(() => new Map(objectives.map((o) => [o.id, o]))),
    objectiveByKey: computed(() => new Map(objectives.map((o) => [o.key, o]))),
    componentById: computed(() => new Map()),
    locationLabel: (fullId: string) => planets.find((p) => p.full_id === fullId)?.id ?? '',
    loading: () => false,
    failed: () => false,
  } as unknown as DataService;
}

/**
 * A save that has been to these bodies and completed these objectives.
 *
 * `isDiscovered` mirrors WorldService: a completed objective is always
 * discovered; a hidden one never is until then; otherwise the start must be
 * reached and every dependency met.
 */
function stubWorld(visited: string[], completed: number[] = []) {
  const ids = new Set(visited.map((id) => byId(id).object_id));
  const done = new Set(completed);
  const byKey = new Map(objectives.map((o) => [o.key, o]));
  const byFull = new Map(planets.map((p) => [p.full_id, p]));
  const isDiscovered = (o: Objective): boolean => {
    if (done.has(o.id)) return true;
    if (o.hidden) return false;
    const at = byFull.get(o.start);
    if (at && !ids.has(at.object_id)) return false;
    return o.dependencies.every((d) => {
      const dep = byKey.get(d);
      if (dep) return done.has(dep.id);
      const place = byFull.get(d);
      return !place || ids.has(place.object_id);
    });
  };
  return {
    hasWorld: () => true,
    name: () => 'test world',
    isCompleted: (id: number) => done.has(id),
    isVisited: (objectId: number) => ids.has(objectId),
    isDiscovered,
  } as unknown as WorldService;
}

function setup(id: number, world: WorldService) {
  TestBed.configureTestingModule({
    imports: [MissionDetail],
    providers: [
      { provide: DataService, useValue: stubData() },
      { provide: WorldService, useValue: world },
      provideRouter([]),
    ],
  });
  const fixture = TestBed.createComponent(MissionDetail);
  fixture.componentRef.setInput('id', String(id));
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  /** The "Leads to" panel's rows. */
  const leadsTo = () => {
    const panel = [...el.querySelectorAll('hud-panel')].find((p) =>
      p.textContent?.includes('Leads to'),
    );
    return panel ? [...panel.querySelectorAll('li')] : [];
  };
  return { fixture, page: fixture.componentInstance, el, leadsTo };
}

describe('MissionDetail "Leads to"', () => {
  it('masks a successor the save has not discovered', () => {
    // Reached B02 and Basalt, finished nothing: Rock Obsession is open, so
    // Find Outcast is not discovered — and its name gives away a planet.
    const { page, leadsTo } = setup(ROCK_OBSESSION, stubWorld(['B02', 'Basalt']));

    expect(page.unlocks().length).toBe(1);
    expect(page.unlocks()[0].known).toBe(false);

    const rows = leadsTo();
    expect(rows.length).toBe(1);
    expect(rows[0].textContent!.trim()).toBe('?');
    expect(rows[0].textContent).not.toContain('Outcast');
    expect(rows[0].querySelector('a')).toBeNull();
  });

  it('names a successor once the save has discovered it', () => {
    const { page, leadsTo } = setup(ROCK_OBSESSION, stubWorld(['B02', 'Basalt'], [ROCK_OBSESSION]));

    expect(page.unlocks()[0].known).toBe(true);
    const rows = leadsTo();
    expect(rows[0].textContent).toContain('Find Outcast');
    expect(rows[0].querySelector('a')!.getAttribute('href')).toContain(String(FIND_OUTCAST));
  });

  it('keeps the row either way — masked, not dropped', () => {
    const hidden = setup(ROCK_OBSESSION, stubWorld(['B02', 'Basalt']));
    expect(hidden.leadsTo().length).toBe(1);
    TestBed.resetTestingModule();

    const shown = setup(ROCK_OBSESSION, stubWorld(['B02', 'Basalt'], [ROCK_OBSESSION]));
    expect(shown.leadsTo().length).toBe(1);
  });

  it('leaves the "After" panel alone — a met dependency keeps its name', () => {
    // Tree Lid depends on Baobara Interference; completing it discovers both.
    const TREE_LID = 2000011;
    const BAOBARA = 2000010;
    const { page, el } = setup(TREE_LID, stubWorld(['VoidWatcher'], [BAOBARA]));

    expect(page.deps().length).toBe(1);
    const after = [...el.querySelectorAll('hud-panel')].find((p) =>
      p.textContent?.includes('After'),
    )!;
    expect(after.textContent).toContain('Baobara Interference');
  });
});
