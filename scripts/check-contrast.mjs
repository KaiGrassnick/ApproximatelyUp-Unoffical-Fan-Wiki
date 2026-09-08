#!/usr/bin/env node
/**
 * Fails if any text colour in the palette is too faint to read on the surfaces
 * it is drawn on.
 *
 * This is a script rather than a spec because the check has to READ
 * _tokens.scss, and the unit-test builder bundles for the browser -- node:fs
 * does not resolve there. Reading the stylesheet is the whole point: a palette
 * copied into a test agrees with itself and with nothing else, and the failure
 * this guards against is somebody editing a token.
 *
 * The thresholds are WCAG 2.1 AA, which is what Chrome's Lighthouse reports:
 * 4.5:1 for body text. Nothing here claims the 3:1 large-text exemption --
 * --text-faint is drawn at 0.65-0.8rem across its 36 uses and --locked at
 * 0.6rem in status-pill, so the small-text bar is the real one for all of them.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const TOKENS = join(here, '..', 'src', 'styles', '_tokens.scss');

/** Every surface text sits on. --panel-hi is the lightest, so it decides. */
const SURFACES = ['bg', 'bg-raise', 'panel', 'panel-hi'];

/**
 * Tokens used as a text colour somewhere. --accent-dim is deliberately absent:
 * it is a 15%-alpha fill for borders and backgrounds, not a text colour, and
 * the one place that used it as one (the 404 numeral) was the bug.
 */
const FOREGROUNDS = ['text', 'text-dim', 'text-faint', 'accent', 'accent-hi', 'violet', 'locked'];

const AA = 4.5;

const scss = readFileSync(TOKENS, 'utf8');
const palette = Object.fromEntries(
  [...scss.matchAll(/^\s*--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/gm)].map(([, k, v]) => [
    k,
    v.toLowerCase(),
  ]),
);

const channel = (c) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
};

const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const missing = [...FOREGROUNDS, ...SURFACES].filter((n) => !palette[n]);
if (missing.length) {
  console.error(`check-contrast: not found in _tokens.scss: ${missing.join(', ')}`);
  process.exit(1);
}

const failures = [];
for (const fg of FOREGROUNDS) {
  for (const bg of SURFACES) {
    const ratio = contrast(palette[fg], palette[bg]);
    if (ratio < AA) {
      failures.push(`  --${fg} (${palette[fg]}) on --${bg}: ${ratio.toFixed(2)}:1, needs ${AA}`);
    }
  }
}

if (failures.length) {
  console.error('check-contrast: text colours below WCAG AA\n' + failures.join('\n'));
  process.exit(1);
}

const worst = Math.min(
  ...FOREGROUNDS.flatMap((fg) => SURFACES.map((bg) => contrast(palette[fg], palette[bg]))),
);
console.log(
  `check-contrast: ${FOREGROUNDS.length} text colours x ${SURFACES.length} surfaces, ` +
    `worst ${worst.toFixed(2)}:1`,
);
