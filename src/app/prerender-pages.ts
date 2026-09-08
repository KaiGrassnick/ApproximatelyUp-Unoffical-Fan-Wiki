import components from '../../data/components_full.json';
import planets from '../../data/planets.json';
import objectives from '../../data/objectives.json';
import guides from '../../data/guides.json';
import circuits from '../../data/circuits.json';

/**
 * Which pages exist, for the prerenderer.
 *
 * SERVER ONLY. This module imports the whole of data/, 588 kB of
 * components_full.json among it, so nothing the browser bundle can reach may
 * import it — the app fetches those files at runtime instead, which is the
 * point of data-manifest.ts and the immutable caching behind it. Its only
 * consumer is app.routes.server.ts, which the browser build never pulls in.
 *
 * The lists here answer the same question scripts/gen-sitemap.mjs answers:
 * "what pages does this wiki have". They are two implementations because they
 * run in two places — that script is plain Node at `npm run gen` time, this is
 * TypeScript compiled into the server bundle — and prerender-pages.spec.ts
 * exists to stop them drifting apart. Change one, and that spec tells you
 * about the other.
 */

/**
 * ALL of them, including the 51 that are not in_build -- which is where this
 * list parts company with the sitemap, deliberately.
 *
 * The two answer different questions. The sitemap answers "what should a
 * crawler be told about", and a part the components grid does not list is an
 * orphan there. This answers "what addresses work", and /components/Acosh
 * works: the detail page renders it and says "Not in this build". Leaving
 * those 51 unprerendered made nginx answer 404 for a page that renders
 * perfectly well, which is worse than either listing or not listing it.
 */
export const componentIds: string[] = components.map((c) => c.id).sort();

/** The subset the sitemap carries -- see the note above. */
export const linkedComponentIds: string[] = components
  .filter((c) => c.in_build)
  .map((c) => c.id)
  .sort();

/**
 * Stations included: /planets/:id serves them too, which is why /stations
 * links every station to an address under /planets.
 */
export const planetIds: string[] = planets.map((p) => p.id).sort();

/** Numbers in the data, strings in a URL — the route param is text. */
export const missionIds: string[] = objectives
  .map((o) => o.id)
  .sort((a, b) => a - b)
  .map(String);

export const guideIds: string[] = guides.map((g) => g.id).sort();

export const circuitIds: string[] = circuits.map((c) => c.id).sort();
