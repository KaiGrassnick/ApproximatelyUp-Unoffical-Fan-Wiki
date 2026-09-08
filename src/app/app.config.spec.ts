import { ApplicationRef, Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DataService } from './core/data.service';

/**
 * The first client render is held until data/ has arrived, because without
 * hydration Angular replaces the prerendered page with a client render, and a
 * client render with no data yet is an empty page. Letting that through
 * collapses every list on the site and refills it a moment later.
 *
 * The failure mode this guards is not a visibly broken page -- it is the app
 * rendering slightly too early, which looks like a flicker and scores as a
 * layout shift. Nothing else in the suite would see it.
 */
describe('holding the first render until the data lands', () => {
  let http: HttpTestingController;
  let data: DataService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    data = TestBed.inject(DataService);
  });

  it('is not settled while the requests are still in flight', () => {
    TestBed.tick();
    http.match(() => true); // taken, deliberately not answered
    expect(data.settled()).toBe(false);
  });

  /**
   * The distinction `settled` exists for: a resource that has not started
   * fetching is not loading either, so !loading() is true before the first
   * request goes out and would release the wait immediately.
   */
  /**
   * httpResource reports isLoading() from construction, not from when the
   * request goes out, so !loading() means the same as settled() today. The
   * app initializer asks settled() so that it keeps meaning "the data is
   * here" if that ever changes.
   */
  it('is not settled before the first request has even gone out', () => {
    expect(data.loading()).toBe(true);
    expect(data.settled()).toBe(false);
  });

  it('settles once every resource has answered', async () => {
    TestBed.tick();
    for (const r of http.match(() => true)) r.flush([]);
    await TestBed.inject(ApplicationRef).whenStable();
    expect(data.settled()).toBe(true);
  });

  /** A 404 on data/ has to release the wait, not hang the app for ten seconds. */
  it('settles when a request fails, so a broken host still renders', async () => {
    TestBed.tick();
    for (const r of http.match(() => true)) {
      r.flush('nope', { status: 404, statusText: 'Not Found' });
    }
    await TestBed.inject(ApplicationRef).whenStable();
    expect(data.settled()).toBe(true);
    expect(data.failed()).toBe(true);
  });

  /**
   * The initializer runs in an injection context and returns a promise. This
   * is the wiring itself: if it resolved before the data settled it would be
   * doing nothing at all, which no other test would notice.
   */
  it('does not resolve until the data has settled', async () => {
    const { waitForData } = await import('./app.config');
    let resolved = false;
    const promise = runInInjectionContext(TestBed.inject(Injector), waitForData).then(() => {
      resolved = true;
    });

    TestBed.tick();
    const pending = http.match(() => true);
    await Promise.resolve();
    expect(resolved, 'resolved while the data was still in flight').toBe(false);

    for (const r of pending) r.flush([]);
    await promise;
    expect(resolved).toBe(true);
  });
});
