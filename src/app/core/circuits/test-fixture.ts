import { Comp } from '../models';

const port = (type: number, dir: number, x: number, y: number, z: number) => ({
  _position: { x, y, z },
  _direction: `${['XPlus', 'XMinus', 'YPlus', 'YMinus', 'ZPlus', 'ZMinus'][dir]} (${dir})`,
  _type: `${['DataInput', 'DataOutput', 'Power', 'DataInOut', 'Plasma', 'Unset'][type]} (${type})`,
});

const comp = (
  id: string,
  ports: unknown[],
  bounds = { x: 0.25, y: 0.125, z: 0.25 },
  extra: Record<string, unknown> = {},
): Comp => ({
  id,
  prefab: `SC_${id}`,
  name: id,
  desc: '',
  ports: ports.map((_, i) => `port ${i}`),
  in_build: true,
  class: 'EPC_SCSignalProcessor',
  stats: {
    EPC_SCSignalProcessor: {
      _bounds: bounds,
      _mass: 5,
      _scGroup: 'MathBlock (7)',
      _scSecondaryGroup: 'None (0)',
      _availableAmount: 0,
      _electricPorts: ports,
      ...extra,
    },
  },
});

export const FIXTURE: Comp[] = [
  comp('Abs', [port(0, 5, -0.0625, 0, -0.0625), port(1, 4, -0.0625, 0, 0.0625)]),
  comp('Adder', [
    port(0, 5, -0.0625, 0, -0.0625),
    port(0, 5, 0.0625, 0, -0.0625),
    port(1, 4, -0.0625, 0, 0.0625),
  ]),
  comp(
    'Router4',
    [
      port(0, 5, -0.1875, 0, -0.0625),
      port(1, 4, -0.1875, 0, 0.0625),
      port(1, 4, -0.0625, 0, 0.0625),
      port(1, 4, 0.0625, 0, 0.0625),
      port(1, 4, 0.1875, 0, 0.0625),
    ],
    { x: 0.5, y: 0.125, z: 0.25 },
  ),
  comp('LogicValue', [port(0, 5, -0.0625, 0, -0.0625), port(1, 4, -0.0625, 0, 0.0625)], undefined, {
    _availableAmount: 30,
  }),
  comp(
    'WirelessTransmitter',
    [port(3, 5, -0.0625, -0.0625, -0.0625)],
    { x: 0.25, y: 0.25, z: 0.25 },
    {
      _scGroup: 'None (0)',
    },
  ),
  comp(
    'Camera',
    [port(1, 5, -0.0625, -0.0625, -0.1875), port(2, 5, 0.0625, -0.0625, -0.1875)],
    { x: 0.25, y: 0.25, z: 0.5 },
    { _scGroup: 'None (0)', _powerConsumptionPerSec: 0.8, _availableAmount: 2 },
  ),
  comp('SmallPlasmaGenerator', [
    port(2, 5, -0.0625, 0, -0.0625),
    port(4, 5, 0.0625, 0, -0.0625),
    port(0, 4, -0.0625, 0, 0.0625),
  ]),
  comp(
    'DataCable',
    [],
    { x: 0.125, y: 0.125, z: 0.125 },
    { _scGroup: 'None (0)', _mass: 0.5, _availableAmount: 1000 },
  ),
  { ...comp('Acosh', []), in_build: false, class: null, stats: {} },
];
