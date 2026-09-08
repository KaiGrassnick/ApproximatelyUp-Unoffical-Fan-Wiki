import { TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { PlanetDetail } from './planet-detail';
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
  return {
    planets: all,
    objectives: signal(objectives),
    components: signal([]),
    planetById: computed(() => new Map(all().map((p) => [p.id, p]))),
    planetByFullId: computed(() => new Map(all().map((p) => [p.full_id, p]))),
    objectiveByKey: computed(() => new Map(objectives.map((o) => [o.key, o]))),
    globeUrl: (id: string) => `data/planets/${id}.webp`,
    locationName: (fullId: string) => planets.find((p) => p.full_id === fullId)?.id ?? '',
    loading: () => false,
    failed: () => false,
  } as unknown as DataService;
}

/** A save that has been to exactly these bodies. */
function stubWorld(...visited: string[]) {
  const ids = new Set(visited.map((id) => byId(id).object_id));
  return {
    hasWorld: () => true,
    name: () => 'test world',
    isVisited: (objectId: number) => ids.has(objectId),
    isSuperseded: () => false,
    // Mirrors WorldService.isKnown() with no reveal turned on: the Sun is
    // never tracked, everything else must have been reached.
    isKnown: (p: Planet) => p.id === 'Sun' || ids.has(p.object_id),
    isDiscovered: (o: Objective) => {
      if (o.hidden) return false;
      const at = planets.find((p) => p.full_id === o.start);
      return !at || ids.has(at.object_id);
    },
  } as unknown as WorldService;
}

function setup(id: string, world?: WorldService) {
  TestBed.configureTestingModule({
    imports: [PlanetDetail],
    providers: [
      { provide: DataService, useValue: stubData() },
      ...(world ? [{ provide: WorldService, useValue: world }] : []),
      provideRouter([]),
    ],
  });
  const fixture = TestBed.createComponent(PlanetDetail);
  fixture.componentRef.setInput('id', id);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    page: fixture.componentInstance,
    listed: () =>
      [...el.querySelectorAll('.links.missions li')].map((li) => li.textContent!.trim()),
    row: () => el.querySelector('to-come .to-come') as HTMLElement | null,
  };
}

describe('PlanetDetail missions here', () => {
  // Everything in Earth's neighbourhood: some at the planet, some at its two
  // stations (Headquarters and Tutorial).
  const earthPlaces = [
    'Planet_Earth',
    'PlanetStation_Earth_Headquarters',
    'PlanetStation_Earth_Tutorial',
  ];
  const onEarth = objectives.filter(
    (o) => earthPlaces.includes(o.start) || earthPlaces.includes(o.end),
  );

  it('lists only the missions the save has reached', () => {
    const { page, listed } = setup('Earth', stubWorld('Earth'));

    expect(page.missions().length).toBeGreaterThan(0);
    expect(page.missions().length).toBeLessThan(onEarth.length);
    expect(
      page
        .missions()
        .every(({ o }) => earthPlaces.includes(o.start) || earthPlaces.includes(o.end)),
    ).toBe(true);
    expect(listed().length).toBe(page.missions().length);
  });

  it('says how many it is holding back rather than listing them', () => {
    const { page, row } = setup('Earth', stubWorld('Earth'));

    expect(page.toCome()).toBeGreaterThan(0);
    expect(page.missions().length + page.toCome()).toBe(onEarth.length);
    expect(row()!.textContent).toContain(String(page.toCome()));
    // A count, not a hint: no mission's name is anywhere in the row.
    expect(row()!.querySelector('a')).toBeNull();
  });

  it('drops the row once nothing is left to come', () => {
    const { page, row } = setup('Earth', stubWorld('Earth', 'Headquarters', 'Tutorial'));
    const hiddenHere = page.toCome();

    // Whatever remains is behind prerequisites, not behind places.
    expect(hiddenHere).toBeGreaterThanOrEqual(0);
    if (hiddenHere === 0) expect(row()).toBeNull();
    else expect(row()).not.toBeNull();
  });

  it('says it the same way the missions and stations pages do', () => {
    // One component, so the three pages cannot drift apart.
    const { row } = setup('Earth', stubWorld('Earth'));
    expect(row()!.textContent).toContain('yet to come');
  });
});

describe('PlanetDetail stations', () => {
  /** The station rows: the panel titled "Stations". */
  function rows(el: HTMLElement) {
    const panel = [...el.querySelectorAll('hud-panel')].find((p) =>
      p.textContent?.includes('Stations'),
    )!;
    return [...panel.querySelectorAll('.links li')] as HTMLElement[];
  }

  it('leaves out a station the save has not docked at', () => {
    // Basalt and B02 reached, CandyVein not — /stations drops it rather than
    // drawing an anonymous row, and this page must agree.
    const { fixture, page } = setup('Basalt', stubWorld('Basalt', 'B02'));
    const el = fixture.nativeElement as HTMLElement;

    expect(page.stations()).toEqual(['B02']);
    expect(rows(el).length).toBe(1);
    expect(el.textContent).not.toContain('CandyVein');
    expect(el.textContent).not.toContain('Unknown');
  });

  it('names and links a station the save has docked at', () => {
    const { fixture } = setup('Basalt', stubWorld('Basalt', 'B02'));
    const el = fixture.nativeElement as HTMLElement;

    const named = rows(el).find((li) => li.textContent!.includes('B02'))!;
    expect(named.querySelector('a')!.hasAttribute('href')).toBe(true);
  });

  it('lists both once the save has docked at both', () => {
    const { fixture, page } = setup('Basalt', stubWorld('Basalt', 'B02', 'CandyVein'));
    const el = fixture.nativeElement as HTMLElement;

    expect(page.stations()).toEqual(['B02', 'CandyVein']);
    expect(rows(el).every((li) => li.querySelector('a')!.hasAttribute('href'))).toBe(true);
  });
});

describe("PlanetDetail missions at this planet's stations", () => {
  /** Earth, its two stations, and the Moon station one mission comes back from. */
  const everywhere = () => stubWorld('Earth', 'Headquarters', 'Tutorial', 'Moon', 'Moonstep');

  const at = (page: PlanetDetail, key: string) => page.missions().find(({ o }) => o.key === key);

  it("lists a mission that starts at one of this planet's stations", () => {
    // ToTheMoon is handed over at Headquarters, not on Earth itself. The
    // panel used to match the planet's own full_id alone and missed it.
    const { page } = setup('Earth', everywhere());
    expect(at(page, 'ToTheMoon')).toBeDefined();
  });

  it('tags a station mission with the station that hands it over', () => {
    const { page } = setup('Earth', everywhere());
    expect(at(page, 'ToTheMoon')!.at).toBe('Headquarters');
    expect(at(page, 'WindTest')!.at).toBe('Headquarters');
  });

  it('leaves a mission at the body itself untagged', () => {
    const { page } = setup('Earth', everywhere());
    expect(at(page, 'Package_Earth_LostInTransit')!.at).toBeNull();
  });

  it('tags a mission that is here only because it ends at a station', () => {
    // UnstableDelivery starts at the Moon and is delivered to Headquarters.
    // Earth is where you take it, so Earth lists it, tagged with the dock.
    const { page } = setup('Earth', everywhere());
    expect(at(page, 'UnstableDelivery')!.at).toBe('Headquarters');
  });

  it('lists a mission once even when it touches the body and a station both', () => {
    const { page } = setup('Earth', everywhere());
    const ids = page.missions().map(({ o }) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('leaves out a station the save has left behind', () => {
    // The tutorial station is superseded by Headquarters, and the stations
    // panel already drops it. A mission must not come back in through it.
    const world = everywhere() as unknown as Record<string, unknown>;
    world['isSuperseded'] = (id: string) => id === 'Headquarters';
    const { page } = setup('Earth', world as unknown as WorldService);

    expect(at(page, 'ToTheMoon')).toBeUndefined();
    expect(at(page, 'Package_Earth_LostInTransit')).toBeDefined();
  });

  it("keeps an undocked station's missions in the count, not in the list", () => {
    const { page } = setup('Earth', stubWorld('Earth'));

    expect(at(page, 'ToTheMoon')).toBeUndefined();
    expect(page.toCome()).toBeGreaterThan(0);
  });

  it('renders the station name beside the mission it belongs to', () => {
    const { fixture } = setup('Earth', everywhere());
    const el = fixture.nativeElement as HTMLElement;
    const rows = [...el.querySelectorAll('.links.missions li')];

    const tagged = rows.filter((li) => li.querySelector('.at'));
    expect(tagged.length).toBeGreaterThan(0);
    expect(
      tagged.every((li) => li.querySelector('.at')!.textContent!.trim() === 'Headquarters'),
    ).toBe(true);
    // The planet's own missions carry no tag at all.
    expect(rows.length).toBeGreaterThan(tagged.length);
  });
});
