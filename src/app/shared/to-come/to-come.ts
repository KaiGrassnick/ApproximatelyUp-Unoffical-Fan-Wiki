import { Component, input } from '@angular/core';

/**
 * "N missions are yet to come" — the wiki's one way of saying that a list is
 * short because of where the reader has got to, not because that is all there
 * is.
 *
 * Shared so the three pages that hold things back say it the same way and
 * look the same doing it. Dashed rather than panelled, so it reads as the
 * outline of something absent rather than as another row you can open.
 */
@Component({
  selector: 'to-come',
  template: `
    @if (count()) {
      <p class="to-come">
        <span class="num">{{ count() }}</span>
        {{ count() === 1 ? noun() : noun() + 's' }}
        {{ count() === 1 ? 'is' : 'are' }} yet to come, {{ reason() }}.
      </p>
    }
  `,
  styles: [
    `
      @use 'styles/hud' as *;
      .to-come {
        @include label;
        display: block;
        margin: 1rem 0 0;
        border: 1px dashed var(--line);
        border-radius: var(--radius);
        padding: 0.8rem 1rem;
        color: var(--text-faint);
        font-size: 0.68rem;
        .num {
          color: var(--accent);
          font-size: 0.9rem;
          margin-right: 0.35rem;
        }
      }
    `,
  ],
})
export class ToCome {
  readonly count = input.required<number>();
  readonly noun = input('mission');
  /** Why they are not here yet; the page knows better than this component. */
  readonly reason = input('somewhere you have not been, or behind work you have not finished');
}
