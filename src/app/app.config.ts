import {
  ApplicationConfig,
  Injector,
  effect,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import {
  provideRouter,
  withComponentInputBinding,
  withEnabledBlockingInitialNavigation,
  withInMemoryScrolling,
} from '@angular/router';
import { routes } from './app.routes';
import { DataService } from './core/data.service';

/**
 * How long the first render will wait for data/ before giving up on it.
 *
 * Only reached if a request hangs rather than fails -- a 404 or a dropped
 * connection settles the resource and releases the wait immediately. Rendering
 * the empty state is the right thing to do at that point; it is what the
 * "could not be loaded" banner is for.
 */
const DATA_WAIT_MS = 10_000;

/**
 * Holds the first render until the wiki's data has arrived.
 *
 * Every page is prerendered, so the reader is already looking at the finished
 * page while this waits -- the HTML with its components, its stats and its
 * missions in it. What the wait prevents is Angular throwing that away and
 * replacing it with the empty state: without hydration the client re-renders
 * from scratch, and at that moment components_full.json is still in flight,
 * so every list is empty. The page would collapse to a heading and a filter
 * bar, then refill a moment later. That is a layout shift the size of the
 * page, and it happens on every route with a list on it.
 *
 * Half of a pair, and neither half is enough. This one guarantees the DATA is
 * there at first render; withEnabledBlockingInitialNavigation() below
 * guarantees the route's COMPONENT is. Measured on /components: both gives
 * CLS 0.003, dropping this one alone puts it back to 0.104.
 *
 * Waiting costs nothing a reader can see. The prerendered links are real
 * hrefs, so navigation works before Angular boots at all, and first paint has
 * already happened -- this delays interactivity, not content.
 *
 * Exported for app.config.spec.ts: an initializer that resolved too early
 * would be indistinguishable from one that worked.
 */
export function waitForData() {
  const data = inject(DataService);
  const injector = inject(Injector);
  return new Promise<void>((resolve) => {
    const timer = setTimeout(finish, DATA_WAIT_MS);
    const watcher = effect(
      () => {
        if (data.settled()) finish();
      },
      { injector },
    );

    function finish() {
      clearTimeout(timer);
      watcher.destroy();
      resolve();
    }
  });
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideAppInitializer(waitForData),
    // The galaxy map lives in a #galaxy section of the home page rather than
    // on a route of its own, so every link to it is a fragment link. Without
    // anchorScrolling those navigate to the top of the home page and leave
    // the reader to hunt for the map.
    provideRouter(
      routes,
      // Holds bootstrap until the first navigation has finished, which
      // includes fetching the route's loadComponent chunk. Without it Angular
      // renders as soon as it can, and on a prerendered page that means
      // replacing the finished HTML with an empty <router-outlet> while
      // components-list.js is still on the wire -- the page goes from 144
      // cards to none and back, which is most of the CLS this app had.
      withEnabledBlockingInitialNavigation(),
      withComponentInputBinding(),
      withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'enabled' }),
    ),
    provideHttpClient(withFetch()),
  ],
};
