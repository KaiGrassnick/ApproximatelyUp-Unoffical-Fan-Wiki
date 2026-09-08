import { Planet } from './models';

/**
 * Places the galaxy's bodies in a 3D scene.
 *
 * Replaces the flat projection this map used to draw (galaxy-projection.ts,
 * a port of the retired tools/wiki.py generator, alive in git at 41be13b):
 * the scene is real now, so the perspective, the depth ordering and the
 * shading are the renderer's job and the only thing left to decide here is
 * where each body goes and how big it is.
 *
 * Two rules survive that port unchanged, because they are the honest way to
 * draw this data rather than artefacts of drawing it flat:
 *
 *   - POSITIONS are true. Every coordinate is the body's own universe
 *     position, uniformly scaled so the widest one lands on the unit sphere.
 *     The Sun is at the origin because the game puts it there.
 *   - SIZES are not. Radii run 36 000 m to 2 800 000 m against distances of
 *     half a billion; at true scale every body is sub-pixel. They are
 *     log-compressed into a narrow band, which is what the game's own map
 *     does too.
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Placed3 {
  id: string;
  objectId: number;
  isStar: boolean;
  isBlackHole: boolean;
  pos: Vec3;
  /** Scene units, log-compressed — see the note above. */
  radius: number;
  /** True if separate() had to move this body off its real position. */
  nudged: boolean;
}

export interface Scene3 {
  placed: Placed3[];
}

const MIN_RADIUS = 0.018;
const MAX_RADIUS = 0.075;
/** A pair must clear this multiple of their summed radii to read as two bodies. */
const GAP = 2.4;

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
export const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);

/** Log-compressed display radius, given the range of real radii in the set. */
export function radiusOf(radius: number, lo: number, hi: number): number {
  const t = hi <= lo ? 0 : (Math.log(Math.max(radius, 1)) - lo) / (hi - lo);
  return MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * t;
}

/**
 * Push apart bodies whose inflated discs overlap, along their real offset so
 * the pair still reads the way the game shows it.
 *
 * Needed because sizes are compressed and positions are not: Earth/Moon,
 * Goldtwin/Pinktwin and Basalt/Kovo sit within 0.04% of the universe's span,
 * far closer than their drawn radii. Without this they intersect into one
 * lumpy body. Returns the ids it had to move.
 */
export function separate(placed: Placed3[], passes = 60): Set<string> {
  const moved = new Set<string>();
  for (let pass = 0; pass < passes; pass++) {
    let worst = 0;
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i];
        const b = placed[j];
        const want = (a.radius + b.radius) * GAP;
        let off = sub(b.pos, a.pos);
        let d = length(off);
        if (d >= want) continue;
        // Exactly coincident bodies have no offset to push along; a fixed
        // direction keeps the result deterministic instead of NaN.
        if (d < 1e-9) {
          off = { x: 1, y: 0.35, z: 0.6 };
          d = length(off);
        }
        const push = (want - d) / 2;
        const unit = scale(off, 1 / d);
        a.pos = sub(a.pos, scale(unit, push));
        b.pos = add(b.pos, scale(unit, push));
        moved.add(a.id);
        moved.add(b.id);
        worst = Math.max(worst, want - d);
      }
    }
    if (worst === 0) break;
  }
  for (const p of placed) p.nudged = moved.has(p.id);
  return moved;
}

/**
 * What the scene is drawn around.
 *
 * A galaxy with a star is drawn around the origin, because that is where the
 * game puts its star and the whole layout is authored about it. A galaxy
 * without one — Galaxy 2, five planets and no sun — has no such centre, and
 * its coordinates sit far off the origin, so drawing it about the origin
 * pushes every body into a corner of the panel. It is centred on the middle
 * of its own bodies instead. A translation changes no distance and no
 * direction between bodies; it only decides what the camera looks at.
 */
function centreOf(bodies: Planet[]): Vec3 {
  if (bodies.some((b) => b.type === 'star')) return { x: 0, y: 0, z: 0 };
  const sum = bodies.reduce((a, b) => add(a, b.position), { x: 0, y: 0, z: 0 } as Vec3);
  return scale(sum, 1 / bodies.length);
}

export function place(bodies: Planet[]): Scene3 {
  if (!bodies.length) return { placed: [] };

  const centre = centreOf(bodies);
  const local = bodies.map((b) => sub(b.position, centre));
  const span = Math.max(
    1,
    ...local.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(p.z))),
  );
  const radii = bodies.map((b) => b.radius).filter((r) => r > 0);
  const lo = Math.log(Math.min(...(radii.length ? radii : [1])));
  const hi = Math.log(Math.max(...(radii.length ? radii : [1])));

  const placed: Placed3[] = bodies.map((b, i) => {
    const pos = scale(local[i], 1 / span);
    return {
      id: b.id,
      objectId: b.object_id,
      isStar: b.type === 'star',
      isBlackHole: b.type === 'blackhole',
      pos,
      radius: radiusOf(b.radius, lo, hi),
      nudged: false,
    };
  });

  separate(placed);
  return { placed };
}
