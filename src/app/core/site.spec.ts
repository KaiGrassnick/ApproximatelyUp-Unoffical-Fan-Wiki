import { SITE_CARD, SITE_DESCRIPTION, SITE_ORIGIN, absoluteUrl, canonicalUrl } from './site';

/**
 * These values leave the site: they end up in a canonical link, in a sitemap
 * and in a Discord unfurl, where a trailing slash or a relative URL is not a
 * cosmetic problem but a wrong answer nobody here ever sees.
 */
describe('site identity', () => {
  it('is a bare origin -- scheme and host, no path and no trailing slash', () => {
    // scripts/gen-sitemap.mjs asserts the same shape and refuses to run
    // otherwise, because it concatenates this with a path.
    expect(SITE_ORIGIN).toMatch(/^https:\/\/[^/]+$/);
  });

  it('describes the wiki in a length a search result will show', () => {
    expect(SITE_DESCRIPTION.length).toBeLessThanOrEqual(200);
  });

  it('makes the link-preview card absolute', () => {
    expect(SITE_CARD).toBe(`${SITE_ORIGIN}/og-card.png`);
  });

  describe('absoluteUrl', () => {
    it('accepts a path with or without its leading slash', () => {
      expect(absoluteUrl('/components')).toBe(`${SITE_ORIGIN}/components`);
      expect(absoluteUrl('data/icons/Abs.png')).toBe(`${SITE_ORIGIN}/data/icons/Abs.png`);
    });

    it('keeps a query string, which is where dataUrl() puts the content hash', () => {
      expect(absoluteUrl('data/icons/Abs.png?v=deadbeef')).toBe(
        `${SITE_ORIGIN}/data/icons/Abs.png?v=deadbeef`,
      );
    });
  });

  describe('canonicalUrl', () => {
    it('keeps an ordinary route as it is', () => {
      expect(canonicalUrl('/missions/1002000')).toBe(`${SITE_ORIGIN}/missions/1002000`);
    });

    /**
     * The galaxy map lives at /#galaxy and every link to it carries that
     * fragment. Left in, the home page would claim two canonical addresses.
     */
    it('drops a fragment, which never names a different page', () => {
      expect(canonicalUrl('/#galaxy')).toBe(`${SITE_ORIGIN}/`);
    });

    it('drops a query string too', () => {
      expect(canonicalUrl('/components?q=frame')).toBe(`${SITE_ORIGIN}/components`);
    });
  });
});
