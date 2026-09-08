// Nothing else enforces that models.ts matches the JSON the Python pipeline
// emits. Two mismatches of exactly this kind (Comp.class, Planet.ocean) were
// found by hand during this project — this test exists so the next one fails
// loudly here instead of in someone's browser. Deliberately does NOT cast
// through `as unknown as T[]` the way availability.spec.ts does: that cast is
// what let the real mismatches slip past the type checker in the first
// place, so this file works against the raw parsed JSON instead.
import comps from '../../../data/components_full.json';
import planets from '../../../data/planets.json';
import objs from '../../../data/objectives.json';
import icons from '../../../data/icons.json';

type Rec = Record<string, unknown>;
const ICON_KEYS = ['file', 'file_1x', 'size', 'texture'].sort();
const COMP_KEYS = ['class', 'desc', 'id', 'in_build', 'name', 'ports', 'prefab', 'stats'].sort();
const STATION_KEYS = [
  'full_id',
  'gravity',
  'id',
  'object_id',
  'parent',
  'position',
  'radius',
  'type',
  'wormhole',
].sort();
const PLANET_KEYS = [...STATION_KEYS, 'air', 'biomes', 'ocean', 'stations', 'wind'].sort();
const STAR_KEYS = [...PLANET_KEYS, 'star'].sort();
// The black hole is authored outside level0 (CRPBlackHoleFeature in
// globalgamemanagers.assets) and has no terrain, air or ocean — it carries
// the same lean key set a station does.
const BLACKHOLE_KEYS = STATION_KEYS;
const OBJ_KEYS = [
  'dependencies',
  'desc',
  'end',
  'hidden',
  'hints',
  'id',
  'key',
  'obj',
  'requires_components',
  'reward',
  'start',
  'title',
  'type',
].sort();

describe('JSON <-> models.ts contract', () => {
  it('every component matches the declared Comp shape', () => {
    for (const c of comps as Rec[]) {
      expect(Object.keys(c).sort()).toEqual(COMP_KEYS);
      expect(typeof c['id']).toBe('string');
      expect(typeof c['prefab']).toBe('string');
      expect(typeof c['name']).toBe('string');
      expect(typeof c['desc']).toBe('string');
      expect(Array.isArray(c['ports'])).toBe(true);
      expect((c['ports'] as unknown[]).every((x) => typeof x === 'string')).toBe(true);
      expect(typeof c['in_build']).toBe('boolean');
      expect(c['class'] === null || typeof c['class'] === 'string').toBe(true);
      expect(typeof c['stats']).toBe('object');
    }
  });

  it('every planet/star/station matches the declared Planet shape, per type', () => {
    for (const p of planets as Rec[]) {
      expect(['planet', 'star', 'station', 'blackhole']).toContain(p['type']);
      expect(Object.keys(p).sort()).toEqual(
        p['type'] === 'station'
          ? STATION_KEYS
          : p['type'] === 'blackhole'
            ? BLACKHOLE_KEYS
            : p['type'] === 'star'
              ? STAR_KEYS
              : PLANET_KEYS,
      );
      expect(typeof p['id']).toBe('string');
      expect(typeof p['object_id']).toBe('number');
      expect(typeof p['full_id']).toBe('string');
      expect(p['parent'] === null || typeof p['parent'] === 'string').toBe(true);
      expect(typeof p['radius']).toBe('number');
      expect(typeof p['gravity']).toBe('number');
      expect(p['wormhole'] === null || typeof p['wormhole'] === 'string').toBe(true);
      expect(typeof p['position']).toBe('object');

      if (p['type'] !== 'station' && p['type'] !== 'blackhole') {
        const ocean = p['ocean'] as Rec | null;
        if (ocean !== null) {
          expect(typeof ocean['enabled']).toBe('boolean');
          expect(typeof ocean['include_in_miniature']).toBe('boolean');
          expect(typeof ocean['deep']).toBe('string');
          expect(typeof ocean['shallow']).toBe('string');
        }
        for (const b of p['biomes'] as Rec[]) {
          expect(Object.keys(b).sort()).toEqual(['color', 'index']);
          expect(typeof b['index']).toBe('number');
          expect(typeof b['color']).toBe('string');
        }
        expect((p['stations'] as unknown[]).every((s) => typeof s === 'string')).toBe(true);
      }
      if (p['type'] === 'star') {
        const star = p['star'] as Rec;
        expect(Array.isArray(star['col_a'])).toBe(true);
        expect(Array.isArray(star['col_b'])).toBe(true);
        for (const col of [star['col_a'], star['col_b']] as unknown[][]) {
          expect(col.length).toBe(3);
          expect(col.every((n) => typeof n === 'number')).toBe(true);
        }
        expect(typeof star['noise']).toBe('string');
        expect(typeof star['temperature']).toBe('number');
      }
    }
  });

  it('every objective matches the declared Objective shape', () => {
    for (const o of objs as Rec[]) {
      expect(Object.keys(o).sort()).toEqual(OBJ_KEYS);
      expect(typeof o['id']).toBe('number');
      expect(typeof o['key']).toBe('string');
      expect(['Delivery', 'Package', 'Special']).toContain(o['type']);
      expect(typeof o['hidden']).toBe('boolean');
      expect(typeof o['start']).toBe('string');
      expect(typeof o['end']).toBe('string');
      // Element types, not just Array.isArray. The whole point: `dependencies`
      // was declared number[] when it is string[], and `requires_components`
      // was declared string[] when it is Reward[] — both are arrays either
      // way, so a presence-only check sails past exactly the bug it exists
      // to catch. One rendered "[object Object]" on 19 pages; the other
      // silently emptied the mission dependency graph.
      expect(Array.isArray(o['dependencies'])).toBe(true);
      expect((o['dependencies'] as unknown[]).every((d) => typeof d === 'string')).toBe(true);

      expect(Array.isArray(o['reward'])).toBe(true);
      expect(Array.isArray(o['requires_components'])).toBe(true);
      for (const r of [...(o['reward'] as Rec[]), ...(o['requires_components'] as Rec[])]) {
        expect(Object.keys(r).sort()).toEqual(['amount', 'component']);
        expect(typeof r['component']).toBe('string');
        expect(typeof r['amount']).toBe('number');
      }
      expect(typeof o['title']).toBe('string');
      expect(typeof o['obj']).toBe('string');
      expect(typeof o['desc']).toBe('string');
      expect(typeof o['hints']).toBe('string');
    }
  });

  /**
   * icons.json gained file_1x when the components grid moved to a srcset. An
   * entry missing it silently drops that icon back to one size -- the grid
   * still renders, so nothing else would notice.
   */
  it('every icon matches the declared IconEntry shape', () => {
    const entries = Object.entries(icons as Record<string, Rec>);
    expect(entries.length).toBeGreaterThan(300);
    for (const [id, e] of entries) {
      expect(Object.keys(e).sort(), id).toEqual(ICON_KEYS);
      expect(e['file'], id).toBe(`icons/${id}.webp`);
      expect(e['file_1x'], id).toBe(`icons/64/${id}.webp`);
      expect(typeof e['texture'], id).toBe('string');
      // The size of the file, not of the game texture it came from.
      expect(e['size'], id).toBe('128x128');
    }
  });
});
