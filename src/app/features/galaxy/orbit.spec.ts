import {
  HOME,
  MAX_DISTANCE,
  MAX_PITCH,
  MIN_DISTANCE,
  cameraPosition,
  clampDistance,
  clampPitch,
  dolly,
  orbitFrom,
  wrapYaw,
  zoomLabel,
} from './orbit';

const SIZE = { w: 800, h: 500 };

describe('galaxy orbit', () => {
  it('stops the camera just short of the poles', () => {
    // Exactly overhead, the view direction is parallel to the up vector and
    // the camera's roll is undefined — the scene spins about its own axis.
    expect(clampPitch(Math.PI)).toBe(MAX_PITCH);
    expect(clampPitch(-Math.PI)).toBe(-MAX_PITCH);
    expect(MAX_PITCH).toBeLessThan(Math.PI / 2);
    expect(clampPitch(0.3)).toBe(0.3);
  });

  it('keeps yaw bounded however far you keep dragging', () => {
    expect(wrapYaw(0.5)).toBeCloseTo(0.5, 12);
    expect(wrapYaw(3 * Math.PI)).toBeCloseTo(-Math.PI, 12);
    expect(wrapYaw(-3 * Math.PI)).toBeCloseTo(-Math.PI, 12);
    expect(Math.abs(wrapYaw(1000))).toBeLessThanOrEqual(Math.PI);
  });

  it('holds distance inside its range', () => {
    expect(clampDistance(0.001)).toBe(MIN_DISTANCE);
    expect(clampDistance(99)).toBe(MAX_DISTANCE);
  });

  describe('orbitFrom', () => {
    it('turns the galaxy half way round for a drag across the full width', () => {
      const o = orbitFrom(HOME, SIZE.w, 0, SIZE);
      expect(o.yaw).toBeCloseTo(wrapYaw(HOME.yaw - Math.PI), 12);
      expect(o.pitch).toBe(HOME.pitch);
      expect(o.distance).toBe(HOME.distance);
    });

    it('is measured in fractions of the view, so it feels the same at any size', () => {
      const wide = orbitFrom(HOME, 400, 0, { w: 800, h: 500 });
      const narrow = orbitFrom(HOME, 200, 0, { w: 400, h: 250 });
      expect(wide.yaw).toBeCloseTo(narrow.yaw, 12);
    });

    it('cannot be dragged past the pole', () => {
      expect(orbitFrom(HOME, 0, 10000, SIZE).pitch).toBe(MAX_PITCH);
      expect(orbitFrom(HOME, 0, -10000, SIZE).pitch).toBe(-MAX_PITCH);
    });
  });

  describe('dolly', () => {
    it('moves in proportion, not in fixed steps', () => {
      // A fixed step in scene units crawls when far out and overshoots when
      // close in; the ratio between consecutive steps must be constant.
      const a = dolly(3, 1);
      const b = dolly(a, 1);
      expect(a / 3).toBeCloseTo(b / a, 12);
      expect(a).toBeLessThan(3);
    });

    it('cannot be walked outside its range in either direction', () => {
      let d = 3;
      for (let i = 0; i < 60; i++) d = dolly(d, 1);
      expect(d).toBe(MIN_DISTANCE);
      for (let i = 0; i < 60; i++) d = dolly(d, -1);
      expect(d).toBe(MAX_DISTANCE);
    });
  });

  describe('cameraPosition', () => {
    it('stays on the sphere of the given distance', () => {
      for (const o of [
        HOME,
        { yaw: 2, pitch: -1.2, distance: 0.9 },
        { yaw: -3, pitch: 0, distance: 6 },
      ]) {
        const p = cameraPosition(o);
        expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(o.distance, 10);
      }
    });

    it('looks down the +z axis at yaw 0, and up from a positive pitch', () => {
      const front = cameraPosition({ yaw: 0, pitch: 0, distance: 2 });
      expect(front).toEqual({ x: 0, y: 0, z: 2 });
      expect(cameraPosition({ yaw: 0, pitch: 1, distance: 2 }).y).toBeGreaterThan(0);
      // A quarter turn of yaw swings the camera onto the +x axis.
      const side = cameraPosition({ yaw: Math.PI / 2, pitch: 0, distance: 2 });
      expect(side.x).toBeCloseTo(2, 10);
      expect(side.z).toBeCloseTo(0, 10);
    });
  });

  it('reads out 1x at the home distance and larger as you close in', () => {
    expect(zoomLabel(HOME.distance)).toBe(1);
    expect(zoomLabel(HOME.distance / 2)).toBe(2);
    expect(zoomLabel(MAX_DISTANCE)).toBeLessThan(1);
  });
});
