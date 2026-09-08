import { TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { PlanetsList } from './planets-list';
import { DataService } from '../../core/data.service';
import { WorldService } from '../../core/world.service';
import { Planet } from '../../core/models';
import planetsJson from '../../../../data/planets.json';

const planets = planetsJson as unknown as Planet[];
// Every body the page lists: planets, stars and the black hole.
const bodies = planets.filter((p) => p.type !== 'station');
const hole = planets.find((p) => p.type === 'blackhole')!;
const sun = planets.find((p) => p.id === 'Sun')!;
const earth = planets.find((p) => p.id === 'Earth')!;

function stubData() {
  const all = signal(planets);
  return {
    planets: all,
    components: signal([]),
    objectives: signal([]),
    buildableCount: computed(() => 0),
    globeUrl: (id: string) => `data/planets/${id}.webp`,
    planetByFullId: computed(() => new Map(all().map((p) => [p.full_id, p]))),
  } as unknown as DataService;
}

/** A loaded save in which the reader has been to exactly these bodies. */
function stubWorld(...visitedObjectIds: number[]) {
  const ids = new Set(visitedObjectIds);
  return {
    hasWorld: () => true,
    isVisited: (objectId: number) => ids.has(objectId),
    // Mirrors WorldService.UNTRACKED: the Sun alone, because every save has
    // it from the moment the world is created.
    tracksVisit: (id: string) => id !== 'Sun',
    // Mirrors WorldService.isKnown(): no reveal turned on, so a body is
    // known when its visit is untracked or the save has been there.
    isKnown: (p: Planet) => p.id === 'Sun' || ids.has(p.object_id),
    name: () => 'test world',
  } as unknown as WorldService;
}

/** A save that has been everywhere — for tests about layout, not discovery. */
const allSeen = () => stubWorld(...planets.map((p) => p.object_id));

function setup(world?: WorldService) {
  TestBed.configureTestingModule({
    imports: [PlanetsList],
    providers: [
      { provide: DataService, useValue: stubData() },
      ...(world ? [{ provide: WorldService, useValue: world }] : []),
      provideRouter([]),
    ],
  });
  const fixture = TestBed.createComponent(PlanetsList);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const cards = () => [...el.querySelectorAll('.grid .body')] as HTMLAnchorElement[];
  return { fixture, el, cards, page: fixture.componentInstance };
}

const textOf = (card: HTMLElement, sel: string) =>
  card.querySelector(sel)?.textContent?.trim() ?? '';

describe('PlanetsList', () => {
  it('shows a new game with no save loaded: the Sun, Earth, and nothing else named', () => {
    // The default used to be "everything", which made the wiki a spoiler for
    // anyone who opened it before finishing the game.
    const { cards } = setup();
    const named = cards()
      .map((c) => textOf(c, '.name'))
      .filter((n) => n !== 'Unknown');

    expect(cards().length).toBe(bodies.length);
    expect(named.sort()).toEqual(['Earth', 'Sun']);
    expect(cards().filter((c) => c.hasAttribute('href')).length).toBe(2);
  });

  it('names every body and links every card once a save has been everywhere', () => {
    const { cards } = setup(allSeen());
    expect(cards().length).toBe(bodies.length);
    expect(cards().every((c) => c.hasAttribute('href'))).toBe(true);
    expect(cards().some((c) => textOf(c, '.name') === 'Unknown')).toBe(false);
    // Every body has a globe image except the black hole, which is a black
    // sphere drawn in CSS.
    expect(cards().filter((c) => !!c.querySelector('img')).length).toBe(bodies.length - 1);
    expect(cards().filter((c) => !!c.querySelector('.globe.hole')).length).toBe(1);
  });

  describe('with a .world save loaded', () => {
    it('gives an unvisited body no name, no figures and no globe', () => {
      const { cards } = setup(stubWorld(earth.object_id));
      const unknown = cards().filter((c) => textOf(c, '.name') === 'Unknown');

      // Everything but Earth and the Sun, the one body never reported as
      // visited or unvisited at all.
      expect(unknown.length).toBe(bodies.length - 2);
      for (const card of unknown) {
        expect(textOf(card, '.meta')).toBe('? m · ? g');
        // The globe image is replaced by a dark disc carrying a "?", the way
        // the galaxy map draws the same body.
        expect(card.querySelector('img')).toBeNull();
        expect(textOf(card, '.globe')).toBe('?');
      }
    });

    it('leaves an unvisited card unclickable — no href to follow or tab into', () => {
      const { cards } = setup(stubWorld(earth.object_id));
      const linked = cards().filter((c) => c.hasAttribute('href'));

      // Earth, plus the Sun, whose visit is never reported and which stays
      // named and reachable rather than sitting permanently "Unknown".
      expect(linked.map((c) => textOf(c, '.name')).sort()).toEqual(['Earth', 'Sun']);
      // Still rendered and still counted — anonymous, not absent.
      expect(cards().length).toBe(bodies.length);
    });

    it('still shows the visited body in full', () => {
      const { cards } = setup(stubWorld(earth.object_id));
      const card = cards().find((c) => textOf(c, '.name') === 'Earth')!;

      expect(card.querySelector('img')).not.toBeNull();
      expect(textOf(card, '.meta')).not.toContain('?');
      expect(textOf(card, 'status-pill')).toContain('visited');
    });

    it('badges no visit on the Sun, which every save has from the first frame', () => {
      // A real save always contains the Sun, so this one does too.
      const { cards } = setup(stubWorld(earth.object_id, sun.object_id));
      const sunCard = cards().find((c) => textOf(c, '.name') === 'Sun');

      // Not hidden — it is a body like any other, it just has no badge.
      expect(sunCard).toBeDefined();
      expect(sunCard!.querySelector('status-pill')).toBeNull();
      // The Sun is now the only body without one: the black hole is tracked
      // like any other and carries an "unvisited" pill.
      expect(cards().filter((c) => c.querySelector('status-pill')).length).toBe(cards().length - 1);
    });
  });

  describe('the black hole', () => {
    it('is listed, as a plain black sphere with no globe image', () => {
      const { cards } = setup(allSeen());
      const card = cards().find((c) => textOf(c, '.name') === 'BlackHole')!;

      expect(card).toBeDefined();
      expect(card.querySelector('img')).toBeNull();
      const globe = card.querySelector('.globe.hole') as HTMLElement;
      expect(globe).not.toBeNull();
      // Just the sphere: no "?" and nothing else written on it.
      expect(globe.textContent!.trim()).toBe('');
    });

    it('shows its real figures once the save has discovered it', () => {
      const { cards } = setup(stubWorld(earth.object_id, hole.object_id));
      const card = cards().find((c) => textOf(c, '.name') === 'BlackHole')!;

      expect(textOf(card, '.meta')).toContain('600,000');
      expect(textOf(card, '.meta')).not.toContain('?');
      expect(textOf(card, 'status-pill')).toContain('visited');
    });

    it('is anonymous to a save that has not been there', () => {
      // The game hides an undiscovered black hole on its own galaxy map.
      const { cards } = setup(stubWorld(earth.object_id));
      const named = cards().map((c) => textOf(c, '.name'));

      expect(named).not.toContain('BlackHole');
      // Anonymous, not absent: still rendered, still counted.
      expect(cards().length).toBe(bodies.length);
    });
  });

  describe('sections', () => {
    it('lists the planets first and the rest under Special', () => {
      const { fixture, page } = setup(allSeen());
      const grids = [...fixture.nativeElement.querySelectorAll('.grid')];
      const namesIn = (g: Element) =>
        [...g.querySelectorAll('.name')].map((n) => n.textContent!.trim());

      expect(grids.length).toBe(2);
      expect(namesIn(grids[0])).toEqual(page.planets().map((p) => p.id));
      expect(namesIn(grids[1])).toEqual(page.special().map((p) => p.id));
    });

    it('puts the two stars and the black hole in Special, and nothing else', () => {
      // A reader scanning for somewhere to land should not have to know that
      // Sun and BlackHole are not places to land.
      const { fixture, page } = setup(allSeen());
      expect(page.special().map((p) => p.id)).toEqual(['BlackHole', 'RedDwarf', 'Sun']);
      expect(page.planets().every((p) => p.type === 'planet')).toBe(true);
      expect(page.planets().length + page.special().length).toBe(bodies.length);

      const heading = fixture.nativeElement.querySelector('.special') as HTMLElement;
      expect(heading.textContent!.trim()).toBe('Special');
    });
  });
});
