import { Component, computed, inject, signal, viewChild, ElementRef } from '@angular/core';
import { WorldService } from '../../core/world.service';
import { SpoilerService } from '../../core/spoiler.service';

/** Where the "don't show this again" choice is kept. */
export const HELP_OFF_KEY = 'approximately-up:world-help-off';

/**
 * Where the game keeps its worlds, on the machine it is installed on.
 *
 * Written with %USERPROFILE% rather than a literal C:\Users\<name> so it can
 * be pasted into Explorer's address bar as it stands.
 */
export const WORLDS_PATH =
  '%USERPROFILE%\\AppData\\LocalLow\\ApproximatelyGames\\ApproximatelyUp\\Worlds';

/**
 * The largest thing worth reading as a save.
 *
 * The seven worlds on the machine this was written against run 890 bytes to
 * 3.7 KB, so a megabyte is generous by two and a half orders of magnitude —
 * the point is to refuse a video before slurping it into a string, not to
 * police the format.
 */
export const MAX_SAVE_BYTES = 1024 * 1024;

@Component({
  selector: 'world-drop',
  // Dismissal is watched on the document rather than on the panel: the panel
  // does not take focus when it opens, so a key bound to it only fires once
  // the reader has tabbed in, and a click that closes it is by definition one
  // that never reaches it.
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'helping.set(false)',
  },
  template: `
    @if (world.hasWorld()) {
      <span class="loaded">
        <span class="lbl">world</span>
        <strong>{{ world.name() }}</strong>
        <button type="button" (click)="world.clear()">clear</button>
      </span>
    } @else {
      <!-- A button, not a <label> wrapping the input: the click has to reach
           the help panel first, and only then the OS dialog. Dropping a file
           still bypasses all of it. -->
      <button
        class="drop"
        [class.hint]="hint()"
        type="button"
        (click)="onZoneClick()"
        (dragover)="$event.preventDefault()"
        (drop)="onDrop($event)"
      >
        <span class="prompt">Drop a <code>.world</code> save for progress</span>
        <span class="privacy">Read locally in your browser — never uploaded</span>
      </button>
      <input
        #file
        class="file-input"
        type="file"
        accept=".world"
        (change)="onPick($event)"
        aria-label="Upload a .world save — read locally in your browser, never sent anywhere"
      />

      @if (helping()) {
        <div class="help" role="dialog" aria-label="Where to find your world saves">
          <div class="head">
            <span class="lbl">Where are my saves?</span>
            <button class="close" type="button" aria-label="Close" (click)="helping.set(false)">
              ×
            </button>
          </div>
          <p>Paste this into Explorer's address bar:</p>
          <div class="path">
            <code>{{ path }}</code>
            <button class="copy" type="button" (click)="copy()">
              {{ copied() ? 'copied' : 'copy' }}
            </button>
          </div>
          <p>
            Then pick the <code>.world</code> file for the world you play. Each world is one file;
            the name inside it is what the wiki shows.
          </p>
          <div class="actions">
            <button class="choose" type="button" (click)="choose()">Choose file…</button>
            <label class="again">
              <input
                type="checkbox"
                [checked]="helpOff()"
                (change)="setHelpOff($any($event.target).checked)"
              />
              don't show this again
            </label>
          </div>
        </div>
      }
    }
    @if (error()) {
      <span class="err">{{ error() }}</span>
    }
  `,
  styles: [
    `
      @use 'styles/hud' as *;
      :host {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        position: relative;
      }
      .drop {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        text-align: left;
        background: none;
        font: inherit;
        border: 1px dashed var(--line);
        padding: 0.35rem 0.7rem;
        cursor: pointer;
        &:hover {
          border-color: var(--line-hi);
          .prompt {
            color: var(--accent);
          }
        }
        &:focus-visible {
          border-color: var(--accent);
          outline: none;
        }
        // The border is dashed here, so the pulse rides on the ring rather
        // than only on the border colour.
        &.hint {
          @include attention;
        }
      }
      .prompt {
        @include label;
        color: var(--text-faint);
      }
      .privacy {
        // No opacity here: --text-faint is already the dimmest text token, and
        // dimming it again took this line to 2.7:1. The token now carries the
        // whole of the de-emphasis, which is the only way it can be checked.
        color: var(--text-faint);
        font-size: 0.65rem;
      }
      .file-input {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
      // Hangs under the drop zone rather than covering the page: the reader is
      // being told where a file is, not being interrupted.
      //
      // The z-index is only worth anything inside the header's own stacking
      // context; what actually keeps this panel above the spoilers button it
      // hangs into is the header's z-index -- see app.scss.
      .help {
        @include panel;
        position: absolute;
        top: calc(100% + 0.4rem);
        right: 0;
        z-index: 20;
        width: min(30rem, 90vw);
        padding: 0.8rem;
        text-align: left;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        p {
          margin: 0;
          font-size: 0.8rem;
          color: var(--text-dim);
          line-height: 1.5;
        }
        code {
          color: var(--text);
        }
      }
      .help .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .help .head .lbl {
        @include label;
        color: var(--accent);
      }
      .help .close {
        background: none;
        border: 0;
        color: var(--text-faint);
        cursor: pointer;
        font-size: 1rem;
        line-height: 1;
        padding: 0 0.2rem;
        &:hover {
          color: var(--text);
        }
      }
      .help .path {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        background: var(--panel);
        border: 1px solid var(--line);
        padding: 0.4rem 0.5rem;
        code {
          font-size: 0.72rem;
          word-break: break-all;
        }
      }
      .help .copy,
      .help .choose {
        @include label;
        background: none;
        border: 1px solid var(--line);
        color: var(--text-dim);
        cursor: pointer;
        padding: 0.25rem 0.5rem;
        white-space: nowrap;
        &:hover {
          border-color: var(--line-hi);
          color: var(--accent);
        }
      }
      .help .choose {
        border-color: var(--line-hi);
        color: var(--accent);
      }
      .help .actions {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }
      .help .again {
        @include label;
        display: flex;
        align-items: center;
        gap: 0.35rem;
        color: var(--text-faint);
        cursor: pointer;
        margin-left: auto;
      }
      .loaded {
        display: flex;
        align-items: center;
        gap: 0.6rem;
      }
      .loaded .lbl {
        @include label;
      }
      .loaded strong {
        font-family: var(--font-head);
        color: var(--accent);
      }
      .loaded button {
        @include label;
        background: none;
        border: 1px solid var(--line);
        color: var(--text-faint);
        cursor: pointer;
        padding: 0.15rem 0.4rem;
      }
      .err {
        color: var(--warn);
        font-size: 0.8rem;
      }
    `,
  ],
})
export class WorldDrop {
  readonly world = inject(WorldService);
  private readonly reveal = inject(SpoilerService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /**
   * Whether to point the reader at the drop zone. Same condition as the
   * spoilers button's own hint, and for the same reason: these are the two
   * ways out of the wiki's default reticence, and using either answers the
   * question that both are asking.
   */
  readonly hint = computed(() => !this.world.hasWorld() && !this.reveal.seen());
  readonly error = signal('');
  readonly path = WORLDS_PATH;

  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('file');

  /** Whether the help panel is open right now. */
  readonly helping = signal(false);
  readonly copied = signal(false);
  /** Whether the reader has asked never to see it again. */
  readonly helpOff = signal(this.restoreHelpOff());

  /**
   * Closes the panel for a click that lands anywhere else on the page. The
   * click that opened it started inside the host and is skipped here, so the
   * panel does not open and shut on one press.
   */
  onDocumentClick(e: MouseEvent): void {
    if (!this.helping()) return;
    const target = e.target as Node | null;
    if (target && this.host.nativeElement.contains(target)) return;
    this.helping.set(false);
  }

  /**
   * First click asks "do you know where the file is?" by showing the panel;
   * a reader who has said they do gets the OS dialog straight away, which is
   * what the zone did before the panel existed.
   *
   * Pressing the zone again closes the panel. The click-away handler cannot
   * do it -- the zone is inside the host, so its clicks are the ones that
   * handler has to ignore -- and a control that opens something is expected
   * to shut it again.
   */
  onZoneClick(): void {
    if (this.helpOff()) this.choose();
    else this.helping.update((open) => !open);
  }

  choose(): void {
    this.fileInput()?.nativeElement.click();
  }

  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(WORLDS_PATH);
      this.copied.set(true);
    } catch {
      // No clipboard permission, or an insecure context. The path is on
      // screen either way, which is the thing that matters.
    }
  }

  setHelpOff(off: boolean): void {
    this.helpOff.set(off);
    try {
      if (off) localStorage.setItem(HELP_OFF_KEY, '1');
      else localStorage.removeItem(HELP_OFF_KEY);
    } catch {
      // Private browsing or a full quota — it holds for this page view.
    }
  }

  onPick(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) void this.read(file);
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    // Dragging the file in proves the reader already found it.
    if (file) {
      this.helping.set(false);
      void this.read(file);
    }
  }

  /**
   * Both checks that can be made without reading the file, then the parse.
   *
   * The name check is here rather than left to the input's `accept`, which
   * only filters what the OS dialog offers: a drag-and-drop never consults
   * it, and the dialog itself will hand over anything once the reader picks
   * "All files".
   */
  private async read(file: File): Promise<void> {
    this.error.set('');
    if (!file.name.toLowerCase().endsWith('.world')) {
      this.error.set('That is not a .world save — look for a .world file in the Worlds folder.');
      return;
    }
    if (file.size > MAX_SAVE_BYTES) {
      this.error.set('That file is too large to be a .world save.');
      return;
    }
    try {
      await this.world.load(file);
      this.helping.set(false);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'That file could not be read.');
    }
  }

  private restoreHelpOff(): boolean {
    try {
      return localStorage.getItem(HELP_OFF_KEY) === '1';
    } catch {
      return false;
    }
  }
}
