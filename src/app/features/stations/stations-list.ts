import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { WorldService } from '../../core/world.service';
import { Planet } from '../../core/models';
import { StatusPill } from '../../shared/status-pill/status-pill';
import { ToCome } from '../../shared/to-come/to-come';

/** A planet and the stations orbiting it. */
export interface StationGroup {
  planet: string;
  stations: Planet[];
}

@Component({
  selector: 'stations-list',
  imports: [RouterLink, StatusPill, ToCome],
  templateUrl: './stations-list.html',
  styleUrl: './stations-list.scss',
})
export class StationsList {
  readonly data = inject(DataService);
  readonly world = inject(WorldService);

  readonly stations = computed(() =>
    this.data
      .planets()
      .filter((p) => p.type === 'station' && !this.world.isSuperseded(p.id))
      .sort((a, b) => a.id.localeCompare(b.id)),
  );

  /**
   * Whether a body may be named — a station, or the planet it orbits.
   *
   * Both are asked through the same rule, and the rule reads the station
   * reveal for a station and the planet reveal for a planet, so revealing
   * stations alone still needs their planet known before the group can be
   * headed with its name.
   */
  isKnown(p: Planet): boolean {
    return this.world.isKnown(p);
  }

  /**
   * The stations worth listing, under the planet they orbit.
   *
   * A station belongs to its planet and to nothing else, so the planet is the
   * only grouping there is. Groups whose planet the reader has never been to
   * are left out whole rather than headed with the planet's name: the rest of
   * the wiki does not name those places, and a heading would.
   *
   * A station the reader has not docked at is left out too, rather than drawn
   * as an anonymous row. The planets list does draw those -- an undiscovered
   * body is a blip on the game's own galaxy map, so an anonymous card there
   * says something true -- but a station has no such presence: an unnamed row
   * under "Earth" carries no information except that there is one more, which
   * is what the count at the bottom of the page is for.
   */
  readonly groups = computed<StationGroup[]>(() => {
    const byPlanet = new Map<string, Planet[]>();
    for (const s of this.stations()) {
      if (!this.isKnown(s)) continue;
      const planet = s.parent ? this.data.planetById().get(s.parent) : undefined;
      if (!planet || !this.isKnown(planet)) continue;
      byPlanet.set(planet.id, [...(byPlanet.get(planet.id) ?? []), s]);
    }
    return [...byPlanet.entries()]
      .map(([planet, stations]) => ({ planet, stations }))
      .sort((a, b) => a.planet.localeCompare(b.planet));
  });

  /**
   * How many stations the loaded save is still hiding. Counted rather than
   * listed, the way the missions page counts what it holds back.
   */
  readonly toCome = computed(
    () => this.stations().length - this.groups().reduce((n, g) => n + g.stations.length, 0),
  );
}
