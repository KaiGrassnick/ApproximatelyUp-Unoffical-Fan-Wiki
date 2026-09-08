export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Comp {
  id: string;
  prefab: string;
  name: string;
  desc: string;
  ports: string[];
  in_build: boolean;
  /** null for all 51 not-in-build components; a real value for all 310 in-build ones. */
  class: string | null;
  stats: Record<string, Record<string, unknown>>;
}

export interface Planet {
  id: string;
  object_id: number;
  full_id: string;
  /**
   * 'blackhole' is the single record that is not authored in level0 — it
   * comes off CRPBlackHoleFeature in globalgamemanagers.assets, and carries
   * the station key set (no air, wind, ocean or biomes).
   */
  type: 'planet' | 'star' | 'station' | 'blackhole';
  parent: string | null;
  radius: number;
  gravity: number;
  wormhole: string | null;
  position: Vec3;
  /**
   * air, wind, ocean, biomes and stations are absent (not null) on station
   * records — a station's complete key set is just full_id, gravity, id,
   * object_id, parent, position, radius, type, wormhole. Only planet/star
   * records carry these.
   */
  air?: { amount: number; radius_min: number; radius_max: number } | null;
  wind?: { speed: number; max_force: number; always_force: number; fixed_rotation: boolean } | null;
  /** null on 11 planet/star bodies with no ocean; present on 6, absent (not null) on stations. */
  ocean?: { enabled: boolean; include_in_miniature: boolean; deep: string; shallow: string } | null;
  biomes?: { index: number; color: string }[];
  stations?: string[];
  /** Present only on the 2 star records — material colours, not a light source's physics. */
  star?: { col_a: number[]; col_b: number[]; noise: string; temperature: number };
}

export interface Reward {
  component: string;
  amount: number;
}

export interface Objective {
  id: number;
  key: string;
  type: 'Delivery' | 'Package' | 'Special';
  hidden: boolean;
  start: string;
  end: string;
  /**
   * Quest items the objective needs handed in. Same `{component, amount}`
   * shape as `reward`, NOT a bare id list — declaring it `string[]` rendered
   * "[object Object]" on all 19 objectives that have one.
   */
  requires_components: Reward[];
  reward: Reward[];
  /**
   * Prerequisite references, NOT this objective's own numeric id space —
   * despite the name, these are strings. Almost always another objective's
   * `key` (16 of 20 entries in the real data); the rest are a station's
   * `full_id` (a location you must reach first, e.g.
   * "PlanetStation_Basalt_CandyVein"). Resolve against objectiveByKey() and
   * planetByFullId() both — do not assume every entry is an objective.
   */
  dependencies: string[];
  title: string;
  obj: string;
  desc: string;
  hints: string;
}

export interface IconEntry {
  /** The 128px icon: what a 2x screen needs for the components grid's 64 CSS px. */
  file: string;
  /** The 64px one, for a 1x screen. See DataService.iconSrcset(). */
  file_1x: string;
  /** Dimensions of `file`, not of the game texture it came from. */
  size: string;
  texture: string;
}

/**
 * The game's own name for a stat, from its `InvSC*` localization entry —
 * written by tools/stat_labels.py, keyed by prefab field.
 */
export interface StatLabel {
  key: string;
  label: string;
  suffix: string;
}

/** The two fields we read out of a .world save. */
export interface World {
  _name: string;
  _objectives: { m_Keys: number[]; m_Values: { _completed: number }[] };
  _universeLocations: { m_Keys: number[] };
}
