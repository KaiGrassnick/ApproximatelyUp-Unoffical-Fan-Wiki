import { Component, HostListener, computed, effect, inject, input } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { GuidesService } from '../../core/guides.service';
import { dataUrl } from '../../core/data-url';
import { issueUrl } from '../../core/issue-url';
import { SeoService } from '../../core/seo.service';

/**
 * The guides section: the list on the left, the guide on the right.
 *
 * One component serves both /guides and /guides/:id rather than a parent with
 * a child outlet. The list is the same list either way, and the difference
 * between the two routes is only what the right-hand pane shows — a component
 * boundary there would buy nothing and cost a second fetch of the index.
 */
@Component({
  selector: 'guides-page',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './guides.html',
})
export class Guides {
  /** Bound from the route param by withComponentInputBinding(); absent on /guides. */
  readonly id = input<string>();

  readonly guides = inject(GuidesService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly router = inject(Router);
  private readonly seo = inject(SeoService);

  /** The "Add new content" form, which is the one that asks for guides. */
  addGuideUrl(): string {
    return issueUrl('content.yml');
  }

  readonly current = computed(() => (this.id() ? this.guides.byId().get(this.id()!) : undefined));

  /** True for an id that is not a guide, as opposed to no id at all. */
  readonly missing = computed(
    () => !!this.id() && !this.guides.loading() && !this.guides.byId().has(this.id()!),
  );

  /**
   * The guide's compiled HTML.
   *
   * Fetched for any guide the reader has navigated to. Guides are never gated
   * on a reveal switch -- see GuidesService -- so there is no case where the
   * body has to be kept off the wire.
   */
  private readonly bodyRes = httpResource.text(() => {
    const g = this.current();
    return g ? dataUrl(`guides/${g.id}.html`) : undefined;
  });

  /**
   * Trusted because we generated it: scripts/gen-guides.mjs compiles the
   * Markdown and escapes any raw HTML in the source, so what arrives here is
   * markup this build produced rather than anything a guide's author wrote
   * directly.
   */
  readonly body = computed<SafeHtml | null>(() => {
    const html = this.bodyRes.value();
    return html ? this.sanitizer.bypassSecurityTrustHtml(html) : null;
  });

  readonly bodyLoading = computed(() => this.bodyRes.isLoading());

  constructor() {
    // A guide is the only prose here that a person wrote, so it is the only
    // page that is honestly an 'article'. Its summary is already a one-line
    // description of itself — the frontmatter asks for exactly that — so
    // there is nothing to write for a search engine that is not already
    // there. /guides itself keeps the route's own title and description.
    effect(() => {
      const g = this.current();
      if (!g) return;
      this.seo.describe({
        title: `${g.title} — Approximately Up`,
        description: g.summary,
        type: 'article',
      });
    });
  }

  /**
   * Keeps in-guide links to other wiki pages inside the app.
   *
   * A guide is Markdown, so a cross-reference is written `[text](/privacy)` and
   * compiles to a plain anchor. Left alone that reloads the whole application
   * to move between two pages it already has. Anything off-site, and any click
   * the reader modified to mean "open elsewhere", is left to the browser.
   *
   * Bound on the host rather than on the prose div: a template `(click)` on a
   * non-interactive element is what the accessibility rules are there to catch,
   * and the thing being clicked really is a link — keyboard activation of a
   * focused anchor arrives here as a click too, so it works either way.
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
}
