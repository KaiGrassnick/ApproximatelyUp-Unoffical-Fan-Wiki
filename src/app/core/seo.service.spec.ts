import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { SeoService, summarise } from './seo.service';
import { SITE_DESCRIPTION, SITE_ORIGIN } from './site';

@Component({ template: '' })
class Blank {}

const ROUTES = [
  { path: 'components', title: 'Components — Approximately Up', component: Blank },
  {
    path: 'planets',
    title: 'Planets — Approximately Up',
    data: { description: 'The planets and stars, with their radii and gravity.' },
    component: Blank,
  },
  { path: 'planets/:id', title: 'Planet — Approximately Up', component: Blank },
  { path: '', title: 'Approximately Up — Wiki', component: Blank },
];

/** The <head> is shared mutable state in jsdom, so each test starts from one. */
function head() {
  const get = (selector: string) =>
    document.head.querySelector(selector)?.getAttribute('content') ?? null;
  return {
    description: get('meta[name="description"]'),
    robots: get('meta[name="robots"]'),
    ogTitle: get('meta[property="og:title"]'),
    ogDescription: get('meta[property="og:description"]'),
    ogUrl: get('meta[property="og:url"]'),
    ogImage: get('meta[property="og:image"]'),
    ogImageWidth: get('meta[property="og:image:width"]'),
    canonical: document.head.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
    breadcrumb: document.head.querySelector('script#ld-breadcrumb')?.textContent ?? null,
  };
}

describe('SeoService', () => {
  let router: Router;
  let seo: SeoService;

  beforeEach(async () => {
    for (const el of document.head.querySelectorAll(
      'meta[name^="og"], meta[property], meta[name^="twitter"], meta[name="description"], meta[name="robots"], link[rel="canonical"], script#ld-breadcrumb',
    )) {
      el.remove();
    }
    TestBed.configureTestingModule({ providers: [provideRouter(ROUTES)] });
    router = TestBed.inject(Router);
    seo = TestBed.inject(SeoService);
    await router.navigateByUrl('/');
    TestBed.tick();
  });

  it('points every page at its own canonical address', async () => {
    await router.navigateByUrl('/components');
    TestBed.tick();
    expect(head().canonical).toBe(`${SITE_ORIGIN}/components`);
    expect(head().ogUrl).toBe(`${SITE_ORIGIN}/components`);
  });

  /**
   * The whole point of the service. Without it every route shares index.html's
   * one description, which tells a search engine that 426 pages are one page.
   */
  it('uses the route’s own description where it declares one', async () => {
    await router.navigateByUrl('/planets');
    TestBed.tick();
    expect(head().description).toBe('The planets and stars, with their radii and gravity.');
  });

  it('falls back to the site description on a route that declares none', async () => {
    await router.navigateByUrl('/components');
    TestBed.tick();
    expect(head().description).toBe(SITE_DESCRIPTION);
  });

  it('mirrors the document title into og:title', async () => {
    await router.navigateByUrl('/components');
    TestBed.tick();
    expect(head().ogTitle).toBe('Components — Approximately Up');
  });

  describe('a page describing itself', () => {
    it('overrides the title and the description', async () => {
      await router.navigateByUrl('/planets/Earth');
      seo.describe({ title: 'Earth — Approximately Up', description: 'A planet.' });
      TestBed.tick();
      expect(document.title).toBe('Earth — Approximately Up');
      expect(head().description).toBe('A planet.');
      expect(head().ogTitle).toBe('Earth — Approximately Up');
    });

    /**
     * A component's icon and a planet's globe are neither of them 1200x630,
     * so the dimensions index.html declares for the card have to come off
     * with the card. An unfurl sized from a lie is worse than an unsized one.
     */
    it('drops the card’s dimensions when it supplies its own image', async () => {
      await router.navigateByUrl('/planets/Earth');
      seo.describe({ image: `${SITE_ORIGIN}/data/planets/Earth.webp?v=abcd1234` });
      TestBed.tick();
      expect(head().ogImage).toBe(`${SITE_ORIGIN}/data/planets/Earth.webp?v=abcd1234`);
      expect(head().ogImageWidth).toBeNull();
    });

    it('restores the card, and its dimensions, on the next page', async () => {
      await router.navigateByUrl('/planets/Earth');
      seo.describe({ image: `${SITE_ORIGIN}/data/planets/Earth.webp` });
      TestBed.tick();

      await router.navigateByUrl('/components');
      TestBed.tick();
      expect(head().ogImage).toBe(`${SITE_ORIGIN}/og-card.png`);
      expect(head().ogImageWidth).toBe('1200');
    });

    /**
     * The override is cleared on NavigationStart, not NavigationEnd -- a page
     * sets it while the navigation is still in flight, so clearing at the end
     * would throw away the description that was just set.
     */
    it('does not leak its description onto the next page', async () => {
      await router.navigateByUrl('/planets/Earth');
      seo.describe({ description: 'A planet.' });
      TestBed.tick();

      await router.navigateByUrl('/planets');
      TestBed.tick();
      expect(head().description).toBe('The planets and stars, with their radii and gravity.');
    });
  });

  describe('robots', () => {
    it('invites indexing by default', async () => {
      await router.navigateByUrl('/components');
      TestBed.tick();
      expect(head().robots).toBe('index, follow');
    });

    /** A 200 that says "no such page" is a soft 404 -- see not-found.ts. */
    it('keeps a noindex page crawlable, so its links still count', async () => {
      await router.navigateByUrl('/components');
      seo.describe({ noindex: true });
      TestBed.tick();
      expect(head().robots).toBe('noindex, follow');
    });
  });

  describe('breadcrumbs', () => {
    it('names Home, the section and the page', async () => {
      await router.navigateByUrl('/planets/Earth');
      seo.describe({ title: 'Earth — Approximately Up' });
      TestBed.tick();

      const ld = JSON.parse(head().breadcrumb!);
      expect(ld['@type']).toBe('BreadcrumbList');
      expect(ld.itemListElement.map((i: { name: string }) => i.name)).toEqual([
        'Home',
        'Planets',
        'Earth',
      ]);
      expect(ld.itemListElement.map((i: { position: number }) => i.position)).toEqual([1, 2, 3]);
    });

    it('stops at the section on a list page', async () => {
      await router.navigateByUrl('/components');
      TestBed.tick();
      const ld = JSON.parse(head().breadcrumb!);
      expect(ld.itemListElement.map((i: { name: string }) => i.name)).toEqual([
        'Home',
        'Components',
      ]);
    });

    it('offers no trail for a path that is not a section', async () => {
      await router.navigateByUrl('/');
      TestBed.tick();
      const ld = JSON.parse(head().breadcrumb!);
      expect(ld.itemListElement.map((i: { name: string }) => i.name)).toEqual(['Home']);
    });
  });
});

describe('summarise', () => {
  it('flattens the game’s own markers and newlines', () => {
    expect(summarise('Find the **lost** package.\nIt is _somewhere_ cold.')).toBe(
      'Find the lost package. It is somewhere cold.',
    );
  });

  /** objectives.json stores "\n" as two literal characters, not a newline. */
  it('flattens an escaped newline too', () => {
    expect(summarise('One.\\nTwo.')).toBe('One. Two.');
  });

  it('leaves a description a search result will show intact', () => {
    const short = 'A planet in Approximately Up.';
    expect(summarise(short)).toBe(short);
  });

  it('cuts a long one at a word boundary', () => {
    const long = `${'word '.repeat(60)}end`;
    const out = summarise(long);
    expect(out.length).toBeLessThanOrEqual(160);
    expect(out.endsWith('…')).toBe(true);
    // Cut between words, never mid-word: "wor…" reads as a broken renderer.
    expect(out).toMatch(/word…$/);
  });

  it('does not leave punctuation stranded before the ellipsis', () => {
    expect(summarise(`${'word '.repeat(31)}, tail`)).not.toContain(',…');
  });
});
