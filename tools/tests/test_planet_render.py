import os

import numpy as np
import pytest

from generator import config
from generator import planet_render as pr

# config.SPHEROIDS, not a hard-coded C:\ path: the game folder is
# per-machine and comes from .env, so a literal path could only ever work on
# the one machine whose Steam library happened to match. Tests that need the
# binaries skip themselves when the game is not installed.
SPHEROIDS = config.SPHEROIDS
needs_game = pytest.mark.skipif(not os.path.isdir(SPHEROIDS),
                                reason="game files not installed on this machine")


def test_face_resolution_from_known_sizes():
    assert pr.face_resolution(201326592, 2) == 4096     # Earth_0.dat, uint16
    assert pr.face_resolution(25165824, 1) == 2048      # Earth_1.dat, uint8
    assert pr.face_resolution(1572864, 1) == 512        # Aundara_1.dat, uint8


def test_face_resolution_rejects_bad_size():
    with pytest.raises(ValueError):
        pr.face_resolution(1234567, 1)


@needs_game
def test_real_files_all_have_derivable_resolutions():
    """Every shipped binary must fit the 6 x n^2 model, or we do not understand it."""
    for fn in os.listdir(SPHEROIDS):
        if not fn.endswith(".dat"):
            continue
        kind = fn.rsplit("_", 1)[1][0]
        if kind not in ("0", "1"):
            continue
        bps = 2 if kind == "0" else 1
        pr.face_resolution(os.path.getsize(os.path.join(SPHEROIDS, fn)), bps)


@needs_game
def test_load_face_downsamples_real_height_face():
    """A real 4096x4096 height face strided down to the 256 working grid."""
    path = os.path.join(SPHEROIDS, "Earth_0.dat")
    res = pr.face_resolution(os.path.getsize(path), 2)
    out = pr.load_face(path, 0, res, np.uint16, 256)
    assert out.shape == (256, 256)


@needs_game
def test_load_face_upsamples_real_kovo_biome_face():
    """Kovo's biome faces are 128x128 -- below the 256 working grid, which
    exercises the upsample path a fixed stride (res // out_res == 0 -> 1)
    used to get wrong by only reading the face's top-left corner."""
    path = os.path.join(SPHEROIDS, "Kovo_1.dat")
    res = pr.face_resolution(os.path.getsize(path), 1)
    assert res < 256, "test expects Kovo's biome faces to be smaller than the working grid"
    out = pr.load_face(path, 0, res, np.uint8, 256)
    assert out.shape == (256, 256)


@needs_game
def test_load_face_shape_guard_fires_on_bad_index_count(monkeypatch):
    """If a future indexing change ever returns the wrong number of samples,
    load_face must fail loudly at the source instead of surfacing as an
    obscure IndexError deep inside _sample."""
    real_linspace = np.linspace

    def short_linspace(start, stop, num, *a, **kw):
        return real_linspace(start, stop, num - 1, *a, **kw)

    monkeypatch.setattr(pr.np, "linspace", short_linspace)
    path = os.path.join(SPHEROIDS, "Earth_0.dat")
    with pytest.raises(ValueError, match="expected shape"):
        pr.load_face(path, 0, 4096, np.uint16, 256)


@needs_game
def test_earth_renders_a_non_empty_globe():
    from PIL import Image
    out = os.path.join(config.DATA, "planets", "Earth.webp")
    assert os.path.exists(out), "run generator/planet_render.py Earth first"
    img = Image.open(out).convert("RGBA")
    assert img.size == (512, 512)
    alpha = img.getchannel("A")
    opaque = sum(1 for a in alpha.get_flattened_data() if a > 0)
    frac = opaque / (512 * 512)
    assert 0.6 < frac < 0.9, "expected a disc covering ~pi/4 of the square"
    disc = [p[:3] for p in img.get_flattened_data() if p[3] > 0]
    assert len(set(disc)) > 200, "globe is flat colour - height or biome data is wrong"
