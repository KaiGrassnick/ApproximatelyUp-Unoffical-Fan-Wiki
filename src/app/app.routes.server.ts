import { RenderMode, ServerRoute } from '@angular/ssr';
import { circuitIds, componentIds, guideIds, missionIds, planetIds } from './prerender-pages';

/**
 * How each route is rendered at build time.
 *
 * Everything is Prerender, and `outputMode: static` in angular.json means the
 * build emits one HTML file per page and no server at all — the container
 * still serves static files through nginx, exactly as before. What changes is
 * that /components/Abs is now a real file with the part's name, description
 * and stats in it, rather than an empty <app-root> that only becomes a page
 * once a crawler runs JavaScript.
 *
 * The parameterised routes get their ids from prerender-pages.ts, which reads
 * the same data/*.json the app does. A page that exists is a page that gets
 * written; there is no second list to keep in step by hand.
 *
 * Note what the prerendered HTML contains: the server has no localStorage, so
 * WorldService and SpoilerService both fall back to their defaults and every
 * page renders the NEW GAME view. That is the right answer twice over — it is
 * what a first-time reader should see, and it keeps the wiki's spoiler policy
 * intact in Google's index without anyone having to design for it.
 */
export const serverRoutes: ServerRoute[] = [
  {
    path: 'components/:id',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => componentIds.map((id) => ({ id })),
  },
  {
    path: 'planets/:id',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => planetIds.map((id) => ({ id })),
  },
  {
    path: 'missions/:id',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => missionIds.map((id) => ({ id })),
  },
  {
    path: 'guides/:id',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => guideIds.map((id) => ({ id })),
  },
  {
    path: 'circuits/:id',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => circuitIds.map((id) => ({ id })),
  },
  // The sections, the legal pages, and the ** route -- which prerenders the
  // 404 page itself, so an unknown address is served a real "no such page"
  // rather than the home page's HTML.
  { path: '**', renderMode: RenderMode.Prerender },
];
