import {
  circuitIds,
  componentIds,
  guideIds,
  linkedComponentIds,
  missionIds,
  planetIds,
} from './prerender-pages';
import sitemapXml from '../../public/sitemap.xml';
import { SITE_ORIGIN } from './core/site';

/**
 * The sitemap and the prerenderer answer the same question — "what pages does
 * this wiki have" — from two implementations, because one is plain Node at
 * `npm run gen` time and the other is TypeScript compiled into the server
 * bundle. This is what stops them drifting.
 *
 * Drift is silent in both directions and bad in both: a sitemap URL that was
 * never prerendered sends a crawler to a page that has to boot JavaScript to
 * exist, and a prerendered page missing from the sitemap is a file nobody is
 * told about.
 */
describe('the prerendered pages and the sitemap', () => {
  const sitemapPaths = [...sitemapXml.matchAll(/<loc>(.*?)<\/loc>/g)]
    .map((m) => m[1].slice(SITE_ORIGIN.length))
    .sort();

  const prerenderedPaths = [
    ...componentIds.map((id) => `/components/${id}`),
    ...planetIds.map((id) => `/planets/${id}`),
    ...missionIds.map((id) => `/missions/${id}`),
    ...guideIds.map((id) => `/guides/${id}`),
    ...circuitIds.map((id) => `/circuits/${id}`),
  ].sort();

  it('reads a sitemap that is actually there', () => {
    expect(sitemapPaths.length).toBeGreaterThan(400);
    expect(sitemapPaths).toContain('/');
  });

  /**
   * The sections and the legal pages are prerendered by the ** route rather
   * than enumerated, so they are in the sitemap and not in the list above.
   * Everything with an id has to be in both.
   */
  it('prerenders every detail page the sitemap lists', () => {
    const detail = sitemapPaths.filter((p) => p.split('/').length > 2);
    const missing = detail.filter((p) => !prerenderedPaths.includes(p));
    expect(missing).toEqual([]);
  });

  /**
   * The one place the two lists differ, and they differ on purpose. A part
   * that is not in_build is linked from nowhere, so the sitemap leaves it
   * out -- but its page renders ("Not in this build"), so it is prerendered
   * anyway. Without that, nginx answers 404 for a page that works, which is
   * how /components/Acosh broke.
   */
  it('prerenders the not-in-build parts without listing them', () => {
    const extra = prerenderedPaths.filter((p) => !sitemapPaths.includes(p));
    expect(extra.length).toBe(componentIds.length - linkedComponentIds.length);
    expect(extra.every((p) => p.startsWith('/components/'))).toBe(true);
    expect(componentIds).toContain('Acosh');
    expect(linkedComponentIds).not.toContain('Acosh');
    expect(sitemapPaths).not.toContain('/components/Acosh');
  });

  it('spells a mission id the way a URL does', () => {
    expect(missionIds.every((id) => typeof id === 'string')).toBe(true);
    expect(missionIds).toContain('1002000');
  });
});
