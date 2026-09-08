"""Star globes, rendered from the game's own star materials.

Each star's material differs from the other in exactly two properties — a dark
`_ColA` and a bright HDR `_ColB` — plus one noise texture. Those are the
surface: noise selects along the ColA..ColB ramp. `_ColB` is HDR (values well
above 1.0), so the brightness mapping to a displayable colour is ours; the
hue is the game's.
"""
import os

import numpy as np
from PIL import Image

from generator import config

PLANETS = os.path.join(config.DATA, "planets")
NOISE = os.path.join(config.DATA, "star_noise")


def star(name):
    return next(p for p in config.load_json("planets.json")
                if p["id"] == name and p["type"] == "star")


# ---------------- data ----------------

def test_star_records_carry_their_material_colours():
    for name in ("Sun", "RedDwarf"):
        s = star(name)["star"]
        for key in ("col_a", "col_b"):
            assert len(s[key]) == 3, (name, key)
            assert all(isinstance(v, (int, float)) for v in s[key]), (name, key)
        assert s["noise"], name


def test_col_b_is_hdr_and_brighter_than_col_a():
    for name in ("Sun", "RedDwarf"):
        s = star(name)["star"]
        assert max(s["col_b"]) > 1.0, f"{name} _ColB should be HDR"
        assert sum(s["col_b"]) > sum(s["col_a"])


def test_the_two_stars_have_different_colours():
    """15 of the 17 material colours are shared; ColA/ColB are what differ."""
    assert star("Sun")["star"]["col_a"] != star("RedDwarf")["star"]["col_a"]
    assert star("Sun")["star"]["col_b"] != star("RedDwarf")["star"]["col_b"]


def test_noise_textures_are_extracted():
    for name in ("Sun", "RedDwarf"):
        path = os.path.join(NOISE, star(name)["star"]["noise"] + ".png")
        assert os.path.exists(path), path
        with Image.open(path) as im:
            assert im.size[0] >= 256 and im.size[0] == im.size[1]


# ---------------- rendered globes ----------------

def disc(name):
    a = np.array(Image.open(os.path.join(PLANETS, name + ".webp")).convert("RGBA"))
    return a[a[..., 3] > 0][:, :3].astype(np.float64)


def test_both_stars_have_a_rendered_globe():
    for name in ("Sun", "RedDwarf"):
        assert os.path.exists(os.path.join(PLANETS, name + ".webp")), name


def test_sun_reads_as_yellow_white():
    """Warm and bright: red and green high and close, blue clearly lower."""
    r, g, b = disc("Sun").mean(axis=0)
    assert r > 150 and g > 130, (r, g, b)
    assert abs(r - g) < 45, (r, g, b)
    assert r - b > 40, (r, g, b)


def test_reddwarf_reads_as_red():
    r, g, b = disc("RedDwarf").mean(axis=0)
    assert r > g * 1.6 and r > b * 1.6, (r, g, b)


def test_the_two_star_globes_are_not_the_same_image():
    with open(os.path.join(PLANETS, "Sun.webp"), "rb") as f:
        a = f.read()
    with open(os.path.join(PLANETS, "RedDwarf.webp"), "rb") as f:
        c = f.read()
    assert a != c


def test_star_surface_is_mottled_not_flat():
    """The noise texture must actually reach the surface."""
    px = disc("Sun")
    assert px.std(axis=0).max() > 8, "surface is flat — noise never applied"
