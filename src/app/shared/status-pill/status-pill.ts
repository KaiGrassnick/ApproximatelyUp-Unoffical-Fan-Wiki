import { Component, input } from '@angular/core';

@Component({
  selector: 'status-pill',
  template: `<span class="pill" [class]="state()">{{ text() }}</span>`,
  styles: [
    `
      @use 'styles/hud' as *;
      .pill {
        @include label;
        display: inline-block;
        padding: 0.15rem 0.45rem;
        border: 1px solid var(--line);
        border-radius: var(--radius);
        font-size: 0.6rem;
      }
      .have {
        color: var(--ok);
        border-color: rgba(61, 220, 151, 0.35);
      }
      .locked {
        color: var(--locked);
        border-color: rgba(107, 122, 145, 0.3);
      }
      .unknown {
        display: none;
      }
    `,
  ],
})
export class StatusPill {
  readonly state = input.required<'have' | 'locked' | 'unknown'>();
  readonly text = input<string>('');
}
