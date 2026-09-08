import { add, footprint, key, rotateCell, rotateDir, rotatedSize } from './geometry';

describe('circuit geometry', () => {
  const size = { x: 2, y: 1, z: 4 };

  it('rotates a local cell inside its footprint by quarter turns', () => {
    const c = { x: 0, y: 0, z: 3 };
    expect(rotateCell(c, size, 0)).toEqual({ x: 0, y: 0, z: 3 });
    expect(rotateCell(c, size, 90)).toEqual({ x: 0, y: 0, z: 0 });
    expect(rotateCell(c, size, 180)).toEqual({ x: 1, y: 0, z: 0 });
    expect(rotateCell(c, size, 270)).toEqual({ x: 3, y: 0, z: 1 });
  });

  it('rotates directions the same way it rotates cells', () => {
    expect(rotateDir('+z', 90)).toBe('-x');
    expect(rotateDir('+x', 90)).toBe('+z');
    expect(rotateDir('-z', 180)).toBe('+z');
    expect(rotateDir('+y', 270)).toBe('+y');
  });

  it('swaps width and depth on a quarter turn', () => {
    expect(rotatedSize(size, 90)).toEqual({ x: 4, y: 1, z: 2 });
    expect(rotatedSize(size, 180)).toEqual(size);
  });

  it('lists every cell a placed box covers', () => {
    const cells = footprint({ x: 5, y: 0, z: 7 }, { x: 2, y: 1, z: 2 });
    expect(cells.map(key).sort()).toEqual(['5,0,7', '5,0,8', '6,0,7', '6,0,8']);
  });

  it('adds', () => {
    expect(add({ x: 1, y: 2, z: 3 }, { x: -1, y: 0, z: 1 })).toEqual({ x: 0, y: 2, z: 4 });
  });
});
