import { TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { StationsList } from './stations-list';
import { DataService } from '../../core/data.service';
import { WorldService } from '../../core/world.service';
import { Planet } from '../../core/models';
import planetsJson from '../../../../data/planets.json';

const planets = planetsJson as unknown as Planet[];
const stations = planets.filter((p) => p.type === 'station');
const byId = (id: string) => planets.find((p) => p.id === id)!;

function stubData() {
  const all = signal(planets);
  return {
    planets: all,
    objectives: signal([]),
    components: signal([]),
    buildableCount: computed(() => 0),
    planetById: computed(() => new Map(all().map((p) => [p.id, p]))),
    planetByFullId: computed(() => new Map(all().map((p) => [p.full_id, p]))),
  } as unknown as DataService;
}

/** A save that has been to exactly these bodies. */
function stubWorld(...visited: string[]) {
  const ids = new Set(visited.map((id) => byId(id).object_id));
  return {
    hasWorld: () => true,
    name: () => 'test world',
    isVisited: (objectId: number) => ids.has(objectId),
    // Mirrors WorldService.isKnown(): no reveal turned on, so a body is
    // known when its visit is untracked or the save has been there.
    isKnown: (p: Planet) => ids.has(p.object_id),
    isSuperseded: (id: string) => id === 'Tutorial' && ids.has(byId('Headquarters').object_id),
  } as unknown as WorldService;
}

/** A save that has been everywhere — for tests about layout, not discovery. */
const allSeen = () => stubWorld(...planets.map((p) => p.id));

function setup(world?: WorldService) {
  TestBed.configureTestingModule({
    imports: [StationsList],
    providers: [
      { provide: DataService, useValue: stubData() },
      ...(world ? [{ provide: WorldService, useValue: world }] : []),
      provideRouter([]),
    ],
  });
  const fixture = TestBed.createComponent(StationsList);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    page: fixture.componentInstance,
    headings: () => [...el.querySelectorAll('.grp h2 a')].map((a) => a.textContent!.trim()),
    names: () => [...el.querySelectorAll('.list .name')].map((n) => n.textContent!.trim()),
    links: () => [...el.querySelectorAll('.list a[href]')] as HTMLAnchorElement[],
  };
}

describe('StationsList', () => {
  it('shows only the tutorial station with no save loaded', () => {
    // A new game has been to Earth and its tutorial station and nowhere else.
    // Headquarters orbits the same planet and has not been reached, so it is
    // counted rather than drawn -- which is why toCome is one short of the
    // whole list rather than two.
    const { page, headings, names } = setup();
    expect(headings()).toEqual(['Earth']);
    expect(names()).toEqual(['Tutorial']);
    expect(page.toCome()).toBe(stations.length - 1);
  });

  it('lists every station under the body it orbits once a save has seen them', () => {
    const { page, headings, names } = setup(allSeen());
    const total = page.groups().reduce((n, g) => n + g.stations.length, 0);

    // Everything visited also retires the tutorial station.
    expect(total).toBe(stations.length - 1);
    expect(page.toCome()).toBe(0);
    expect(headings()).toEqual([...headings()].sort());
    expect(names()).not.toContain('Unknown');
    // Every station is filed under its own parent, never another.
    for (const g of page.groups()) {
      expect(g.stations.every((s) => s.parent === g.planet)).toBe(true);
    }
  });

  it('links every station to its page once a save has seen them', () => {
    const { links } = setup(allSeen());
    expect(links().length).toBe(stations.length - 1);
    expect(links()[0].getAttribute('href')).toContain('/planets/');
  });

  describe('with a save', () => {
    // Aundara has two stations and neither is special — Earth's pair includes
    // the tutorial station, which has a rule of its own further down.
    const aundara = stations.filter((s) => s.parent === 'Aundara').map((s) => s.id);

    it('leaves out a planet the reader has never been to, heading and all', () => {
      const { page, headings } = setup(stubWorld('Aundara', aundara[0]));
      expect(headings()).toEqual(['Aundara']);
      // Not one name of a place the reader has not found appears anywhere --
      // including the second Aundara station, which they have not docked at.
      expect(
        page
          .groups()
          .flatMap((g) => g.stations)
          .map((s) => s.id),
      ).toEqual([aundara[0]]);
    });

    it('counts the stations it is holding back rather than listing them', () => {
      const { page } = setup(stubWorld('Aundara', aundara[0]));
      // Everything but the one station docked at, Aundara's second included.
      expect(page.toCome()).toBe(stations.length - 1);
      expect(page.toCome()).toBeGreaterThan(0);
    });

    it('lists a station only once the reader has docked at it', () => {
      const { names, links } = setup(stubWorld('Aundara', aundara[0]));
      expect(names()).toEqual([aundara[0]]);
      // The undocked one is not drawn at all -- an anonymous row under a
      // planet's name says nothing the count at the bottom does not.
      expect(names()).not.toContain('Unknown');
      // So every row on the page is a real link.
      expect(links().length).toBe(1);
      expect(links()[0].getAttribute('href')).toContain(aundara[0]);
    });

    it('shows nothing to come once everything has been seen', () => {
      // Everything visited also means Headquarters visited, which retires the
      // tutorial station — so the list is one shorter, and complete.
      const { page } = setup(stubWorld(...planets.map((p) => p.id)));
      expect(page.toCome()).toBe(0);
      expect(page.groups().reduce((n, g) => n + g.stations.length, 0)).toBe(stations.length - 1);
    });
  });

  describe('the tutorial station', () => {
    it('is listed while the save is still there', () => {
      const { names } = setup(stubWorld('Earth', 'Tutorial'));
      expect(names()).toContain('Tutorial');
    });

    it('drops out once the save has reached Headquarters', () => {
      // A save moves from the tutorial station to Headquarters and is never
      // sent back; no objective mentions it after that.
      const { page, names } = setup(stubWorld('Earth', 'Tutorial', 'Headquarters'));
      expect(names()).not.toContain('Tutorial');
      expect(page.stations().some((s) => s.id === 'Tutorial')).toBe(false);
      // And it is not counted as something still to come, either.
      expect(page.toCome()).toBe(stations.length - 1 - 1);
    });

    it('is the one station a new game can see', () => {
      // Headquarters comes later, so with no save loaded it is not named.
      const { names } = setup();
      expect(names()).toContain('Tutorial');
      expect(names()).not.toContain('Headquarters');
    });
  });
});
