import { TextRef } from './mesh-file';

/**
 * Where a part's text goes and how big it is -- the one answer for both the
 * SVG and the 3D scene, so a readout cannot sit on its screen in one and off
 * it in the other.
 *
 * The numbers are the game's: CRPText3D draws a monospace alphabet
 * MONOSPACE_HEIGHT 0.75 by MONOSPACE_WIDTH 0.375 of the text scale per
 * glyph, anchored by Alignment (left/centre/right) and VerticalAlignment
 * (top/centre/bottom). The wiki's monospace face is about 0.6 em wide, so a
 * font size of 0.625 x scale reproduces the game's glyph width.
 */
export interface LaidText {
  /** Index into the part's texts. */
  index: number;
  text: string;
  /** Metres, local to the part (unrotated): the anchor point. */
  position: [number, number, number];
  /** Unity Euler degrees, the text's own tilt. */
  rotation: [number, number, number];
  anchor: 'start' | 'middle' | 'end';
  /** Glyph height in METRES: 0.75 x textScale, the game's MONOSPACE_HEIGHT. */
  heightM: number;
  /** Font size in metres that reproduces the game's glyph width in a 0.6 em face: 0.625 x textScale. */
  fontM: number;
  /** Vertical offset of the text's middle from the anchor, in metres, positive = down the text's plane. */
  yMidM: number;
  readout: boolean;
  /** Plate box in metres relative to the anchor, text-plane coordinates (x right, y down): [x, y, w, h]. Null unless readout. */
  plate: [number, number, number, number] | null;
}

const GLYPH_H = 0.75;
const FONT = 0.625;
/** Half a line, in font sizes: where a top- or bottom-anchored text's middle sits. */
const HALF_LINE = 0.62;
const CHAR_W = 0.62;

const isNumeric = (s: string) => /^-?\d/.test(s);

export function layoutTexts(texts: TextRef[], value: string | undefined): LaidText[] {
  // A `value` overwrites the one text the game itself fills in at runtime:
  // the first that reads as a number, so a Datameter's '0.000' takes it and
  // the blank label beside it does not. A part that shows no number at all
  // falls back to its first text, so a value written on an Abs is drawn
  // rather than silently dropped.
  const valueAt =
    value === undefined
      ? -1
      : Math.max(
          0,
          texts.findIndex((t) => isNumeric(t.text)),
        );
  const out: LaidText[] = [];
  texts.forEach((t, index) => {
    // The game leaves some label slots blank until a player names them.
    if (!t.text && index !== valueAt) return;
    const text = index === valueAt ? value! : t.text;
    const fontM = t.scale * FONT;
    const anchor = (['start', 'middle', 'end'] as const)[t.alignment] ?? 'middle';
    // Top means the text hangs below its anchor, bottom that it stands on
    // it. Text-plane y runs down. Written as `1 - valign` rather than
    // `-(valign - 1)` so a centred text gets a positive zero: a negative one
    // is the same offset but compares unequal to 0.
    const yMidM = (1 - (t.valign ?? 1)) * fontM * HALF_LINE;
    // A readout is a number on a dark screen or over a glyph; the game lights
    // it, the wiki gives it a pale plate instead so it stays legible.
    const readout = index === valueAt || isNumeric(t.text);
    let plate: LaidText['plate'] = null;
    if (readout) {
      // Grouped as one multiple of the font size rather than a sum of two
      // products: summing first loses a bit on a width that lands exactly on
      // a rounding boundary, which moved two plates by 0.1 px.
      const w = fontM * (text.length * CHAR_W + 0.3);
      const x0 = anchor === 'start' ? -fontM * 0.15 : anchor === 'end' ? fontM * 0.15 - w : -w / 2;
      plate = [x0, yMidM - fontM * HALF_LINE, w, fontM * 2 * HALF_LINE];
    }
    out.push({
      index,
      text,
      position: t.position as [number, number, number],
      rotation: t.rotation as [number, number, number],
      anchor,
      heightM: t.scale * GLYPH_H,
      fontM,
      yMidM,
      readout,
      plate,
    });
  });
  return out;
}
