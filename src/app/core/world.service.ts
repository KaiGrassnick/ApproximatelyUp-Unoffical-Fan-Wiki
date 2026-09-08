import { Injectable, computed, inject, signal } from '@angular/core';
import { Objective, Planet, World } from './models';
import { computeAvailability } from './availability';
import { DataService } from './data.service';
import { SpoilerService } from './spoiler.service';

const KEY = 'approximately-up:world';

/**
 * Bodies whose visited state the wiki does not report.
 *
 * One, and only the Sun: it is in `_universeLocations` from the moment a
 * world is created, before the world has ever been loaded, so a "visited"
 * badge on it is one every reader has always had and tells them nothing.
 * The other 16 bodies are earned and are reported.
 *
 * The black hole was here too, on the reasoning that its id had never been
 * seen in a save. The game's own data does not support that: `BlackHole` is
 * ObjectID 999, a first-class entry sitting with the bodies, and
 * CheckUniverseLocationsJob records a location when the player comes within
 * its discover range — there is nothing that would single it out. It was
 * missing from every save to hand because no save to hand had been there.
 * The game draws an undiscovered black hole as an anonymous blip on its own
 * galaxy map, and now so does the wiki.
 */
const UNTRACKED = new Set(['Sun']);

/**
 * The tutorial station, and the station that replaces it.
 *
 * A save begins at PlanetStation_Earth_Tutorial and moves to Headquarters;
 * after that the game never sends the reader back, and no objective so much
 * as mentions the tutorial one. Listing it from then on is listing a place
 * that no longer exists for that player.
 */
const TUTORIAL = 'PlanetStation_Earth_Tutorial';
const HEADQUARTERS = 'PlanetStation_Earth_Headquarters';

/**
 * Where a save begins.
 *
 * Read off a freshly created save rather than guessed: no completed
 * objectives, and exactly three visited locations. Everything else in the
 * game is ahead of the player.
 */
const NEW_GAME_PLACES = ['Star_Sun', 'Planet_Earth', TUTORIAL];

/** Validate and narrow the parsed JSON of a .world file. */
export function parseWorld(raw: string): World {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('That file could not be read as JSON.');
  }
  const w = parsed as Partial<World>;
  const keys = w?._objectives?.m_Keys;
  const values = w?._objectives?.m_Values;
  const locKeys = w?._universeLocations?.m_Keys;

  // The ids have to be NUMBERS, not merely present. A file carrying string
  // ids passed every structural check, then matched no objective and no
  // location, and the wiki read as a brand new game — which looks like it
  // lost the reader's progress rather than like it refused their file.
  //
  // Only the types are checked, never the values: a save from a newer game
  // build can carry ids this build's data/ has never heard of, and refusing
  // it would be worse than resolving what we can.
  const numeric = (a: unknown[]) => a.every((n) => typeof n === 'number');
  const objective = (v: unknown) =>
    v !== null &&
    typeof v === 'object' &&
    ['number', 'undefined'].includes(typeof (v as { _completed?: unknown })._completed);

  if (
    !Array.isArray(keys) ||
    !Array.isArray(values) ||
    !Array.isArray(locKeys) ||
    keys.length !== values.length ||
    !numeric(keys) ||
    !numeric(locKeys) ||
    !values.every(objective)
  ) {
    throw new Error('That file is not a .world save.');
  }
  return {
    _name: w._name ?? 'unnamed world',
    _objectives: { m_Keys: keys, m_Values: values as { _completed: number }[] },
    _universeLocations: { m_Keys: locKeys },
  };
}

/**
 * Progress state, supplied by the reader rather than baked into the build.
 *
 * The save is read in the browser and kept in localStorage; nothing is
 * uploaded anywhere.
 *
 * With no world loaded the wiki reasons from a NEW GAME rather than from
 * omniscience: the parts you start with, the places you start in, and nothing
 * else. Opening the wiki should not spoil a game nobody asked it to spoil.
 * `hasWorld()` stays false throughout — it means "the reader gave us a save",
 * and the progress bars and pills that ask it are right to stay hidden.
 */
@Injectable({ providedIn: 'root' })
export class WorldService {
  private readonly data = inject(DataService);
  private readonly reveal = inject(SpoilerService);
  private readonly _world = signal<World | null>(this.restore());

  readonly world = this._world.asReadonly();
  readonly hasWorld = computed(() => this._world() !== null);
  readonly name = computed(() => this._world()?._name ?? '');

  /**
   * The save the wiki reasons from when the reader has not supplied one.
   *
   * Showing everything by default made the whole wiki a spoiler for anyone
   * who opened it before finishing the game — every planet named, every
   * mission listed, the far side of the wormhole on the map. It now starts
   * where the game starts and opens up as the reader's own save does.
   */
  private readonly newGame = computed<World>(() => ({
    _name: '',
    _objectives: { m_Keys: [], m_Values: [] },
    _universeLocations: {
      m_Keys: NEW_GAME_PLACES.map((full) => this.data.planetByFullId().get(full)?.object_id).filter(
        (id): id is number => id !== undefined,
      ),
    },
  }));

  readonly availability = computed(() =>
    computeAvailability(
      this.data.components(),
      this.data.objectives(),
      this._world() ?? this.newGame(),
    ),
  );

  readonly haveCount = computed(() => this.availability().have.size);

  async load(file: File): Promise<void> {
    this._world.set(parseWorld(await file.text()));
    try {
      localStorage.setItem(KEY, JSON.stringify(this._world()));
    } catch {
      // Private browsing or a full quota — the world still works this session.
    }
  }

  clear(): void {
    this._world.set(null);
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* nothing to undo */
    }
  }

  /**
   * Whether a component can be placed. Answered from the reader's save, or
   * from a new game when they have not supplied one — never "unknown": the
   * wiki always knows, it is only ever a question of whose progress it is
   * reasoning from.
   */
  stateOf(id: string): 'have' | 'locked' {
    return this.availability().have.has(id) ? 'have' : 'locked';
  }

  /**
   * Whether a component is worth listing at all.
   *
   * Placeability and listing came apart when the reveal toggles arrived: a
   * reader who has asked to see every component still wants the locked ones
   * to say `locked` and to name the objective that unlocks them, so the
   * reveal is read here and never in stateOf() or gateOf().
   */
  isListed(id: string): boolean {
    return this.reveal.components() || this.stateOf(id) === 'have';
  }

  /**
   * How much stock the save has been GIVEN for a component, per pool.
   *
   * Not how much is left: a .world file records objectives and visited
   * locations and nothing else, so what a player has already welded onto a
   * ship is unknowable here. The figure is the starting `_availableAmount`
   * plus every completed objective's reward.
   *
   * One entry per pool the part spends — two for a window, which is a frame
   * and a pane both. `pool` is null when the part is its own pool, so a
   * caller can print the bare number instead of repeating the part's name.
   * Pools with nothing in them are left out entirely.
   */
  stockOf(id: string): { pool: string | null; amount: number }[] {
    const av = this.availability();
    return (av.pools.get(id) ?? [])
      .map((p) => ({ pool: av.group.get(id) ? p : null, amount: av.stock.get(p) ?? 0 }))
      .filter((e) => e.amount > 0);
  }

  /**
   * Display string for a locked component's unlock hint. Formats from
   * `availability().gateInfo` (not the fixture-pinned `gate` string, which
   * carries the objective's raw `start` id) so the location resolves through
   * `DataService.locationName()` the same way every other place-name is
   * shown, instead of leaking an internal id like
   * "PlanetStation_Basalt_B02".
   */
  gateOf(id: string): string {
    const info = this.availability().gateInfo.get(id);
    if (!info) return '';
    const loc = this.data.locationName(info.start);
    return loc ? `${info.title} (${loc})` : info.title;
  }

  /**
   * Whether the save has this objective done.
   *
   * `_completed` is an integer, not a boolean — 1 and 2 both appear in real
   * saves — so any non-zero value counts, matching computeAvailability() and
   * the Python it is a port of. An objective absent from the save has never
   * been started, which is also not done.
   */
  isCompleted(objectiveId: number): boolean {
    return !!this.availability().done.get(objectiveId);
  }

  /**
   * Whether a mission exists yet, as far as the reader's save is concerned.
   *
   * Two gates, and the game's own:
   *
   *   - the place, and precisely the place. `_start` names a station as often
   *     as a planet, and the game hands a mission over at that station: 27 of
   *     the 34 story missions start at one. Resolving to the parent planet
   *     instead made every Headquarters mission appear the moment Earth was
   *     known — "Drop The Depth Diver" offered to a save still sitting in the
   *     tutorial. A save records stations separately, so this asks about the
   *     station itself, and only falls back to the planet when the objective
   *     starts on the planet.
   *   - the prerequisites. `ObjectiveSetup._dependencies` is the game's only
   *     serialized unlock condition (its `IsUnlocked()` reads it), and each
   *     entry is an ObjectID naming either another objective — done it? — or
   *     a location — been there? "Wind Test" starts at Headquarters on Earth,
   *     which a new save has, but waits on the Aundara plasma package, so it
   *     is not a mission that player has yet.
   *
   * ...and one flag. `ObjectiveSetup._hidden` marks four objectives — the
   * Earth drumkit and Helirion's three lost packages, all of them with no
   * title — as things the game does not put in the objectives log at all.
   * They are found by stumbling over them, so the wiki does not list them
   * either until the save says the reader has one.
   *
   * A mission the save has already completed is visible whatever else is
   * true: the reader plainly knows about it. An objective, or a dependency,
   * that resolves to nothing counts as satisfied — nothing should disappear
   * because the wiki failed to look it up.
   */
  isDiscovered(o: Objective): boolean {
    if (this.reveal.missions()) return true;
    if (this.isCompleted(o.id)) return true;
    if (o.hidden) return false;
    const at = this.data.planetByFullId().get(o.start);
    if (at && !this.isVisited(at.object_id)) return false;
    return o.dependencies.every((dep) => this.isMet(dep));
  }

  /** One `_dependencies` entry: another objective done, or a place visited. */
  private isMet(dep: string): boolean {
    const objective = this.data.objectiveByKey().get(dep);
    if (objective) return this.isCompleted(objective.id);
    const place = this.data.planetByFullId().get(dep);
    return !place || this.isVisited(place.object_id);
  }

  /**
   * Whether a body may be named at all — the one question every page that
   * lists places asks.
   *
   * Three ways to answer yes: the reader has asked for planets (or for
   * stations — a station is its own toggle, since a reader may want the map
   * without the orbital furniture), the body's visited state is not tracked
   * anyway (see UNTRACKED), or the save says they have been there.
   */
  isKnown(p: Planet): boolean {
    if (p.type === 'station' ? this.reveal.stations() : this.reveal.planets()) return true;
    return !this.tracksVisit(p.id) || this.isVisited(p.object_id);
  }

  /**
   * Whether a body has been left behind and should no longer be listed.
   *
   * Only the tutorial station, and only once the save has reached
   * Headquarters — see TUTORIAL. A new game has not, so the default view
   * keeps it: that is where the reader would be standing.
   */
  isSuperseded(id: string): boolean {
    // Matched through the record rather than against the literal "Tutorial":
    // the short id is a display name, the full id is the game's own key.
    const tutorial = this.data.planetByFullId().get(TUTORIAL);
    if (!tutorial || tutorial.id !== id) return false;
    const hq = this.data.planetByFullId().get(HEADQUARTERS);
    return !!hq && this.isVisited(hq.object_id);
  }

  /** Whether a body's visited state is reported at all — see UNTRACKED. */
  tracksVisit(id: string): boolean {
    return !UNTRACKED.has(id);
  }

  isVisited(objectId: number): boolean {
    return this.availability().visited.has(objectId);
  }

  private restore(): World | null {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? parseWorld(raw) : null;
    } catch {
      return null;
    }
  }
}
