import { CableKind, Catalog, CircuitSource, Finding, PlacedCircuit, PortKind } from './model';
import { parsePortRef } from './schema';

/**
 * The game's wiring rules, as findings.
 *
 * A data cable joins one output to one input -- the game's own description
 * of it -- and a port takes one cable; that is why Router2 and Router4
 * exist, and why the third finding here names them. Data, power and plasma
 * are three separate networks with three different cables, so a wire is
 * only legal when both of its ends sit on the same one; the transmitter's
 * one in/out port is the single exception that accepts either end of a
 * data cable.
 *
 * A wire may also name its cable outright -- that is how a power run picks
 * the nanocable over the heavier one -- and a named cable is taken at its
 * word by the router and charged to the bill of materials, so it is checked
 * here against the network its ports sit on.
 *
 * Stock is not judged here. The build judges it against a new game and
 * against everything unlocked; the page judges it again against the
 * reader's save, which the build never sees. Both use stock.ts.
 */
type Network = 'data' | 'power' | 'plasma' | 'unset';

const networkOf = (k: PortKind): Network =>
  k === 'in' || k === 'out' || k === 'io'
    ? 'data'
    : k === 'pwr'
      ? 'power'
      : k === 'plasma'
        ? 'plasma'
        : 'unset';

const describe = (n: Network) => (n === 'unset' ? 'an untyped port' : `a ${n} port`);

/** The network each cable belongs to; power carries two, the cable and the nanocable. */
const networkOfCable: Record<CableKind, Network> = {
  data: 'data',
  power: 'power',
  nano: 'power',
  plasma: 'plasma',
};

export function validate(
  source: CircuitSource,
  _placed: PlacedCircuit,
  catalog: Catalog,
): Finding[] {
  const findings: Finding[] = [];
  const typeOf = new Map(source.parts.map((p) => [p.id, p.type]));
  const kindOf = (ref: string): PortKind => {
    const r = parsePortRef(ref)!;
    return catalog.get(typeOf.get(r.part)!)!.ports.find((p) => p.name === r.port)!.kind;
  };

  const used = new Set<string>();
  source.wires.forEach((w, i) => {
    const where = `wire ${i + 1}`;
    const a = kindOf(w.from);
    const b = kindOf(w.to);

    const na = networkOf(a);
    const nb = networkOf(b);

    if (na !== nb) {
      findings.push({
        level: 'error',
        where,
        message: `${w.from} is ${describe(na)} and ${w.to} is ${describe(nb)}; they take different cables`,
      });
    } else {
      if (na === 'data' && ((a !== 'io' && a !== 'out') || (b !== 'io' && b !== 'in'))) {
        // The guard leaves exactly one wrong end, and on the data network a
        // wrong end is an input where an output belongs, or the reverse.
        const wrong = a !== 'io' && a !== 'out' ? `${w.from} is an input` : `${w.to} is an output`;
        findings.push({
          level: 'error',
          where,
          message: `a cable runs from an output (blue) to an input (yellow); ${wrong}`,
        });
      }
      // Both ends agree on a network by now, so a named cable has one thing
      // left to be wrong about. Untyped ports are left alone: no in-build
      // part has one, so there is no network to hold a cable to.
      if (w.cable && na !== 'unset' && networkOfCable[w.cable] !== na) {
        findings.push({
          level: 'error',
          where,
          message: `${w.from} and ${w.to} are ${na} ports; a ${w.cable} cable does not fit them`,
        });
      }
    }

    for (const end of [w.from, w.to]) {
      if (used.has(end)) {
        findings.push({
          level: 'error',
          where,
          message: `${end} already has a cable; use a Router2 or Router4 to split a signal`,
        });
      }
      used.add(end);
    }
  });

  for (const p of source.parts) {
    for (const port of catalog.get(p.type)!.ports) {
      if (port.kind === 'in' && !used.has(`${p.id}:${port.name}`)) {
        findings.push({ level: 'warn', where: `${p.id}:${port.name}`, message: 'not connected' });
      }
    }
  }
  return findings;
}
