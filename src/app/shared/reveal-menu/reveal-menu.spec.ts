import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { RevealMenu } from './reveal-menu';
import { REVEAL_KINDS, SpoilerService } from '../../core/spoiler.service';

const KEY = 'approximately-up:reveal';
const WORLD_KEY = 'approximately-up:world';

function setup() {
  localStorage.removeItem(KEY);
  return setup2();
}

/** setup() without clearing storage, for tests about what was restored. */
function setup2() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [RevealMenu] });
  const fixture: ComponentFixture<RevealMenu> = TestBed.createComponent(RevealMenu);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const q = <T extends Element>(sel: string) => el.querySelector(sel) as T | null;
  const boxes = () => [...el.querySelectorAll('.row input')] as HTMLInputElement[];
  /**
   * One switch, found by what it says rather than by where it sits. The order
   * of the rows is a presentation decision and has been changed once already;
   * a test that means "the planets switch" should say so.
   */
  const box = (label: string) => {
    const row = [...el.querySelectorAll('.row')].find(
      (r) => r.querySelector('.lbl')?.textContent?.trim() === label,
    );
    return row!.querySelector('input') as HTMLInputElement;
  };
  const click = (node: Element | null) => {
    (node as HTMLElement).click();
    fixture.detectChanges();
  };
  return {
    fixture,
    el,
    q,
    boxes,
    box,
    click,
    reveal: TestBed.inject(SpoilerService),
    trigger: () => q<HTMLButtonElement>('.trigger')!,
    warning: () => q<HTMLElement>('.warn'),
    open: () => click(q('.trigger')),
  };
}

describe('RevealMenu', () => {
  afterEach(() => localStorage.removeItem(KEY));

  /**
   * A first-time reader is looking at a deliberately thin wiki. The pulse is
   * how the wiki says there is a way out of that; once they have opened the
   * menu they have been told, whether or not they revealed anything.
   */
  it('pulses until the reader has opened it', () => {
    const s = setup();
    expect(s.trigger().classList).toContain('hint');

    s.open();
    expect(s.trigger().classList).not.toContain('hint');
  });

  /**
   * Not alphabetical and not arbitrary: the wiki's own section order. Pinned
   * because it is a deliberate choice that nothing else would notice losing.
   */
  it('lists the switches in the order the wiki reads', () => {
    const s = setup();
    s.open();
    const labels = [...s.el.querySelectorAll('.row .lbl')].map((n) => n.textContent?.trim());

    expect(labels).toEqual([
      'Show all components',
      'Show all planets',
      'Show all stations',
      'Show all missions',
      'Show everything',
    ]);
  });

  it('stays quiet for a reader who has opened it before', () => {
    localStorage.setItem(KEY, JSON.stringify({ opened: true }));
    const s = setup2();
    expect(s.trigger().classList).not.toContain('hint');
  });

  /**
   * A reader who loaded a save has found the better of the two routes. Selling
   * them the spoiler switches after that is noise.
   */
  it('stays quiet once a save is loaded', () => {
    localStorage.setItem(
      WORLD_KEY,
      JSON.stringify({
        _name: 'Test',
        _objectives: { m_Keys: [], m_Values: [] },
        _universeLocations: { m_Keys: [] },
      }),
    );
    const s = setup();
    expect(s.trigger().classList).not.toContain('hint');
    localStorage.removeItem(WORLD_KEY);
  });

  it('never pulses and reports at the same time', () => {
    const s = setup();
    s.reveal.set('planets', true);
    s.fixture.detectChanges();

    expect(s.trigger().classList).toContain('on');
    expect(s.trigger().classList).not.toContain('hint');
  });

  it('starts closed, and opens on the button', () => {
    const s = setup();
    expect(s.q('.panel')).toBeNull();
    expect(s.trigger().getAttribute('aria-expanded')).toBe('false');
    s.open();
    expect(s.q('.panel')).not.toBeNull();
    expect(s.trigger().getAttribute('aria-expanded')).toBe('true');
    // Every reveal kind, plus the "show everything" switch under them.
    expect(s.boxes().length).toBe(REVEAL_KINDS.length + 1);
  });

  it('holds the first reveal behind the warning rather than applying it', () => {
    const s = setup();
    s.open();
    s.click(s.box('Show all missions'));
    expect(s.warning()).not.toBeNull();
    expect(s.reveal.missions()).toBe(false);
    expect(s.reveal.acknowledged()).toBe(false);
  });

  it('applies the held toggle when the reader accepts', () => {
    const s = setup();
    s.open();
    s.click(s.box('Show all missions'));
    s.click(s.q('.warn .go'));
    expect(s.reveal.missions()).toBe(true);
    expect(s.reveal.acknowledged()).toBe(true);
    expect(s.warning()).toBeNull();
  });

  it('cancelling reveals nothing and leaves the warning unacknowledged', () => {
    const s = setup();
    s.open();
    s.click(s.box('Show all planets'));
    s.click(s.q('.warn button:not(.go)'));
    expect(s.reveal.any()).toBe(false);
    expect(s.reveal.acknowledged()).toBe(false);
    expect(s.warning()).toBeNull();
  });

  it('asks only once — a later toggle applies straight away', () => {
    const s = setup();
    s.open();
    s.click(s.box('Show all missions'));
    s.click(s.q('.warn .go'));
    s.click(s.box('Show all components'));
    expect(s.warning()).toBeNull();
    expect(s.reveal.components()).toBe(true);
  });

  it('turning a reveal back off never asks', () => {
    const s = setup();
    s.reveal.set('planets', true);
    s.reveal.ack();
    s.open();
    s.click(s.box('Show all planets'));
    expect(s.warning()).toBeNull();
    expect(s.reveal.planets()).toBe(false);
  });

  it('the last switch drives all of them, once accepted', () => {
    const s = setup();
    s.open();
    s.click(s.boxes().at(-1)!);
    s.click(s.q('.warn .go'));
    expect(s.reveal.all()).toBe(true);
    expect(s.boxes().every((b) => b.checked)).toBe(true);
  });

  it('counts what is revealed on the button', () => {
    const s = setup();
    s.reveal.set('planets', true);
    s.reveal.set('stations', true);
    s.fixture.detectChanges();
    expect(s.trigger().querySelector('.count')!.textContent!.trim()).toBe('2');
  });

  it('closes on Escape and on a click outside, dropping any held toggle', () => {
    const s = setup();
    s.open();
    s.click(s.box('Show all missions'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    s.fixture.detectChanges();
    expect(s.q('.panel')).toBeNull();
    expect(s.reveal.any()).toBe(false);

    s.open();
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    s.fixture.detectChanges();
    expect(s.q('.panel')).toBeNull();
  });
});
