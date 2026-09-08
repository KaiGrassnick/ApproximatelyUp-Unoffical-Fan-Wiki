import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { SeoService } from '../../core/seo.service';
import { absoluteUrl } from '../../core/site';
import { WorldService } from '../../core/world.service';
import { Objective, Planet } from '../../core/models';
import { Panel } from '../../shared/panel/panel';
import { ObjectiveTitle } from '../../shared/objective-title/objective-title';
import { ToCome } from '../../shared/to-come/to-come';

/** A mission listed on this page, and the station that hands it over. */
export interface MissionHere {
  o: Objective;
  /** The station's short name, or null when the mission is at the body itself. */
  at: string | null;
}

@Component({
  selector: 'planet-detail',
  imports: [RouterLink, DecimalPipe, Panel, ObjectiveTitle, ToCome],
  templateUrl: './planet-detail.html',
  styleUrl: './planet-detail.scss',
})
export class PlanetDetail {
  readonly id = input.required<string>();
  readonly data = inject(DataService);
  readonly world = inject(WorldService);
  private readonly seo = inject(SeoService);

  readonly planet = computed(() => this.data.planetById().get(this.id()));

  constructor() {
    // The description is the body's own figures, in the units the page shows
    // them in, and the preview image is its rendered globe. Both come out of
    // planets.json — nothing here is a sentence written for a search engine.
    effect(() => {
      const p = this.planet();
      if (!p) return;
      this.seo.describe({
        title: `${p.id} — Approximately Up`,
        description: this.summary(p),
        // Same rule the header uses: only a planet or a star has a globe
        // rendered for it. A station or the black hole falls back to the
        // site card rather than to a 404.
        image:
          p.type === 'planet' || p.type === 'star'
            ? absoluteUrl(this.data.globeUrl(p.id))
            : undefined,
      });
    });
  }

  /**
   * One sentence of the body's own numbers, for a search result and a link
   * unfurl. A station carries neither air nor biomes, so it says what it is
   * instead of listing blanks.
   */
  private summary(p: Planet): string {
    const km = Math.round(p.radius / 1000).toLocaleString('en-US');
    const g = p.gravity.toFixed(1);
    const kind =
      p.type === 'station'
        ? `An orbital station in Approximately Up`
        : `A ${p.type} in Approximately Up`;
    return `${kind}: ${km} km radius, ${g} m/s² surface gravity. Its stations, and the missions that start and end here.`;
  }

  /**
   * The stations orbiting this body that the reader has docked at, minus any
   * the save has left behind.
   *
   * Dropped rather than masked, which is how /stations does it: an anonymous
   * row says only that there is one more station here, and the two pages must
   * not disagree about the same station. A short id that resolves to no record
   * is kept — nothing should vanish because a lookup failed.
   *
   * Note this is not the set the missions below are gathered from: a mission
   * handed over at a station the reader has never seen still belongs to this
   * planet, and hiding the station must not hide the mission. See
   * hereabouts().
   */
  readonly stations = computed(() => {
    const byId = this.data.planetById();
    return (this.planet()?.stations ?? [])
      .filter((id) => !this.world.isSuperseded(id))
      .filter((id) => {
        const record = byId.get(id);
        return !record || this.world.isKnown(record);
      });
  });

  /**
   * Where "here" is: this body, and every station orbiting it that the save
   * has not left behind.
   *
   * The same isSuperseded() cut stations() makes, so a mission cannot come
   * back in through a station this page has already decided not to list.
   */
  private readonly hereabouts = computed(() => {
    const p = this.planet();
    const byId = this.data.planetById();
    return {
      body: p?.full_id ?? '',
      stations: new Set(
        (p?.stations ?? [])
          .filter((id) => !this.world.isSuperseded(id))
          .map((id) => byId.get(id)?.full_id)
          .filter((full): full is string => !!full),
      ),
    };
  });

  /**
   * Objectives that start or end at this body OR at one of its stations.
   *
   * The stations matter: 25 of the 69 objectives are handed over at one, and
   * matching the planet's own full_id alone left them off the planet they are
   * plainly at. "To The Moon" starts at Headquarters, which is Earth.
   */
  private readonly allMissions = computed<MissionHere[]>(() => {
    const { body, stations } = this.hereabouts();
    if (!body) return [];
    const here = (loc: string) => loc === body || stations.has(loc);
    return this.data
      .objectives()
      .filter((o) => here(o.start) || here(o.end))
      .map((o) => ({ o, at: this.stationTag(o, body, stations) }));
  });

  /**
   * The station to name beside a mission, or null for one at the body itself.
   *
   * Start wins, because that is where the game hands the mission over and so
   * where the reader has to dock. A mission that is here only because it is
   * DELIVERED to one of our stations is tagged with that one instead — the
   * Moon's "Unstable Delivery" ends at Headquarters, and Earth is where you
   * take it.
   */
  private stationTag(o: Objective, body: string, stations: Set<string>): string | null {
    if (o.start === body) return null;
    if (stations.has(o.start)) return this.data.locationName(o.start);
    if (stations.has(o.end)) return this.data.locationName(o.end);
    return null;
  }

  /** The ones the reader's save has reached — the same rule the missions page uses. */
  readonly missions = computed(() =>
    this.allMissions().filter(({ o }) => this.world.isDiscovered(o)),
  );

  /** And how many it is holding back, said rather than shown. */
  readonly toCome = computed(() => this.allMissions().length - this.missions().length);
}
