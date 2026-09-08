import { Injectable, computed, signal } from '@angular/core';

const KEY = 'approximately-up:reveal';

/**
 * The things the wiki hides, each revealable on its own.
 *
 * A guide also declares one of these, but as a note rather than a gate: it
 * says what the guide gives away, and its body is served either way. See
 * GuidesService.
 */
export type RevealKind = 'components' | 'planets' | 'stations' | 'missions';

// Same order the menu presents them in, so the two never look at odds; nothing
// here depends on it beyond that.
export const REVEAL_KINDS: RevealKind[] = ['components', 'planets', 'stations', 'missions'];

interface Stored {
  missions?: boolean;
  components?: boolean;
  planets?: boolean;
  stations?: boolean;
  acknowledged?: boolean;
  opened?: boolean;
}

/**
 * What the reader has asked the wiki to stop hiding.
 *
 * With no save loaded the wiki reasons from a NEW GAME (see WorldService), so
 * a first-time visitor sees three places and the starting parts. That is right
 * for someone mid-playthrough and wrong for someone who has finished the game
 * or never means to play it. These flags are the way out, and they are the
 * reader's own deliberate choice: the first one they turn on is held behind a
 * warning, because turning it on is the one action in the wiki that can spoil
 * a game for them.
 *
 * A flag reveals; it never reports. Nothing here changes what the status pills
 * or the progress bars say — those keep reading the save.
 */
@Injectable({ providedIn: 'root' })
export class SpoilerService {
  private readonly flags = {
    missions: signal(false),
    components: signal(false),
    planets: signal(false),
    stations: signal(false),
  } as const;

  readonly missions = this.flags.missions.asReadonly();
  readonly components = this.flags.components.asReadonly();
  readonly planets = this.flags.planets.asReadonly();
  readonly stations = this.flags.stations.asReadonly();

  private readonly _seen = signal(false);
  private readonly _acknowledged = signal(false);
  /** Whether the spoiler warning has been shown and accepted, ever. */
  readonly acknowledged = this._acknowledged.asReadonly();

  /**
   * Whether the reader has ever opened this menu.
   *
   * Not the same as having revealed anything: opening it and closing it again
   * is still an answer, and the wiki should stop pointing at the control once
   * it has been given one. `any()` counts too, so a reader who revealed
   * something before this flag existed is not nagged about a control they
   * have plainly already found.
   */
  readonly seen = computed(() => this._seen() || this.any());

  /** Called when the menu is opened. Idempotent, and persisted. */
  markSeen(): void {
    if (this._seen()) return;
    this._seen.set(true);
    this.persist();
  }

  /** All of them at once — what the "reveal everything" switch reads and writes. */
  readonly all = computed(() => REVEAL_KINDS.every((k) => this.flags[k]()));

  /** Whether anything at all is revealed, for the button's own state. */
  readonly any = computed(() => REVEAL_KINDS.some((k) => this.flags[k]()));

  constructor() {
    const stored = this.restore();
    for (const k of REVEAL_KINDS) this.flags[k].set(!!stored[k]);
    this._acknowledged.set(!!stored.acknowledged);
    this._seen.set(!!stored.opened);
  }

  is(kind: RevealKind): boolean {
    return this.flags[kind]();
  }

  set(kind: RevealKind, on: boolean): void {
    this.flags[kind].set(on);
    this.persist();
  }

  setAll(on: boolean): void {
    for (const k of REVEAL_KINDS) this.flags[k].set(on);
    this.persist();
  }

  /** Record that the reader has seen the warning and chosen to go on. */
  ack(): void {
    this._acknowledged.set(true);
    this.persist();
  }

  private persist(): void {
    const out: Stored = { acknowledged: this._acknowledged(), opened: this._seen() };
    for (const k of REVEAL_KINDS) out[k] = this.flags[k]();
    try {
      localStorage.setItem(KEY, JSON.stringify(out));
    } catch {
      // Private browsing or a full quota — the choice still holds this session.
    }
  }

  private restore(): Stored {
    try {
      const raw = localStorage.getItem(KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object' ? (parsed as Stored) : {};
    } catch {
      return {};
    }
  }
}
