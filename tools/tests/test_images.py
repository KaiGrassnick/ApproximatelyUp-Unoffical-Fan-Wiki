"""Encoding policy for everything the wiki serves as an image."""
import os

import numpy as np
import pytest
from PIL import Image

from generator import images


def _rgba(path_or_img):
    img = Image.open(path_or_img) if isinstance(path_or_img, str) else path_or_img
    return np.array(img.convert("RGBA"))


def _checkerboard():
    """An icon-shaped image: colour, a hard edge, and a transparent column."""
    src = Image.new("RGBA", (16, 16))
    for x in range(16):
        for y in range(16):
            src.putpixel((x, y), (x * 16, y * 16, 128, 255 if x else 0))
    return src


def test_lossless_preserves_every_visible_pixel(tmp_path):
    src = _checkerboard()
    out = os.path.join(tmp_path, "icon.webp")
    images.save_web(src, out, lossy=False)

    a, b = _rgba(src), _rgba(out)
    assert Image.open(out).format == "WEBP"

    # Alpha is exact everywhere, and colour is exact everywhere alpha shows it.
    assert np.array_equal(a[..., 3], b[..., 3])
    visible = a[..., 3] > 0
    assert np.array_equal(a[visible], b[visible])


def test_lossless_drops_colour_under_fully_transparent_pixels(tmp_path):
    """Not a defect -- libwebp's `exact=False` default, and worth keeping.

    RGB beneath alpha=0 cannot be seen once composited, and letting the encoder
    zero it compresses better. Asserted rather than merely tolerated so that a
    future switch to exact=True is a deliberate, visible decision.
    """
    src = _checkerboard()
    out = os.path.join(tmp_path, "icon.webp")
    images.save_web(src, out, lossy=False)

    transparent = _rgba(src)[..., 3] == 0
    assert transparent.any()
    assert not _rgba(out)[transparent][..., :3].any()


def test_lossy_is_webp_and_smaller_than_lossless(tmp_path):
    src = Image.effect_noise((256, 256), 48).convert("RGB")

    lossy = os.path.join(tmp_path, "a.webp")
    lossless = os.path.join(tmp_path, "b.webp")
    images.save_web(src, lossy, lossy=True)
    images.save_web(src, lossless, lossy=False)

    assert Image.open(lossy).format == "WEBP"
    assert os.path.getsize(lossy) < os.path.getsize(lossless)


def test_creates_missing_parent_directories(tmp_path):
    out = os.path.join(tmp_path, "deep", "nested", "x.webp")
    images.save_web(Image.new("RGB", (4, 4)), out, lossy=True)
    assert os.path.exists(out)


def test_rejects_a_non_webp_path(tmp_path):
    with pytest.raises(ValueError):
        images.save_web(Image.new("RGB", (4, 4)), os.path.join(tmp_path, "x.png"), lossy=True)
