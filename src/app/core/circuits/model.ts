/**
 * The circuit engine's shared vocabulary.
 *
 * Everything is in CELLS -- the game's 0.125 m build grid -- until the
 * renderer, which is the only module that thinks in metres. A cell is an
 * integer triple; a part occupies a box of them; a cable is a list of them.
 * The types here are the contract between the stages in this directory and
 * between the build-time generator, the page, and a future three.js view,
 * which all read the same PlacedCircuit.
 */

/**
 * What a circuit warns it gives away. Mirrors RevealKind in ../spoiler.service
 * plus 'none', spelled out here because nothing in this directory may import
 * Angular: the same code runs in Node at build time.
 */
export type Spoiler = 'none' | 'missions' | 'components' | 'planets' | 'stations';
export const SPOILERS: Spoiler[] = ['none', 'missions', 'components', 'planets', 'stations'];

/** Metres per cell: `CABLE_CELL_SIZE` in the game's code. */
export const CELL_M = 0.125;

/** At most this many consecutive cable cells may hang in the air (`MAX_UNANCHORED_CELLS`). */
export const MAX_UNANCHORED = 10;

export interface Cell {
  x: number;
  y: number;
  z: number;
}

export type Dir = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';
export type Rot = 0 | 90 | 180 | 270;

/** The game's `SpaceshipPortType`, by integer. */
export type PortKind = 'in' | 'out' | 'pwr' | 'io' | 'plasma' | 'unset';
export const PORT_KINDS: PortKind[] = ['in', 'out', 'pwr', 'io', 'plasma', 'unset'];

/** The game's `ElectricPortSetup.Direction`, by integer. */
export const DIRS: Dir[] = ['+x', '-x', '+y', '-y', '+z', '-z'];

export type CableKind = 'data' | 'power' | 'nano' | 'plasma';

/** Cable inventory ids and per-cell mass live on the cable prefabs; the kind is how a wire names one. */
export const CABLE_PART: Record<CableKind, string> = {
  data: 'DataCable',
  power: 'PowerCable',
  nano: 'PowerNanocable',
  plasma: 'PlasmaCable',
};

export interface PortSpec {
  /** Generated: `in`/`in1`.., `out`/`out1`.., `pwr`.., `io`, `plasma`.., `port`.. */
  name: string;
  kind: PortKind;
  /** Index into the prefab's `_electricPorts`, which is also the index into the localised `ports`. */
  index: number;
  desc: string;
  /** Cell inside the unrotated footprint; the footprint's min corner is (0,0,0). */
  local: Cell;
  /** The face the cable leaves through, unrotated. */
  dir: Dir;
}

export interface PartSpec {
  id: string;
  name: string;
  /** Footprint in cells, unrotated: x width, y height, z depth. */
  size: Cell;
  ports: PortSpec[];
  mass: number;
  /** Power drawn per second while running; 0 for every math block. */
  power: number;
  /** The stock pool the part spends: its `_scGroup`, or its own id when ungrouped. */
  pool: string;
  /** Placeable in a new game -- every pool it spends starts stocked. */
  newGame: boolean;
}

export type Catalog = Map<string, PartSpec>;

export type NoteColor = 'magenta' | 'green' | 'red' | 'yellow' | 'cyan';

export interface SourcePart {
  id: string;
  type: string;
  value?: string;
  label?: string;
  mode?: string;
  /** Min-corner cell [x, z] on the panel. Absent: auto-placed. */
  at?: [number, number];
  rot?: Rot;
}

export interface SourceWire {
  from: string;
  to: string;
  /** Defaults to whatever both ports are: data for data ports, power for power ports. */
  cable?: CableKind;
}

export type SourceNote =
  | { kind: 'group'; parts: string[]; text: string; color: NoteColor }
  | { kind: 'callout'; at: [number, number]; text: string; color: NoteColor }
  | { kind: 'md'; body: string };

export interface CircuitSource {
  title: string;
  summary: string;
  spoiler: Spoiler;
  updated: string;
  order: number;
  view: 'top' | 'iso';
  parts: SourcePart[];
  wires: SourceWire[];
  notes: SourceNote[];
}

export interface PlacedPart {
  id: string;
  type: string;
  /** Min corner, world cells. y is always 0: everything sits on the panel. */
  at: Cell;
  rot: Rot;
  /** Footprint after rotation. */
  size: Cell;
  value?: string;
  label?: string;
  mode?: string;
}

export interface PortRef {
  part: string;
  port: string;
}

export interface Cable {
  from: PortRef;
  to: PortRef;
  kind: CableKind;
  /** World cells from the source port's exit cell to the target's. Empty when the two ports touch. */
  cells: Cell[];
}

export interface PlacedCircuit {
  parts: PlacedPart[];
  cables: Cable[];
}

export interface Finding {
  level: 'error' | 'warn';
  /** A part id, `part:port`, `wire N`, `pool X`, or `file`. */
  where: string;
  message: string;
}

export interface CircuitStats {
  mass: number;
  power: number;
  /** Component id -> count. */
  parts: Record<string, number>;
  /** Pool -> units spent, cables included as cells under their own ids. */
  pools: Record<string, number>;
  cableCells: Record<CableKind, number>;
}

/** Pool id -> units held. The same shape as `Availability.stock`. */
export type Stock = Map<string, number>;
