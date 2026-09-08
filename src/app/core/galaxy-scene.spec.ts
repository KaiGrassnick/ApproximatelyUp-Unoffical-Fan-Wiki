import { Planet } from './models';
import { Placed3, length, place, radiusOf, separate } from './galaxy-scene';
import planets from '../../../data/planets.json';

function body(id: string, pos: [number, number, number], radius: number, type = 'planet'): Planet {
  return {
    id,
    object_id: id.length,
    full_id: id,
    type,
    parent: null,
    radius,
    gravity: 1,
    wormhole: null,
    position: { x: pos[0], y: pos[1], z: pos[2] },
  } as Planet;
}

const real = (planets as unknown as Planet[]).filter(
  (p) => p.type === 'planet' || p.type === 'star',
);

describe('galaxy scene', () => {
  it('scales every position by one factor, so the shape of the galaxy survives', () => {
    // With a star present the scene is drawn about the origin, so the only
    // transform is the uniform scale.
    const { placed } = place([
      body('S', [0, 0, 0], 100, 'star'),
      body('A', [1000, 0, 0], 100),
      body('B', [0, 0, -500], 100),
    ]);
    const a = placed.find((p) => p.id === 'A')!;
    const b = placed.find((p) => p.id === 'B')!;
    expect(a.pos).toEqual({ x: 1, y: 0, z: 0 });
    expect(b.pos).toEqual({ x: 0, y: 0, z: -0.5 });
  });

  describe('what the scene is drawn around', () => {
    it('keeps the origin as the centre when the galaxy has a star', () => {
      const { placed } = place([body('S', [0, 0, 0], 100, 'star'), body('A', [1000, 0, 0], 100)]);
      expect(placed.find((p) => p.id === 'S')!.pos).toEqual({ x: 0, y: 0, z: 0 });
    });

    it('centres a starless galaxy on its own bodies', () => {
      // Galaxy 2 is five planets with no sun, sitting hundreds of millions of
      // units off the origin: drawn about the origin it lands in a corner of
      // the panel with everything else empty.
      const { placed } = place([body('A', [1000, 0, 0], 100), body('B', [3000, 0, 0], 100)]);
      const a = placed.find((p) => p.id === 'A')!;
      const b = placed.find((p) => p.id === 'B')!;
      expect(a.pos.x).toBeCloseTo(-1, 10);
      expect(b.pos.x).toBeCloseTo(1, 10);
      // Same distance apart as before, in the same direction: a translation
      // changes the frame, never the geometry.
      expect(b.pos.x - a.pos.x).toBeGreaterThan(0);
    });
  });

  it('compresses radii into a narrow band, largest still largest', () => {
    const lo = Math.log(36_000);
    const hi = Math.log(2_800_000);
    const small = radiusOf(36_000, lo, hi);
    const big = radiusOf(2_800_000, lo, hi);
    expect(small).toBeLessThan(big);
    // At true scale the smallest body would be 1.3% of the largest and
    // sub-pixel on any screen; compressed it stays visible.
    expect(small / big).toBeGreaterThan(0.2);
    expect(radiusOf(1, 0, 0)).toBe(small);
  });

  describe('separate', () => {
    it('splits a pair that would intersect, and says which it moved', () => {
      const placed: Placed3[] = [
        {
          id: 'A',
          objectId: 1,
          isStar: false,
          isBlackHole: false,
          pos: { x: 0, y: 0, z: 0 },
          radius: 0.05,
          nudged: false,
        },
        {
          id: 'B',
          objectId: 2,
          isStar: false,
          isBlackHole: false,
          pos: { x: 0.01, y: 0, z: 0 },
          radius: 0.05,
          nudged: false,
        },
      ];
      const moved = separate(placed);
      expect([...moved].sort()).toEqual(['A', 'B']);
      expect(
        length({
          x: placed[0].pos.x - placed[1].pos.x,
          y: placed[0].pos.y - placed[1].pos.y,
          z: placed[0].pos.z - placed[1].pos.z,
        }),
      ).toBeGreaterThan(0.1);
      // Split along their real offset: the pair still reads left-to-right the
      // way the game has them.
      expect(placed[0].pos.x).toBeLessThan(placed[1].pos.x);
      expect(placed[0].nudged).toBe(true);
    });

    it('leaves bodies that already clear each other exactly where they are', () => {
      const placed: Placed3[] = [
        {
          id: 'A',
          objectId: 1,
          isStar: false,
          isBlackHole: false,
          pos: { x: 0, y: 0, z: 0 },
          radius: 0.02,
          nudged: false,
        },
        {
          id: 'B',
          objectId: 2,
          isStar: false,
          isBlackHole: false,
          pos: { x: 0.9, y: 0, z: 0 },
          radius: 0.02,
          nudged: false,
        },
      ];
      expect(separate(placed).size).toBe(0);
      expect(placed[1].pos).toEqual({ x: 0.9, y: 0, z: 0 });
      expect(placed[0].nudged).toBe(false);
    });

    it('is deterministic for exactly coincident bodies rather than NaN', () => {
      // No offset to push along: the fallback direction has to be fixed.
      const at = (id: string): Placed3 => ({
        id,
        objectId: 1,
        isStar: false,
        isBlackHole: false,
        pos: { x: 0, y: 0, z: 0 },
        radius: 0.03,
        nudged: false,
      });
      const first = [at('A'), at('B')];
      const second = [at('A'), at('B')];
      separate(first);
      separate(second);
      expect(first[0].pos).toEqual(second[0].pos);
      expect(Number.isFinite(first[0].pos.x)).toBe(true);
    });
  });

  describe('against the real galaxy', () => {
    const scene = place(real);

    it('places every planet and star', () => {
      expect(scene.placed.length).toBe(real.length);
      expect(scene.placed.every((p) => Number.isFinite(p.pos.x + p.pos.y + p.pos.z))).toBe(true);
    });

    it('leaves no two bodies overlapping', () => {
      for (let i = 0; i < scene.placed.length; i++) {
        for (let j = i + 1; j < scene.placed.length; j++) {
          const a = scene.placed[i];
          const b = scene.placed[j];
          const d = length({
            x: a.pos.x - b.pos.x,
            y: a.pos.y - b.pos.y,
            z: a.pos.z - b.pos.z,
          });
          expect(d).toBeGreaterThan(a.radius + b.radius);
        }
      }
    });

    it('splits the close pairs the game really does have', () => {
      // Earth/Moon, Goldtwin/Pinktwin and Basalt/Kovo sit within 0.04% of the
      // universe's span — far closer than their drawn radii, so these six are
      // the bodies that certainly have to move. They are not the only ones:
      // the inner cluster crowds too, which is why this is a superset check
      // and not an equality. The Sun has room and must be left alone, since
      // the whole scene is centred on it.
      const nudged = new Set(scene.placed.filter((p) => p.nudged).map((p) => p.id));
      for (const id of ['Earth', 'Moon', 'Goldtwin', 'Pinktwin', 'Basalt', 'Kovo']) {
        expect(nudged.has(id)).toBe(true);
      }
      expect(nudged.has('Sun')).toBe(false);
    });

    it('keeps the Sun at the origin, where the game puts it', () => {
      const sun = scene.placed.find((p) => p.id === 'Sun')!;
      expect(sun.isStar).toBe(true);
      expect(length(sun.pos)).toBeLessThan(0.001);
    });
  });
});
