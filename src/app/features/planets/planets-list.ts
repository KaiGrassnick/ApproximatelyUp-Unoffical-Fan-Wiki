import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../core/data.service';
import { WorldService } from '../../core/world.service';
import { Planet } from '../../core/models';
import { StatusPill } from '../../shared/status-pill/status-pill';

@Component({
  selector: 'planets-list',
  imports: [RouterLink, DecimalPipe, StatusPill, NgTemplateOutlet],
  templateUrl: './planets-list.html',
  styleUrl: './planets-list.scss',
})
export class PlanetsList {
  readonly data = inject(DataService);
  readonly world = inject(WorldService);

  /**
   * Whether this body may be named — the shared rule, in WorldService, that
   * the galaxy map and the stations page ask too: a body the save has never
   * reached gives up neither its name, its figures, nor a link to its page,
   * unless the reader has turned the planets reveal on.
   */
  isKnown(p: Planet): boolean {
    return this.world.isKnown(p);
  }

  /** Every body: planets, stars, and the black hole. Stations have their own page. */
  readonly bodies = computed(() =>
    this.data
      .planets()
      .filter((p) => p.type !== 'station')
      .sort((a, b) => a.id.localeCompare(b.id)),
  );

  /** The 15 planets — what a reader means by the word. */
  readonly planets = computed(() => this.bodies().filter((p) => p.type === 'planet'));

  /**
   * The three that are not planets: two stars and the black hole.
   *
   * Kept apart rather than sorted in among the planets, where a reader
   * scanning for somewhere to land would have to know that Sun and BlackHole
   * are not places to land.
   */
  readonly special = computed(() => this.bodies().filter((p) => p.type !== 'planet'));
}
