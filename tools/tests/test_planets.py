"""planets.json, and the helpers in generator/planets.py that produce it.

The record tests read the committed output. The helper tests below open the
real scene once (a UnityPy load of level0 + sharedassets0, which is slow) and
share it, rather than mocking the game's data.
"""
import hashlib
import os
import re

import pytest

from generator import config, planets

HEX_RE = re.compile(r"^#[0-9a-f]{6}$")


@pytest.fixture(scope="session")
def scene():
    """The real level0 scene, built once for every test that needs it."""
    return planets.load_scene()


@pytest.fixture(scope="session")
def raw(scene):
    """The classified bodies: [(class name, typetree dict)]."""
    return planets.classify(scene)[0]


def data_digest():
    """Every file under data/, by content."""
    out = {}
    for root, _, files in os.walk(config.DATA):
        for f in files:
            path = os.path.join(root, f)
            with open(path, "rb") as fh:
                out[os.path.relpath(path, config.DATA)] = hashlib.sha256(
                    fh.read()).hexdigest()
    return out


def load():
    return config.load_json("planets.json")


def test_counts_match_level0():
    d = load()
    assert sum(1 for x in d if x["type"] == "planet") == 15
    assert sum(1 for x in d if x["type"] == "star") == 2
    assert sum(1 for x in d if x["type"] == "station") == 18


def test_earth_is_present_and_sane():
    earth = next(x for x in load() if x["id"] == "Earth")
    assert earth["type"] == "planet"
    assert earth["radius"] > 0
    assert earth["gravity"] > 0
    assert earth["air"]["amount"] > 0          # Earth has an atmosphere
    assert "Headquarters" in " ".join(earth["stations"])


def test_every_station_resolves_to_a_known_planet():
    d = load()
    planets = {x["id"] for x in d if x["type"] in ("planet", "star")}
    for s in (x for x in d if x["type"] == "station"):
        assert s["parent"] in planets, "orphan station: " + s["id"]


def test_biome_colors_are_hex():
    for p in (x for x in load() if x["type"] == "planet"):
        for b in p["biomes"]:
            assert b["color"].startswith("#") and len(b["color"]) == 7


def test_ocean_populated_where_present_else_none():
    """Planets with a sibling PlanetOcean component get real hex colours;
    the rest get None -- never a half-filled dict."""
    d = load()
    with_ocean = 0
    for p in (x for x in d if x["type"] == "planet"):
        oc = p["ocean"]
        if oc is None:
            continue
        with_ocean += 1
        assert isinstance(oc["enabled"], bool)
        assert HEX_RE.match(oc["deep"])
        assert HEX_RE.match(oc["shallow"])
    # Ashbelt, Aundara, CoronaSilva, Earth, Moon, Tenebra -- the 6 planets
    # that actually have a PlanetOcean MonoBehaviour in level0.
    assert with_ocean == 6


# ---- direct unit tests for the helper functions in generator/planets.py ----

def _first_biome_pptr(raw):
    """A real Planet's first `_terrainPaletteSetup` PPtr entry, taken
    straight from the parsed scene."""
    for cls, d in raw:
        if cls != "Planet":
            continue
        tps = d.get("_terrainPaletteSetup") or []
        if tps:
            return tps[0]
    raise AssertionError("no Planet with a non-empty _terrainPaletteSetup found")


def test_deref_resolves_the_two_biome_hops(scene, raw):
    biom_pptr = _first_biome_pptr(raw)
    biom_obj = scene.deref(biom_pptr, local="env")
    assert biom_obj is not None
    bd = biom_obj.read_typetree(scene.nodes("PlanetTerrainBiom"))
    tex_obj = scene.deref(bd.get("_color"), local="shared")
    assert tex_obj is not None
    assert tex_obj.type.name == "Texture2D"


def test_deref_handles_missing_or_unresolvable_pptr(scene):
    assert scene.deref(None) is None
    assert scene.deref({}) is None
    assert scene.deref({"m_FileID": 0, "m_PathID": 0}) is None
    assert scene.deref({"m_FileID": 2, "m_PathID": 999999999}) is None


def test_avg_color_returns_a_real_color_for_a_real_biome(scene, raw):
    color = planets.avg_color(scene, _first_biome_pptr(raw))
    assert HEX_RE.match(color)
    assert color != planets.GREY


def test_avg_color_falls_back_on_unresolvable_pptr(scene):
    assert planets.avg_color(scene, None) == planets.GREY
    assert planets.avg_color(scene, {"m_FileID": 2, "m_PathID": 999999999}) == planets.GREY


def test_wormhole_world_unwraps_the_struct():
    assert planets.wormhole_world({"_wormholeWorldIndex": {"_world": 1}}) == "1"
    assert planets.wormhole_world({"_wormholeWorldIndex": {"_world": 0}}) == "0"


def test_wormhole_world_defaults_when_field_absent():
    # PlanetStation objects carry no _wormholeWorldIndex field at all.
    assert planets.wormhole_world({}) == "0"


def test_reading_the_scene_writes_nothing_into_data(scene):
    """Only `python -m generator.planets` may write data/.

    Reading the scene and rebuilding every record must stay read-only: a
    build that also wrote left planets.json and the two star noise PNGs
    dirty after every test run. `noise_dir=None` is what withholds the pen.
    """
    before = data_digest()
    records = planets.build_records(scene)
    assert len(records) > 30
    assert data_digest() == before
