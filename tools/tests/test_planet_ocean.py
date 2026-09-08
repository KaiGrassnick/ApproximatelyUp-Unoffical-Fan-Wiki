"""Ocean compositing on the rendered planet globes.

Sea level is INFERRED at the midpoint of the normalised height range — the
game authors no waterline field anywhere in its types. The evidence is that
the resulting coverage matches each world's character (Aundara ~98%, Earth
~82%, Moon ~3%). Treat these tests as pinning that inference, not as proof of
the game's real rule.
"""
import os

import numpy as np
from PIL import Image

from generator import config
from generator import planet_render as pr

PLANETS = os.path.join(config.DATA, "planets")


def record(name):
    return next(p for p in config.load_json("planets.json") if p["id"] == name)


# ---------------- data ----------------

def test_ocean_records_carry_the_miniature_flag():
    for p in config.load_json("planets.json"):
        if p.get("ocean"):
            assert "include_in_miniature" in p["ocean"], p["id"]


def test_moon_ocean_is_excluded_from_the_miniature_by_the_game():
    """Moon has ocean data but the game sets _includeInMiniature = 0."""
    assert record("Moon")["ocean"]["include_in_miniature"] is False
    assert record("Earth")["ocean"]["include_in_miniature"] is True


# ---------------- the decision function ----------------

def test_ocean_palette_is_used_only_where_the_game_would_draw_it():
    assert pr.ocean_palette(record("Earth")) is not None
    assert pr.ocean_palette(record("Aundara")) is not None
    assert pr.ocean_palette(record("Moon")) is None, "excluded from miniature"
    assert pr.ocean_palette(record("Kovo")) is None, "has no ocean at all"


def test_water_mask_marks_everything_below_sea_level():
    h = np.array([[0.0, 0.25], [0.5, 0.9]], dtype=np.float32)
    mask = pr.water_mask(h)
    assert mask.tolist() == [[True, True], [False, False]]


def test_water_mask_coverage_matches_each_world_character():
    """Aundara is the ocean world; Earth is mostly water; Ashbelt is lava seas."""
    cov = {}
    for name in ("Aundara", "Earth", "Ashbelt"):
        path = os.path.join(pr.SPHEROIDS, pr._resolve_stem(name) + "_0.dat")
        res = pr.face_resolution(os.path.getsize(path), 2)
        v = np.stack([pr.load_face(path, f, res, np.uint16, 96) for f in range(6)])
        cov[name] = float(pr.water_mask(v.astype(np.float32) / 65535.0).mean())
    assert cov["Aundara"] > 0.9, cov
    assert 0.6 < cov["Earth"] < 0.95, cov
    assert cov["Ashbelt"] < 0.3, cov


# ---------------- the rendered globes ----------------

def opaque_pixels(name):
    img = Image.open(os.path.join(PLANETS, name + ".webp")).convert("RGBA")
    a = np.array(img)
    return a[a[..., 3] > 0][:, :3].astype(np.int16)


def hex_to_rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.int16)


def fraction_bluer_than_land(name, margin=12):
    """Share of the disc where blue clearly leads red.

    A distance-to-water-colour test is useless here: Earth's `deep` is
    near-black and matches its own shadowed land, so it passes with no water
    rendered at all. Earth's and Aundara's terrain palettes are browns, greens
    and greys where red >= blue; their water is the only blue-leading thing on
    the globe, which makes this an actual discriminator.
    """
    px = opaque_pixels(name)
    return float(((px[:, 2] - px[:, 0]) > margin).mean())


def test_earth_globe_actually_contains_water():
    """Earth's biomes are green/brown/grey — nothing blue-leading but ocean."""
    assert fraction_bluer_than_land("Earth") > 0.3, "Earth still renders as all land"


def test_aundara_is_overwhelmingly_water():
    assert fraction_bluer_than_land("Aundara") > 0.5


def test_a_planet_without_ocean_stays_dry():
    """Helirion is 96% below the inferred sea level but has no PlanetOcean —
    coverage must never be what decides whether water is drawn."""
    assert pr.ocean_palette(record("Helirion")) is None
    assert fraction_bluer_than_land("Helirion") < 0.05
