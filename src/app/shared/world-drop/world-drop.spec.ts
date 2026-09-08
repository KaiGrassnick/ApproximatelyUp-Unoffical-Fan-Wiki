import { TestBed } from '@angular/core/testing';
import { WorldDrop, HELP_OFF_KEY } from './world-drop';
import { DataService } from '../../core/data.service';

/** A save file the wiki will accept. */
const SAVE = JSON.stringify({
  _name: 'Story-Welt',
  _objectives: { m_Keys: [1], m_Values: [{ _completed: 1 }] },
  _universeLocations: { m_Keys: [1] },
});

function saveFile(text = SAVE): File {
  return new File([text], 'Story-Welt.world', { type: 'application/json' });
}

const data = {
  planets: () => [],
  components: () => [],
  objectives: () => [],
  planetById: () => new Map(),
  planetByFullId: () => new Map(),
  objectiveByKey: () => new Map(),
  locationName: () => '',
} as unknown as DataService;

function setup() {
  TestBed.resetTestingModule();
  localStorage.removeItem('approximately-up:world');
  TestBed.configureTestingModule({
    imports: [WorldDrop],
    providers: [{ provide: DataService, useValue: data }],
  });
  const fixture = TestBed.createComponent(WorldDrop);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    drop: fixture.componentInstance,
    el,
    zone: () => el.querySelector('.drop') as HTMLButtonElement,
    help: () => el.querySelector('.help') as HTMLElement | null,
    input: () => el.querySelector('.file-input') as HTMLInputElement,
    detect: () => fixture.detectChanges(),
  };
}

afterEach(() => {
  localStorage.removeItem(HELP_OFF_KEY);
  localStorage.removeItem('approximately-up:world');
});

describe('WorldDrop attention hint', () => {
  afterEach(() => localStorage.removeItem('approximately-up:reveal'));

  /**
   * The drop zone is one of the two ways out of the wiki's default reticence,
   * and a first-time reader has no reason to know it exists.
   */
  it('pulses on a fresh visit', () => {
    const { zone } = setup();
    expect(zone().classList).toContain('hint');
  });

  /**
   * The other way out. Someone who has already dealt with the spoiler switches
   * has been told there is a choice here; pulsing at them as well is nagging.
   */
  it('stops once the reader has opened the spoiler menu', () => {
    localStorage.setItem('approximately-up:reveal', JSON.stringify({ opened: true }));
    const { zone } = setup();
    expect(zone().classList).not.toContain('hint');
  });
});

describe('WorldDrop save-location help', () => {
  it('shows no help until the reader asks for the picker', () => {
    const { help } = setup();
    expect(help()).toBeNull();
  });

  it('opens the help panel instead of going straight to the picker', () => {
    // The old markup was a <label> wrapping the input, so a click went
    // straight to the OS dialog with no chance to say where the file is.
    const { zone, help, detect } = setup();
    zone().click();
    detect();

    expect(help()).not.toBeNull();
  });

  it('names the folder the game keeps its worlds in', () => {
    const { zone, help, detect } = setup();
    zone().click();
    detect();

    const path = help()!.querySelector('code')!.textContent!;
    expect(path).toContain('AppData');
    expect(path).toContain('LocalLow');
    expect(path).toContain('ApproximatelyGames');
    expect(path).toContain('ApproximatelyUp');
    expect(path).toContain('Worlds');
  });

  it("reaches the file input from the panel's own button", () => {
    const { zone, help, input, detect } = setup();
    zone().click();
    detect();

    let opened = 0;
    input().click = () => {
      opened++;
    };
    (help()!.querySelector('.choose') as HTMLButtonElement).click();

    expect(opened).toBe(1);
  });

  it('closes the panel without loading anything', () => {
    const { zone, help, drop, detect } = setup();
    zone().click();
    detect();
    (help()!.querySelector('.close') as HTMLButtonElement).click();
    detect();

    expect(help()).toBeNull();
    expect(drop.world.hasWorld()).toBe(false);
  });

  /**
   * A panel that hangs off a control in the header is dismissed the way every
   * other one is: by looking away from it. Without this the only ways out are
   * the × and a key, and neither is where the reader's mouse already is.
   */
  it('closes the panel when the reader clicks away from it', () => {
    const { zone, help, detect } = setup();
    zone().click();
    detect();

    document.body.click();
    detect();

    expect(help()).toBeNull();
  });

  // The zone is inside the host, so the click-away handler deliberately skips
  // it; pressing it again has to close the panel itself or it does nothing.
  it('closes the panel when the reader presses the drop zone again', () => {
    const { zone, help, detect } = setup();
    zone().click();
    detect();

    zone().click();
    detect();

    expect(help()).toBeNull();
  });

  it('stays open while the reader is clicking inside it', () => {
    const { zone, help, detect } = setup();
    zone().click();
    detect();

    (help()!.querySelector('.path code') as HTMLElement).click();
    detect();

    expect(help()).not.toBeNull();
  });

  // Escape is a whole-document key, and the panel does not take focus when it
  // opens -- so binding it to the panel itself only worked once the reader had
  // tabbed into it.
  it('closes the panel on Escape without it having been focused first', () => {
    const { zone, help, detect } = setup();
    zone().click();
    detect();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    detect();

    expect(help()).toBeNull();
  });

  it('closes the panel on Escape', () => {
    const { zone, help, el, detect } = setup();
    zone().click();
    detect();
    el.querySelector('.help')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    detect();

    expect(help()).toBeNull();
  });
});

describe('WorldDrop "don\'t show this again"', () => {
  it('remembers the choice past this page view', () => {
    const { zone, help, detect } = setup();
    zone().click();
    detect();
    (help()!.querySelector('.again input') as HTMLInputElement).click();
    detect();

    expect(localStorage.getItem(HELP_OFF_KEY)).toBe('1');
  });

  it('goes straight to the picker once the reader has turned it off', () => {
    localStorage.setItem(HELP_OFF_KEY, '1');
    const { zone, help, input, detect } = setup();

    let opened = 0;
    input().click = () => {
      opened++;
    };
    zone().click();
    detect();

    expect(help()).toBeNull();
    expect(opened).toBe(1);
  });

  it('brings the panel back when the reader unticks it', () => {
    const { zone, help, detect } = setup();
    zone().click();
    detect();
    const box = () => help()!.querySelector('.again input') as HTMLInputElement;
    box().click();
    detect();
    box().click();
    detect();

    expect(localStorage.getItem(HELP_OFF_KEY)).toBeNull();
  });

  it('survives a browser that refuses localStorage', () => {
    // Private browsing throws on read. The panel is a convenience; refusing
    // to render the drop zone at all because of it would not be.
    const real = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('denied');
    };
    try {
      const { zone, help, detect } = setup();
      zone().click();
      detect();
      expect(help()).not.toBeNull();
    } finally {
      Storage.prototype.getItem = real;
    }
  });
});

describe('WorldDrop loading a save', () => {
  it('loads a dropped file without ever showing the panel', async () => {
    // Dragging the file in proves the reader already found it.
    const { el, drop, help, detect } = setup();
    // jsdom implements neither DataTransfer nor DragEvent, so the payload is
    // hung on a plain event — onDrop only ever reads dataTransfer.files[0].
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { files: [saveFile()] } });
    el.querySelector('.drop')!.dispatchEvent(event);
    await new Promise((r) => setTimeout(r));
    detect();

    expect(drop.world.hasWorld()).toBe(true);
    expect(help()).toBeNull();
  });

  it("shows the world's name and a way out once one is loaded", async () => {
    const { el, drop, detect } = setup();
    await drop['read'](saveFile());
    detect();

    expect(el.querySelector('.loaded strong')!.textContent).toContain('Story-Welt');
    expect(el.querySelector('.drop')).toBeNull();
  });

  it('reports a file that is not a save, and keeps the drop zone', async () => {
    const { el, drop, detect } = setup();
    await drop['read'](saveFile('{"hello":1}'));
    detect();

    expect(el.querySelector('.err')!.textContent).toMatch(/not a .world save/);
    expect(el.querySelector('.drop')).not.toBeNull();
  });
});

describe('WorldDrop file checks', () => {
  const named = (name: string, size = 100) =>
    new File(['x'.repeat(size)], name, { type: 'application/json' });

  it('refuses a file that is not named .world, without reading it', async () => {
    const { drop, detect, el } = setup();
    await drop['read'](named('screenshot.png'));
    detect();

    expect(el.querySelector('.err')!.textContent).toMatch(/not a \.world save/);
    expect(drop.world.hasWorld()).toBe(false);
  });

  it('does not care how the extension is capitalised', async () => {
    const { drop } = setup();
    await drop['read'](new File([SAVE], 'Story-Welt.WORLD'));
    expect(drop.world.hasWorld()).toBe(true);
  });

  it('refuses a file far too large to be a save', async () => {
    // Real saves run under 4 KB; the cap is generous by orders of magnitude.
    const { drop, detect, el } = setup();
    await drop['read'](named('huge.world', 1024 * 1024 + 1));
    detect();

    expect(el.querySelector('.err')!.textContent).toMatch(/too large/);
    expect(drop.world.hasWorld()).toBe(false);
  });
});
