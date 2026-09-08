import config from './site.config.json';

/**
 * The wiki's identity as the outside world sees it.
 *
 * Everything here has one property in common: it only matters to something
 * that is NOT the reader's browser. A crawler needs an absolute origin to
 * canonicalise against, Discord needs an absolute image URL to unfurl, and
 * scripts/gen-sitemap.mjs needs the same origin at build time to write
 * <loc> elements. Relative URLs are correct for the app and useless to all
 * three.
 *
 * It lives in a JSON file rather than in this one so the build script can
 * read it too: scripts/gen-sitemap.mjs parses site.config.json directly.
 * A second copy of the origin in a .mjs file is a copy that goes stale the
 * day the domain changes, and nothing would catch it -- the sitemap would
 * simply point at the wrong host.
 */

/** Scheme and host, no trailing slash. */
export const SITE_ORIGIN: string = config.origin;

/** The name used for og:site_name and the web app manifest. */
export const SITE_NAME: string = config.name;

/**
 * What the wiki is, in one sentence, for a search result and a link unfurl.
 *
 * The same sentence src/index.html carries in its own <meta name="description">
 * — SeoService uses this as the fallback for a route that declares none, so if
 * the two drift the home page's description changes the moment the app boots.
 * Change both together.
 */
export const SITE_DESCRIPTION: string = config.description;

/** The 1200x630 link-preview card, as an absolute URL. */
export const SITE_CARD: string = absoluteUrl(config.card);

/**
 * An absolute URL for anything this site serves, verbatim.
 *
 * Verbatim matters for assets: dataUrl() appends a ?v=<hash>, and dropping it
 * would hand a crawler an unversioned URL that nginx then refuses to cache.
 */
export function absoluteUrl(path: string): string {
  return SITE_ORIGIN + (path.startsWith('/') ? path : `/${path}`);
}

/**
 * The one address a page should be indexed under.
 *
 * Query and fragment are both stripped, because neither names a different
 * page. '/#galaxy' is the home page; a canonical link that says otherwise
 * splits the home page's ranking across two addresses.
 */
export function canonicalUrl(path: string): string {
  return absoluteUrl(path.split('#')[0].split('?')[0]);
}
