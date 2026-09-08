import { Pipe, PipeTransform } from '@angular/core';
import { richtext } from './text';

/**
 * Two pipes, because the source strings are two different kinds of thing and
 * the difference is not visible at the call site.
 *
 * `richtext` is for prose — titles, objectives, descriptions — which may
 * legitimately carry "**bold**", "_em_" or a real newline. It is bound
 * through `[innerHTML]`, so it escapes the source text itself before adding
 * any markup.
 *
 * `ident` is for internal keys such as "Package_Ashbelt_DamagedThruster",
 * which five untitled objectives fall back to. Running those through the
 * emphasis regex mangles them into "Package<em>Ashbelt</em>DamagedThruster" —
 * a bug that reached live pages twice in the old generator because every call
 * site had to remember the distinction. Here the type of the string picks the
 * pipe, so it cannot be forgotten. `ident` is bound through `{{ }}`
 * interpolation, which Angular already escapes, so it must not escape again.
 */
@Pipe({ name: 'richtext' })
export class RichtextPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return value ? richtext(value) : '';
  }
}

@Pipe({ name: 'ident' })
export class IdentPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return value ? value.replace(/_/g, ' ') : '';
  }
}
