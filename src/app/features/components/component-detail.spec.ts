import { TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { ComponentDetail } from './component-detail';
import { DataService } from '../../core/data.service';
import { WorldService } from '../../core/world.service';
import { Comp, Objective, Planet, StatLabel } from '../../core/models';
import compsJson from '../../../../data/components_full.json';
import labelsJson from '../../../../data/stat_labels.json';
import objectivesJson from '../../../../data/objectives.json';
import planetsJson from '../../../../data/planets.json';

const comps = compsJson as unknown as Comp[];
const objectives = objectivesJson as unknown as Objective[];
const planets = planetsJson as unknown as Planet[];
const labels = labelsJson as unknown as Record<string, StatLabel>;

function stubData() {
  const all = signal(comps);
  return {
    components: all,
    objectives: signal(objectives),
    planets: signal(planets),
    componentById: computed(() => new Map(all().map((c) => [c.id, c]))),
    statsOf: (c: Comp) => Object.values(c.stats)[0] ?? {},
    iconUrl: (id: string) => `data/icons/${id}.webp`,
    statLabels: computed(() => labels),
    loading: () => false,
    failed: () => false,
  } as unknown as DataService;
}

const planetOf = (o: Objective) => {
  const at = planets.find((p) => p.full_id === o.start);
  return at?.type === 'station' ? planets.find((p) => p.id === at.parent) : at;
};

/** A save that has been to these bodies. */
function stubWorld(visited: string[]) {
  const ids = new Set(visited.map((id) => planets.find((p) => p.id === id)!.object_id));
  return {
    hasWorld: () => true,
    name: () => 'test world',
    stateOf: () => 'have',
    gateOf: () => '',
    isVisited: (objectId: number) => ids.has(objectId),
    isDiscovered: (o: Objective) => {
      const at = planetOf(o);
      return !at || ids.has(at.object_id);
    },
  } as unknown as WorldService;
}

/** A save that has been everywhere — for tests about pooling, not discovery. */
const allSeen = () => stubWorld(planets.map((p) => p.id));

function setup(id: string, world?: WorldService) {
  TestBed.configureTestingModule({
    imports: [ComponentDetail],
    providers: [
      { provide: DataService, useValue: stubData() },
      ...(world ? [{ provide: WorldService, useValue: world }] : []),
      provideRouter([]),
    ],
  });
  const fixture = TestBed.createComponent(ComponentDetail);
  fixture.componentRef.setInput('id', id);
  fixture.detectChanges();
  return { fixture, page: fixture.componentInstance };
}

/** Never rewarded by name — it is stocked through the Frame pool. */
const POOLED = 'FrameHalfC';

describe('ComponentDetail rewards', () => {
  it('no longer offers a same-stock-pool list', () => {
    const { fixture } = setup(POOLED, allSeen());
    expect(fixture.nativeElement.textContent).not.toContain('Same stock pool');
  });

  it('answers "how do I get this" for a part no objective names', () => {
    // The old page had nothing to say here: this part is rewarded by no
    // objective, so it showed a pool list and no rewards at all.
    const { fixture, page } = setup(POOLED, allSeen());
    expect(objectives.some((o) => o.reward.some((r) => r.component === POOLED))).toBe(false);
    expect(page.rewards().length).toBeGreaterThan(0);
    expect(fixture.nativeElement.textContent).toContain('Rewarded by');
  });

  it("credits the pool the part draws from, summing an objective's members", () => {
    const { page } = setup(POOLED, allSeen());
    const frames = new Set(
      comps
        .filter(
          (c) =>
            c.in_build &&
            (Object.values(c.stats)[0] as Record<string, string>)['_scGroup']?.startsWith('Frame '),
        )
        .map((c) => c.id),
    );

    for (const r of page.rewards()) {
      const expected = r.objective.reward
        .filter((x) => frames.has(x.component))
        .reduce((n, x) => n + x.amount, 0);
      expect(r.amount).toBe(expected);
      expect(r.amount).toBeGreaterThan(0);
    }
  });

  it('names every objective once a save has been everywhere', () => {
    const { fixture, page } = setup(POOLED, allSeen());
    expect(page.rewards().every((r) => r.known)).toBe(true);
    expect(fixture.nativeElement.querySelector('.unknown')).toBeNull();
  });

  describe('with a save that has not been everywhere', () => {
    it('hides the name and the amount of a mission the reader has not found', () => {
      const { fixture, page } = setup(POOLED, stubWorld(['Earth']));
      const hidden = page.rewards().filter((r) => !r.known);
      expect(hidden.length).toBeGreaterThan(0);

      const rows = [...fixture.nativeElement.querySelectorAll('.links li')] as HTMLElement[];
      const anon = rows.filter((li) => li.querySelector('.unknown'));
      expect(anon.length).toBe(hidden.length);
      for (const li of anon) {
        expect(li.textContent).toContain('?');
        expect(li.textContent).toContain('×?');
        // No link, and no number that would give the stock away.
        expect(li.querySelector('a')).toBeNull();
        expect(li.textContent).not.toMatch(/×\d/);
      }
    });

    it('keeps the row, so the reader still knows more stock is coming', () => {
      const open = setup(POOLED, allSeen());
      const total = open.page.rewards().length;
      TestBed.resetTestingModule();

      const { page } = setup(POOLED, stubWorld(['Earth']));
      expect(page.rewards().length).toBe(total);
    });

    it('uses the same discovery rule as the missions page', () => {
      const { page } = setup(POOLED, stubWorld(['Earth']));
      for (const r of page.rewards()) {
        const at = planetOf(r.objective);
        expect(r.known).toBe(!at || at.id === 'Earth');
      }
    });
  });
});
