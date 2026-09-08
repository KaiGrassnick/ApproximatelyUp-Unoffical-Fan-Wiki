#!/usr/bin/env python3
"""Draws public/og-card.png -- the 1200x630 image a link to this wiki unfurls as.

Every link to the wiki ends up pasted into the game's Discord sooner or later,
and this is what is seen there before anything else. It was a hand-made binary
with no source until this script existed, which meant the one thing it had to
stay in step with -- the wiki's own look -- it could not.

Nothing here is invented. The globe is `data/planets/Earth.webp`, the same
rendered disc a planet page shows; the colours are the tokens from
`src/styles/_tokens.scss`; the mark is the geometry of `public/favicon.svg`;
and the type is the site's own Chakra Petch and Inter, unpacked out of the
@fontsource packages in node_modules (see `woff_to_sfnt` -- Pillow cannot read
a .woff, and this is cheaper than a font toolchain for two faces).

Run it after changing any of those:

    .venv/bin/python scripts/gen-og-card.py

It prints the size it wrote. Nothing in the build calls it: the card changes
about as often as the logo does, so the PNG is committed and this is the
source it was committed from.
"""

from __future__ import annotations

import os
import struct
import sys
import zlib

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "og-card.png")
GLOBE = os.path.join(ROOT, "data", "planets", "Earth.webp")
FONTS = os.path.join(ROOT, "node_modules", "@fontsource")

W, H = 1200, 630

# src/styles/_tokens.scss
BG = (5, 7, 13)
PANEL = (11, 16, 32)
TEXT = (223, 232, 245)
TEXT_DIM = (142, 163, 191)
TEXT_FAINT = (91, 109, 136)
ACCENT = (79, 216, 255)


def woff_to_sfnt(path: str) -> bytes:
    """A WOFF1 file turned back into the TrueType font inside it.

    WOFF1 is a container, not a format: an sfnt whose tables have each been
    zlib-deflated, with a directory in front. Undoing it is a header, a table
    directory and an inflate per table, which is all this does. (A table may
    also be stored uncompressed, which is what the compLength == origLength
    case is.)
    """
    with open(path, "rb") as fh:
        data = fh.read()
    if data[:4] != b"wOFF":
        raise ValueError(f"{path} is not a WOFF file")
    flavor, _, num_tables = struct.unpack(">4sIH", data[4:14])

    directory = []
    for i in range(num_tables):
        tag, offset, comp_len, orig_len, checksum = struct.unpack(
            ">4sIIII", data[44 + i * 20 : 44 + i * 20 + 20]
        )
        raw = data[offset : offset + comp_len]
        directory.append((tag, checksum, raw if comp_len == orig_len else zlib.decompress(raw)))
    directory.sort(key=lambda t: t[0])

    # sfnt header: the binary-search fields are derived from the table count
    # and are what a reader uses to find a table without scanning.
    entry_selector = max(num_tables.bit_length() - 1, 0)
    search_range = (1 << entry_selector) * 16
    head = struct.pack(
        ">4sHHHH", flavor, num_tables, search_range, entry_selector,
        num_tables * 16 - search_range,
    )

    offset = len(head) + num_tables * 16
    records, body = [], []
    for tag, checksum, table in directory:
        records.append(struct.pack(">4sIII", tag, checksum, offset, len(table)))
        padded = table + b"\0" * (-len(table) % 4)
        body.append(padded)
        offset += len(padded)
    return head + b"".join(records) + b"".join(body)


def face(package: str, file: str, size: int) -> ImageFont.FreeTypeFont:
    """One @fontsource face at a pixel size, via a temporary sfnt in memory."""
    import io

    path = os.path.join(FONTS, package, "files", file)
    if not os.path.exists(path):
        sys.exit(f"missing {path} -- run `npm install` first")
    return ImageFont.truetype(io.BytesIO(woff_to_sfnt(path)), size)


def background() -> Image.Image:
    """The field: the page's own background, lifted towards the globe.

    A flat rectangle reads as a slide rather than as this site, and the wiki's
    own pages sit on a gradient of exactly this kind.
    """
    img = Image.new("RGB", (W, H), BG)
    glow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(glow).ellipse([W * 0.52, -H * 0.55, W * 1.25, H * 1.5], fill=110)
    glow = glow.filter(ImageFilter.GaussianBlur(160))
    return Image.composite(Image.new("RGB", (W, H), PANEL), img, glow)


def globe(card: Image.Image) -> None:
    """Earth, bled off the right edge so the card is a window and not a poster.

    The disc is drawn at more than the card's height and pushed past the edge:
    a whole circle floating in the middle of the space reads as a sticker.
    """
    disc = Image.open(GLOBE).convert("RGBA").resize((720, 720), Image.LANCZOS)

    # The rim light. The render is lit from the front, so without this the
    # planet ends where the dark background begins and the silhouette is lost.
    # Multiplied by the disc's own alpha, or the blur spills past the edge and
    # the planet wears a halo instead of a lit limb.
    ring = Image.new("L", disc.size, 0)
    edge = [2, 2, disc.size[0] - 3, disc.size[1] - 3]
    ImageDraw.Draw(ring).ellipse(edge, outline=255, width=4)
    ring = ImageChops.multiply(ring.filter(ImageFilter.GaussianBlur(5)), disc.split()[3])
    lit = Image.new("RGBA", disc.size, ACCENT + (255,))
    lit.putalpha(Image.eval(ring, lambda v: int(v * 0.55)))
    disc.alpha_composite(lit)

    card.paste(disc, (W - 560, -70), disc)


def mark(size: int) -> Image.Image:
    """The favicon's mark, at any size. Same geometry as public/favicon.svg."""
    ss = 8  # supersample, then Lanczos down: these are all curves and diagonals
    def px(v):
        """One SVG user unit of the 32-unit viewBox, in supersampled pixels."""
        return v * size * ss / 32

    img = Image.new("RGBA", (size * ss, size * ss), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, size * ss - 1, size * ss - 1], radius=px(6), fill=PANEL)
    tile = img.split()[3]
    d.ellipse([px(1), px(21), px(31), px(51)], fill=ACCENT)
    pts = [(px(7.5), px(18.5)), (px(16), px(7.5)), (px(24.5), px(18.5))]
    w = px(5)
    d.line(pts, fill=TEXT, width=int(w), joint="curve")
    for x, y in pts:
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=TEXT)
    img.putalpha(tile)  # the planet is clipped by the tile, as in the SVG
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    card = background()
    globe(card)
    d = ImageDraw.Draw(card)

    head = face("chakra-petch", "chakra-petch-latin-600-normal.woff", 78)
    sub = face("inter", "inter-latin-600-normal.woff", 30)
    body = face("inter", "inter-latin-400-normal.woff", 25)
    small = face("inter", "inter-latin-400-normal.woff", 22)

    left, top = 118, 150
    icon = mark(96)
    card.paste(icon, (left, top - 118), icon)

    # The rule the whole left column hangs off, in the accent: the same device
    # the wiki uses to mark a section as belonging to it.
    d.rectangle([left - 38, top - 118, left - 34, top + 328], fill=ACCENT)

    d.text((left, top), "APPROXIMATELY", font=head, fill=TEXT)
    d.text((left, top + 92), "UP", font=head, fill=ACCENT)
    d.text((left, top + 208), "Unofficial Fan Wiki", font=sub, fill=TEXT_DIM)
    sections = "Components · Planets · Stations · Missions"
    tagline = "Stats straight from the game files."
    d.text((left, top + 268), sections, font=body, fill=TEXT_DIM)
    d.text((left, top + 308), tagline, font=small, fill=TEXT_FAINT)

    # Quantised rather than saved as truecolour. The card is flat fields, one
    # gradient and one small photographic disc, so 256 colours with dithering
    # is indistinguishable at the size anything actually shows it -- and it is
    # the difference between a quarter of a megabyte and a tenth of one on a
    # file that every unfurl fetches.
    card.quantize(
        colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG
    ).save(OUT, optimize=True)
    print(f"wrote {OUT} ({os.path.getsize(OUT) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
