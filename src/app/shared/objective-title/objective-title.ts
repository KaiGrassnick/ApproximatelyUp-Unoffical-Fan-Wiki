import { Component, input } from '@angular/core';
import { RichtextPipe, IdentPipe } from '../../core/richtext.pipe';

/**
 * The one correct way to display an objective's name.
 *
 * A titled objective is prose and may carry markdown-ish emphasis, so it goes
 * through `richtext`. An untitled objective falls back to its raw `key` — an
 * internal identifier like "Package_Ashbelt_DamagedThruster" — which must go
 * through `ident` instead and never `richtext`: running an identifier through
 * the emphasis regex mangles "Package_Ashbelt_DamagedThruster" into
 * "Package<em>Ashbelt</em>DamagedThruster", a bug that reached live pages
 * twice in the old generator because every call site had to remember the
 * distinction by hand. Centralizing the `@if (title) {...} @else {...}`
 * block here means there is exactly one place left to get it wrong.
 */
@Component({
  selector: 'objective-title',
  imports: [RichtextPipe, IdentPipe],
  template: `
    @if (objective().title) {
      <span [innerHTML]="objective().title | richtext"></span>
    } @else {
      <span>{{ objective().key | ident }}</span>
    }
  `,
})
export class ObjectiveTitle {
  readonly objective = input.required<{ title: string; key: string }>();
}
