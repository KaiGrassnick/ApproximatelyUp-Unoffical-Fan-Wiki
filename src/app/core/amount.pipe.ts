import { Pipe, PipeTransform } from '@angular/core';

/**
 * The game's own stand-in for "unlimited".
 *
 * Not a wiki invention and not a cap: the painters and the welder start with
 * exactly 1000000, and 20 reward entries hand out exactly 1000000 more. It is
 * the number the game uses to mean "you will never run out", and every one of
 * the 20 is a painter.
 */
export const UNLIMITED = 1000000;

/**
 * An item count, as a reader should see it.
 *
 * `>=` rather than `===` is load-bearing. component-detail sums a reward
 * across every part in a stock pool, so a mission handing out two painters
 * from one pool reports 2000000 — still unlimited, and still not a number
 * anyone is meant to read.
 */
export function amountLabel(n: number): string {
  return n >= UNLIMITED ? '∞' : String(n);
}

/** amountLabel() for the templates that show a reward or a requirement row. */
@Pipe({ name: 'amount' })
export class AmountPipe implements PipeTransform {
  transform(value: number): string {
    return amountLabel(value);
  }
}
