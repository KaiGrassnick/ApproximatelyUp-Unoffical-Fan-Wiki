import { ApplicationConfig, mergeApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';

/**
 * The browser's providers, plus the ones only the prerenderer needs.
 *
 * provideClientHydration() is deliberately ABSENT, and this is the one real
 * decision in the whole setup. Hydration asks the client's first render to
 * match the server's; every content-bearing component here reads WorldService
 * or SpoilerService, and both of those read localStorage, which the server
 * does not have. So for any reader with a save loaded — the wiki's whole
 * point — the two renders differ on nearly every page, and that is a mismatch
 * on the site as a whole rather than in some corner of it.
 *
 * Without hydration the client simply renders over the prerendered HTML. The
 * cost is one render on load; what is bought is that a crawler, a link unfurl
 * and a reader with JavaScript off all get the real page, and no reader ever
 * sees a half-hydrated one.
 */
const serverConfig: ApplicationConfig = {
  providers: [provideServerRendering(withRoutes(serverRoutes))],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
