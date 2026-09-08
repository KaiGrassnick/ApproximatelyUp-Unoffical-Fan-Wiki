import { TestBed } from '@angular/core/testing';
import { LimitedView } from './limited-view';
import { SpoilerService } from '../../core/spoiler.service';
import { DataService } from '../../core/data.service';

const REVEAL_KEY = 'approximately-up:reveal';
const WORLD_KEY = 'approximately-up:world';

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
  TestBed.configureTestingModule({
    imports: [LimitedView],
    providers: [{ provide: DataService, useValue: data }],
  });
  const fixture = TestBed.createComponent(LimitedView);
  fixture.detectChanges();
  return {
    fixture,
    reveal: TestBed.inject(SpoilerService),
    notice: () => (fixture.nativeElement as HTMLElement).querySelector('.notice'),
    detect: () => fixture.detectChanges(),
  };
}

describe('LimitedView', () => {
  beforeEach(() => {
    localStorage.removeItem(REVEAL_KEY);
    localStorage.removeItem(WORLD_KEY);
  });
  afterEach(() => {
    localStorage.removeItem(REVEAL_KEY);
    localStorage.removeItem(WORLD_KEY);
  });

  it('explains the limited view on a fresh visit', () => {
    const s = setup();
    const text = s.notice()?.textContent ?? '';

    expect(s.notice()).toBeTruthy();
    expect(text).toContain('You are seeing a new game');
    // Both ways out, or the notice states a problem and no remedy.
    expect(text).toContain('.world');
    expect(text).toContain('Spoilers');
  });

  /**
   * Not on the first interaction. Opening the spoiler menu and closing it
   * again stops the controls pulsing, because the reader has been shown them
   * -- but the view is still limited, and a notice that described the view
   * would be lying if it left at that point.
   */
  it('stays until a switch is actually turned on', () => {
    const s = setup();
    s.reveal.markSeen();
    s.detect();
    expect(s.notice()).toBeTruthy();

    s.reveal.set('planets', true);
    s.detect();
    expect(s.notice()).toBeNull();
  });

  it('is gone for a reader with a save loaded', () => {
    localStorage.setItem(
      WORLD_KEY,
      JSON.stringify({
        _name: 'Test',
        _objectives: { m_Keys: [], m_Values: [] },
        _universeLocations: { m_Keys: [] },
      }),
    );
    const s = setup();
    expect(s.notice()).toBeNull();
  });
});
