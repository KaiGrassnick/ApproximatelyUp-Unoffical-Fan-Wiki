import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Guides } from './guides';
import { routes } from '../../app.routes';
import { SpoilerService } from '../../core/spoiler.service';
import { Guide } from '../../core/guides.service';

const INDEX: Guide[] = [
  {
    id: 'open',
    title: 'An open guide',
    summary: 'Safe to read',
    spoiler: 'none',
    updated: '2026-01-01',
  },
  {
    id: 'spoils',
    title: 'A spoilery guide',
    summary: 'Gives away missions',
    spoiler: 'missions',
    updated: '2026-01-02',
  },
];

describe('Guides', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [Guides],
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => localStorage.clear());

  /**
   * Renders the page at a given route id and answers the index request.
   *
   * Deliberately no `whenStable()` while a request is outstanding: with
   * httpResource that waits for the very request the test is about to answer,
   * and the test times out instead of failing. Flush first, settle after.
   */
  async function render(id?: string) {
    const fixture = TestBed.createComponent(Guides);
    if (id) fixture.componentRef.setInput('id', id);
    fixture.detectChanges();
    http.expectOne((r) => r.url.startsWith('data/guides.json')).flush(INDEX);
    await settle(fixture);
    return fixture;
  }

  /** Let the resource's signals and effects catch up, without waiting on HTTP. */
  async function settle(fixture: { detectChanges(): void }) {
    for (let i = 0; i < 3; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
  }

  it('lists every guide, whatever it gives away', async () => {
    const fixture = await render();
    const titles = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.list .t'),
    ).map((n) => n.textContent?.trim());

    expect(titles).toEqual(['An open guide', 'A spoilery guide']);
  });

  /**
   * The way out of the section for someone who wants a guide that is not here.
   * It points at the same form the feedback bubble's "Add new content" opens.
   */
  it('offers a way to ask for a guide', async () => {
    const fixture = await render();
    const add = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      '.list .add',
    );

    expect(add?.textContent?.trim()).toBe('Add guide');
    expect(new URL(add!.href).searchParams.get('template')).toBe('content.yml');
    expect(add?.target).toBe('_blank');
    expect(add?.rel).toContain('noopener');
  });

  it('shows nothing but an invitation until a guide is chosen', async () => {
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.prose')).toBeFalsy();
    expect(el.querySelector('.empty')?.textContent).toContain('Pick one from the list');
  });

  it('renders the body of an open guide', async () => {
    const fixture = await render('open');
    http.expectOne((r) => r.url.startsWith('data/guides/open.html')).flush('<p>The body.</p>');
    await settle(fixture);

    expect((fixture.nativeElement as HTMLElement).querySelector('.prose')?.textContent).toContain(
      'The body.',
    );
  });

  /**
   * Guides are not gated. Everything else on the site reasons from a new game
   * and waits for a switch, because a list that shows everything spoils the
   * game to anyone who glances at it. A guide is reached by choosing its title
   * off a list that says what it gives away, so the choice a switch exists to
   * ask for has already been made — and prose held back half-read is worse
   * than prose nobody opened.
   */
  it('renders a spoilery guide with no switch turned on', async () => {
    const reveal = TestBed.inject(SpoilerService);
    expect(reveal.any()).toBe(false);

    const fixture = await render('spoils');
    http.expectOne((r) => r.url.startsWith('data/guides/spoils.html')).flush('<p>Spoilers.</p>');
    await settle(fixture);

    expect((fixture.nativeElement as HTMLElement).querySelector('.prose')?.textContent).toContain(
      'Spoilers.',
    );
  });

  /**
   * The warning the gate used to be. It has to appear on the guide itself as
   * well as in the list, because a reader can arrive by link and never see the
   * list entry.
   */
  it('says what a guide gives away, in the list and on the guide', async () => {
    const fixture = await render('spoils');
    http.expectOne((r) => r.url.startsWith('data/guides/spoils.html')).flush('<p>Spoilers.</p>');
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.list .gated')?.textContent).toContain('missions');
    expect(el.querySelector('.reader .gives')?.textContent).toContain('missions');
  });

  /** A guide that gives nothing away is not labelled as though it did. */
  it('says nothing for a guide that spoils nothing', async () => {
    const fixture = await render('open');
    http.expectOne((r) => r.url.startsWith('data/guides/open.html')).flush('<p>The body.</p>');
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.reader .gives')).toBeFalsy();
    expect(el.querySelectorAll('.list .gated').length).toBe(1);
  });

  it('says so for an id that is not a guide', async () => {
    const fixture = await render('nope');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No such guide');
  });

  afterEach(() => http.verify());
});
