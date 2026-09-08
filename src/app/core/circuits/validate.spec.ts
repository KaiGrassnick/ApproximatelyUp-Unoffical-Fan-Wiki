import { layout } from './layout';
import { CircuitSource } from './model';
import { buildCatalog } from './parts';
import { FIXTURE } from './test-fixture';
import { route } from './route';
import { validate } from './validate';

const cat = buildCatalog(FIXTURE);

function check(parts: CircuitSource['parts'], wires: CircuitSource['wires']) {
  const source: CircuitSource = {
    title: 't',
    summary: 's',
    spoiler: 'none',
    updated: '2026-09-07',
    order: 100,
    view: 'top',
    parts,
    wires,
    notes: [],
  };
  const laid = layout(source, cat);
  const routed = route(laid.parts, wires, cat);
  return validate(source, { parts: laid.parts, cables: routed.cables }, cat).map(
    (f) => `${f.level} ${f.where}: ${f.message}`,
  );
}

describe('validate', () => {
  it('passes a clean chain', () => {
    expect(
      check(
        [
          { id: 'cam', type: 'Camera' },
          { id: 'b', type: 'Abs' },
        ],
        [{ from: 'cam:out', to: 'b:in' }],
      ),
    ).toEqual([]);
  });

  it('rejects output to output and input to input', () => {
    expect(
      check(
        [
          { id: 'a', type: 'Abs' },
          { id: 'b', type: 'Abs' },
        ],
        [
          { from: 'a:out', to: 'b:out' },
          { from: 'a:in', to: 'b:in' },
        ],
      ),
    ).toEqual([
      'error wire 1: a cable runs from an output (blue) to an input (yellow); b:out is an output',
      'error wire 2: a cable runs from an output (blue) to an input (yellow); a:in is an input',
    ]);
  });

  it('rejects a second cable on one port -- fan-out is what routers are for', () => {
    expect(
      check(
        [
          { id: 'a', type: 'Abs' },
          { id: 'b', type: 'Abs' },
          { id: 'c', type: 'Abs' },
        ],
        [
          { from: 'a:out', to: 'b:in' },
          { from: 'a:out', to: 'c:in' },
        ],
      ),
      // a:in is genuinely open here -- only b:in and c:in are wired -- so the
      // open-input warning belongs in this list too.
    ).toEqual([
      'error wire 2: a:out already has a cable; use a Router2 or Router4 to split a signal',
      'warn a:in: not connected',
    ]);
  });

  it('rejects a power port on a data cable', () => {
    expect(
      check(
        [
          { id: 'cam', type: 'Camera' },
          { id: 'b', type: 'Abs' },
        ],
        [{ from: 'cam:pwr', to: 'b:in' }],
      ),
    ).toEqual([
      'error wire 1: cam:pwr is a power port and b:in is a data port; they take different cables',
    ]);
  });

  it('rejects a plasma port on a power cable', () => {
    expect(
      check(
        [
          { id: 'cam', type: 'Camera' },
          { id: 'g', type: 'SmallPlasmaGenerator' },
        ],
        [{ from: 'cam:pwr', to: 'g:plasma' }],
      ),
    ).toEqual([
      'error wire 1: cam:pwr is a power port and g:plasma is a plasma port; they take different cables',
      'warn g:in: not connected',
    ]);
  });

  it('rejects a plasma port on a data cable', () => {
    expect(
      check(
        [
          { id: 'g', type: 'SmallPlasmaGenerator' },
          { id: 'b', type: 'Abs' },
        ],
        [{ from: 'g:plasma', to: 'b:in' }],
      ),
    ).toEqual([
      'error wire 1: g:plasma is a plasma port and b:in is a data port; they take different cables',
      'warn g:in: not connected',
    ]);
  });

  it('accepts the transmitter on either end', () => {
    expect(
      check(
        [
          { id: 'a', type: 'Abs' },
          { id: 'w', type: 'WirelessTransmitter' },
        ],
        [{ from: 'a:out', to: 'w:io' }],
      ),
    ).toEqual(['warn a:in: not connected']);
  });

  // A wire may name its cable, and the router and the bill of materials both
  // take that name at its word -- so a wrong name has to be caught here or
  // nowhere.
  it('rejects a power cable named on a wire between two data ports', () => {
    expect(
      check(
        [
          { id: 'cam', type: 'Camera' },
          { id: 'b', type: 'Abs' },
        ],
        [{ from: 'cam:out', to: 'b:in', cable: 'power' }],
      ),
    ).toEqual(['error wire 1: cam:out and b:in are data ports; a power cable does not fit them']);
  });

  it('accepts the nanocable on a power wire -- the power network carries both', () => {
    expect(
      check(
        [
          { id: 'cam', type: 'Camera' },
          { id: 'g', type: 'SmallPlasmaGenerator' },
        ],
        [{ from: 'cam:pwr', to: 'g:pwr', cable: 'nano' }],
      ),
    ).toEqual(['warn g:in: not connected']);
  });

  it('warns about an input left open, and says nothing about an open output', () => {
    expect(check([{ id: 'b', type: 'Adder' }], [])).toEqual([
      'warn b:in1: not connected',
      'warn b:in2: not connected',
    ]);
  });
});
