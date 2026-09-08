import { Component, computed, inject, input } from '@angular/core';
import { DataService } from '../../core/data.service';
import { Flat, statRows } from '../../core/stats';

@Component({
  selector: 'stat-table',
  template: `
    <table>
      @for (row of rows(); track row.field) {
        <tr [class.derived]="row.derived">
          <!-- Whitespace-significant, both of the next two: the dagger must
               sit tight against the label ("Mass fully welded†") and the unit
               carries its own single leading space ("12 P/s"). Reflowing them
               onto separate lines renders "Mass fully welded †" and "12  P/s",
               which is what stat-table.spec.ts pins. Hence prettier-ignore --
               which applies to the very next node, so nothing may come
               between it and the tag it protects. -->
          <!-- prettier-ignore -->
          <th [title]="row.field">{{ row.label }}@if (row.derived) { <span class="mark">†</span> }</th>
          <!-- prettier-ignore -->
          <td class="num">{{ row.value }}@if (row.suffix) { <span class="unit"> {{ row.suffix }}</span> }</td>
        </tr>
      }
    </table>
    @if (hasDerived()) {
      <p class="footnote">
        † Not an extracted value. The game's own description says a fully welded frame weighs twice
        as much.
      </p>
    }
  `,
  styles: [
    `
      @use 'styles/hud' as *;
      table {
        width: 100%;
        border-collapse: collapse;
      }
      tr {
        border-bottom: 1px solid var(--line);
      }
      tr:last-child {
        border-bottom: 0;
      }
      th {
        text-align: left;
        font-weight: 400;
        color: var(--text-dim);
        padding: 0.35rem 0;
      }
      .unit {
        color: var(--text-faint);
        font-size: 0.8em;
      }
      .mark {
        color: var(--text-faint);
        margin-left: 0.15rem;
      }
      tr.derived th,
      tr.derived td {
        font-style: italic;
      }
      .footnote {
        color: var(--text-faint);
        font-size: 0.72rem;
        margin: 0.6rem 0 0;
      }
      td {
        text-align: right;
        color: var(--accent);
        padding: 0.35rem 0;
      }
    `,
  ],
})
export class StatTable {
  private readonly data = inject(DataService);
  readonly stats = input.required<Flat>();

  /** Only the stats the game names — see statRows(). */
  readonly rows = computed(() => statRows(this.stats(), this.data.statLabels()));

  readonly hasDerived = computed(() => this.rows().some((r) => r.derived));
}
