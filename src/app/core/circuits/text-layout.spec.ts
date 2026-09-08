import { layoutTexts } from './text-layout';

const t = (text: string, alignment = 1, valign = 1, scale = 0.085) => ({
  name: 'T',
  text,
  scale,
  position: [0, 0.04, 0],
  rotation: [0, 0, 0],
  alignment,
  valign,
});

describe('layoutTexts', () => {
  it('substitutes a value into the first numeric text and skips blank slots', () => {
    const out = layoutTexts([t(''), t('0.000', 2)], '12.5');
    expect(out.map((l) => l.text)).toEqual(['12.5']);
    expect(out[0].index).toBe(1);
  });

  it('falls back to the first text when nothing is numeric', () => {
    expect(layoutTexts([t('ABS')], '7').map((l) => l.text)).toEqual(['7']);
  });

  it('keeps a glyph text plain and gives a readout a plate', () => {
    const [abs] = layoutTexts([t('ABS', 1, 1, 0.11)], undefined);
    expect(abs.readout).toBe(false);
    expect(abs.plate).toBeNull();
    const [num] = layoutTexts([t('0.000')], undefined);
    expect(num.readout).toBe(true);
    expect(num.plate).not.toBeNull();
  });

  it('sizes from the game metrics', () => {
    const [l] = layoutTexts([t('0.000')], undefined);
    expect(l.heightM).toBeCloseTo(0.075 * 0.85, 6); // 0.75 x 0.085
    expect(l.fontM).toBeCloseTo(0.625 * 0.085, 6);
  });

  it('anchors top, centre and bottom', () => {
    const [top] = layoutTexts([t('1', 1, 0)], undefined);
    const [mid] = layoutTexts([t('1', 1, 1)], undefined);
    const [bot] = layoutTexts([t('1', 1, 2)], undefined);
    expect(top.yMidM).toBeGreaterThan(0);
    expect(mid.yMidM).toBe(0);
    expect(bot.yMidM).toBeLessThan(0);
    expect(top.yMidM).toBeCloseTo(-bot.yMidM, 9);
  });

  it('maps alignment to an anchor and shifts the plate with it', () => {
    const [l, c, r] = layoutTexts([t('1', 0), t('1', 1), t('1', 2)], undefined);
    expect([l.anchor, c.anchor, r.anchor]).toEqual(['start', 'middle', 'end']);
    expect(l.plate![0]).toBeGreaterThan(r.plate![0]);
    expect(Math.abs(c.plate![0] + c.plate![2] / 2)).toBeLessThan(1e-9);
  });
});
