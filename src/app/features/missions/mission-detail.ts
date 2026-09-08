import { Component, computed, effect, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { SeoService } from '../../core/seo.service';
import { WorldService } from '../../core/world.service';
import { Objective, Reward } from '../../core/models';
import { RichtextPipe } from '../../core/richtext.pipe';
import { AmountPipe } from '../../core/amount.pipe';
import { Panel } from '../../shared/panel/panel';
import { ObjectiveTitle } from '../../shared/objective-title/objective-title';
import { StatusPill } from '../../shared/status-pill/status-pill';

/** A resolved `dependencies` entry — see the comment on Objective.dependencies. */
type Dep = { kind: 'objective'; obj: Objective } | { kind: 'location'; id: string };

@Component({
  selector: 'mission-detail',
  imports: [RouterLink, RichtextPipe, AmountPipe, Panel, ObjectiveTitle, StatusPill],
  templateUrl: './mission-detail.html',
  styleUrl: './mission-detail.scss',
})
export class MissionDetail {
  readonly id = input.required<string>();
  readonly data = inject(DataService);
  readonly world = inject(WorldService);
  private readonly seo = inject(SeoService);

  readonly obj = computed(() => this.data.objectiveById().get(Number(this.id())));

  constructor() {
    // Description is the objective's own briefing from the game, falling back
    // to its objective line and then to where it starts — in that order,
    // because that is the order they go from specific to merely true.
    effect(() => {
      const o = this.obj();
      if (!o) return;
      const name = o.title || o.key.replace(/_/g, ' ');
      // locationLabel, not locationName: a description reads to a person, and
      // "Moon (Moonstep)" says where to dock where "Moon" only says where to go.
      const from = this.data.locationLabel(o.start);
      this.seo.describe({
        title: `${name} — Approximately Up`,
        description:
          o.desc ||
          o.obj ||
          `A ${o.type.toLowerCase()} objective in Approximately Up${from ? `, starting at ${from}` : ''}.`,
      });
    });
  }

  /**
   * Each dependency entry is a string that is almost always another
   * objective's key, and sometimes a station's full_id (a location you must
   * reach first, not an objective) — resolve against both, in that order,
   * and drop anything that resolves to neither rather than guessing.
   */
  readonly deps = computed<Dep[]>(() => {
    const objByKey = this.data.objectiveByKey();
    const planetByFullId = this.data.planetByFullId();
    const out: Dep[] = [];
    for (const d of this.obj()?.dependencies ?? []) {
      const dep = objByKey.get(d);
      if (dep) {
        out.push({ kind: 'objective', obj: dep });
        continue;
      }
      const loc = planetByFullId.get(d);
      if (loc) out.push({ kind: 'location', id: loc.id });
    }
    return out;
  });

  /**
   * Objectives that list this one's key as a dependency, and whether the
   * reader has found each.
   *
   * A successor needs this objective COMPLETED, while this page is reachable
   * as soon as it is merely open — so the ordinary case is an open mission
   * whose successors the reader has not discovered. Naming them handed over
   * the next step of the story, and sometimes a planet with it: "Rock
   * Obsession" led to "Find Outcast" on a save that had never seen Outcast.
   * Shaped like component-detail's reward rows so the two relations panels
   * mask the same way.
   */
  readonly unlocks = computed(() => {
    const key = this.obj()?.key;
    if (!key) return [];
    return this.data
      .objectives()
      .filter((o) => o.dependencies.includes(key))
      .map((objective) => ({ objective, known: this.world.isDiscovered(objective) }));
  });

  readonly rewards = computed(() => this.named(this.obj()?.reward));

  readonly requires = computed(() => this.named(this.obj()?.requires_components));

  /** Resolve each {component, amount} to its display name, id kept for links. */
  private named(list: Reward[] | undefined) {
    return (list ?? []).map((r) => ({
      ...r,
      name: this.data.componentById().get(r.component)?.name ?? r.component,
    }));
  }
}
