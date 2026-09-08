import os

from PIL import Image

from generator import config

PLANETS = os.path.join(config.DATA, "planets")


def _normalize(s):
    """Independent re-implementation of the id/filename normalisation --
    deliberately not imported from generator/planet_render.py, so a bug shared
    between renderer and test can't hide a coverage gap (as it did before:
    the old have_bin set was built with the renderer's own naive filename
    stem, so it silently agreed with the renderer that CoronaSilva -- whose
    binaries ship as "Corona Silva_0.dat", with a space -- had no data)."""
    return s.replace(" ", "").casefold()


def test_every_planet_with_binaries_has_an_image():
    # config.SPHEROIDS, not a hard-coded C:\ path: the game folder is
    # per-machine and comes from .env, and this test could only ever run on
    # the one machine whose Steam library happened to match. With no game
    # files present there is nothing to check, which is a skip, not a failure.
    spheroids = config.SPHEROIDS
    if not os.path.isdir(spheroids):
        return
    stems = [f[:-len("_0.dat")] for f in os.listdir(spheroids) if f.endswith("_0.dat")]
    norm_stems = {_normalize(s) for s in stems}
    for p in config.load_json("planets.json"):
        if p["type"] != "planet":
            continue
        if _normalize(p["id"]) in norm_stems:
            assert os.path.exists(os.path.join(PLANETS, p["id"] + ".webp")), \
                "{} has a binary on disk (one of {}) but no rendered PNG".format(
                    p["id"], stems)


def test_planets_are_visually_distinct():
    """Two different planets must not render identically."""
    imgs = {}
    for fn in sorted(os.listdir(PLANETS)):
        if fn.endswith(".webp"):
            imgs[fn] = Image.open(os.path.join(PLANETS, fn)).convert("RGB").tobytes()
    assert len(imgs) >= 2
    assert len(set(imgs.values())) == len(imgs), "some planets rendered identically"
