import { Component, ElementRef, HostListener, computed, inject, signal } from '@angular/core';
import { REVEAL_KINDS, RevealKind, SpoilerService } from '../../core/spoiler.service';
import { WorldService } from '../../core/world.service';

/** A switch in the panel: what it is called, and what it turns on. */
interface Row {
  kind: RevealKind | 'all';
  label: string;
}

/**
 * The switches, in the order the wiki's own sections run: what you build,
 * where you go, and what you are asked to do there.
 *
 * Guides are not here. They are prose rather than a generated list, they are
 * always served in full, and each one says in the list what it gives away —
 * which is the warning a switch would have been standing in for.
 */
const ROWS: Row[] = [
  { kind: 'components', label: 'Show all components' },
  { kind: 'planets', label: 'Show all planets' },
  { kind: 'stations', label: 'Show all stations' },
  { kind: 'missions', label: 'Show all missions' },
  { kind: 'all', label: 'Show everything' },
];

/**
 * The way out of the wiki's default reticence.
 *
 * The wiki reasons from a new game until the reader loads a save, which keeps
 * it from spoiling a game nobody asked it to spoil — and leaves someone who
 * has finished the game, or who is not playing at all, looking at three
 * planets. This is how they say so.
 *
 * Turning the first switch on does not turn it on. The panel asks first, once
 * ever, because this is the one control on the site whose whole effect is to
 * tell the reader things the game has not yet.
 */
@Component({
  selector: 'reveal-menu',
  templateUrl: './reveal-menu.html',
  styleUrl: './reveal-menu.scss',
})
export class RevealMenu {
  readonly reveal = inject(SpoilerService);
  private readonly world = inject(WorldService);
  private readonly host = inject(ElementRef<HTMLElement>);

  /**
   * Whether to point the reader at this control.
   *
   * A first-time visitor is looking at a deliberately thin wiki and has two
   * ways to open it up — a save, or these switches. Either one answers the
   * question, so doing either stops both hints: the reader who loaded a save
   * has found the better route and does not need to be sold this one.
   */
  readonly hint = computed(() => !this.world.hasWorld() && !this.reveal.seen());

  readonly rows = ROWS;
  readonly open = signal(false);

  /**
   * The switch waiting on the warning, if any. Held rather than applied so
   * that "Cancel" leaves the panel exactly as the reader found it.
   */
  readonly pending = signal<Row | null>(null);

  /** How many are on — the count on the button. */
  readonly onCount = computed(() => REVEAL_KINDS.filter((k) => this.reveal.is(k)).length);

  isOn(row: Row): boolean {
    return row.kind === 'all' ? this.reveal.all() : this.reveal.is(row.kind);
  }

  toggle(): void {
    this.reveal.markSeen();
    this.open.update((v) => !v);
    if (!this.open()) this.pending.set(null);
  }

  /**
   * Turning a switch on for the first time only asks. Turning one OFF never
   * does: nothing is revealed by hiding things again, and a reader who wants
   * the spoilers gone should not have to agree to anything to get there.
   */
  onToggle(row: Row): void {
    if (this.isOn(row)) {
      this.apply(row, false);
      return;
    }
    if (!this.reveal.acknowledged()) {
      this.pending.set(row);
      return;
    }
    this.apply(row, true);
  }

  confirm(): void {
    const row = this.pending();
    if (!row) return;
    this.reveal.ack();
    this.pending.set(null);
    this.apply(row, true);
  }

  cancel(): void {
    this.pending.set(null);
  }

  private apply(row: Row, on: boolean): void {
    if (row.kind === 'all') this.reveal.setAll(on);
    else this.reveal.set(row.kind, on);
  }

  @HostListener('document:pointerdown', ['$event'])
  onOutside(e: Event): void {
    if (this.open() && !this.host.nativeElement.contains(e.target as Node)) {
      this.open.set(false);
      this.pending.set(null);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.pending.set(null);
  }
}
