import { KeyValuePipe } from '@angular/common';
import { Component, HostListener, computed, effect, inject, input, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { CircuitsService } from '../../core/circuits.service';
// A type-only import: build.ts pulls in the layout, router and renderer, and
// none of that belongs in the browser bundle. `import type` is erased by the
// compiler outright, rather than relying on a bundler to notice it is unused.
import type { BuiltCircuit } from '../../core/circuits/build';
import { CELL_M } from '../../core/circuits/model';
import { shortfalls } from '../../core/circuits/stock';
import { DataService } from '../../core/data.service';
import { dataUrl } from '../../core/data-url';
import { issueUrl } from '../../core/issue-url';
import { SeoService } from '../../core/seo.service';
import { WorldService } from '../../core/world.service';
import { StatusPill } from '../../shared/status-pill/status-pill';
import { Circuit3d } from './circuit-3d';

/** The per-circuit file, as gen-circuits.ts writes it. */
type CircuitDetail = Omit<BuiltCircuit, 'svg'> & { id: string; notesHtml: string };

/**
 * The circuits section: the list on the left, one circuit on the right.
 *
 * Shaped like the guides page, and for the same reason: one component for
 * /circuits and /circuits/:id, one fetch of the index. The picture is an
 * <img> of a build-time SVG rather than anything drawn here, so it shows
 * with JavaScript off and in the prerendered HTML a crawler reads.
 *
 * The one thing computed in the browser is the third verdict. The build
 * knows what a new game holds and what the whole game hands out; only the
 * reader knows what their save has, and WorldService.availability() carries
 * that as the same pool -> units map the build used.
 */
@Component({
  selector: 'circuits-page',
  imports: [Circuit3d, KeyValuePipe, RouterLink, RouterLinkActive, StatusPill],
  templateUrl: './circuits.html',
  styleUrl: './circuits.scss',
})
export class Circuits {
  readonly id = input<string>();

  readonly circuits = inject(CircuitsService);
  readonly data = inject(DataService);
  readonly world = inject(WorldService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly router = inject(Router);
  private readonly seo = inject(SeoService);

  addCircuitUrl(): string {
    return issueUrl('content.yml');
  }

  readonly current = computed(() => (this.id() ? this.circuits.byId().get(this.id()!) : undefined));
  readonly missing = computed(
    () => !!this.id() && !this.circuits.loading() && !this.circuits.byId().has(this.id()!),
  );

  private readonly detailRes = httpResource<CircuitDetail>(() => {
    const c = this.current();
    return c ? dataUrl(`circuits/${c.id}.json`) : undefined;
  });
  readonly detail = computed(() => this.detailRes.value());
  readonly detailLoading = computed(() => this.detailRes.isLoading());

  imageUrl(id: string): string {
    return dataUrl(`circuits/${id}.svg`);
  }

  /** The reader has asked for the scene rather than the picture. */
  readonly view3d = signal(false);

  /**
   * Switch between the picture and the scene.
   *
   * `wantMeshes` is set once and left set: the mesh file is 220 kB and worth
   * fetching only on request, but once it is here, switching back to the
   * picture is no reason to forget it.
   */
  toggle3d(): void {
    const on = !this.view3d();
    this.view3d.set(on);
    if (on) this.circuits.wantMeshes.set(true);
  }

  /**
   * What the scene needs, or null while anything is still missing -- which is
   * also the signal the template reads to keep showing the picture until the
   * meshes have arrived.
   */
  readonly scene = computed(() => {
    const d = this.detail();
    const meshes = this.circuits.meshes();
    if (!this.view3d() || !d || !meshes) return null;
    return { placed: d.placed, meshes };
  });

  readonly notes = computed<SafeHtml | null>(() => {
    const html = this.detail()?.notesHtml;
    return html ? this.sanitizer.bypassSecurityTrustHtml(html) : null;
  });

  /** What the reader's own save is short of, per pool. Empty with no save loaded. */
  readonly saveShort = computed(() => {
    const c = this.current();
    if (!c || !this.world.hasWorld()) return [];
    return shortfalls(c.needs, this.world.availability().stock);
  });

  readonly warnings = computed(() =>
    (this.detail()?.findings ?? []).filter((f) => f.level === 'warn'),
  );

  /** Cable cells as metres, the unit a reader can picture. */
  metres(cells: number): string {
    return (cells * CELL_M).toFixed(1);
  }

  /** A part's name, or a stand-in when the reader has not unlocked it and not asked to see it. */
  partName(id: string): string {
    if (!this.world.isListed(id)) return 'a part you have not unlocked';
    return this.data.componentById().get(id)?.name ?? id;
  }

  /**
   * A pool's name for a reader.
   *
   * A pool id is either a group several parts draw from -- MathBlock, Frame,
   * DigitalOrAnalogMeter -- or, for a part that belongs to no group, that
   * part's own component id. The first is a game term the reader sees in the
   * build menu and can be printed as it stands; the second is a part, and
   * naming a part the reader has not unlocked is the spoiler partName() is
   * there to avoid.
   */
  poolName(pool: string): string {
    return this.data.componentById().has(pool) ? this.partName(pool) : pool;
  }

  /**
   * Which objective hands out a pool the reader's save is short of.
   *
   * Only for a pool that is a part in its own right and that the save cannot
   * place: a group pool (MathBlock) is filled by any of its members and has
   * no single unlock, and a part the save already has is short by amount,
   * not by progress. Empty otherwise, and the line simply ends earlier.
   */
  unlockHint(pool: string): string {
    // A part the page is standing in for stays stood in for: naming the
    // mission that hands it out gives away as much as naming the part.
    if (!this.world.isListed(pool)) return '';
    if (!this.data.componentById().has(pool)) return '';
    if (this.world.stateOf(pool) !== 'locked') return '';
    return this.world.gateOf(pool);
  }

  /**
   * Follow a link inside the notes through the router.
   *
   * A circuit's notes are Markdown, so a cross-reference is written
   * `[text](/components/Abs)` and compiles to a plain anchor. Left alone that
   * reloads the whole application to move between two pages it already has.
   * Anything off-site, and any click the reader modified to mean "open
   * elsewhere", is left to the browser. The same listener the guides page
   * uses, for the same reason -- see guides.ts.
   */
  @HostListener('click', ['$event'])
  onBodyClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.prose')) return;
    const anchor = target.closest('a');
    const href = anchor?.getAttribute('href');
    if (!href?.startsWith('/')) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    void this.router.navigateByUrl(href);
  }

  constructor() {
    effect(() => {
      const c = this.current();
      if (!c) return;
      this.seo.describe({
        title: `${c.title} — Approximately Up`,
        description: c.summary,
        type: 'article',
      });
    });
  }
}
