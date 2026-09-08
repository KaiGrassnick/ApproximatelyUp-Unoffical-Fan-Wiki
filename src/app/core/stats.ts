import { StatLabel } from './models';

// Ports of the stat-filtering and placeholder rules in tools/stats.py.
// Keep the constant lists identical to the Python — they decide which prefab
// fields count as meaningful stats and which are cosmetic noise.

export type Flat = Record<string, string | number | boolean>;

/** One row of a stat table: only stats the game itself names get one. */
export interface StatRow {
  field: string;
  label: string;
  suffix: string;
  value: string;
  /** Computed by the wiki rather than read off the prefab — see WELD_FACTOR. */
  derived?: boolean;
}

const COSMETIC = [
  'light',
  'particle',
  'sound',
  'color',
  'fan',
  'indicator',
  'icon',
  'uipreview',
  'renderer',
  'facesetup',
  'mesh',
  'sprite',
  'blow',
  'propertiesmaterial',
  'boundscollider',
  'collider',
];
const SKIP_PREFIX = [
  '_bounds',
  '_uiPreview',
  '_oceanFloating',
  '_electricPorts',
  '_scGroup',
  '_scSecondary',
];
// '_mass' is NOT here: the game labels and shows it (InvSCMass), so hiding it
// made the wiki the poorer of the two. '_maxTemperature' is, by choice — it is
// a material class ("Iron (1)") rather than a figure worth a table row.
const SKIP_EXACT = ['_categories', '_customProperties', '_availableAmount', '_maxTemperature'];

export function flatten(d: Record<string, unknown>, prefix = ''): Flat {
  const out: Flat = {};
  for (const [k, v] of Object.entries(d)) {
    const key = prefix + k;
    if (Array.isArray(v)) {
      out[key + '.count'] = v.length;
    } else if (v !== null && typeof v === 'object') {
      const keys = Object.keys(v as object);
      // Exact single-character membership in "xyzw", matching the Python's
      // set(v) <= {"x","y","z","w"}. `'xyzw'.includes(a)` alone would test
      // substring containment instead, so a key like "xy" would wrongly
      // pass (it is a substring of "xyzw") and the object would be hoisted
      // flat instead of recursed into.
      const isVector = keys.length > 0 && keys.every((a) => a.length === 1 && 'xyzw'.includes(a));
      if (isVector) {
        for (const [a, b] of Object.entries(v as Record<string, number>)) {
          out[key + '.' + a] = b;
        }
      } else {
        Object.assign(out, flatten(v as Record<string, unknown>, key + '.'));
      }
    } else if (v !== null) {
      // Deliberate divergence from the Python: stats.py's flatten() passes
      // a None field through as out[key] = None, which the old wiki rendered
      // as the literal text "None". Here we skip null fields entirely so
      // they never reach a stat table. This is display-only: availability
      // computation reads _scGroup and _availableAmount off the raw stats
      // object directly, never through flatten(), so skipping nulls here
      // cannot affect it. Do not "fix" this back into parity with the Python.
      out[key] = v as string | number | boolean;
    }
  }
  return out;
}

/**
 * The `_scGroup` pooling key a component's stats declare, or `null` for the
 * "None" sentinel (an ungrouped component, pooled against its own id).
 *
 * The one parser for the branch's highest-stakes invariant — components
 * sharing an `_scGroup` draw from one stock pool. `|| 'None (0)'` (not `??`)
 * is deliberate: it matches availability.py's `st.get("_scGroup") or "None (0)"`,
 * which also treats an empty-string `_scGroup` as absent. This function's
 * result is fixture-pinned through availability.ts — do not change its
 * behaviour without regenerating and re-checking the parity fixture.
 */
export function scGroupOf(stats: Record<string, unknown>): string | null {
  const g = ((stats['_scGroup'] as string) || 'None (0)').split(' (')[0];
  return g === 'None' ? null : g;
}

export function cosmetic(k: string): boolean {
  const kl = k.toLowerCase();
  return COSMETIC.some((c) => kl.includes(c));
}

export function useful(k: string): boolean {
  return !cosmetic(k) && !SKIP_EXACT.includes(k) && !SKIP_PREFIX.some((p) => k.startsWith(p));
}

// Deliberately does NOT reproduce Python's format(v, "g"): booleans render
// here as lowercase "true"/"false" rather than Python's "True"/"False", and
// large-magnitude numbers stay plain digits rather than switching to
// exponential notation. This is a display-only helper for a new UI (the
// wiki it would otherwise need to match byte-for-byte is deleted in
// Task 12), so it is explicitly outside the Python parity contract -- the
// availability engine, which parity does matter for, reads stats directly
// and never calls fmtValue. Measured against the real dataset before
// deciding: 0 boolean-valued stat fields and exactly 8 values (7 x
// _maxForce.y, 1 x _explosionStrength) across all 310 in-build components
// where Python's "g" format would have rendered exponentially (e.g.
// -1.3e+06) instead of the plain -1300000 this renders. A right-aligned
// monospace stat column reads better with plain digits. Do not "fix" this
// back into %g parity.
export function fmtValue(v: unknown): string {
  if (typeof v === 'number' && !Number.isInteger(v)) {
    return String(parseFloat(v.toPrecision(6)));
  }
  return String(v);
}

const GEN_FIELDS = ['_maxPowerGenerationPerSec', '_maxGenerationPerSecond'];
const IGNITE_FIELDS = ['_solidFuelRequiredIgnitionPower'];
const USE_FIELDS = [
  '_powerConsumptionPerSec',
  '_consumptionPerSec',
  '_maxPowerConsumption',
  '_idlePowerConsumptionPerSec',
];

/** Substitute a single {0} from the prefab fields; leave it alone if unsure. */
export function resolveText(text: string, flat: Flat): string {
  const hits = text.split('{0}').length - 1;
  if (hits !== 1) return text;
  const low = text.toLowerCase();
  if (!low.includes('p/s')) return text;
  const cands = low.includes('generate')
    ? GEN_FIELDS
    : low.includes('ignite')
      ? IGNITE_FIELDS
      : USE_FIELDS;
  for (const c of cands) {
    if (c in flat) return text.replace('{0}', fmtValue(flat[c]));
  }
  return text;
}

/**
 * The build-menu categories a component belongs to, in the game's own order.
 *
 * These are the tabs of the in-game inventory, not a wiki invention: the
 * labels come from the `MenuInventoryCat*` keys in the game's
 * Localization.csv, and the order is the declaration order of the flags enum
 * behind `_categories` (Frame=1, Electronics=2, Fuel=4, Tools=8,
 * Objectives=16, Glass=32, Math=64, Thrusters=128, Other=256). Do not sort
 * this alphabetically — it exists to mirror what a player sees in the game.
 */
export const CATEGORIES = [
  'Frame',
  'Electronics',
  'Fuel',
  'Tools',
  'Objectives',
  'Glass',
  'Math',
  'Thrusters',
  'Other',
] as const;

/**
 * The categories a component's stats declare, ordered as CATEGORIES is.
 *
 * `_categories` is a flags enum the extractor has already decoded into a
 * string like `"Frame|Glass (33)"` — one component genuinely lives in
 * several build-menu tabs, so this returns a list, not a single value. A
 * component with no bits set (Sunflower Pot, the only one in the current
 * build) decodes to the number 0 rather than a string and yields []: it is
 * reachable in-game through the "All" tab only, so it must not be forced
 * into some catch-all bucket here.
 */
export function categoriesOf(stats: Record<string, unknown>): string[] {
  const raw = stats['_categories'];
  if (typeof raw !== 'string') return [];
  const names = new Set(raw.split(' (')[0].split('|'));
  return CATEGORIES.filter((c) => names.has(c));
}

/**
 * The rows a stat table shows: the stats the game itself labels, and nothing
 * else.
 *
 * The prefab carries far more than the game ever puts in front of a player —
 * sound-occlusion face vectors, gimbal ratios, internal enums — and printing
 * those as raw field names made the table longer without making it more
 * useful. The 19 the game names are the table now; the rest stay in the data
 * for anyone reading components_full.json.
 *
 * A vector resolves off its base field: the game labels `_maxForce`, not
 * `_maxForce.y`, so all three axes are named rather than one.
 */
export function statRows(flat: Flat, labels: Record<string, StatLabel>): StatRow[] {
  const out: StatRow[] = [];
  for (const [field, v] of Object.entries(flat)) {
    if (!useful(field)) continue;
    const dot = field.lastIndexOf('.');
    const axis = dot > 0 ? field.slice(dot + 1) : '';
    const entry = labels[field] ?? (axis ? labels[field.slice(0, dot)] : undefined);
    if (!entry) continue;
    out.push({
      field,
      label: axis ? `${entry.label} ${axis}` : entry.label,
      suffix: entry.suffix,
      value: fmtValue(v),
    });

    // A welded frame's mass is the one figure a reader cannot get from the
    // table otherwise, and it sits right under the mass it is derived from.
    if (field === '_mass' && typeof v === 'number' && isWeldable(flat)) {
      out.push({
        field: '_mass.welded',
        label: `${entry.label} fully welded`,
        suffix: entry.suffix,
        value: fmtValue(v * WELD_FACTOR),
        derived: true,
      });
    }
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Whether this part is a frame that can be welded solid.
 *
 * Read off `_faceSetupData`, the per-face geometry welding works on, rather
 * than off the English in the description. The two agree exactly on the
 * current build — the 52 parts carrying "Fully welded frame weighs twice as
 * much!" are the same 52 that have face data, with no leftovers either way —
 * and the field keeps agreeing after a re-extraction or a translation change,
 * where a string match would not.
 */
export function isWeldable(flat: Flat): boolean {
  return Object.keys(flat).some((k) => k.startsWith('_faceSetupData'));
}

/**
 * What welding does to a frame's mass, per the game's own description.
 *
 * NOT an extracted value. No prefab field holds it: `_mass` is the unwelded
 * figure, and the doubling happens in code at runtime (the metadata has a
 * `_fullSolidMass` next to `_defaultMass`, and `_progressWelding`, none of
 * which reach components_full.json). The number here comes from the sentence
 * the game shows the player, which is why every row built from it is flagged
 * `derived` and footnoted rather than sitting among the extracted stats
 * unmarked.
 */
export const WELD_FACTOR = 2;
