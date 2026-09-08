import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('shows the footer on every page, so the imprint is always reachable', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('site-footer a[href="/imprint"]')).toBeTruthy();
  });

  /**
   * The guides list sticks below the header and needs its height to do it.
   * jsdom lays nothing out, so the value here is 0px -- what this catches is
   * the wiring being removed, which in a browser drops the list under the
   * header with nothing failing.
   */
  it('publishes the header height for sticky elements below it', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    expect(document.documentElement.style.getPropertyValue('--header-h')).toMatch(/^\d+px$/);
  });

  it('should render the nav shell', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.brand')?.textContent).toContain('APPROXIMATELY');
  });
});
