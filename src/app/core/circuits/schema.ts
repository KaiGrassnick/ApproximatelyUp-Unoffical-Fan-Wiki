import {
  CableKind,
  Catalog,
  CircuitSource,
  Finding,
  NoteColor,
  PortRef,
  Rot,
  SPOILERS,
  SourceNote,
  SourcePart,
  SourceWire,
} from './model';

/**
 * A circuit file is written by hand, so every mistake it can contain has to
 * come back as a sentence naming the part, wire or note it is in. This module
 * only checks the file's SHAPE against the catalog -- that a part exists,
 * that a wire names ports the parts have. Whether the wires make sense is
 * validate.ts's job, and whether they can be routed is route.ts's.
 */

const COLORS: NoteColor[] = ['magenta', 'green', 'red', 'yellow', 'cyan'];
const ROTS: Rot[] = [0, 90, 180, 270];
const CABLES: CableKind[] = ['data', 'power', 'nano', 'plasma'];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** Two integers, the shape both a part's `at` and a callout's `at` must have. */
const isPair = (v: unknown): v is [number, number] =>
  Array.isArray(v) && v.length === 2 && v.every(isInt);

export function parsePortRef(ref: string): PortRef | null {
  const bits = ref.split(':');
  if (bits.length !== 2 || !bits[0] || !bits[1]) return null;
  return { part: bits[0], port: bits[1] };
}

export function parseSource(
  json: unknown,
  catalog: Catalog,
): { source: CircuitSource | null; findings: Finding[] } {
  const findings: Finding[] = [];
  const err = (where: string, message: string) => findings.push({ level: 'error', where, message });

  if (!isObj(json)) {
    err('file', 'the file must be a JSON object');
    return { source: null, findings };
  }

  for (const k of ['title', 'summary', 'updated']) {
    if (!isStr(json[k])) err('file', `"${k}" is required`);
  }
  const spoiler = json['spoiler'] ?? 'none';
  if (!SPOILERS.some((s) => s === spoiler)) {
    err('file', `spoiler must be one of ${SPOILERS.join(', ')}`);
  }
  const view = json['view'] ?? 'top';
  if (view !== 'top' && view !== 'iso') err('file', 'view must be "top" or "iso"');

  const parts: SourcePart[] = [];
  const ids = new Set<string>();
  const rawParts: unknown[] = Array.isArray(json['parts']) ? json['parts'] : [];
  if (!rawParts.length) err('file', '"parts" must list at least one part');
  for (const raw of rawParts) {
    if (!isObj(raw) || !isStr(raw['id'])) {
      err('file', 'every part needs an "id"');
      continue;
    }
    const id = raw['id'];
    if (ids.has(id)) {
      err(id, 'part id used twice');
      continue;
    }
    ids.add(id);
    const type = String(raw['type'] ?? '');
    if (!catalog.has(type)) err(id, `"${type}" is not a part in this build`);
    const part: SourcePart = { id, type };
    for (const k of ['value', 'label', 'mode'] as const) {
      if (raw[k] !== undefined) part[k] = String(raw[k]);
    }
    if (raw['at'] !== undefined) {
      const at = raw['at'];
      if (isPair(at)) part.at = [at[0], at[1]];
      else err(id, '"at" must be two integers');
    }
    if (raw['rot'] !== undefined) {
      const rot = ROTS.find((r) => r === raw['rot']);
      if (rot !== undefined) part.rot = rot;
      else err(id, '"rot" must be 0, 90, 180 or 270');
    }
    parts.push(part);
  }
  const byId = new Map(parts.map((p) => [p.id, p]));

  const wires: SourceWire[] = [];
  const rawWires: unknown[] = Array.isArray(json['wires']) ? json['wires'] : [];
  rawWires.forEach((raw, i) => {
    const where = `wire ${i + 1}`;
    if (!isObj(raw) || !isStr(raw['from']) || !isStr(raw['to'])) {
      err(where, 'a wire needs "from" and "to"');
      return;
    }
    const from = raw['from'];
    const to = raw['to'];
    let ok = true;
    for (const end of [from, to]) {
      const ref = parsePortRef(end);
      if (!ref) {
        err(where, `"${end}" is not part:port`);
        ok = false;
        continue;
      }
      const part = byId.get(ref.part);
      if (!part) {
        err(where, `"${end}" -- no part with id ${ref.part}`);
        ok = false;
        continue;
      }
      const spec = catalog.get(part.type);
      if (spec && !spec.ports.some((p) => p.name === ref.port)) {
        err(where, `"${end}" -- ${spec.id} has ports ${spec.ports.map((p) => p.name).join(', ')}`);
        ok = false;
      }
    }
    let cable: CableKind | undefined;
    if (raw['cable'] !== undefined) {
      cable = CABLES.find((c) => c === raw['cable']);
      if (cable === undefined) {
        err(where, `cable must be one of ${CABLES.join(', ')}`);
        ok = false;
      }
    }
    if (ok) wires.push(cable === undefined ? { from, to } : { from, to, cable });
  });

  const notes: SourceNote[] = [];
  const rawNotes: unknown[] = Array.isArray(json['notes']) ? json['notes'] : [];
  rawNotes.forEach((raw, i) => {
    const where = `note ${i + 1}`;
    if (!isObj(raw)) return err(where, 'a note must be an object');
    const color = raw['color'];
    const colorOk = raw['kind'] === 'md' || COLORS.some((c) => c === color);
    if (!colorOk) err(where, `color must be one of ${COLORS.join(', ')}`);
    if (raw['kind'] === 'group') {
      const ps: string[] = Array.isArray(raw['parts']) ? raw['parts'].map(String) : [];
      const missing = ps.filter((p) => !byId.has(p));
      for (const m of missing) err(where, `no part with id ${m}`);
      if (!ps.length) err(where, 'a group note needs a "parts" list');
      const text = raw['text'];
      if (!isStr(text)) err(where, 'a note needs "text"');
      if (isStr(text) && colorOk && ps.length && !missing.length) {
        notes.push({ kind: 'group', parts: ps, text, color: color as NoteColor });
      }
    } else if (raw['kind'] === 'callout') {
      const at = raw['at'];
      if (!isPair(at)) return err(where, '"at" must be two integers');
      const text = raw['text'];
      if (!isStr(text)) err(where, 'a note needs "text"');
      if (isStr(text) && colorOk) {
        notes.push({
          kind: 'callout',
          at: [at[0], at[1]],
          text,
          color: color as NoteColor,
        });
      }
    } else if (raw['kind'] === 'md') {
      if (!isStr(raw['body'])) return err(where, 'an md note needs a "body"');
      notes.push({ kind: 'md', body: raw['body'] });
    } else {
      err(where, 'kind must be group, callout or md');
    }
    return undefined;
  });

  if (findings.some((f) => f.level === 'error')) return { source: null, findings };
  return {
    source: {
      title: json['title'] as string,
      summary: json['summary'] as string,
      spoiler: spoiler as CircuitSource['spoiler'],
      updated: json['updated'] as string,
      order: isInt(json['order']) ? json['order'] : 100,
      view: view as 'top' | 'iso',
      parts,
      wires,
      notes,
    },
    findings,
  };
}
