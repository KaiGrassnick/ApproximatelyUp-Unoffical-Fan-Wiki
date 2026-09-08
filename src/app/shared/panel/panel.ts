import { Component, input } from '@angular/core';

@Component({
  selector: 'hud-panel',
  template: `
    @if (title()) {
      <h2 class="ttl">{{ title() }}</h2>
    }
    <div class="body"><ng-content /></div>
  `,
  styles: [
    `
      @use 'styles/hud' as *;
      :host {
        @include panel;
        display: block;
        padding: 1.1rem 1.25rem;
      }
      .ttl {
        @include label;
        margin: 0 0 0.75rem;
      }
      .body {
        display: block;
      }
    `,
  ],
})
export class Panel {
  readonly title = input<string>('');
}
