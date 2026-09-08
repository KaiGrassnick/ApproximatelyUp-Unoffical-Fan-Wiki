"""Extract planets, stars and stations from level0 into data/planets.json.

Importing this module has no side effects: it loads nothing and writes
nothing. `load_scene()` opens the game's asset files, and every function that
needs them takes that scene. Tests build one scene and reuse it.

Run:  python -m generator.planets
"""
from __future__ import annotations

import os
import sys

import UnityPy

from . import config, parse_cs, typetree

STAR_NOISE_DIR = os.path.join(config.DATA, "star_noise")
STAR_NOISE_SIZE = 512

GREY = "#888888"
KINDS = {"Planet": "planet", "Star": "star", "PlanetStation": "station"}


class Scene:
    """level0 and sharedassets0, with the type trees and enums that read them.

    Failures that mean a missing or wrong record are appended to `warnings`
    rather than raised: one unresolvable body should not cost the other
    thirty-four, and `main()` fails the run if the list is non-empty.
    """

    def __init__(self, env, shared, trees: typetree.TypeTrees, enums: dict) -> None:
        self.env = env
        self.shared = shared
        self.env_objs = {o.path_id: o for o in env.objects}
        self.shared_objs = {o.path_id: o for o in shared.objects}
        self.trees = trees
        self.enums = enums
        self.oid = enums["ObjectID"]
        self.warnings: list[str] = []

    def nodes(self, cls: str) -> list:
        return self.trees.require(cls)

    def label(self, oid) -> str:
        return self.oid.get(oid, str(oid))

    def deref(self, pptr, local: str = "env"):
        """Resolve a PPtr dict ({m_FileID, m_PathID}) to an ObjectReader.

        Empirically (verified against level0's external-file table): a PPtr read
        off an object in `env` (level0) with m_FileID==2 points into `shared`
        (sharedassets0.assets, level0's 2nd dependency); m_FileID==0 means "same
        file the containing object came from" -- pass local="shared" when
        dereferencing a PPtr found on an object that itself came from `shared`.
        """
        if not pptr:
            return None
        pid = pptr.get("m_PathID", 0)
        if not pid:
            return None
        fid = pptr.get("m_FileID", 0)
        if fid == 0:
            return (self.env_objs if local == "env" else self.shared_objs).get(pid)
        if fid == 2:
            return self.shared_objs.get(pid)
        return self.env_objs.get(pid) or self.shared_objs.get(pid)

    def read_class(self, o) -> str | None:
        """MonoBehaviour -> its script's class name, or None on failure.

        Failures (e.g. a stripped or unresolvable script reference) are
        collected into `warnings` rather than silently dropped, per the
        per-item-failures-are-reported rule -- identified by the object's
        path_id since that is the only stable handle available when the
        script itself cannot be read.
        """
        try:
            return o.read(check_read=False).m_Script.read().m_ClassName
        except Exception as e:                              # noqa: BLE001
            self.warnings.append("failed to read MonoBehaviour script class for "
                                 f"object path_id={o.path_id}: {e}")
            return None


def load_scene() -> Scene:
    """Open level0, sharedassets0 and the IL2CPP dump. Slow; call once."""
    config.require_game()
    config.require_extracted()
    _, enums = parse_cs.parse(config.IL2CPP_CS)
    trees = typetree.TypeTrees()
    return Scene(UnityPy.load(config.LEVEL0), UnityPy.load(config.SHARED_ASSETS0),
                 trees, enums)


def init_position(d: dict) -> dict:
    """The body's authored universe coordinate, as plain floats."""
    p = d.get("_initPosition") or {}
    return {k: float(p.get(k, 0.0)) for k in ("x", "y", "z")}


def wormhole_world(d: dict) -> str:
    """`_wormholeWorldIndex` is a `WormholeWorldIndex` struct ({_world: int}),
    not a plain int and not an enum (there is no WormholeWorldIndex enum in
    il2cpp.cs -- it is an ECS IComponentData struct wrapping a single int).
    PlanetStation objects do not carry this field at all, so default to 0.
    """
    w = d.get("_wormholeWorldIndex", 0)
    world = w.get("_world", 0) if isinstance(w, dict) else (w or 0)
    return str(world)


def color_hex(c: dict) -> str:
    """Unity `Color` struct ({r, g, b, a}, floats 0..1) -> "#rrggbb".

    Same convention as `avg_color` below: Unity Color-field values are
    stored exactly as picked in the inspector, with no gamma re-encoding
    baked into serialization (parallel to how an albedo texture's raw
    bytes are already display-space, which is why avg_color needs no
    gamma step either). Direct 0..1 -> 0..255 scaling was checked against
    all 6 PlanetOcean instances and produces plausible, on-theme colours
    with no correction (Aundara/CoronaSilva teal, Ashbelt amber, Tenebra
    rust-orange, Moon neutral grey); a gamma-corrected version was also
    computed and just made everything look washed out/pastel, so no gamma
    step is applied here.
    """
    def ch(v):
        return max(0, min(255, round((v or 0.0) * 255)))
    return "#{:02x}{:02x}{:02x}".format(ch(c.get("r")), ch(c.get("g")), ch(c.get("b")))


def avg_color(scene: Scene, biom_pptr) -> str:
    """Mean RGB of a biome colour texture, as "#rrggbb".

    `_terrainPaletteSetup` on Planet is a PPtr<PlanetTerrainBiom>[] -- each
    entry is a reference to a PlanetTerrainBiom ScriptableObject asset that
    lives in sharedassets0.assets (m_FileID==2 from level0). That asset's own
    `_color` field is in turn a PPtr<Texture2D> (m_FileID==0, i.e. also in
    sharedassets0.assets) -- so getting a colour takes two hops of
    dereferencing, not one.
    """
    biom_obj = scene.deref(biom_pptr, local="env")
    if biom_obj is None:
        return GREY
    try:
        bd = biom_obj.read_typetree(scene.nodes("PlanetTerrainBiom"))
        tex_obj = scene.deref(bd.get("_color"), local="shared")
        if tex_obj is None:
            return GREY
        img = tex_obj.read().image.convert("RGB").resize((8, 8))
        px = img.get_flattened_data()
        n = len(px)
        r, g, b = (sum(p[i] for p in px) // n for i in (0, 1, 2))
        return f"#{r:02x}{g:02x}{b:02x}"
    except Exception:                                       # noqa: BLE001
        # A biome whose texture will not decode still has to yield *a* colour,
        # or the palette shifts and every later biome index renders as the
        # wrong terrain. Grey is the same default an unlisted index gets.
        return GREY


def star_material(scene: Scene, d: dict, noise_dir: str | None = None) -> dict | None:
    """A Star's surface: the two colours its material ramps between, plus the
    noise texture that selects along that ramp.

    The two star materials are identical in 15 of their 17 colour properties;
    only `_ColA` (dark) and `_ColB` (bright, HDR) differ, which is what makes
    them the ramp. `_NoiseTxd0` is saved out downsampled -- when `noise_dir` is
    given -- so the renderer can read a plain PNG instead of reopening a 288 MB
    asset file.
    """
    mo = scene.deref(d.get("_material"), local="env")
    if mo is None:
        scene.warnings.append(f"star material PPtr {d.get('_material')} did not resolve")
        return None
    try:
        sp = mo.read().m_SavedProperties
    except Exception as e:                                  # noqa: BLE001
        scene.warnings.append(f"could not read star material: {e}")
        return None

    cols = dict(getattr(sp, "m_Colors", []) or [])

    def rgb(key):
        c = cols.get(key)
        return [float(c.r), float(c.g), float(c.b)] if c is not None else None

    col_a, col_b = rgb("_ColA"), rgb("_ColB")
    if col_a is None or col_b is None:
        scene.warnings.append("star material missing _ColA/_ColB")
        return None

    noise_name = None
    for k, v in (getattr(sp, "m_TexEnvs", []) or []):
        if k != "_NoiseTxd0":
            continue
        tex = getattr(v, "m_Texture", None)
        to = scene.shared_objs.get(getattr(tex, "path_id", 0))
        if to is None:
            scene.warnings.append("star noise texture did not resolve")
            break
        try:
            img = to.read()
            noise_name = img.m_Name
            if noise_dir:
                os.makedirs(noise_dir, exist_ok=True)
                img.image.convert("L").resize(
                    (STAR_NOISE_SIZE, STAR_NOISE_SIZE)).save(
                        os.path.join(noise_dir, noise_name + ".png"))
        except Exception as e:                              # noqa: BLE001
            scene.warnings.append(f"could not save star noise texture: {e}")
    return {"col_a": col_a, "col_b": col_b, "noise": noise_name,
            "temperature": d.get("_temperature")}


def classify(scene: Scene):
    """One pass over level0: the bodies, and the oceans that sit beside them.

    PlanetOcean is a *separate* sibling component on the same GameObject as its
    Planet (verified: all 6 instances in level0 share m_GameObject with a Planet
    MonoBehaviour, not a parent or child GameObject) -- collected into
    `ocean_by_go` keyed by that GameObject's path_id so it can be joined onto
    the matching Planet record afterwards, regardless of which one UnityPy
    iterates first.

    Returns (raw, ocean_by_go) where raw is [(class name, typetree dict)].
    """
    ocean_by_go: dict[int, dict] = {}
    raw: list[tuple[str, dict]] = []
    for o in scene.env.objects:
        if o.type.name != "MonoBehaviour":
            continue
        cls = scene.read_class(o)
        if cls is None:
            continue
        if cls == "PlanetOcean":
            od = o.read_typetree(scene.nodes(cls))
            go_pid = (od.get("m_GameObject") or {}).get("m_PathID", 0)
            if go_pid:
                ocean_by_go[go_pid] = {
                    "enabled": bool(od.get("m_Enabled", 1)),
                    "include_in_miniature": bool(od.get("_includeInMiniature", 1)),
                    "deep": color_hex(od.get("_deepWaterColor") or {}),
                    "shallow": color_hex(od.get("_shallowWaterColor") or {}),
                }
            continue
        if cls in KINDS:
            raw.append((cls, o.read_typetree(scene.nodes(cls))))
    return raw, ocean_by_go


def body_record(scene: Scene, cls: str, d: dict, ocean_by_go: dict,
                noise_dir: str | None) -> dict:
    oid = d.get("_universeLocationID", 0)
    full = scene.label(oid)
    kind = KINDS[cls]
    # Planet_Earth -> Earth ; PlanetStation_Earth_Headquarters -> Earth / Headquarters
    parts = full.split("_")
    if kind == "station":
        ident = "_".join(parts[2:]) if len(parts) > 2 else full
        parent = parts[1] if len(parts) > 2 else None
    else:
        ident = "_".join(parts[1:]) if len(parts) > 1 else full
        parent = None
    rec = {
        "id": ident, "object_id": oid, "full_id": full, "type": kind,
        "parent": parent,
        "radius": (d.get("_setupRadius") or {}).get("_radius", 0.0),
        "gravity": (d.get("_setupGravity") or {}).get("_gravity", 0.0),
        "wormhole": wormhole_world(d),
        # The authored universe coordinate. NOT the GameObject's Transform —
        # in level0 most bodies share one placeholder transform, because the
        # real positions come from this field at runtime.
        "position": init_position(d),
    }
    if kind == "station":
        return rec

    air = d.get("_setupAirDensity") or {}
    rec["air"] = {"amount": air.get("_amount", 0.0),
                  "radius_min": air.get("_radiusMin", 0.0),
                  "radius_max": air.get("_radiusMax", 0.0)}
    rec["wind"] = {"speed": d.get("_windSpeed", 0.0),
                   "max_force": d.get("_windMaxForce", 0.0),
                   "always_force": d.get("_windAlwaysForce", 0.0),
                   "fixed_rotation": bool(d.get("_windFixedRotation", 0))}
    # Planet (and its base classes UniverseSpheroid / UniverseMonoBehaviour)
    # has no ocean field of its own in il2cpp.cs -- checked exhaustively,
    # neither _setupOcean nor _ocean nor anything else ocean-related is
    # declared there. Ocean water is instead driven by a *separate* sibling
    # MonoBehaviour, `PlanetOcean` (TypeDefIndex 3016), joined here via
    # shared m_GameObject; only 6 of the 15 planets have one.
    go_pid = (d.get("m_GameObject") or {}).get("m_PathID", 0)
    rec["ocean"] = ocean_by_go.get(go_pid)
    rec["biomes"] = [{"index": i, "color": avg_color(scene, b)}
                     for i, b in enumerate(d.get("_terrainPaletteSetup") or [])]
    rec["stations"] = []
    if kind == "star":
        rec["star"] = star_material(scene, d, noise_dir)
    return rec


def black_hole(scene: Scene) -> dict | None:
    """The one body outside level0.

    It is authored on CRPBlackHoleFeature, a render-pipeline feature living in
    globalgamemanagers.assets, and carries its own universe coordinate in the
    same space as the planets. Everything else about it (radius, gravity)
    comes from `_wormholeWorldParams`, one entry per wormhole world.
    """
    if not os.path.isfile(config.GLOBAL_GAME_MANAGERS):
        scene.warnings.append("globalgamemanagers.assets missing — no black hole record")
        return None
    ggm = UnityPy.load(config.GLOBAL_GAME_MANAGERS)
    for o in ggm.objects:
        if o.type.name != "MonoBehaviour":
            continue
        if scene.read_class(o) != "CRPBlackHoleFeature":
            continue
        d = o.read_typetree(scene.nodes("CRPBlackHoleFeature"))
        params = d.get("_wormholeWorldParams") or []
        if not params:
            scene.warnings.append("CRPBlackHoleFeature has no _wormholeWorldParams")
            return None
        # Radius and gravity are per-world fields but identical across the
        # three; only the colours and the accretion disk differ. Taking world
        # 0's is safe, and saying so out loud is cheaper than a record that
        # has to explain which world its numbers came from.
        radii = {round(w.get("_radius", 0.0), 3) for w in params}
        gravs = {round(w.get("_gravity", 0.0), 3) for w in params}
        if len(radii) > 1 or len(gravs) > 1:
            scene.warnings.append("black hole differs per world: "
                                  f"radii {sorted(radii)} gravities {sorted(gravs)}"
                                  )
        p = d.get("_position") or {}
        return {
            "id": "BlackHole",
            "object_id": next((v for v, n in scene.oid.items() if n == "BlackHole"), 999),
            "full_id": "BlackHole",
            "type": "blackhole",
            "parent": None,
            "radius": params[0].get("_radius", 0.0),
            "gravity": params[0].get("_gravity", 0.0),
            # No world index: one position, and it is in every world — that
            # is what a wormhole is.
            "wormhole": None,
            "position": {k: float(p.get(k, 0.0)) for k in ("x", "y", "z")},
        }
    scene.warnings.append("no CRPBlackHoleFeature in globalgamemanagers.assets")
    return None


def build_records(scene: Scene, noise_dir: str | None = None) -> list[dict]:
    """Every planet, star, station and the black hole, sorted and cross-linked.

    Pass `noise_dir` to also write the two star noise PNGs; leaving it None
    keeps this read-only, which is what lets the tests call it.
    """
    raw, ocean_by_go = classify(scene)
    records = [body_record(scene, cls, d, ocean_by_go, noise_dir) for cls, d in raw]

    bh = black_hole(scene)
    if bh:
        records.append(bh)

    by_id = {r["id"]: r for r in records if r["type"] in ("planet", "star")}
    for r in records:
        if r["type"] != "station":
            continue
        if r["parent"] in by_id:
            by_id[r["parent"]]["stations"].append(r["id"])
        else:
            scene.warnings.append(
                "orphan station {} (parent {!r})".format(r["id"], r["parent"]))

    records.sort(key=lambda r: (r["type"], r["id"]))
    return records


def main() -> int:
    scene = load_scene()
    records = build_records(scene, noise_dir=STAR_NOISE_DIR)
    config.write_json("planets.json", records)

    def count(kind):
        return sum(1 for r in records if r["type"] == kind)

    print("planets.json:", count("planet"), "planets,", count("star"), "stars,",
          count("station"), "stations,", count("blackhole"), "black hole,",
          sum(1 for r in records if r["type"] == "planet" and r["ocean"]),
          "with ocean data")
    # A stub assembly that will not load is expected -- the dump carries
    # framework and third-party assemblies the generator has no use for -- so
    # it is reported as a note and never fails the run. A body that could not
    # be read is a missing or wrong record, and does.
    for w in scene.trees.warnings:
        print("  note:", w)
    for w in scene.warnings:
        print("  WARNING:", w)
    return 1 if scene.warnings else 0


if __name__ == "__main__":
    sys.exit(main())
