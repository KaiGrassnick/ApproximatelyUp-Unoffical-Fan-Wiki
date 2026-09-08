"""How the wiki's images are encoded, in one place.

Everything served is WebP, lossy at q90, and no larger than the page actually
draws it. Both of those were once decided the other way, and both were changed
for the same reason: Chrome's Lighthouse audit measures what a reader
downloads against what a reader sees.

Sizing. `fit` is the pixel size a call site asks for, and it is always TWICE
the largest CSS size the wiki draws that image at -- 2x is what a retina
display needs, and anything beyond it is bytes no screen can show. Shrinking
from the source rather than rendering small is deliberate for the planet
discs: downsampling a 512px render antialiases the limb better than rasterising
at 288 ever would.

Encoding. Icons were lossless until the audit, on the reasoning that lossy
encoding fringes flat art against transparency. Measured at the size the page
draws them, that turned out not to happen: against the lossless original, q90
moved silhouette pixels by 3.01/255 where the downscale alone already moved
them 2.66, and alpha bleed into fully-transparent pixels was identical to three
decimal places. So the fringing the old note worried about is real in principle
and absent here, and lossless was costing roughly half the icon payload.

Star noise textures are deliberately not routed through here: they are an
input to planet_render, never served, and stay lossless PNG.
"""
from __future__ import annotations

import os

from PIL import Image

# method=6 is the slowest, densest of libwebp's search settings. These images
# are encoded once per extraction and downloaded by every reader, so the
# encoder's time is the cheapest time in the system.
_METHOD = 6
_LOSSY_QUALITY = 90


def save_web(
    img: Image.Image, out_path: str, *, lossy: bool, fit: int | None = None
) -> tuple[int, int]:
    """Write `img` to `out_path` as WebP, creating parent directories.

    `fit` shrinks the longest side to that many pixels first. It never
    enlarges: an image already at or under `fit` is written as it is.

    Returns the size actually written, which is what a caller recording a
    manifest wants -- the source texture's size stopped being the file's the
    moment `fit` arrived.
    """
    if not out_path.endswith(".webp"):
        raise ValueError(f"served images must be .webp, got {out_path!r}")
    if fit is not None and max(img.size) > fit:
        scale = fit / max(img.size)
        img = img.convert("RGBA").resize(
            (max(1, round(img.width * scale)), max(1, round(img.height * scale))),
            Image.LANCZOS,
        )
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    if lossy:
        img.save(out_path, "WEBP", quality=_LOSSY_QUALITY, method=_METHOD)
    else:
        img.save(out_path, "WEBP", lossless=True, quality=100, method=_METHOD)
    return img.size
