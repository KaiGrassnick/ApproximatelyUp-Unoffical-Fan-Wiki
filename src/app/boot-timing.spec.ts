import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app';
import { appConfig } from './app.config';

/**
 * The claim the CLS fix rests on, tested end to end rather than reasoned
 * about: Angular does not touch the prerendered DOM until app initializers
 * have resolved.
 *
 * If it cleared <app-root> first, the page would still go blank while
 * components_full.json was in flight and the initializer would be buying
 * nothing — which is exactly the 0.630 shift it exists to remove, and is
 * invisible to every other test in the suite.
 */
describe('bootstrap timing against prerendered DOM', () => {
  const realFetch = globalThis.fetch;
  let release!: () => void;

  beforeEach(() => {
    const gate = new Promise<void>((r) => (release = r));
    // Every data/ request hangs until the test lets it through.
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      await gate;
      const url = String(input);
      const body = url.includes('icons.json') || url.includes('stat_labels') ? '{}' : '[]';
      return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    document.querySelectorAll('app-root').forEach((el) => el.remove());
  });

  it('leaves the server-rendered DOM alone until the data arrives, then replaces it', async () => {
    const host = document.createElement('app-root');
    host.innerHTML = '<main id="server">SERVER CONTENT</main>';
    document.body.appendChild(host);

    const boot = bootstrapApplication(App, appConfig);

    // Give the initializer and the resource effects every chance to run.
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));

    // The whole point: the reader is still looking at the prerendered page.
    expect(document.getElementById('server'), 'prerendered DOM was cleared early').toBeTruthy();

    release();
    const ref = await boot;

    // And once the data is in, Angular renders over it.
    expect(document.getElementById('server')).toBeNull();
    expect(host.querySelector('main')).toBeTruthy();
    ref.destroy();
  });
});
