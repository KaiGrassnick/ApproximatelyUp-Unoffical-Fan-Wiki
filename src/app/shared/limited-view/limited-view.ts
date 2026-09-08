import { Component, computed, inject } from '@angular/core';
import { SpoilerService } from '../../core/spoiler.service';
import { WorldService } from '../../core/world.service';

/**
 * Says out loud what the wiki is currently showing, and why it is so little.
 *
 * The default view is a new game, which is the right default and a confusing
 * one: a reader who does not know that reads a thin wiki as a bad wiki rather
 * than as a careful one. The two floating controls pulse to be noticed, but a
 * pulse cannot explain itself — this is the sentence that does.
 *
 * It goes away on the first real result, not on the first interaction: a save
 * loaded, or a switch actually turned on. Opening the spoiler menu and closing
 * it again quiets the pulses (see SpoilerService.seen), because the reader has
 * been shown the control — but the view is still limited, and a banner that
 * described the view would be lying if it left at that point.
 */
@Component({
  selector: 'limited-view',
  template: `
    @if (show()) {
      <aside class="notice" role="note">
        <div class="what">
          <p class="head">You are seeing a new game</p>
          <p>
            This wiki hides what the game has not shown you yet — the parts you start with, the
            places you start in, and nothing further. There is a great deal more in it.
          </p>
        </div>
        <ul class="how">
          <li>
            <span class="where">In the header</span>
            Drop in a <code>.world</code> save and the wiki opens up as far as you have played. Read
            in your browser, never uploaded.
          </li>
          <li>
            <span class="where">Top right</span>
            Or open <strong>Spoilers</strong> and reveal it all, if the game holds no surprises for
            you.
          </li>
        </ul>
      </aside>
    }
  `,
  styles: [
    `
      @use 'styles/hud' as *;

      :host {
        display: block;
        max-width: 1200px;
        margin: 0 auto;
        padding: 1.5rem 1.5rem 0;
      }

      .notice {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem 2rem;
        justify-content: space-between;
        padding: 0.9rem 1.1rem;
        border: 1px solid rgba(255, 180, 84, 0.4);
        border-radius: var(--radius);
        background: rgba(255, 180, 84, 0.07);
        color: var(--text-dim);
        font-size: 0.85rem;
        line-height: 1.55;
        @include attention;
      }

      .what {
        flex: 1 1 22rem;
      }

      .head {
        @include label;
        color: var(--warn);
        font-size: 0.72rem;
        margin: 0 0 0.3rem;
      }

      .what p:last-child {
        margin: 0;
      }

      /* The two ways out, against the side of the page the controls are on. */
      .how {
        flex: 0 1 26rem;
        list-style: none;
        margin: 0;
        padding: 0;
        font-size: 0.8rem;
      }

      .how li + li {
        margin-top: 0.5rem;
      }

      .where {
        @include label;
        display: block;
        font-size: 0.62rem;
        color: var(--warn);
      }

      strong {
        color: var(--text);
      }

      code {
        font-family: var(--font-mono);
        font-size: 0.85em;
        background: rgba(255, 180, 84, 0.12);
        padding: 0 0.3em;
        border-radius: var(--radius);
      }
    `,
  ],
})
export class LimitedView {
  private readonly world = inject(WorldService);
  private readonly reveal = inject(SpoilerService);

  readonly show = computed(() => !this.world.hasWorld() && !this.reveal.any());
}
