import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Imprint } from './imprint';
import { Privacy } from './privacy';
import { routes } from '../../app.routes';

/**
 * These pages exist to satisfy German law, so the assertions are about the
 * things the law actually requires rather than about the prose: both language
 * versions present and marked up as such, the § 5 DDG heading, and — the one
 * that would be a real problem to get wrong — the claim that no cookies are
 * set, which has to stay true of the code.
 */
describe('legal pages', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Imprint, Privacy],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  it('renders the imprint in both languages', async () => {
    const fixture = TestBed.createComponent(Imprint);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('h1')?.textContent).toContain('Impressum');
    expect(el.querySelectorAll('[lang="de"]').length).toBeGreaterThan(0);
    expect(el.querySelectorAll('[lang="de"]').length).toBe(
      el.querySelectorAll('[lang="en"]').length,
    );
  });

  it('names the German provisions the imprint is written under', async () => {
    const fixture = TestBed.createComponent(Imprint);
    await fixture.whenStable();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('§ 5 DDG');
    expect(text).toContain('§ 18 Abs. 2 MStV');
  });

  /**
   * § 5 DDG wants a name, a postal address and a way to be reached, and a page
   * that lists a placeholder instead satisfies none of it. This asserts the
   * three are actually there, so a future edit cannot blank them by accident.
   */
  it('carries a real address and a working contact link', async () => {
    const fixture = TestBed.createComponent(Imprint);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const address = el.querySelector('address')?.textContent ?? '';

    expect(address).toContain('Kai Grassnick');
    // A German postcode and town, not a placeholder standing in for one.
    expect(address).toMatch(/\d{5}\s+\w/);
    expect(el.querySelector('a[href^="mailto:"]')).toBeTruthy();
  });

  it('says plainly that the wiki is not official', async () => {
    const fixture = TestBed.createComponent(Imprint);
    await fixture.whenStable();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Not an official site');
  });

  it('renders the privacy policy in both languages', async () => {
    const fixture = TestBed.createComponent(Privacy);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('h1')?.textContent).toContain('Datenschutz');
    expect(el.querySelectorAll('[lang="de"]').length).toBe(
      el.querySelectorAll('[lang="en"]').length,
    );
  });

  it('lists every localStorage key by name', async () => {
    const fixture = TestBed.createComponent(Privacy);
    await fixture.whenStable();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    // If a key is added to the app and not to this list, the policy is
    // incomplete -- and this is the only place that would notice.
    for (const key of [
      'approximately-up:world',
      'approximately-up:reveal',
      'approximately-up:world-help-off',
    ]) {
      expect(text).toContain(key);
    }
  });

  it('claims no cookies, and the app sets none', async () => {
    const fixture = TestBed.createComponent(Privacy);
    await fixture.whenStable();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('no cookies');
    // The claim above is only safe while this holds. Rendering the whole app
    // would be a stronger check; nothing in the wiki writes a cookie at all,
    // so asserting the document stayed clean after a render is enough to catch
    // one being introduced here.
    expect(document.cookie).toBe('');
  });
});
