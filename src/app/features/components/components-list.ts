import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { WorldService } from '../../core/world.service';
import { CATEGORIES, categoriesOf } from '../../core/stats';
import { amountLabel } from '../../core/amount.pipe';

@Component({
  selector: 'components-list',
  imports: [RouterLink],
  templateUrl: './components-list.html',
  styleUrl: './components-list.scss',
})
export class ComponentsList {
  readonly data = inject(DataService);
  readonly world = inject(WorldService);
  readonly query = signal('');
  readonly category = signal('All');

  readonly inBuild = computed(() => this.data.components().filter((c) => c.in_build));

  /**
   * The stock the save has been given for a part, as "(1130)".
   *
   * The pool is not named. The card already sits under the heading for the
   * category it is filed in, so the name only said again what the section
   * above it says — and the note above the grid explains that a figure is a
   * shared pool's, not this one shape's.
   *
   * A part that spends two pools reports the LAST one, on the same reasoning
   * that files it under its last category: the second material is what the
   * part is for. A window's glass is the number that decides whether you can
   * build one — its frame stock is already on every frame card.
   *
   * A pool of 1000000 shows as ∞ — see UNLIMITED in core/amount.pipe.ts, which
   * is the one place that rule lives now that the mission and component reward
   * rows apply it too.
   *
   * Empty when there is nothing to report, so the card grows no element.
   */
  stockLabel(id: string): string {
    const last = this.world.stockOf(id).at(-1);
    if (!last) return '';
    return `(${amountLabel(last.amount)})`;
  }

  /**
   * component id -> the build-menu categories it appears under.
   *
   * These are the game's own inventory tabs (`_categories`), not the
   * `_scGroup` stock pool the availability engine uses. The two are
   * different axes and were conflated here before: filtering by _scGroup
   * offered players tabs like "MathBlock" and "DigitalOrAnalogMeter" that
   * exist nowhere in the game, and dumped 140 of 310 components into an
   * ungrouped "None".
   */
  readonly catsById = computed(() => {
    const m = new Map<string, string[]>();
    for (const c of this.data.components()) {
      m.set(c.id, categoriesOf(this.data.statsOf(c)));
    }
    return m;
  });

  /**
   * The components the page is willing to show: everything placeable in the
   * build that the reader's save has unlocked.
   *
   * A locked component is hidden outright rather than listed and greyed. With
   * no save loaded nothing is hidden and the page is the full reference.
   *
   * This used to carry a second cut, dropping a multi-category part whose
   * section had nothing of its own in it — a workaround for "Frame Quarter
   * With Pipe" showing up under a Fuel heading in a save with no fuel at all.
   * That turned out to be an availability bug, not a display one: the part
   * spends pipe stock as well as frame stock, and computeAvailability() now
   * knows it. The page needs no special case.
   */
  readonly available = computed(() => this.inBuild().filter((c) => this.world.isListed(c.id)));

  /**
   * component id -> the one category it is filed under.
   *
   * A part in several categories is filed under the LAST of them in the
   * game's own order — a Frame|Glass window belongs with the glass, an
   * Electronics|Thrusters engine with the thrusters. The earlier bit is the
   * broader material the part is made of; the later one is what it is for,
   * and that is what a reader is looking for it under.
   *
   * One category per part, used for the tabs and the headings alike, so a
   * tab and its heading can never disagree about what is in it. The full
   * membership is still on the card.
   */
  readonly filedUnder = computed(() => {
    const m = new Map<string, string>();
    for (const [id, list] of this.catsById()) {
      m.set(id, CATEGORIES.filter((c) => list.includes(c)).at(-1) ?? '');
    }
    return m;
  });

  /**
   * "All" plus every game category that some *shown* component is filed
   * under.
   *
   * Built from what is available rather than from the whole build, so a save
   * that has unlocked no thrusters is not offered a Thrusters tab that can
   * only empty the page.
   */
  readonly categories = computed(() => {
    const used = new Set(this.available().map((c) => this.filedUnder().get(c.id)!));
    return ['All', ...CATEGORIES.filter((c) => used.has(c))];
  });

  /**
   * The category actually in force. A selection can stop being offered under
   * it — loading a save narrows the tabs to what that save has unlocked — and
   * falling back to "All" beats an empty page filtered by a tab that is no
   * longer there.
   */
  readonly activeCategory = computed(() =>
    this.categories().includes(this.category()) ? this.category() : 'All',
  );

  /**
   * The shown components, split into the game's build-menu categories and
   * ordered exactly as the filter bar orders them. Each part appears once,
   * under the category filedUnder() puts it in.
   */
  readonly groups = computed(() => {
    const filed = this.filedUnder();
    const items = this.shown();
    const wanted =
      this.activeCategory() === 'All' ? this.categories().slice(1) : [this.activeCategory()];

    const out = wanted
      .map((name) => ({ name, items: items.filter((c) => filed.get(c.id) === name) }))
      .filter((g) => g.items.length);

    // A component with no category bits set at all (the Sunflower Pot is the
    // only one in this build) belongs to no tab — in game it is reachable
    // through "All" alone. It gets a group of its own rather than dropping
    // off a page that is supposed to list the whole build.
    if (this.activeCategory() === 'All') {
      const loose = items.filter((c) => !filed.get(c.id));
      if (loose.length) out.push({ name: 'Uncategorised', items: loose });
    }
    return out;
  });

  readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    const cat = this.activeCategory();
    const filed = this.filedUnder();
    return this.available()
      .filter((c) => cat === 'All' || filed.get(c.id) === cat)
      .filter(
        (c) =>
          !q ||
          c.name.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q) ||
          c.desc.toLowerCase().includes(q),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  });
}
