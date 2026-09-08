import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Router, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Circuits } from './circuits';
import { routes } from '../../app.routes';
import { CircuitIndexEntry } from '../../core/circuits.service';
import { Comp, Objective } from '../../core/models';
import { SpoilerService } from '../../core/spoiler.service';

const stats = {
  mass: 25,
  power: 0,
  parts: { Abs: 2 },
  pools: { MathBlock: 2, DataCable: 6 },
  cableCells: { data: 6, power: 0, nano: 0, plasma: 0 },
};

const INDEX: CircuitIndexEntry[] = [
  {
    id: 'simple',
    title: 'A simple one',
    summary: 'Two blocks',
    spoiler: 'none',
    updated: '2026-09-07',
    stats,
    needs: { MathBlock: 2, DataCable: 6 },
    newGame: true,
  },
  {
    id: 'big',
    title: 'A big one',
    summary: 'Needs 40 blocks',
    spoiler: 'components',
    updated: '2026-09-07',
    stats,
    needs: { MathBlock: 40, WirelessTransmitter: 2 },
    newGame: false,
  },
];

const DETAIL = {
  id: 'simple',
  source: {
    title: 'A simple one',
    summary: 'Two blocks',
    spoiler: 'none',
    updated: '2026-09-07',
    order: 100,
    view: 'top',
    parts: [],
    wires: [],
    notes: [],
  },
  placed: { parts: [], cables: [] },
  stats,
  needs: { MathBlock: 2, DataCable: 6 },
  findings: [{ level: 'warn', where: 'b:in', message: 'not connected' }],
  newGame: true,
  bom: [{ id: 'Abs', count: 2 }],
  notesHtml: '<p>Some <strong>notes</strong>.</p>\n<p><a href="/components/Abs">Abs</a></p>\n',
};

/**
 * A part with a pool of its own: `WirelessTransmitter` is both a component id
 * and, because it belongs to no build group, the name of the pool a circuit
 * needing one is short of.
 */
const TRANSMITTER: Comp = {
  id: 'WirelessTransmitter',
  prefab: 'WirelessTransmitter',
  name: 'Wireless Transmitter',
  desc: 'Sends a signal without a cable.',
  ports: [],
  in_build: true,
  class: 'Signal',
  stats: {},
};

/**
 * The objective that hands the transmitter over. `start` is left empty on
 * purpose: locationName('') is '', so gateOf() prints the bare title and the
 * test needs no planets.
 */
const UNLOCKS_TRANSMITTER: Objective = {
  id: 7,
  key: 'signal-relay',
  type: 'Package',
  hidden: false,
  start: '',
  end: '',
  requires_components: [],
  reward: [{ component: 'WirelessTransmitter', amount: 2 }],
  dependencies: [],
  title: 'A Signal From Far Away',
  obj: '',
  desc: '',
  hints: '',
} as unknown as Objective;

/** A save that has been nowhere and done nothing: every part is still locked. */
function loadEmptySave() {
  localStorage.setItem(
    'approximately-up:world',
    JSON.stringify({
      _name: 'test world',
      _objectives: { m_Keys: [], m_Values: [] },
      _universeLocations: { m_Keys: [] },
    }),
  );
}

describe('Circuits', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [Circuits],
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => localStorage.clear());

  async function settle(fixture: { detectChanges(): void }) {
    for (let i = 0; i < 3; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
  }

  /**
   * The components request answers with nothing unless a test says otherwise,
   * so no part is "unlocked"; this is the switch that lets a page name them.
   */
  function reveal() {
    TestBed.inject(SpoilerService).set('components', true);
  }

  /** Renders at a route id; answers the index and, for an id, the detail; ignores data/*.json the services fetch. */
  async function render(id?: string, comps: Comp[] = [], objs: Objective[] = []) {
    const fixture = TestBed.createComponent(Circuits);
    if (id) fixture.componentRef.setInput('id', id);
    fixture.detectChanges();
    http.expectOne((r) => r.url.startsWith('data/circuits.json')).flush(INDEX);
    await settle(fixture);
    if (id) {
      const req = http.match((r) => r.url.startsWith(`data/circuits/${id}.json`));
      if (req.length) req[0].flush(DETAIL);
      await settle(fixture);
    }
    http.match((r) => r.url.startsWith('data/components_full.json')).forEach((r) => r.flush(comps));
    http.match((r) => r.url.startsWith('data/objectives.json')).forEach((r) => r.flush(objs));
    await settle(fixture);
    http.match(() => true).forEach((r) => r.flush([]));
    await settle(fixture);
    return fixture;
  }
  const text = (f: { nativeElement: HTMLElement }, sel: string) =>
    Array.from(f.nativeElement.querySelectorAll(sel)).map((n) => n.textContent?.trim());

  it('lists every circuit with its new-game note', async () => {
    const fixture = await render();
    expect(text(fixture, '.list .t')).toEqual(['A simple one', 'A big one']);
    expect(text(fixture, '.list .gated')).toEqual(['Spoilers: components']);
  });

  it('shows the picture, the numbers and the bill of materials for one circuit', async () => {
    reveal();
    const fixture = await render('simple');
    const el = fixture.nativeElement as HTMLElement;
    const img = el.querySelector<HTMLImageElement>('img.circuit');
    expect(img?.getAttribute('src')).toContain('data/circuits/simple.svg');
    expect(img?.getAttribute('alt')).toContain('A simple one');
    expect(el.querySelector('.stats')?.textContent).toContain('25');
    expect(text(fixture, '.bom li')).toEqual(['Abs ×2']);
    expect(el.querySelector('.notes')?.innerHTML).toContain('<strong>notes</strong>');
  });

  // The mesh file is 220 kB. A reader who never asks for the 3D view should
  // never fetch it, so the request is the thing under test as much as the
  // scene it feeds.
  it('offers 3D once the circuit has loaded, and fetches the meshes only then', async () => {
    const fixture = await render('simple');
    const el = fixture.nativeElement as HTMLElement;
    const button = el.querySelector<HTMLButtonElement>('button.view3d');
    expect(button).not.toBeNull();
    expect(button!.disabled).toBe(false);
    expect(button!.textContent?.trim()).toBe('3D');
    http.expectNone((r) => r.url.startsWith('data/circuit-meshes.json'));

    button!.click();
    await settle(fixture);
    http
      .expectOne((r) => r.url.startsWith('data/circuit-meshes.json'))
      .flush({ cell: 0.125, meshes: {}, parts: {} });
    await settle(fixture);

    expect(el.querySelector('circuit-3d')).not.toBeNull();
    expect(el.querySelector('img.circuit')).toBeNull();
    expect(el.querySelector('button.view3d')?.getAttribute('aria-pressed')).toBe('true');
    // The control keeps its name while pressed: aria-pressed is the state.
    expect(el.querySelector('button.view3d')?.textContent?.trim()).toBe('3D');
  });

  // 220 kB takes a moment on a slow line, and a page that blanked the picture
  // for it would be worse than the one that waits.
  it('keeps the picture while the meshes load', async () => {
    const fixture = await render('simple');
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('button.view3d')!.click();
    await settle(fixture);

    expect(el.querySelector('img.circuit')).not.toBeNull();
    expect(el.querySelector('.viewbar')?.textContent).toContain('loading 3D');
  });

  it('turns back to the picture', async () => {
    const fixture = await render('simple');
    const el = fixture.nativeElement as HTMLElement;
    const button = el.querySelector<HTMLButtonElement>('button.view3d')!;
    button.click();
    await settle(fixture);
    http
      .expectOne((r) => r.url.startsWith('data/circuit-meshes.json'))
      .flush({ cell: 0.125, meshes: {}, parts: {} });
    await settle(fixture);

    el.querySelector<HTMLButtonElement>('button.view3d')!.click();
    await settle(fixture);
    expect(el.querySelector('circuit-3d')).toBeNull();
    expect(el.querySelector('img.circuit')).not.toBeNull();
    expect(el.querySelector('button.view3d')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('says a circuit is buildable in a new game, and what the whole game allows', async () => {
    const fixture = await render('simple');
    expect(text(fixture, '.pills status-pill')).toEqual(['new game', 'everything unlocked']);
  });

  it('says what is short for one that is not', async () => {
    const fixture = await render('big');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.pills')?.textContent).toContain('not a new game');
    expect(el.querySelector('.short')?.textContent).toContain('MathBlock');
  });

  // With the reveal off and no save loaded, nothing is unlocked, and a page
  // that named the parts of a circuit anyway would give away what the game
  // has not handed the reader yet.
  it('stands in for a part the reader has not unlocked', async () => {
    const fixture = await render('simple');
    const el = fixture.nativeElement as HTMLElement;
    expect(text(fixture, '.bom li')).toEqual(['a part you have not unlocked ×2']);
    expect(el.querySelector('.bom a[href^="/components/"]')).toBeNull();
  });

  // A shortfall is counted per pool, and an ungrouped part's pool is that
  // part's own id -- so the list of what is missing is a place a part's name
  // can leak out. A group id (MathBlock) is a build-menu term and stays.
  it('names an ungrouped part in the shortfall list as carefully as anywhere else', async () => {
    const fixture = await render('big', [TRANSMITTER]);
    const short = (fixture.nativeElement as HTMLElement).querySelector('.short');
    expect(short?.textContent).toContain('a part you have not unlocked: 2');
    expect(short?.textContent).toContain('MathBlock: 40');
    expect(short?.textContent).not.toContain('WirelessTransmitter');
  });

  // Being told "you are two short" of a part is only half an answer; the
  // other half is where the game hands them out.
  it('names the objective that unlocks a part the save is short of', async () => {
    loadEmptySave();
    reveal();
    const fixture = await render('big', [TRANSMITTER], [UNLOCKS_TRANSMITTER]);
    const lines = text(fixture, '.short li');
    expect(lines.some((l) => l?.includes('A Signal From Far Away'))).toBe(true);
    expect(lines.find((l) => l?.includes('Wireless Transmitter'))).toContain(
      'unlocked by A Signal From Far Away',
    );
    // A group pool is filled by any of its members, so it has no one unlock.
    expect(lines.find((l) => l?.startsWith('MathBlock'))).not.toContain('unlocked by');
  });

  // The mission is as much of a giveaway as the part: "unlocked by A Signal
  // From Far Away" tells a reader with the reveal off exactly what the
  // stand-in text is there to withhold.
  it('says nothing about the mission when the part itself is stood in for', async () => {
    loadEmptySave();
    const fixture = await render('big', [TRANSMITTER], [UNLOCKS_TRANSMITTER]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.short')?.textContent).toContain('a part you have not unlocked');
    expect(el.textContent).not.toContain('unlocked by');
    expect(el.textContent).not.toContain('A Signal From Far Away');
  });

  // A note's cross-reference is a plain anchor out of Markdown; followed by
  // the browser it would reload the whole application to reach a page it
  // already has.
  it('follows a link in the notes through the router', async () => {
    const fixture = await render('simple');
    const router = TestBed.inject(Router);
    const go = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const link = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      '.notes a[href="/components/Abs"]',
    );
    expect(link).not.toBeNull();
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    link!.dispatchEvent(event);
    expect(go).toHaveBeenCalledWith('/components/Abs');
    expect(event.defaultPrevented).toBe(true);
  });

  it('shows the warnings the build kept', async () => {
    const fixture = await render('simple');
    expect(text(fixture, '.findings li')).toEqual(['b:in: not connected']);
  });

  // A circuit's address is only an address if a route answers it; a route
  // that lazy loads the wrong symbol fails at run time rather than at build
  // time, so both routes are checked against the component itself.
  it('is reachable at /circuits and /circuits/:id', async () => {
    for (const path of ['circuits', 'circuits/:id']) {
      const route = routes.find((r) => r.path === path);
      expect(route?.title).toBe('Circuits — Approximately Up');
      await expect(route!.loadComponent!()).resolves.toBe(Circuits);
    }
  });

  it('says so for an id that is not a circuit', async () => {
    const fixture = await render('nope');
    expect((fixture.nativeElement as HTMLElement).querySelector('.empty h2')?.textContent).toBe(
      'No such circuit',
    );
  });
});
