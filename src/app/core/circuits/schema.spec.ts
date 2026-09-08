import { buildCatalog } from './parts';
import { FIXTURE } from './test-fixture';
import { parsePortRef, parseSource } from './schema';

const cat = buildCatalog(FIXTURE);

const good = () => ({
  title: 'Sign of a value',
  summary: 'Whether the input is above zero.',
  spoiler: 'none',
  updated: '2026-09-07',
  parts: [
    { id: 'c', type: 'LogicValue', value: '1' },
    { id: 'a', type: 'Abs', at: [4, 0], rot: 90 },
  ],
  wires: [{ from: 'c:out', to: 'a:in' }],
  notes: [{ kind: 'group', parts: ['c', 'a'], text: 'All of it', color: 'green' }],
});

const errors = (json: unknown) =>
  parseSource(json, cat)
    .findings.filter((f) => f.level === 'error')
    .map((f) => `${f.where}: ${f.message}`);

describe('parseSource', () => {
  it('accepts a well-formed file and fills the defaults', () => {
    const { source, findings } = parseSource(good(), cat);
    expect(findings).toEqual([]);
    expect(source).toMatchObject({ order: 100, view: 'top', spoiler: 'none' });
    expect(source!.parts[1]).toMatchObject({ at: [4, 0], rot: 90 });
  });

  it('names the missing header field', () => {
    const j = good();
    delete (j as { summary?: string }).summary;
    expect(errors(j)).toEqual(['file: "summary" is required']);
  });

  it('rejects a part the game does not have, and one not in the build', () => {
    const j = good();
    j.parts.push({ id: 'x', type: 'Acosh' } as never, { id: 'y', type: 'Nope' } as never);
    expect(errors(j)).toEqual([
      'x: "Acosh" is not a part in this build',
      'y: "Nope" is not a part in this build',
    ]);
  });

  it('rejects a duplicate part id', () => {
    const j = good();
    j.parts.push({ id: 'c', type: 'Abs' } as never);
    expect(errors(j)).toEqual(['c: part id used twice']);
  });

  it('rejects a wire to a port the part does not have, and lists the ports it has', () => {
    const j = good();
    j.wires.push({ from: 'c:out', to: 'a:in3' });
    expect(errors(j)).toEqual(['wire 2: "a:in3" -- Abs has ports in, out']);
  });

  it('rejects a wire to a part that is not in the file', () => {
    const j = good();
    j.wires.push({ from: 'c:out', to: 'zz:in' });
    expect(errors(j)).toEqual(['wire 2: "zz:in" -- no part with id zz']);
  });

  it('rejects a bad rotation and a non-integer position', () => {
    const j = good();
    j.parts[1] = { id: 'a', type: 'Abs', at: [1.5, 0], rot: 45 } as never;
    expect(errors(j)).toEqual([
      'a: "at" must be two integers',
      'a: "rot" must be 0, 90, 180 or 270',
    ]);
  });

  it('rejects an unknown spoiler kind and note colour', () => {
    const j = good();
    (j as { spoiler: string }).spoiler = 'everything';
    (j.notes[0] as { color: string }).color = 'puce';
    expect(errors(j)).toEqual([
      'file: spoiler must be one of none, missions, components, planets, stations',
      'note 1: color must be one of magenta, green, red, yellow, cyan',
    ]);
  });

  it('rejects a group note naming a part that is not there', () => {
    const j = good();
    (j.notes[0] as { parts: string[] }).parts.push('q');
    expect(errors(j)).toEqual(['note 1: no part with id q']);
  });

  it('rejects a note with a colour but no text', () => {
    const j = good();
    delete (j.notes[0] as { text?: string }).text;
    expect(errors(j)).toEqual(['note 1: a note needs "text"']);
  });

  it('rejects a group note with no parts list', () => {
    const j = good();
    delete (j.notes[0] as { parts?: string[] }).parts;
    expect(errors(j)).toEqual(['note 1: a group note needs a "parts" list']);
  });

  it('rejects a wire whose cable is not a kind the game has', () => {
    const j = good();
    (j.wires[0] as { cable?: string }).cable = 'string';
    expect(errors(j)).toEqual(['wire 1: cable must be one of data, power, nano, plasma']);
  });

  it('keeps a wire that names its cable kind', () => {
    const j = good();
    (j.wires[0] as { cable?: string }).cable = 'power';
    const { source, findings } = parseSource(j, cat);
    expect(findings).toEqual([]);
    expect(source!.wires[0].cable).toBe('power');
  });

  it('parses a port reference', () => {
    expect(parsePortRef('and1:in2')).toEqual({ part: 'and1', port: 'in2' });
    expect(parsePortRef('and1')).toBeNull();
    expect(parsePortRef('a:b:c')).toBeNull();
  });
});
