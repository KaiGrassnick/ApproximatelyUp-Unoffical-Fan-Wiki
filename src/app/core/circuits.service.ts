import { Injectable, computed, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { dataUrl } from './data-url';
import type { MeshFile } from './circuits/mesh-file';
import { CircuitStats, Spoiler } from './circuits/model';

/** One circuit, as scripts/gen-circuits.ts writes it into data/circuits.json. */
export interface CircuitIndexEntry {
  id: string;
  title: string;
  summary: string;
  spoiler: Spoiler;
  updated: string;
  stats: CircuitStats;
  /** Pool -> units, what the save check compares against `Availability.stock`. */
  needs: Record<string, number>;
  /** Buildable from a new game's starting stock. */
  newGame: boolean;
}

/**
 * The circuits index: title, summary and the numbers, in one small file.
 *
 * The numbers are in the index rather than in each circuit's own file so
 * that the list can say "buildable in a new game" and the save check can
 * run without a second fetch. The picture and the placed model are fetched
 * per circuit by the page, as guide bodies are.
 */
@Injectable({ providedIn: 'root' })
export class CircuitsService {
  private readonly res = httpResource<CircuitIndexEntry[]>(() => dataUrl('circuits.json'));

  readonly all = computed(() => this.res.value() ?? []);
  readonly loading = computed(() => this.res.isLoading());
  readonly byId = computed(() => new Map(this.all().map((c) => [c.id, c])));

  /**
   * The geometry the 3D view draws with, fetched only once a reader asks for
   * that view: 220 kB nobody reading the picture should pay for.
   */
  readonly wantMeshes = signal(false);
  private readonly meshesRes = httpResource<MeshFile>(() =>
    this.wantMeshes() ? dataUrl('circuit-meshes.json') : undefined,
  );
  readonly meshes = computed(() => this.meshesRes.value());
  readonly meshesLoading = computed(() => this.meshesRes.isLoading());
}
