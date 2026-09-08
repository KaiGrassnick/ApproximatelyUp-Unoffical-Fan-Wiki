import { Injectable, computed } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { Comp, IconEntry, Objective, Planet, StatLabel } from './models';
import { dataUrl } from './data-url';

/**
 * The four extracted JSON files, fetched once and exposed as signals.
 * data/ is served verbatim by angular.json's asset config, so this is the
 * same file the extraction pipeline writes — there is no second copy.
 */
@Injectable({ providedIn: 'root' })
export class DataService {
  private readonly compsRes = httpResource<Comp[]>(() => dataUrl('components_full.json'));
  private readonly planetsRes = httpResource<Planet[]>(() => dataUrl('planets.json'));
  private readonly objsRes = httpResource<Objective[]>(() => dataUrl('objectives.json'));
  private readonly iconsRes = httpResource<Record<string, IconEntry>>(() => dataUrl('icons.json'));
  private readonly labelsRes = httpResource<Record<string, StatLabel>>(() =>
    dataUrl('stat_labels.json'),
  );

  readonly components = computed(() => this.compsRes.value() ?? []);
  readonly planets = computed(() => this.planetsRes.value() ?? []);
  readonly objectives = computed(() => this.objsRes.value() ?? []);
  readonly icons = computed(() => this.iconsRes.value() ?? {});
  /**
   * prefab field -> the game's own name for it. Deliberately absent from
   * loading() and failed(): a stat table falls back to raw field names
   * without these, which is the wiki as it was, not a broken wiki.
   */
  readonly statLabels = computed(() => this.labelsRes.value() ?? {});

  readonly loading = computed(
    () =>
      this.compsRes.isLoading() ||
      this.planetsRes.isLoading() ||
      this.objsRes.isLoading() ||
      this.iconsRes.isLoading(),
  );

  /**
   * True once any of the four resources has settled into an error status —
   * e.g. data/*.json 404s because a static host serves the app without its
   * assets. Without
   * this the app silently renders as a fully-loaded, empty wiki: loading()
   * goes false, every lookup finds nothing, and every page reports "not
   * found" as if the id were wrong rather than the data missing.
   */
  readonly failed = computed(() =>
    [this.compsRes, this.planetsRes, this.objsRes, this.iconsRes].some(
      (r) => r.status() === 'error',
    ),
  );

  /**
   * True once all four resources have finished, successfully or not.
   *
   * `!loading()` happens to mean the same thing today, because httpResource
   * reports isLoading() from the moment it is constructed rather than from
   * when its request goes out. This asks the question directly instead of
   * resting on that: a resource that started reporting 'idle' first would
   * make `!loading()` briefly true before any data existed, and the app
   * initializer that gates the first render on this would sail straight
   * through. app.config.spec.ts pins the distinction.
   */
  readonly settled = computed(() =>
    [this.compsRes, this.planetsRes, this.objsRes, this.iconsRes].every((r) =>
      ['resolved', 'error', 'local'].includes(r.status()),
    ),
  );

  readonly componentById = computed(() => new Map(this.components().map((c) => [c.id, c])));
  readonly planetById = computed(() => new Map(this.planets().map((p) => [p.id, p])));
  readonly objectiveById = computed(() => new Map(this.objectives().map((o) => [o.id, o])));
  readonly objectiveByKey = computed(() => new Map(this.objectives().map((o) => [o.key, o])));
  readonly planetByFullId = computed(() => new Map(this.planets().map((p) => [p.full_id, p])));

  /** How many components are actually placeable in this build — a fact about the dataset, not the reader's progress. */
  readonly buildableCount = computed(() => this.components().filter((c) => c.in_build).length);

  /**
   * The planet an objective takes place on — a station resolves to its
   * parent, so "Basalt" owns the missions on Basalt and on everything
   * orbiting it rather than splitting them across a dozen station entries.
   *
   * One definition, used by the missions list's planet filter and by
   * WorldService.isDiscovered(); the two must not drift.
   */
  objectivePlanet(o: Objective): Planet | undefined {
    const at = this.planetByFullId().get(o.start);
    return at?.type === 'station' ? this.planetById().get(at.parent ?? '') : at;
  }

  /** component id -> the objectives that reward it, with amounts. */
  readonly rewardedBy = computed(() => {
    const m = new Map<string, { objective: Objective; amount: number }[]>();
    for (const o of this.objectives()) {
      for (const r of o.reward) {
        const list = m.get(r.component) ?? [];
        list.push({ objective: o, amount: r.amount });
        m.set(r.component, list);
      }
    }
    return m;
  });

  /** The first stats block of a component — the one carrying its real fields. */
  statsOf(c: Comp): Record<string, unknown> {
    return Object.values(c.stats)[0] ?? {};
  }

  iconUrl(id: string): string {
    const entry = this.icons()[id];
    return entry ? dataUrl(entry.file) : '';
  }

  /**
   * The same icon at both sizes, for an <img srcset>.
   *
   * The components grid draws 310 icons at 64 CSS px. One file cannot serve
   * that well: 64px is right for an ordinary monitor and soft on a retina
   * one, 128px is right for retina and twice the bytes everyone else needs.
   * A srcset lets the browser decide, and it is the only place on the site
   * with enough icons for the difference to be worth the second file.
   *
   * null rather than '' when the icon is unknown: an empty srcset attribute
   * is a thing browsers have to parse and discard, where an absent one is
   * simply the src.
   */
  iconSrcset(id: string): string | null {
    const entry = this.icons()[id];
    if (!entry?.file_1x) return null;
    return `${dataUrl(entry.file_1x)} 1x, ${dataUrl(entry.file)} 2x`;
  }

  /** The rendered globe image for a planet/star id — the asset-path convention lives here alone. */
  globeUrl(id: string): string {
    return dataUrl(`planets/${id}.webp`);
  }

  /**
   * The body's surface unwrapped, for the galaxy scene's spheres.
   *
   * A different image from globeUrl(), not a different size of it: that one is
   * a picture OF a globe (lit, round, transparent outside the disc), which is
   * exactly what must not be wrapped onto a sphere. Written by
   * tools/planet_render.py's render_equirect().
   */
  globeMapUrl(id: string): string {
    return dataUrl(`planets/maps/${id}.webp`);
  }

  /**
   * Display name for a planet/station reference — an objective's `start`,
   * `end`, or a location-type `dependencies` entry — resolved against the
   * referenced record's own `id` rather than string-munging the `full_id`.
   * '' for `Invalid`, empty, or a reference with no matching record.
   */
  locationName(fullId: string): string {
    if (!fullId || fullId === 'Invalid') return '';
    return this.planetByFullId().get(fullId)?.id ?? '';
  }

  /**
   * How a location reads to a player: the planet, with the station named in
   * parentheses when the reference is to one — "Moon (Moonstep)".
   *
   * Separate from locationName() rather than replacing it. That one answers
   * "what body is this", which is what gateOf() wants for its own
   * "Title (Location)" sentence; folding the station in there would nest a
   * second pair of brackets inside the first.
   */
  locationLabel(fullId: string): string {
    if (!fullId || fullId === 'Invalid') return '';
    const at = this.planetByFullId().get(fullId);
    if (!at) return '';
    if (at.type !== 'station') return at.id;
    const parent = at.parent ? this.planetById().get(at.parent) : undefined;
    return parent ? `${parent.id} (${at.id})` : at.id;
  }
}
