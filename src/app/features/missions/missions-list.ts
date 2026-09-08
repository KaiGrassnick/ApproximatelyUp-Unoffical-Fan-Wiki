import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { WorldService } from '../../core/world.service';
import { Objective } from '../../core/models';
import { ObjectiveTitle } from '../../shared/objective-title/objective-title';
import { StatusPill } from '../../shared/status-pill/status-pill';
import { ToCome } from '../../shared/to-come/to-come';

@Component({
  selector: 'missions-list',
  imports: [RouterLink, ObjectiveTitle, StatusPill, ToCome],
  templateUrl: './missions-list.html',
  styleUrl: './missions-list.scss',
})
export class MissionsList {
  readonly data = inject(DataService);
  readonly world = inject(WorldService);
  readonly kind = signal('all');
  readonly planet = signal('all');
  readonly state = signal<'all' | 'completed' | 'open'>('all');

  readonly kinds = computed(() => [
    'all',
    ...[...new Set(this.data.objectives().map((o) => o.type))].sort(),
  ]);

  /**
   * objective id -> the planet it takes place on.
   *
   * An objective's `start` is either a planet (`Planet_Basalt`) or one of its
   * stations (`PlanetStation_Basalt_CandyVein`); a station resolves to its
   * parent, so "Basalt" collects the missions on Basalt and on everything
   * orbiting it rather than splitting them across a dozen station entries.
   */
  readonly planetByObjective = computed(() => {
    const m = new Map<number, string>();
    for (const o of this.data.objectives()) {
      const body = this.data.objectivePlanet(o);
      if (body) m.set(o.id, body.id);
    }
    return m;
  });

  /**
   * The planet filter's options: bodies that actually have missions, and that
   * the reader's save says they have been to.
   *
   * Both halves matter. Listing a planet with no missions offers a filter
   * that can only empty the page, and listing one the reader has never
   * visited names a place the rest of the wiki is careful not to name. With
   * no save loaded nothing is hidden — the wiki is a plain reference then.
   */
  readonly planets = computed(() => {
    const withMissions = new Set(this.planetByObjective().values());
    return [
      'all',
      ...this.data
        .planets()
        .filter((p) => p.type !== 'station' && withMissions.has(p.id) && this.world.isKnown(p))
        .map((p) => p.id)
        .sort(),
    ];
  });

  /**
   * The planet filter actually in force. A selection can stop being offered
   * under it — dropping a save narrows the list to what that save has seen —
   * and silently falling back to "all" beats showing an empty page filtered
   * by a button that is no longer there.
   */
  readonly activePlanet = computed(() =>
    this.planets().includes(this.planet()) ? this.planet() : 'all',
  );

  /**
   * Everything the two filter rows let through, discovered or not, grouped by
   * planet.
   *
   * Objective id alone very nearly groups them — the story missions run
   * planet by planet — and then the side missions interleave, breaking the
   * 14 planets into 40 runs. Sorting by planet first collects each place's
   * work together; the id is the tie-break, so within a planet the missions
   * still appear in the game's own order.
   */
  private readonly filtered = computed(() => {
    const k = this.kind();
    const at = this.activePlanet();
    const byObjective = this.planetByObjective();
    const st = this.state();
    return (
      this.data
        .objectives()
        .filter((o) => k === 'all' || o.type === k)
        .filter((o: Objective) => at === 'all' || byObjective.get(o.id) === at)
        // Progress is something only a save knows, so with none loaded this
        // filter is not offered and must not quietly apply either.
        .filter(
          (o) =>
            st === 'all' ||
            !this.world.hasWorld() ||
            (this.world.isCompleted(o.id) ? 'completed' : 'open') === st,
        )
        .sort(
          (a, b) =>
            (byObjective.get(a.id) ?? '').localeCompare(byObjective.get(b.id) ?? '') || a.id - b.id,
        )
    );
  });

  readonly shown = computed(() => this.filtered().filter((o) => this.world.isDiscovered(o)));

  /**
   * How many missions the loaded save is still hiding, under the filters in
   * force. Counted rather than listed: the page says there is more out there
   * without saying what or where, which is the whole point of hiding them.
   */
  readonly toCome = computed(() => this.filtered().length - this.shown().length);
}
