import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { SpoilerService } from './spoiler.service';

const KEY = 'approximately-up:reveal';

function service(): SpoilerService {
  TestBed.resetTestingModule();
  return TestBed.inject(SpoilerService);
}

describe('SpoilerService', () => {
  beforeEach(() => localStorage.removeItem(KEY));
  afterEach(() => localStorage.removeItem(KEY));

  it('reveals nothing until asked, and has not shown the warning', () => {
    const s = service();
    expect(s.missions()).toBe(false);
    expect(s.components()).toBe(false);
    expect(s.planets()).toBe(false);
    expect(s.stations()).toBe(false);
    expect(s.any()).toBe(false);
    expect(s.all()).toBe(false);
    expect(s.acknowledged()).toBe(false);
  });

  it('turns one flag on without touching the others', () => {
    const s = service();
    s.set('missions', true);
    expect(s.missions()).toBe(true);
    expect(s.planets()).toBe(false);
    expect(s.any()).toBe(true);
    expect(s.all()).toBe(false);
  });

  it('setAll drives every flag, and all() follows the four', () => {
    const s = service();
    s.setAll(true);
    expect(s.all()).toBe(true);
    s.set('stations', false);
    expect(s.all()).toBe(false);
    expect(s.any()).toBe(true);
    s.setAll(false);
    expect(s.any()).toBe(false);
  });

  it('survives a reload — flags and the acknowledgement both', () => {
    const first = service();
    first.set('planets', true);
    first.ack();

    const second = service();
    expect(second.planets()).toBe(true);
    expect(second.missions()).toBe(false);
    expect(second.acknowledged()).toBe(true);
  });

  it('ignores stored junk rather than throwing on it', () => {
    localStorage.setItem(KEY, 'not json');
    expect(service().any()).toBe(false);
  });

  it('still works this session when the store refuses to write', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    try {
      const s = service();
      s.set('components', true);
      expect(s.components()).toBe(true);
      expect(setItem).toHaveBeenCalled();
    } finally {
      setItem.mockRestore();
    }
  });
});
