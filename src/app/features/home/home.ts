import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { WorldService } from '../../core/world.service';
import { GalaxyMap } from '../galaxy/galaxy-map';

@Component({
  selector: 'home-page',
  imports: [RouterLink, GalaxyMap],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  readonly data = inject(DataService);
  readonly world = inject(WorldService);

  /**
   * The tiles count what their pages will actually show, not what exists.
   *
   * With no save loaded that is a new game's view — 144 placeable parts, the
   * Sun and Earth, six missions on Earth — and it grows with the reader's own
   * save. A tile promising 310 components over a page listing 144 was the
   * wiki telling on the game.
   */
  readonly buildable = computed(
    () =>
      this.data.components().filter((c) => c.in_build && this.world.stateOf(c.id) === 'have')
        .length,
  );

  readonly bodies = computed(
    () =>
      this.data
        .planets()
        .filter(
          (p) =>
            (p.type === 'planet' || p.type === 'star') &&
            (!this.world.tracksVisit(p.id) || this.world.isVisited(p.object_id)),
        ).length,
  );

  /**
   * Stations the reader can name, on the same rule /stations lists them by:
   * docked at, and not left behind. Counted apart from the bodies above
   * because the game tracks them separately — see progress().
   */
  readonly stations = computed(
    () =>
      this.data
        .planets()
        .filter(
          (p) => p.type === 'station' && !this.world.isSuperseded(p.id) && this.world.isKnown(p),
        ).length,
  );

  readonly missions = computed(
    () => this.data.objectives().filter((o) => this.world.isDiscovered(o)).length,
  );

  /**
   * The four things a save can be measured against, as bars.
   *
   * Stations are counted apart from planets rather than folded in with them:
   * there are 18 of them against 17 bodies, they are visited separately, and
   * a single "places seen" bar would hide which of the two a reader is
   * behind on.
   */
  readonly progress = computed(() => {
    const objectives = this.data.objectives();
    const bodies = this.data.planets().filter((p) => p.type === 'planet' || p.type === 'star');
    // Superseded stations are not counted: a bar the reader can never fill
    // is worse than one that quietly gets shorter.
    const stations = this.data
      .planets()
      .filter((p) => p.type === 'station' && !this.world.isSuperseded(p.id));
    const visited = (list: typeof stations) =>
      list.filter((p) => this.world.isVisited(p.object_id)).length;

    return [
      {
        label: 'components placeable',
        done: this.world.haveCount(),
        total: this.data.buildableCount(),
      },
      {
        label: 'missions completed',
        done: objectives.filter((o) => this.world.isCompleted(o.id)).length,
        total: objectives.length,
      },
      { label: 'planets visited', done: visited(bodies), total: bodies.length },
      { label: 'stations visited', done: visited(stations), total: stations.length },
    ].map((r) => ({ ...r, pct: r.total ? Math.round((r.done / r.total) * 100) : 0 }));
  });
}
