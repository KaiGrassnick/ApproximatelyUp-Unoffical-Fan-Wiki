import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SiteFooter } from './site-footer';
import { routes } from '../../app.routes';

describe('SiteFooter', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SiteFooter],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  /**
   * The imprint has to be reachable from every page, and the footer is how
   * that is met. A link that stops pointing at /imprint is a legal defect,
   * not a cosmetic one, so it is asserted by href rather than by label.
   */
  it('links the imprint and the privacy policy', async () => {
    const fixture = TestBed.createComponent(SiteFooter);
    await fixture.whenStable();
    const hrefs = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a')).map(
      (a) => a.getAttribute('href'),
    );

    expect(hrefs).toContain('/imprint');
    expect(hrefs).toContain('/privacy');
  });

  it('carries the fan-project disclaimer', async () => {
    const fixture = TestBed.createComponent(SiteFooter);
    await fixture.whenStable();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('unofficial fan project');
    expect(text).toContain('Not affiliated');
  });
});
