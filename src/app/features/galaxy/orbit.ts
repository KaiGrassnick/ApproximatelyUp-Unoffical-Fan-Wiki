/**
 * Camera arithmetic for the galaxy scene, kept out of the component so it can
 * be tested without a GPU.
 *
 * The camera orbits the origin — where the Sun is — on a sphere of radius
 * `distance`, aimed at the centre. Yaw runs around the ecliptic, pitch above
 * and below it. Scene units are galaxy-scene.ts's: the outermost body sits on
 * the unit sphere, so a distance of ~2.5 frames the whole galaxy.
 */
export interface Orbit {
  yaw: number;
  pitch: number;
  distance: number;
}
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const MIN_DISTANCE = 0.45;
export const MAX_DISTANCE = 6;
/**
 * The framing the map opens on, and the one "reset" returns to.
 *
 * Not a guess: these are the numbers recovered by fitting yaw/pitch/distance
 * against a view Kai framed by hand, so that every body lands where that view
 * put it (11 px RMS across a 1144 px wide panel — inside the error of reading
 * the centres off the image). The pitch is negative: it looks up at the
 * galaxy's plane from below, which is what opens the flat, wide band out
 * across the panel instead of stacking it into a line.
 */
export const HOME: Orbit = { yaw: 3.01, pitch: -1.1, distance: 2.49 };

/**
 * Just short of the poles. Exactly overhead the view direction is parallel to
 * the up vector and the camera's roll is undefined — the scene flips about
 * its own axis for a frame, which reads as a glitch.
 */
export const MAX_PITCH = Math.PI / 2 - 0.05;

export function clampPitch(pitch: number): number {
  return Math.min(MAX_PITCH, Math.max(-MAX_PITCH, pitch));
}

/** Yaw is periodic: kept in -pi..pi so it never grows without bound. */
export function wrapYaw(yaw: number): number {
  const t = (yaw + Math.PI) % (2 * Math.PI);
  return (t < 0 ? t + 2 * Math.PI : t) - Math.PI;
}

export function clampDistance(distance: number): number {
  return Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, distance));
}

/**
 * Drag to orbit. Dragging the full width of the view turns the galaxy half
 * way round; the full height sweeps pitch pole to pole. Sensitivity is in
 * fractions of the viewport rather than pixels so the gesture feels the same
 * on a phone and on a 4K monitor.
 */
export function orbitFrom(
  from: Orbit,
  dx: number,
  dy: number,
  size: { w: number; h: number },
): Orbit {
  return {
    yaw: wrapYaw(from.yaw - (dx / Math.max(size.w, 1)) * Math.PI),
    pitch: clampPitch(from.pitch + (dy / Math.max(size.h, 1)) * Math.PI),
    distance: from.distance,
  };
}

/**
 * Multiplicative, not additive: a fixed step in scene units crawls when you
 * are far out and overshoots when you are close in.
 */
export function dolly(distance: number, steps: number): number {
  return clampDistance(distance * Math.pow(0.82, steps));
}

/** Where the camera sits for an orbit. Right-handed, y up, matching three.js. */
export function cameraPosition(o: Orbit): Vec3 {
  const c = Math.cos(o.pitch);
  return {
    x: o.distance * c * Math.sin(o.yaw),
    y: o.distance * Math.sin(o.pitch),
    z: o.distance * c * Math.cos(o.yaw),
  };
}

/** How far in the reader is, as the "2.4×" the zoom readout shows. */
export function zoomLabel(distance: number): number {
  return Math.round((HOME.distance / distance) * 10) / 10;
}
