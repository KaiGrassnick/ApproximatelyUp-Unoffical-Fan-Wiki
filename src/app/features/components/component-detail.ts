import { Component, computed, effect, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { SeoService } from '../../core/seo.service';
import { WorldService } from '../../core/world.service';
import { RichtextPipe } from '../../core/richtext.pipe';
import { AmountPipe } from '../../core/amount.pipe';
import { Panel } from '../../shared/panel/panel';
import { StatTable } from '../../shared/stat-table/stat-table';
import { StatusPill } from '../../shared/status-pill/status-pill';
import { ObjectiveTitle } from '../../shared/objective-title/objective-title';
import { flatten, isWeldable, resolveText, scGroupOf, statRows } from '../../core/stats';
import { absoluteUrl } from '../../core/site';

@Component({
  selector: 'component-detail',
  imports: [RouterLink, RichtextPipe, AmountPipe, Panel, StatTable, StatusPill, ObjectiveTitle],
  templateUrl: './component-detail.html',
  styleUrl: './component-detail.scss',
})
export class ComponentDetail {
  /** Bound from the route param by withComponentInputBinding(). */
  readonly id = input.required<string>();
  readonly data = inject(DataService);
  readonly world = inject(WorldService);
  private readonly seo = inject(SeoService);

  readonly comp = computed(() => this.data.componentById().get(this.id()));

  constructor() {
    // The description is the game's own text for the part, resolved the same
    // way the page body resolves it — not a sentence written about the part
    // for a search engine. The link-preview image is the part's own icon.
    effect(() => {
      const c = this.comp();
      if (!c) return;
      const icon = this.data.iconUrl(c.id);
      this.seo.describe({
        title: `${c.name} — Approximately Up`,
        description: this.desc() || `${c.name}, a component in Approximately Up.`,
        image: icon ? absoluteUrl(icon) : undefined,
      });
    });
  }
  readonly flat = computed(() => {
    const c = this.comp();
    return c ? flatten(this.data.statsOf(c)) : {};
  });
  /**
   * The stat rows this part has. Held here as well as in the table so the
   * panel can stay closed rather than framing an empty table — most parts
   * carry no stat the game names.
   */
  readonly statRows = computed(() => statRows(this.flat(), this.data.statLabels()));

  /** A frame that can be welded solid — read off the prefab, see isWeldable(). */
  readonly weldable = computed(() => isWeldable(this.flat()));

  readonly desc = computed(() => {
    const c = this.comp();
    return c ? resolveText(c.desc, this.flat()) : '';
  });
  readonly ports = computed(() => {
    const c = this.comp();
    return c ? c.ports.map((p) => resolveText(p, this.flat())) : [];
  });
  /**
   * Every component that shares this one's stock pool, itself included.
   *
   * The pool, not the part, is what a reward stocks: no objective rewards
   * "Frame Half Curved 2" by name, and listing that part as rewarded by
   * nothing was true of the part and useless about the part. This is what
   * makes the rewards below answer "how do I get this".
   */
  private readonly pool = computed(() => {
    const c = this.comp();
    if (!c) return new Set<string>();
    const group = scGroupOf(this.data.statsOf(c));
    if (!group) return new Set([c.id]);
    return new Set(
      this.data
        .components()
        .filter((o) => o.in_build && scGroupOf(this.data.statsOf(o)) === group)
        .map((o) => o.id),
    );
  });

  /**
   * The objectives that stock this component's pool, in the game's order.
   *
   * `known` is false for a mission on a planet the loaded save has never
   * been to. Those are kept as anonymous rows rather than dropped: the
   * reader can see that more stock is coming from somewhere without being
   * told where, which is the same bargain the missions page strikes.
   */
  readonly rewards = computed(() => {
    const pool = this.pool();
    if (!pool.size) return [];
    return this.data
      .objectives()
      .map((objective) => ({
        objective,
        amount: objective.reward
          .filter((r) => pool.has(r.component))
          .reduce((n, r) => n + r.amount, 0),
        known: this.world.isDiscovered(objective),
      }))
      .filter((r) => r.amount > 0)
      .sort((a, b) => a.objective.id - b.objective.id);
  });
}
