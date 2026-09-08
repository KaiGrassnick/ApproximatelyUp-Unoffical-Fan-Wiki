import { DOCUMENT, Injectable, effect, inject, signal } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, NavigationEnd, NavigationStart, Router } from '@angular/router';
import { SITE_CARD, SITE_DESCRIPTION, canonicalUrl } from './site';
import { plaintext } from './text';

/**
 * How much of a description a search result will show. Google's own limit
 * moves around and is measured in pixels rather than characters, so this is
 * the conventional safe length rather than an exact one — the point is that
 * an objective's full briefing runs to several hundred characters, and a
 * description cut mid-word by someone else's renderer reads worse than one
 * cut at a word here.
 */
const MAX_DESCRIPTION = 160;

/**
 * One line of plain text, no longer than a search result will show.
 *
 * Applied centrally rather than at each call site: every description here
 * comes out of the game's own text, which carries "**bold**", literal "\n"
 * and no length limit whatsoever.
 */
export function summarise(text: string): string {
  const flat = plaintext(text);
  if (flat.length <= MAX_DESCRIPTION) return flat;
  // Cut at the last word boundary that fits, leaving room for the ellipsis.
  const cut = flat.slice(0, MAX_DESCRIPTION - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > 0 ? cut.slice(0, space) : cut).replace(/[,;:.\s]+$/, '')}…`;
}

/** What a page can say about itself beyond its title. */
export interface SeoPage {
  /**
   * The document title, replacing the one app.routes.ts declared. A route's
   * static title is a placeholder for a detail page ("Component —
   * Approximately Up"); this is where the real one arrives, once the data
   * naming it has loaded.
   */
  title?: string;
  /** One sentence, drawn from the wiki's own text — see the note on describe(). */
  description?: string;
  /** An absolute image URL for the link preview. Defaults to the site card. */
  image?: string;
  /** 'article' for a guide, which is the only prose here with an author and a date. */
  type?: 'website' | 'article';
  /** Keeps a page out of the index without keeping a crawler out of its links. */
  noindex?: boolean;
}

/**
 * The tags a crawler, a search result and a Discord unfurl read.
 *
 * index.html carries a full, correct set of these for the home page, which is
 * what a crawler that does not run JavaScript sees. This service keeps them
 * true for every other route: without it, every page of the wiki shares one
 * description, one og:title and one canonical URL, and a search engine is
 * being told that 470 distinct pages are the same page.
 *
 * Two signals feed it, and the split is what makes ordering a non-issue:
 *
 *   - `url`, set on NavigationEnd, once the router knows where it landed.
 *   - `override`, set by the page component when its data arrives, and
 *     CLEARED on NavigationStart. Clearing on start rather than on end is
 *     load-bearing: a component sets its override during navigation, so
 *     clearing at the end would throw it away again.
 *
 * The DOM write happens in an effect, which runs after both have settled, so
 * neither has to know whether it ran first.
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly doc = inject(DOCUMENT);
  private readonly meta = inject(Meta);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly url = signal('/');
  private readonly routeDescription = signal<string | undefined>(undefined);
  private readonly override = signal<SeoPage | null>(null);

  /**
   * Declares what this page is. Called from a component effect, so it is
   * expected to run more than once as the data behind the page loads.
   */
  describe(page: SeoPage): void {
    this.override.set(page);
  }

  constructor() {
    this.router.events.subscribe((e) => {
      if (e instanceof NavigationStart) this.override.set(null);
      else if (e instanceof NavigationEnd) {
        this.url.set(e.urlAfterRedirects);
        this.routeDescription.set(this.declaredDescription());
      }
    });
    effect(() => this.apply(this.url(), this.routeDescription(), this.override() ?? {}));
  }

  /**
   * The `data.description` of the route that actually matched, which is the
   * deepest one — the wiki has no nested routes today, but reading only the
   * root's data would silently return nothing the day it does.
   */
  private declaredDescription(): string | undefined {
    let route = this.route;
    while (route.firstChild) route = route.firstChild;
    const declared: unknown = route.snapshot.data['description'];
    return typeof declared === 'string' ? declared : undefined;
  }

  private apply(url: string, declared: string | undefined, page: SeoPage): void {
    // The router's TitleStrategy has already applied the route's own title by
    // the time NavigationEnd fires, so the fallback here is the real title
    // rather than a guess at it.
    if (page.title) this.doc.title = page.title;
    const title = this.doc.title;
    // Only the page's own description is summarised. It is the one that comes
    // out of the game's data — an objective's briefing runs to several hundred
    // characters of marked-up prose — whereas a route's description and the
    // site's were both written to be a description. SITE_DESCRIPTION in
    // particular is the exact string index.html carries: cutting it here would
    // make the home page's description change the moment the app boots.
    const description = page.description
      ? summarise(page.description)
      : declared || SITE_DESCRIPTION;
    const image = page.image || SITE_CARD;
    const canonical = canonicalUrl(url);

    this.setMeta('name', 'description', description);
    // 'follow' either way: a page worth keeping out of the index is still
    // worth crawling THROUGH — /404 links to every section of the wiki.
    this.setMeta('name', 'robots', page.noindex ? 'noindex, follow' : 'index, follow');

    this.setMeta('property', 'og:title', title);
    this.setMeta('property', 'og:description', description);
    this.setMeta('property', 'og:url', canonical);
    this.setMeta('property', 'og:image', image);
    this.setMeta('property', 'og:type', page.type ?? 'website');
    // index.html declares the card's 1200x630, which is true of the card and
    // of nothing else. A page that supplies its own image — a component icon,
    // a planet's globe — drops the dimensions rather than lying about them;
    // an unfurl with no declared size is laid out from the file itself.
    this.setImageSize(page.image ? null : { width: '1200', height: '630' });

    this.setMeta('name', 'twitter:title', title);
    this.setMeta('name', 'twitter:description', description);
    this.setMeta('name', 'twitter:image', image);

    this.setCanonical(canonical);
    this.setBreadcrumb(url, title);
  }

  private setImageSize(size: { width: string; height: string } | null): void {
    for (const [key, value] of [
      ['og:image:width', size?.width],
      ['og:image:height', size?.height],
    ] as const) {
      const selector = `property="${key}"`;
      if (value) this.meta.updateTag({ property: key, content: value }, selector);
      else this.meta.removeTag(selector);
    }
  }

  private setMeta(attr: 'name' | 'property', key: string, content: string): void {
    this.meta.updateTag({ [attr]: key, content }, `${attr}="${key}"`);
  }

  private setCanonical(href: string): void {
    let link = this.doc.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.doc.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.doc.head.appendChild(link);
    }
    link.setAttribute('href', href);
  }

  /** The section names, for the breadcrumb trail's middle rung. */
  private static readonly SECTIONS: Record<string, string> = {
    components: 'Components',
    circuits: 'Circuits',
    planets: 'Planets',
    stations: 'Stations',
    missions: 'Missions',
    guides: 'Guides',
    imprint: 'Imprint',
    privacy: 'Privacy',
  };

  /**
   * Home › Section › Page, as JSON-LD.
   *
   * This is what turns a bare URL under a search result into a readable trail,
   * and the wiki's addresses are already shaped for it: everything is either a
   * section or one thing inside a section. A path whose first segment is not a
   * known section (the 404 route) gets no trail rather than an invented one.
   */
  private setBreadcrumb(url: string, title: string): void {
    const segments = url.split('#')[0].split('?')[0].split('/').filter(Boolean);
    const section = segments[0] ? SeoService.SECTIONS[segments[0]] : undefined;

    const items: { name: string; item: string }[] = [{ name: 'Home', item: canonicalUrl('/') }];
    if (section) {
      items.push({ name: section, item: canonicalUrl(`/${segments[0]}`) });
      // The leaf's name is the document title with the site suffix taken off:
      // "Absolute — Approximately Up" is the tab, "Absolute" is the crumb.
      if (segments.length > 1) {
        items.push({
          name: title.replace(/\s+—\s+Approximately Up.*$/, ''),
          item: canonicalUrl(url),
        });
      }
    }

    const json = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: items.map((it, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: it.name,
        item: it.item,
      })),
    };

    let script = this.doc.head.querySelector<HTMLScriptElement>('script#ld-breadcrumb');
    if (!script) {
      script = this.doc.createElement('script');
      script.id = 'ld-breadcrumb';
      script.type = 'application/ld+json';
      this.doc.head.appendChild(script);
    }
    // textContent, never innerHTML: the leaf name comes from the data, and
    // this is a <script> element.
    script.textContent = JSON.stringify(json);
  }
}
