import { TestBed } from '@angular/core/testing';
import { computed } from '@angular/core';
import { StatTable } from './stat-table';
import { DataService } from '../../core/data.service';
import { StatLabel } from '../../core/models';
import labelsJson from '../../../../data/stat_labels.json';

const labels = labelsJson as unknown as Record<string, StatLabel>;

function setup(stats: Record<string, string | number | boolean>) {
  TestBed.configureTestingModule({
    imports: [StatTable],
    providers: [{ provide: DataService, useValue: { statLabels: computed(() => labels) } }],
  });
  const fixture = TestBed.createComponent(StatTable);
  fixture.componentRef.setInput('stats', stats);
  fixture.detectChanges();
  const cell = (sel: string) =>
    [...fixture.nativeElement.querySelectorAll(sel)].map((el) =>
      (el as HTMLElement).textContent!.trim(),
    );
  return { fixture, table: fixture.componentInstance, cell };
}

describe('StatTable', () => {
  it("uses the game's own name and unit for a stat the game names", () => {
    const { cell } = setup({ _powerConsumptionPerSec: 12 });
    expect(cell('th')).toEqual(['Power consumption']);
    expect(cell('td')).toEqual(['12 P/s']);
  });

  it('shows mass, which the wiki used to hide', () => {
    const { cell } = setup({ _mass: 25 });
    expect(cell('th')).toEqual(['Mass']);
    expect(cell('td')).toEqual(['25']);
  });

  it('does not show max temperature, a material class rather than a figure', () => {
    const { table } = setup({ _maxTemperature: 'Iron (1)', _mass: 25 });
    expect(table.rows().map((r) => r.field)).toEqual(['_mass']);
  });

  it('names all three axes of a vector off the base field', () => {
    // The game labels `_maxForce`, not `_maxForce.y` — without the fallback
    // one axis would be named and the other two left raw.
    const { cell } = setup({ '_maxForce.x': 1, '_maxForce.y': -1300000, '_maxForce.z': 3 });
    expect(cell('th')).toEqual(['Max force x', 'Max force y', 'Max force z']);
  });

  it('drops a stat the game has no name for', () => {
    // The prefab carries far more than the game shows a player; printing the
    // raw field names made the table longer, not more useful.
    const { table } = setup({
      '_soFaceXPlus.x': 1,
      _acceleratorSpeed: 4,
      _gimbalLinear: 0.45,
      _mass: 25,
    });
    expect(table.rows().map((r) => r.field)).toEqual(['_mass']);
  });

  it('keeps the prefab field reachable on the row it does show', () => {
    const { fixture } = setup({ _mass: 25 });
    expect((fixture.nativeElement.querySelector('th') as HTMLElement).getAttribute('title')).toBe(
      '_mass',
    );
  });

  it('renders nothing at all for a part the game names no stat of', () => {
    const { fixture, table } = setup({ '_soFaceXPlus.x': 1, _acceleratorSpeed: 4 });
    expect(table.rows()).toEqual([]);
    expect(fixture.nativeElement.querySelectorAll('tr').length).toBe(0);
  });

  it('drops a unit it cannot state honestly', () => {
    // `_absorption` is a 0..1 fraction the game prints as a percentage.
    // "0.93%" would be wrong and scaling it is unverified, so the label is
    // kept and the unit is not.
    const { cell } = setup({ _absorption: 0.93 });
    expect(cell('th')).toEqual(['Impact absorption']);
    expect(cell('td')).toEqual(['0.93']);
  });

  it('still hides the fields that are not stats at all', () => {
    const { table } = setup({ _categories: 'Math (64)', _lightColor: 'x', _mass: 1 });
    expect(table.rows().map((r) => r.field)).toEqual(['_mass']);
  });

  describe('welded frames', () => {
    // `_faceSetupData` is the per-face geometry welding works on, and it is
    // what identifies a weldable frame — not the English in the description.
    const FRAME = { _mass: 25, '_faceSetupData.count': 6 };

    it('adds the welded mass under the mass it comes from', () => {
      const { cell } = setup(FRAME);
      expect(cell('th')).toEqual(['Mass', 'Mass fully welded†']);
      expect(cell('td')).toEqual(['25', '50']);
    });

    it('marks it as derived and says why, once', () => {
      const { fixture, table } = setup(FRAME);
      const derived = table.rows().filter((r) => r.derived);
      expect(derived.map((r) => r.field)).toEqual(['_mass.welded']);

      const notes = fixture.nativeElement.querySelectorAll('.footnote');
      expect(notes.length).toBe(1);
      expect(notes[0].textContent).toContain('Not an extracted value');
      expect(fixture.nativeElement.querySelectorAll('tr.derived').length).toBe(1);
    });

    it('leaves a part with no face data alone', () => {
      const { fixture, table } = setup({ _mass: 25 });
      expect(table.rows().map((r) => r.field)).toEqual(['_mass']);
      expect(fixture.nativeElement.querySelector('.footnote')).toBeNull();
    });
  });

  it('sorts by the name the reader sees', () => {
    const { cell } = setup({ _mass: 1, _fuelCapacity: 2, _powerConsumptionPerSec: 3 });
    expect(cell('th')).toEqual(['Fuel capacity', 'Mass', 'Power consumption']);
  });
});
