import {
  flatten,
  useful,
  cosmetic,
  resolveText,
  fmtValue,
  CATEGORIES,
  categoriesOf,
  isWeldable,
} from './stats';
import comps from '../../../data/components_full.json';

describe('stats', () => {
  it('expands vectors into x/y/z keys', () => {
    expect(flatten({ _bounds: { x: 1, y: 2, z: 3 } })).toEqual({
      '_bounds.x': 1,
      '_bounds.y': 2,
      '_bounds.z': 3,
    });
  });

  it('collapses lists to a count', () => {
    expect(flatten({ _electricPorts: [{}, {}] })).toEqual({ '_electricPorts.count': 2 });
  });

  it('recurses into nested objects', () => {
    expect(flatten({ _ocean: { _buoyancy: 0.7 } })).toEqual({ '_ocean._buoyancy': 0.7 });
  });

  it('does not mistake a key that merely contains x/y/z/w characters for a vector', () => {
    // '_weird.xy' is not a vector key even though 'xy' is a substring of
    // 'xyzw' -- vector detection must check exact single-character
    // membership, matching the Python's set(v) <= {"x","y","z","w"}, not
    // substring containment. Nesting an object one level under 'xy' makes
    // the divergence observable: the substring-containment bug takes the
    // vector branch and hoists the raw nested object in unflattened,
    // instead of recursing into it and producing a dotted key.
    expect(flatten({ _weird: { xy: { z: 1 } } })).toEqual({ '_weird.xy.z': 1 });
  });

  it('treats light, particle and collider fields as cosmetic', () => {
    expect(cosmetic('_lightColor')).toBe(true);
    expect(cosmetic('_particleSetup')).toBe(true);
    expect(cosmetic('_maxForce')).toBe(false);
  });

  it('hides skipped and cosmetic keys from the stat table', () => {
    expect(useful('_maxForce')).toBe(true);
    // Mass and max temperature are shown now: the game labels both in its own
    // inventory panel, so hiding them made the wiki the poorer of the two.
    expect(useful('_mass')).toBe(true);
    expect(useful('_maxTemperature')).toBe(false);
    expect(useful('_categories')).toBe(false);
    expect(useful('_bounds.x')).toBe(false);
    expect(useful('_scGroup')).toBe(false);
    expect(useful('_lightColor')).toBe(false);
  });

  it('fills a single power placeholder from the matching field', () => {
    expect(resolveText('Uses {0} P/s', { _powerConsumptionPerSec: 12 })).toBe('Uses 12 P/s');
    expect(resolveText('Generates {0} P/s', { _maxPowerGenerationPerSec: 3.5 })).toBe(
      'Generates 3.5 P/s',
    );
  });

  it('leaves the placeholder alone when the mapping is not certain', () => {
    expect(resolveText('Holds {0} litres', { _powerConsumptionPerSec: 12 })).toBe(
      'Holds {0} litres',
    );
    expect(resolveText('Uses {0} P/s and {0} more', { _powerConsumptionPerSec: 12 })).toBe(
      'Uses {0} P/s and {0} more',
    );
    expect(resolveText('Uses {0} P/s', {})).toBe('Uses {0} P/s');
  });
});

describe('fmtValue', () => {
  it('formats a non-integer float to 6 significant figures, trailing zeros stripped', () => {
    expect(fmtValue(0.699999988079071)).toBe('0.7');
  });

  it('formats an integer-valued float as a plain integer, no trailing .0', () => {
    expect(fmtValue(5.0)).toBe('5');
  });

  it('renders large magnitudes in plain digits rather than switching to exponential notation', () => {
    expect(fmtValue(-1300000)).toBe('-1300000');
  });

  it('renders booleans as lowercase true/false', () => {
    expect(fmtValue(true)).toBe('true');
    expect(fmtValue(false)).toBe('false');
  });
});

describe('categoriesOf', () => {
  it('reads a single build-menu category off the decoded flags string', () => {
    expect(categoriesOf({ _categories: 'Math (64)' })).toEqual(['Math']);
  });

  it('returns every category of a component that lives in several tabs', () => {
    expect(categoriesOf({ _categories: 'Frame|Glass (33)' })).toEqual(['Frame', 'Glass']);
  });

  it('orders the result the way the game orders its tabs, not the way the string does', () => {
    // "Electronics|Thrusters" and "Fuel|Objectives|Thrusters" already read in
    // enum order, so a same-order-as-input bug would pass on real data.
    // Feed the names back to front to make the reordering observable.
    expect(categoriesOf({ _categories: 'Thrusters|Electronics|Frame (131)' })).toEqual([
      'Frame',
      'Electronics',
      'Thrusters',
    ]);
  });

  it('yields no categories for a component with no bits set, rather than a catch-all', () => {
    // Sunflower Pot decodes to the number 0, not a string: it is reachable
    // in-game only through the "All" tab.
    expect(categoriesOf({ _categories: 0 })).toEqual([]);
    expect(categoriesOf({})).toEqual([]);
  });

  it('ignores a name the wiki does not know instead of offering it as a tab', () => {
    expect(categoriesOf({ _categories: 'Math|Warp (65)' })).toEqual(['Math']);
  });

  it('covers every category the real dataset uses', () => {
    // The components page builds its filter bar out of CATEGORIES, so a
    // future extraction that introduces a tenth build-menu tab must fail
    // here rather than silently hide those components from every tab.
    const known = new Set<string>(CATEGORIES);
    for (const c of comps as Record<string, unknown>[]) {
      const stats = Object.values(c['stats'] as Record<string, Record<string, unknown>>)[0] ?? {};
      const raw = stats['_categories'];
      if (typeof raw !== 'string') continue;
      for (const name of raw.split(' (')[0].split('|')) expect(known.has(name)).toBe(true);
    }
  });
});

describe('isWeldable', () => {
  it('reads the prefab, not the description', () => {
    expect(isWeldable({ '_faceSetupData.count': 6, _mass: 25 })).toBe(true);
    expect(isWeldable({ _mass: 25 })).toBe(false);
  });

  it("agrees exactly with the game's own note on the real data", () => {
    // The 52 parts whose description carries "Fully welded frame weighs twice
    // as much!" are the same 52 that have face data. If a re-extraction ever
    // breaks that, the flag is wrong and this fails rather than the wiki
    // quietly mislabelling parts.
    const note = new Set<string>();
    const faces = new Set<string>();
    for (const c of comps as Record<string, unknown>[]) {
      if (!c['in_build']) continue;
      const stats = Object.values(c['stats'] as Record<string, Record<string, unknown>>)[0] ?? {};
      if (/welded/i.test(String(c['desc']))) note.add(String(c['id']));
      if (isWeldable(flatten(stats))) faces.add(String(c['id']));
    }
    expect(note.size).toBe(52);
    expect([...faces].sort()).toEqual([...note].sort());
  });
});
