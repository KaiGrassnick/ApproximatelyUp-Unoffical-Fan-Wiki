import { TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { ComponentsList } from './components-list';
import { DataService } from '../../core/data.service';
import { WorldService } from '../../core/world.service';
import { Comp } from '../../core/models';
import compsJson from '../../../../data/components_full.json';

const comps = compsJson as unknown as Comp[];
const inBuild = comps.filter((c) => c.in_build);

function stubData() {
  const all = signal(comps);
  return {
    components: all,
    planets: signal([]),
    objectives: signal([]),
    buildableCount: computed(() => inBuild.length),
    statsOf: (c: Comp) => Object.values(c.stats)[0] ?? {},
    // The real WorldService is used when a test passes no save.
    planetByFullId: computed(() => new Map()),
    iconUrl: (id: string) => `data/icons/${id}.webp`,
    iconSrcset: (id: string) => `data/icons/64/${id}.webp 1x, data/icons/${id}.webp 2x`,
  } as unknown as DataService;
}

/** A loaded save that has unlocked exactly these components. */
function stubWorld(have: string[]) {
  const ids = new Set(have);
  return {
    hasWorld: () => true,
    stateOf: (id: string) => (ids.has(id) ? 'have' : 'locked'),
    stockOf: () => [],
    // Mirrors WorldService.isListed(): no reveal turned on, so only what the
    // save can place is listed.
    isListed: (id: string) => ids.has(id),
    name: () => 'test world',
  } as unknown as WorldService;
}

/** A save that has unlocked the lot — for tests about layout, not progress. */
const allUnlocked = () => stubWorld(inBuild.map((c) => c.id));

function setup(world?: WorldService) {
  TestBed.configureTestingModule({
    imports: [ComponentsList],
    providers: [
      { provide: DataService, useValue: stubData() },
      ...(world ? [{ provide: WorldService, useValue: world }] : []),
      provideRouter([]),
    ],
  });
  const fixture = TestBed.createComponent(ComponentsList);
  fixture.detectChanges();
  return { fixture, list: fixture.componentInstance };
}

/** Two components that between them use only a couple of the game's tabs. */
const cats = (c: Comp): string[] => {
  const raw = (Object.values(c.stats)[0] as Record<string, unknown>)['_categories'];
  const names = typeof raw === 'string' ? raw.split(' (')[0].split('|') : [];
  return [
    'Frame',
    'Electronics',
    'Fuel',
    'Tools',
    'Objectives',
    'Glass',
    'Math',
    'Thrusters',
    'Other',
  ].filter((n) => names.includes(n));
};

const mathOnes = inBuild
  .filter((c) => JSON.stringify(Object.values(c.stats)[0]).includes('Math ('))
  .slice(0, 3)
  .map((c) => c.id);

describe('ComponentsList', () => {
  it('shows only what a new game can place when no save is loaded', () => {
    // The parts that ship with base stock — the wiki starts where the game
    // starts rather than listing everything to anyone who opens it.
    const { list } = setup();
    const base = inBuild.filter(
      (c) => (Object.values(c.stats)[0] as Record<string, number>)['_availableAmount'] > 0,
    );

    expect(list.shown().length).toBeGreaterThan(0);
    expect(list.shown().length).toBeLessThan(inBuild.length);
    expect(list.shown().some((c) => base.some((b) => b.id === c.id))).toBe(true);
  });

  it('shows the whole build once a save has unlocked it, each part once', () => {
    const { fixture, list } = setup(allUnlocked());
    expect(list.shown().length).toBe(inBuild.length);
    expect(fixture.nativeElement.querySelectorAll('.grid .card').length).toBe(inBuild.length);
  });

  it('no longer lists the components that are not in this build', () => {
    const { fixture } = setup(allUnlocked());
    const names = [...fixture.nativeElement.querySelectorAll('.grid .card .name')].map(
      (el: Element) => el.textContent!.trim(),
    );
    const missing = comps.filter((c) => !c.in_build);
    expect(missing.length).toBeGreaterThan(0);
    expect(names.some((n) => missing.some((m) => m.name === n))).toBe(false);
    expect(fixture.nativeElement.querySelector('.nib')).toBeNull();
  });

  describe('grouping', () => {
    it('heads each group with its category, in the filter bar order', () => {
      const { fixture, list } = setup(allUnlocked());
      const headings = [...fixture.nativeElement.querySelectorAll('.cat h2')].map((el: Element) =>
        el.firstChild!.textContent!.trim(),
      );
      expect(headings).toEqual(list.groups().map((g) => g.name));
      // The filter bar is "All" plus the same categories in the same order.
      expect(list.categories().slice(1)).toEqual(headings.filter((h) => h !== 'Uncategorised'));
    });

    it('files a multi-category part under the last of its categories', () => {
      // A Frame|Glass window belongs with the glass, not with the frames:
      // the earlier bit is what it is made of, the later one what it is for.
      const { list } = setup(allUnlocked());
      const window = list
        .shown()
        .find((c) => list.catsById().get(c.id)!.join('|') === 'Frame|Glass')!;
      expect(list.filedUnder().get(window.id)).toBe('Glass');

      const under = list
        .groups()
        .filter((g) => g.items.some((c) => c.id === window.id))
        .map((g) => g.name);
      expect(under).toEqual(['Glass']);
    });

    it('files every part exactly once', () => {
      const { list } = setup(allUnlocked());
      const filed = list.groups().flatMap((g) => g.items.map((c) => c.id));
      expect(new Set(filed).size).toBe(filed.length);
      expect(filed.length).toBe(list.shown().length);
    });

    it('agrees with the tab of the same name, part for part', () => {
      // The heading count and the tab must never disagree about what is in a
      // category — that is the whole reason a part is filed only once.
      const { list } = setup(allUnlocked());
      for (const group of list.groups().filter((g) => g.name !== 'Uncategorised')) {
        list.category.set(group.name);
        expect(
          list
            .shown()
            .map((c) => c.id)
            .sort(),
        ).toEqual(group.items.map((c) => c.id).sort());
      }
    });

    it('keeps a component with no category at all rather than dropping it', () => {
      // The Sunflower Pot has no category bits set; in game it is reachable
      // through the "All" tab alone.
      const { list } = setup(allUnlocked());
      const loose = list.shown().filter((c) => !list.filedUnder().get(c.id));
      expect(loose.length).toBeGreaterThan(0);
      const bucket = list.groups().find((g) => g.name === 'Uncategorised')!;
      expect(bucket.items.map((c) => c.id)).toEqual(loose.map((c) => c.id));
      expect(list.groups()[list.groups().length - 1]).toBe(bucket);
    });

    it('shows one group when a category is selected', () => {
      const { list } = setup(allUnlocked());
      list.category.set('Math');
      expect(list.groups().map((g) => g.name)).toEqual(['Math']);
      expect(list.groups()[0].items.length).toBe(list.shown().length);
    });

    it('drops a group the search has emptied', () => {
      const { fixture, list } = setup(allUnlocked());
      list.query.set(list.shown()[0].name);
      fixture.detectChanges();
      expect(list.groups().every((g) => g.items.length > 0)).toBe(true);
      expect(list.groups().length).toBeLessThan(list.categories().length - 1);
    });
  });

  it('offers no have/locked filter — there is nothing locked left to filter', () => {
    const { fixture } = setup(stubWorld(mathOnes));
    const buttons = [...fixture.nativeElement.querySelectorAll('.controls button')].map(
      (b: Element) => b.textContent!.trim(),
    );
    expect(buttons).not.toContain('have');
    expect(buttons).not.toContain('locked');
    expect(buttons).not.toContain('all');
    // The per-card pill went with it: every card on the page is placeable now,
    // so a label saying so on each one is noise.
    expect(fixture.nativeElement.querySelector('status-pill')).toBeNull();
  });

  it('hides everything the save has not unlocked', () => {
    const { fixture, list } = setup(stubWorld(mathOnes));
    expect(
      list
        .shown()
        .map((c) => c.id)
        .sort(),
    ).toEqual([...mathOnes].sort());
    const names = [...fixture.nativeElement.querySelectorAll('.grid .card .name')].map(
      (el: Element) => el.textContent!.trim(),
    );
    expect(new Set(names).size).toBe(mathOnes.length);
  });

  it('counts only what it will show in the search placeholder', () => {
    const { fixture } = setup(stubWorld(mathOnes));
    const search = fixture.nativeElement.querySelector('.search') as HTMLInputElement;
    expect(search.placeholder).toBe(`Search ${mathOnes.length} components…`);
  });

  it('offers only the categories the shown components actually use', () => {
    const { list } = setup(stubWorld(mathOnes));
    const used = new Set(mathOnes.flatMap((id) => list.catsById().get(id)!));
    expect(list.categories()[0]).toBe('All');
    expect(list.categories().length).toBeGreaterThan(1);
    expect(
      list
        .categories()
        .slice(1)
        .every((c) => used.has(c)),
    ).toBe(true);
    // A tab that can only empty the page has no business being offered.
    expect(list.categories()).not.toContain('Frame');
  });

  it('falls back to All when the chosen category stops being offered', () => {
    const { list } = setup(stubWorld(mathOnes));
    list.category.set('Frame');

    expect(list.categories()).not.toContain('Frame');
    expect(list.activeCategory()).toBe('All');
    expect(list.shown().length).toBe(mathOnes.length);
  });

  it('still searches, within what the save has unlocked', () => {
    const { list } = setup(stubWorld(mathOnes));
    const target = list.shown()[0];
    list.query.set(target.name);

    expect(list.shown().length).toBeGreaterThan(0);
    expect(
      list
        .shown()
        .every(
          (c) =>
            c.name.toLowerCase().includes(target.name.toLowerCase()) ||
            c.id.toLowerCase().includes(target.name.toLowerCase()) ||
            c.desc.toLowerCase().includes(target.name.toLowerCase()),
        ),
    ).toBe(true);
  });

  describe('a save that has not unlocked a whole category', () => {
    // Story-Welt's real shape: frames and glass unlocked, no fuel parts at
    // all. "Frame Quarter With Pipe" is Frame|Fuel and sits in the frame
    // stock pool, but it spends pipe stock too, so the availability engine
    // reports it locked and the page never sees it.
    const glassPanes = inBuild.filter((c) => cats(c).join('|') === 'Glass').map((c) => c.id);
    const frames = inBuild.filter((c) => cats(c).join('|') === 'Frame').map((c) => c.id);
    const windows = inBuild.filter((c) => cats(c).join('|') === 'Frame|Glass').map((c) => c.id);
    const framePipe = inBuild.find((c) => c.id === 'FrameQuarterPipe')!;
    const save = [...frames, ...glassPanes, ...windows];

    it('offers no section for a category with nothing unlocked in it', () => {
      const { fixture, list } = setup(stubWorld(save));
      expect(list.categories()).not.toContain('Fuel');
      expect(list.groups().map((g) => g.name)).not.toContain('Fuel');
      expect(fixture.nativeElement.textContent).not.toContain(framePipe.name);
    });

    it('keeps a section whose parts the save does have, visitors included', () => {
      // Glass has its 23 plain panes, so the Frame|Glass windows stay filed
      // under it and stay on the page.
      const { list } = setup(stubWorld(save));
      expect(list.categories()).toContain('Glass');
      expect(list.filedUnder().get(windows[0])).toBe('Glass');
      expect(list.shown().map((c) => c.id)).toContain(windows[0]);
    });

    it('brings the section back when the save unlocks something in it', () => {
      const tank = inBuild.find((c) => cats(c).join('|') === 'Fuel')!;
      const { list } = setup(stubWorld([...save, tank.id, framePipe.id]));
      expect(list.categories()).toContain('Fuel');
      expect(list.filedUnder().get(framePipe.id)).toBe('Fuel');
      expect(list.shown().map((c) => c.id)).toContain(framePipe.id);
    });

    it('hides nothing at all once a save has unlocked the build', () => {
      const { list } = setup(allUnlocked());
      expect(list.filedUnder().get(framePipe.id)).toBe('Fuel');
      expect(list.shown().length).toBe(inBuild.length);
    });
  });
});

describe('ComponentsList — stock amounts', () => {
  interface Entry {
    pool: string | null;
    amount: number;
  }

  /** A save that has unlocked everything and reports the stock given here. */
  function withStock(entries: Record<string, Entry[]>) {
    const world = allUnlocked() as unknown as Record<string, unknown>;
    world['stockOf'] = (id: string) => entries[id] ?? [];
    return world as unknown as WorldService;
  }

  it('shows the amount in brackets, with no pool name', () => {
    // The card sits under its category heading already; naming the pool only
    // repeated what the section above it says.
    const { list } = setup(withStock({ FrameA: [{ pool: 'Frame', amount: 1130 }] }));
    expect(list.stockLabel('FrameA')).toBe('(1130)');
  });

  it('brackets a part that is its own pool the same way', () => {
    const { list } = setup(withStock({ GimbalThruster: [{ pool: null, amount: 6 }] }));
    expect(list.stockLabel('GimbalThruster')).toBe('(6)');
  });

  it('reports only the last pool of a part that spends two', () => {
    // A window is filed under Glass rather than Frame for the same reason
    // this shows the glass: the second material is what the part is FOR, and
    // it is the one a reader is short of. Frame stock is on the frame cards.
    const { list } = setup(
      withStock({
        WindowDualA: [
          { pool: 'Frame', amount: 1130 },
          { pool: 'Glass', amount: 105 },
        ],
      }),
    );
    expect(list.stockLabel('WindowDualA')).toBe('(105)');
  });

  it("shows the game's unlimited marker as ∞ rather than 1000000", () => {
    const { list } = setup(
      withStock({
        InventoryTool_Welder: [{ pool: null, amount: 1000000 }],
      }),
    );
    expect(list.stockLabel('InventoryTool_Welder')).toBe('(∞)');
  });

  it('says nothing at all for a part with no stock to report', () => {
    const { list } = setup(withStock({}));
    expect(list.stockLabel('FrameA')).toBe('');
  });

  it('renders the label on the card it belongs to', () => {
    const { fixture } = setup(withStock({ FrameA: [{ pool: 'Frame', amount: 1130 }] }));
    const cards = [...fixture.nativeElement.querySelectorAll('.grid .card')] as Element[];
    const frameA = cards.find(
      (el) =>
        el.querySelector('.name')!.textContent!.trim() ===
        inBuild.find((c) => c.id === 'FrameA')!.name,
    )!;

    expect(frameA.querySelector('.stock')!.textContent!.trim()).toBe('(1130)');
    // A card with nothing to report grows no empty element.
    expect(cards.filter((el) => el.querySelector('.stock')).length).toBe(1);
  });

  it('does not repeat the category on the card, which sits under it already', () => {
    const { fixture } = setup(allUnlocked());
    expect(fixture.nativeElement.querySelector('.grid .card .grp')).toBeNull();
    // The heading it sits under is still there to say what it is.
    expect(fixture.nativeElement.querySelectorAll('.cat h2').length).toBeGreaterThan(0);
  });

  it('notes under the heading that the figure is what the save was granted', () => {
    const { fixture } = setup(allUnlocked());
    const note = fixture.nativeElement.querySelector('.stock-note')!.textContent!;
    expect(note).toMatch(/granted/i);
    // The save carries no inventory, so the note must not promise otherwise.
    expect(note).toMatch(/not what is left|not how much is left|never what is left/i);
  });
});
