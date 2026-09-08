import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DataService } from './data.service';
import { DATA_MANIFEST } from './data-manifest';

describe('DataService asset URLs', () => {
  let svc: DataService;

  beforeEach(() => {
    // provideHttpClientTesting intercepts the five httpResource fetches the
    // service kicks off on construction. Without it they hit the network under
    // jsdom, which is slow and noisy even though none of these tests read them.
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(DataService);
  });

  it('fingerprints a globe URL with the manifest hash', () => {
    const [path, query] = svc.globeUrl('Earth').split('?');
    const hash = DATA_MANIFEST[path.replace('data/', '')];
    // Asserted, not assumed: without this the test passes vacuously when the
    // key is missing, comparing 'v=undefined' to 'v=undefined'.
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
    expect(query).toBe(`v=${hash}`);
  });

  it('fingerprints a globe map URL', () => {
    const [path, query] = svc.globeMapUrl('Earth').split('?');
    const hash = DATA_MANIFEST[path.replace('data/', '')];
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
    expect(query).toBe(`v=${hash}`);
  });

  it('returns a bare, working path for an id the manifest has never heard of', () => {
    expect(svc.globeUrl('NoSuchBody')).toBe('data/planets/NoSuchBody.webp');
  });

  it('returns empty string for an unknown icon id, as before', () => {
    expect(svc.iconUrl('NoSuchComponent')).toBe('');
  });

  describe('iconSrcset', () => {
    /**
     * The components grid draws 310 icons at 64 CSS px, and offers the
     * browser both files so an ordinary monitor does not fetch the retina
     * one. Getting the descriptors backwards would silently serve every
     * reader the wrong size, which nothing on screen would show.
     */
    it('offers the 64px file at 1x and the 128px file at 2x', async () => {
      const http = TestBed.inject(HttpTestingController);
      // httpResource fetches from an effect, which has not run yet.
      TestBed.tick();
      // All five have to be answered, not just the one this test reads:
      // whenStable() waits on every outstanding request, so flushing one
      // leaves the other four pending and the await never returns.
      for (const r of http.match(() => true)) {
        r.flush(
          r.request.url.startsWith('data/icons.json')
            ? {
                Abs: {
                  file: 'icons/Abs.webp',
                  file_1x: 'icons/64/Abs.webp',
                  size: '128x128',
                  texture: 'SC_Abs',
                },
              }
            : [],
        );
      }
      await TestBed.inject(ApplicationRef).whenStable();

      const [small, large] = svc.iconSrcset('Abs')!.split(', ');
      expect(small).toMatch(/^data\/icons\/64\/Abs\.webp(\?v=[0-9a-f]{8})? 1x$/);
      expect(large).toMatch(/^data\/icons\/Abs\.webp(\?v=[0-9a-f]{8})? 2x$/);
    });

    /** An absent srcset is the src; an empty one is a thing to parse and discard. */
    it('is null for an icon the manifest does not have', () => {
      expect(svc.iconSrcset('NoSuchComponent')).toBeNull();
    });
  });
});
