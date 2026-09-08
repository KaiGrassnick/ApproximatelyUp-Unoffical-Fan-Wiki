import { TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { Home } from './home';
import { DataService } from '../../core/data.service';
import { WorldService } from '../../core/world.service';
import { Comp, Objective, Planet } from '../../core/models';
import planetsJson from '../../../../data/planets.json';
import objectivesJson from '../../../../data/objectives.json';

const planets = planetsJson as unknown as Planet[];
const objectives = objectivesJson as unknown as Objective[];
const bodies = planets.filter((p) => p.type === 'planet' || p.type === 'star');
const stations = planets.filter((p) => p.type === 'station');

function stubData() {
  const all = signal(planets);
  return {
    planets: all,
    objectives: signal(objectives),
    components: signal([] as Comp[]),
    buildableCount: computed(() => 310),
    // The home page renders the galaxy map, which reads these two.
    planetById: computed(() => new Map(all().map((p) => [p.id, p]))),
    planetByFullId: computed(() => new Map(all().map((p) => [p.full_id, p]))),
    objectiveByKey: computed(() => new Map(objectives.map((o) => [o.key, o]))),
    objectivePlanet: (o: Objective) => {
      const at = all().find((p) => p.full_id === o.start);
      return at?.type === 'station' ? all().find((p) => p.id === at.parent) : at;
    },
    globeMapUrl: (id: string) => `data/planets/maps/${id}.webp`,
  } as unknown as DataService;
}

/** A save that has seen these bodies and finished these objectives. */
function stubWorld(visited: string[], completed: number[], have = 0) {
  const ids = new Set(visited.map((id) => planets.find((p) => p.id === id)!.object_id));
  const done = new Set(completed);
  return {
    hasWorld: () => true,
    name: () => 'Story-Welt',
    haveCount: () => have,
    isVisited: (objectId: number) => ids.has(objectId),
    isCompleted: (objectiveId: number) => done.has(objectiveId),
    tracksVisit: (id: string) => id !== 'Sun',
    // Mirrors WorldService.isKnown(): no reveal turned on, so a body is known
    // when its visit is untracked or the save has been there.
    isKnown: (p: Planet) => p.id === 'Sun' || ids.has(p.object_id),
    stateOf: () => 'locked',
    isDiscovered: () => true,
    // Mirrors WorldService: the tutorial station drops out of the counts
    // once the save has reached Headquarters.
    isSuperseded: (id: string) =>
      id === 'Tutorial' && ids.has(planets.find((p) => p.id === 'Headquarters')!.object_id),
  } as unknown as WorldService;
}

function setup(world?: WorldService) {
  TestBed.configureTestingModule({
    imports: [Home],
    providers: [
      { provide: DataService, useValue: stubData() },
      ...(world ? [{ provide: WorldService, useValue: world }] : []),
      provideRouter([]),
    ],
  });
  const fixture = TestBed.createComponent(Home);
  fixture.detectChanges();
  return { fixture, home: fixture.componentInstance };
}

describe('Home progress', () => {
  const save = () =>
    stubWorld(
      ['Sun', 'Earth', 'Moon', 'Aundara', 'Headquarters', 'Moonstep'],
      objectives.slice(0, 7).map((o) => o.id),
      191,
    );

  it('shows nothing to measure until a save is loaded', () => {
    const { fixture } = setup();
    expect(fixture.nativeElement.querySelector('.progress')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Drop a');
  });

  it('measures components, missions, planets and stations', () => {
    const { home } = setup(save());
    expect(home.progress().map((r) => r.label)).toEqual([
      'components placeable',
      'missions completed',
      'planets visited',
      'stations visited',
    ]);
  });

  it('counts stations apart from planets, not folded in with them', () => {
    // 18 stations against 17 bodies, visited separately: one combined bar
    // would hide which of the two a reader is behind on.
    const { home } = setup(save());
    const by = new Map(home.progress().map((r) => [r.label, r]));

    expect(by.get('planets visited')).toMatchObject({ done: 4, total: bodies.length });
    // The save has reached Headquarters, which retires the tutorial station:
    // it leaves the denominator rather than sitting there unreachable.
    expect(by.get('stations visited')).toMatchObject({ done: 2, total: stations.length - 1 });
    expect(bodies.length).not.toBe(stations.length);
  });

  it('counts completed missions and placeable components', () => {
    const { home } = setup(save());
    const by = new Map(home.progress().map((r) => [r.label, r]));
    expect(by.get('missions completed')).toMatchObject({ done: 7, total: objectives.length });
    expect(by.get('components placeable')).toMatchObject({ done: 191, total: 310 });
  });

  it('turns each row into a percentage, and a bar of that width', () => {
    const { fixture, home } = setup(save());
    const rows = [...fixture.nativeElement.querySelectorAll('.progress .row')];
    expect(rows.length).toBe(4);

    for (const [i, r] of home.progress().entries()) {
      expect(r.pct).toBe(Math.round((r.done / r.total) * 100));
      const fill = rows[i].querySelector('.bar span') as HTMLElement;
      expect(fill.style.width).toBe(`${r.pct}%`);
      expect(rows[i].textContent).toContain(`${r.done} of ${r.total}`);
    }
  });

  it('names the loaded world once, not once per bar', () => {
    const { fixture } = setup(save());
    const text = fixture.nativeElement.textContent as string;
    expect(text.split('Story-Welt').length - 1).toBe(1);
  });

  it('drops a superseded station from the count, not just from the list', () => {
    const before = setup(stubWorld(['Sun', 'Earth', 'Moonstep'], []));
    const beforeTotal = before.home.progress().find((r) => r.label === 'stations visited')!.total;
    TestBed.resetTestingModule();

    const after = setup(stubWorld(['Sun', 'Earth', 'Headquarters'], []));
    const afterTotal = after.home.progress().find((r) => r.label === 'stations visited')!.total;

    expect(beforeTotal).toBe(stations.length);
    expect(afterTotal).toBe(stations.length - 1);
  });

  /**
   * The three figures are what the reader has, not what exists -- the heading
   * is what says so. Without it the cards read as a table of contents and the
   * numbers look wrong to anyone who knows the game has more in it.
   */
  it('heads the cards with what the numbers mean', () => {
    const el = setup(save()).fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.cards-head')?.textContent?.trim()).toBe('Unlocked');
    expect(el.querySelector('.cards')?.getAttribute('aria-labelledby')).toBe('unlocked');
  });

  /**
   * Stations sit between the bodies and the missions because that is the
   * order the wiki's own nav uses, and because a station is a place before it
   * is a mission board.
   */
  it('cards the four sections in the nav order', () => {
    const el = setup(save()).fixture.nativeElement as HTMLElement;
    const hrefs = [...el.querySelectorAll('.cards a')].map((a) => a.getAttribute('href'));

    expect(hrefs).toEqual(['/components', '/planets', '/stations', '/missions']);
  });

  /** The same rule /stations lists by: docked at, and not left behind. */
  it('counts only the stations the reader has docked at', () => {
    // The save below has reached Headquarters and Moonstep, and Headquarters
    // retires the tutorial station.
    const { home } = setup(save());
    expect(home.stations()).toBe(2);
  });

  /** The count includes stars, so the card says so. */
  it('names the planets card for what it counts', () => {
    const el = setup(save()).fixture.nativeElement as HTMLElement;
    const card = el.querySelector('a[href="/planets"]');

    expect(card?.textContent).toContain('Planets / Stars');
  });
});
