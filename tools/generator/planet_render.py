"""Render a planet globe from its terrain cubemap binaries.

Layout is inferred from file sizes, not documented:
  <Name>_0.dat  height  6 faces x res^2 x uint16
  <Name>_1.dat  biome   6 faces x res^2 x uint8
Resolution differs per planet (Earth 2048 biome faces, Aundara 512), so it is
always derived from the file size.
"""
from __future__ import annotations

import math
import os
import sys

import numpy as np
from PIL import Image

from . import config, images

SPHEROIDS = config.SPHEROIDS
OUT_DIR = os.path.join(config.DATA, "planets")
# Equirectangular surface maps, for the wiki's WebGL galaxy: the same terrain
# as the discs in OUT_DIR, but unwrapped and unlit, because three.js lights
# and shades them itself. The discs stay -- they are what a planet's own page
# and the body cards show, and a flat picture of a globe is the right thing
# there.
MAP_DIR = os.path.join(OUT_DIR, "maps")


def face_resolution(size_bytes, bytes_per_sample):
    """n such that size == 6 * n * n * bytes_per_sample."""
    per_face = size_bytes / 6 / bytes_per_sample
    n = int(round(math.sqrt(per_face)))
    if n <= 0 or 6 * n * n * bytes_per_sample != size_bytes:
        raise ValueError(f"size {size_bytes} is not 6 x n^2 x {bytes_per_sample}")
    return n


def load_face(path, face, res, dtype, out_res):
    """One cubemap face, resampled (nearest-neighbour) to out_res x out_res.

    Uses evenly spaced index selection across the *full* face so this is
    correct both when downsampling (res > out_res) and when upsampling
    (res < out_res, e.g. Kovo's 128x128 biome faces) -- a fixed stride of
    `res // out_res` silently truncates to 1 in that regime and only reads
    the top-left corner of the face instead of the whole thing.

    The two index arrays are applied to the memmap in one fancy-indexing
    gather (`arr[rows[:, None], cols[None, :]]`), so numpy reads exactly
    out_res*out_res elements off disk -- the full-resolution face (let alone
    the whole file) is never materialised in memory.
    """
    itemsize = np.dtype(dtype).itemsize
    offset = face * res * res * itemsize
    arr = np.memmap(path, dtype=dtype, mode="r", offset=offset, shape=(res, res))
    idx = np.linspace(0, res - 1, out_res).astype(np.int64)
    out = np.asarray(arr[idx[:, None], idx[None, :]])
    if out.shape != (out_res, out_res):
        raise ValueError(f"load_face: expected shape ({out_res}, {out_res}), got {out.shape}"
                          )
    return out


CUBE = 256   # working resolution per face

# INFERRED, not read from the game. No waterline field exists anywhere in the
# IL2CPP types -- heights are a displacement around the planet's radius, so
# the waterline sits at the midpoint of the normalised range. The evidence is
# that the resulting coverage matches each world: Aundara (the ocean world,
# where the submarine mission is) comes out 98% water, Earth 82%, the lava
# worlds ~15%. Coverage alone never decides whether water is drawn -- only the
# presence of an enabled, miniature-included PlanetOcean does, which is why
# Helirion sits 96% below this line and stays bone dry.
SEA_LEVEL = 0.5


def water_mask(h01):
    """Boolean mask of everything below the inferred sea level.

    `h01` is normalised height in 0..1, as stored in the height cubemap.
    """
    return np.asarray(h01) < SEA_LEVEL


STAR_NOISE_DIR = os.path.join(config.DATA, "star_noise")


# The largest a disc is drawn is 140 CSS px, on the planet detail page; the
# planets grid draws 17 of them at 110. 288 is 2x the detail page, and the
# renders stay at `size` (512) internally -- downsampling that antialiases the
# limb better than rasterising at 288 would.
DISC_PX = 288


def render_star(name, out_path, size=512):
    """A star globe, from its material's ColA..ColB ramp and noise texture.

    `_ColB` is HDR — the Sun's is (38.9, 32.7, 8.6), where 1.0 is white — so
    something has to map it into a displayable range. We normalise by its own
    brightest channel (preserving hue) and apply a display gamma, which lands
    the bright surface near white with the star's colour still reading. The
    game reaches its look through a bloom/tone-mapping pipeline we do not
    reproduce, so this is our mapping of the game's colours, not its output.
    """
    rec = next((p for p in config.load_json("planets.json")
                if p["id"] == name and p["type"] == "star"), None)
    if not rec or not rec.get("star") or not rec["star"].get("noise"):
        return False
    s = rec["star"]
    noise_path = os.path.join(STAR_NOISE_DIR, s["noise"] + ".png")
    if not os.path.exists(noise_path):
        return False
    noise = np.asarray(Image.open(noise_path).convert("L"), dtype=np.float32) / 255.0
    nres = noise.shape[0]

    yy, xx = np.mgrid[0:size, 0:size]
    nx = (xx - size / 2) / (size / 2 * 0.95)
    ny = (yy - size / 2) / (size / 2 * 0.95)
    r2 = nx * nx + ny * ny
    inside = r2 <= 1.0
    nz = np.sqrt(np.clip(1 - r2, 0, 1))

    # equirectangular lookup into the noise texture
    u = (np.arctan2(nz, nx) / (2 * math.pi)) % 1.0
    v = np.arccos(np.clip(ny, -1, 1)) / math.pi
    t = noise[np.clip((v * (nres - 1)).astype(np.int32), 0, nres - 1),
              np.clip((u * (nres - 1)).astype(np.int32), 0, nres - 1)]

    # The noise is a detail/flare mask, not a linear ramp selector: roughly
    # half of the Sun's texels are exactly 0 (median 0.016, p95 0.757), so
    # anchoring the dark end at _ColA paints half the disc near-black, which
    # is not how the game shows a star. Floored and gamma-biased so _ColB is
    # the base and the noise reads as mottling on a lit surface. The curve is
    # ours; the two colours and the noise texture are the game's.
    t = 0.55 + 0.45 * (t ** 0.35)

    col_a = np.array(s["col_a"], dtype=np.float32)
    col_b = np.array(s["col_b"], dtype=np.float32)
    lin = col_a + (col_b - col_a) * t[..., None]
    lin /= max(float(col_b.max()), 1e-6)
    rgb = np.clip(lin, 0, 1) ** (1 / 2.2)

    # a star is emissive: only a slight falloff at the limb, no shaded side
    rgb *= (0.82 + 0.18 * nz)[..., None]

    out = np.zeros((size, size, 4), dtype=np.uint8)
    out[..., :3] = np.clip(rgb * 255.0, 0, 255).astype(np.uint8)
    out[..., 3] = np.where(inside, 255, 0)
    images.save_web(Image.fromarray(out, "RGBA"), out_path, lossy=True, fit=DISC_PX)
    return True


def _lonlat_dirs(width, height):
    """Direction vectors for an equirectangular image of the given size.

    u spans longitude 0..2pi and v latitude, with v=0 at the north pole --
    three.js's SphereGeometry UV convention, so a texture rendered here maps
    onto a sphere without a flip or an offset. Pixel centres (the +0.5) rather
    than edges, so the seam meets itself.
    """
    lon = (np.arange(width) + 0.5) / width * 2 * math.pi
    lat = (np.arange(height) + 0.5) / height * math.pi
    slat = np.sin(lat)[:, None]
    return (slat * np.sin(lon)[None, :],
            np.cos(lat)[:, None] * np.ones((1, width)),
            slat * np.cos(lon)[None, :])


def render_equirect(name, out_path, width=512, height=256):
    """A planet's surface unwrapped to an equirectangular map.

    Shares the biome palette, height shading and ocean ramp with render(), and
    deliberately drops that function's fake directional light: this is a
    texture, and baking a light into it would fight the real one in the scene.

    512x256 because these are sampled onto discs of at most ~120 screen px in
    the galaxy view, and the biome index map is nearest-neighbour noise that
    PNG compresses badly -- 1024x512 quadrupled the committed bytes (5.9 MB
    across 17 bodies) for detail no viewer of that scene can resolve.
    """
    heights, bioms = _faces(name)
    if heights is None:
        return False
    pal = _palette(name)
    dx, dy, dz = _lonlat_dirs(width, height)

    idx = _sample(bioms, dx, dy, dz)
    hgt = _sample(heights, dx, dy, dz).astype(np.float32)
    lo, hi = np.percentile(hgt, [2, 98])
    hn = np.clip((hgt - lo) / max(hi - lo, 1e-6), 0, 1)

    rgb = pal[idx].astype(np.float32)
    rgb *= (0.75 + 0.45 * hn)[..., None]

    water = ocean_palette(planet_record(name))
    if water is not None:
        h01 = hgt / 65535.0
        mask = water_mask(h01)
        if mask.any():
            floor = float(h01[mask].min())
            depth = np.clip((SEA_LEVEL - h01) / max(SEA_LEVEL - floor, 1e-6), 0, 1)
            deep = np.array(water["deep"], dtype=np.float32)
            shallow = np.array(water["shallow"], dtype=np.float32)
            blend = shallow + (deep - shallow) * depth[..., None]
            rgb = np.where(mask[..., None], blend, rgb)

    rgb = np.clip(rgb, 0, 255).astype(np.uint8)
    images.save_web(Image.fromarray(rgb, "RGB"), out_path, lossy=True)
    return True


def render_star_equirect(name, out_path, width=512, height=256):
    """A star's surface unwrapped, from the same colour ramp render_star uses.

    The limb darkening render_star applies is a property of looking at a
    sphere, not of its surface, so it has no place in a texture -- the scene
    produces it by actually being three-dimensional.
    """
    rec = next((p for p in config.load_json("planets.json")
                if p["id"] == name and p["type"] == "star"), None)
    if not rec or not rec.get("star") or not rec["star"].get("noise"):
        return False
    s = rec["star"]
    noise_path = os.path.join(STAR_NOISE_DIR, s["noise"] + ".png")
    if not os.path.exists(noise_path):
        return False
    noise = np.asarray(Image.open(noise_path).convert("L"), dtype=np.float32) / 255.0
    nres = noise.shape[0]

    u = ((np.arange(width) + 0.5) / width)[None, :] * np.ones((height, 1))
    v = ((np.arange(height) + 0.5) / height)[:, None] * np.ones((1, width))
    t = noise[np.clip((v * (nres - 1)).astype(np.int32), 0, nres - 1),
              np.clip((u * (nres - 1)).astype(np.int32), 0, nres - 1)]
    t = 0.55 + 0.45 * (t ** 0.35)

    col_a = np.array(s["col_a"], dtype=np.float32)
    col_b = np.array(s["col_b"], dtype=np.float32)
    lin = col_a + (col_b - col_a) * t[..., None]
    lin /= max(float(col_b.max()), 1e-6)
    rgb = np.clip(np.clip(lin, 0, 1) ** (1 / 2.2) * 255.0, 0, 255).astype(np.uint8)

    images.save_web(Image.fromarray(rgb, "RGB"), out_path, lossy=True)
    return True


def planet_record(name):
    for p in config.load_json("planets.json"):
        if p["id"] == name and p["type"] == "planet":
            return p
    return None


def ocean_palette(rec):
    """(deep, shallow) RGB triples for a body the game would draw water on.

    Returns None when the planet has no ocean, when its ocean is disabled, or
    when the game excludes it from the miniature view -- Moon has real ocean
    data but `_includeInMiniature` is 0, so the galaxy map must not show it.
    """
    if not rec:
        return None
    oc = rec.get("ocean")
    if not oc or not oc.get("enabled") or not oc.get("include_in_miniature"):
        return None

    def rgb(h):
        h = h.lstrip("#")
        return [int(h[i:i + 2], 16) for i in (0, 2, 4)]

    return {"deep": rgb(oc["deep"]), "shallow": rgb(oc["shallow"])}


def _norm(s):
    return s.replace(" ", "").casefold()


def _resolve_stem(name):
    """Binary filename stem for a planet id.

    Prefers an exact `<name>_0.dat` match so nothing changes for the common
    case. If that file is absent, falls back to the stem of a shipped
    `*_0.dat` whose spaces-stripped, case-folded form equals the id's --
    e.g. planets.json's id "CoronaSilva" (from the Unity object name
    Planet_CoronaSilva) against the shipped "Corona Silva_0.dat" (with a
    space). Returns `name` unchanged when nothing matches, so the existing
    "no binaries" skip path still fires for planets that genuinely have no
    files.
    """
    if os.path.exists(os.path.join(SPHEROIDS, name + "_0.dat")):
        return name
    target = _norm(name)
    for fn in os.listdir(SPHEROIDS):
        if fn.endswith("_0.dat") and _norm(fn[:-len("_0.dat")]) == target:
            return fn[:-len("_0.dat")]
    return name


def _faces(name):
    stem = _resolve_stem(name)
    h = os.path.join(SPHEROIDS, stem + "_0.dat")
    b = os.path.join(SPHEROIDS, stem + "_1.dat")
    if not (os.path.exists(h) and os.path.exists(b)):
        return None, None
    hres = face_resolution(os.path.getsize(h), 2)
    bres = face_resolution(os.path.getsize(b), 1)
    heights = np.stack([load_face(h, f, hres, np.uint16, CUBE) for f in range(6)])
    bioms = np.stack([load_face(b, f, bres, np.uint8, CUBE) for f in range(6)])
    return heights, bioms


def _palette(name):
    """biome index -> RGB, from planets.json; grey for anything unlisted.

    "This planet has no entry" (or no matching type) is a normal, expected
    case -- e.g. stars, or a planet id passed on the command line that isn't
    in the data -- and falls through to the grey default with no error. "The
    file could not be read or parsed" is not: that would silently render
    every globe uniform grey with no indication anything was wrong, so it
    propagates instead of being swallowed here.
    """
    pal = np.full((256, 3), 136, dtype=np.uint8)
    data = config.load_json("planets.json")
    for p in data:
        if p["id"] == name and p["type"] == "planet":
            for b in p["biomes"]:
                c = b["color"].lstrip("#")
                pal[b["index"] % 256] = [int(c[i:i + 2], 16) for i in (0, 2, 4)]
    return pal


def _sample(faces, x, y, z):
    """Nearest-neighbour cubemap lookup for direction vectors (arrays)."""
    ax, ay, az = np.abs(x), np.abs(y), np.abs(z)
    face = np.zeros(x.shape, dtype=np.int8)
    u = np.zeros(x.shape)
    v = np.zeros(x.shape)
    m = np.ones(x.shape)

    # The dominant axis picks the face; the other two, divided by it, are the
    # coordinates on that face. Face order is +X 0, -X 1, +Y 2, -Y 3, +Z 4, -Z 5.
    sel = (ax >= ay) & (ax >= az)
    face[sel & (x > 0)] = 0
    face[sel & (x <= 0)] = 1
    u[sel] = np.where(x[sel] > 0, -z[sel], z[sel])
    v[sel] = -y[sel]
    m[sel] = ax[sel]

    sel = (ay > ax) & (ay >= az)
    face[sel & (y > 0)] = 2
    face[sel & (y <= 0)] = 3
    u[sel] = x[sel]
    v[sel] = np.where(y[sel] > 0, z[sel], -z[sel])
    m[sel] = ay[sel]

    sel = (az > ax) & (az > ay)
    face[sel & (z > 0)] = 4
    face[sel & (z <= 0)] = 5
    u[sel] = np.where(z[sel] > 0, x[sel], -x[sel])
    v[sel] = -y[sel]
    m[sel] = az[sel]

    su = np.clip(((u / m + 1) * 0.5 * (CUBE - 1)).astype(np.int32), 0, CUBE - 1)
    sv = np.clip(((v / m + 1) * 0.5 * (CUBE - 1)).astype(np.int32), 0, CUBE - 1)
    return faces[face, sv, su]


def render(name, out_path, size=512):
    heights, bioms = _faces(name)
    if heights is None:
        return False
    pal = _palette(name)

    yy, xx = np.mgrid[0:size, 0:size]
    nx = (xx - size / 2) / (size / 2 * 0.95)
    ny = (yy - size / 2) / (size / 2 * 0.95)
    r2 = nx * nx + ny * ny
    inside = r2 <= 1.0
    nz = np.sqrt(np.clip(1 - r2, 0, 1))

    # tilt so the pole is not dead centre
    tilt = math.radians(20)
    dy = ny * math.cos(tilt) - nz * math.sin(tilt)
    dz = ny * math.sin(tilt) + nz * math.cos(tilt)
    dx = nx

    idx = _sample(bioms, dx, dy, dz)
    hgt = _sample(heights, dx, dy, dz).astype(np.float32)
    lo, hi = np.percentile(hgt[inside], [2, 98])
    hn = np.clip((hgt - lo) / max(hi - lo, 1e-6), 0, 1)

    rgb = pal[idx].astype(np.float32)
    rgb *= (0.75 + 0.45 * hn)[..., None]                       # height shading

    water = ocean_palette(planet_record(name))
    if water is not None:
        # Everything below the inferred sea level becomes water, shaded from
        # `shallow` at the coastline to `deep` at the lowest point, so the
        # ramp reads as depth rather than a flat fill.
        h01 = hgt / 65535.0
        mask = water_mask(h01) & inside
        if mask.any():
            floor = float(h01[mask].min())
            depth = np.clip((SEA_LEVEL - h01) / max(SEA_LEVEL - floor, 1e-6), 0, 1)
            deep = np.array(water["deep"], dtype=np.float32)
            shallow = np.array(water["shallow"], dtype=np.float32)
            blend = shallow + (deep - shallow) * depth[..., None]
            rgb = np.where(mask[..., None], blend, rgb)
    light = np.clip(0.35 + 0.75 * (0.6 * (-nx) + 0.4 * (-ny) + 0.7 * nz), 0, 1.4)
    rgb *= light[..., None]                                     # directional light
    rgb = np.clip(rgb, 0, 255).astype(np.uint8)

    out = np.zeros((size, size, 4), dtype=np.uint8)
    out[..., :3] = rgb
    out[..., 3] = np.where(inside, 255, 0)
    images.save_web(Image.fromarray(out, "RGBA"), out_path, lossy=True, fit=DISC_PX)
    return True


def main(argv: list[str] | None = None) -> int:
    """Render every body named on the command line, or all of them.

    "No binaries for this id" (render() returns False, from _faces()
    finding no matching _0.dat/_1.dat) is an expected, benign outcome --
    some bodies genuinely ship with no cubemap data -- and stays exit 0.
    An exception (unreadable/corrupt file, a size that doesn't fit the
    6 x n^2 x bytes model, a render() failure) is a real problem a human
    needs to look at, so only that counts toward exit 1.
    """
    bodies = config.load_json("planets.json")
    names = list(argv if argv is not None else sys.argv[1:])
    if not names:
        names = [p["id"] for p in bodies if p["type"] in ("planet", "star")]
    stars = {p["id"] for p in bodies if p["type"] == "star"}

    ok, skipped, errors = 0, [], []
    for n in names:
        try:
            # stars have no terrain cubemap; they render from their
            # material's colour ramp and noise texture instead
            is_star = n in stars
            disc = render_star if is_star else render
            unwrap = render_star_equirect if is_star else render_equirect
            if disc(n, os.path.join(OUT_DIR, n + ".webp")):
                ok += 1
                print("rendered", n)
                # Every body that has a disc must have a map: the galaxy scene
                # falls back to a flat colour without one, which reads as a
                # rendering bug rather than as missing data.
                if not unwrap(n, os.path.join(MAP_DIR, n + ".webp")):
                    errors.append(n + " (disc rendered but map did not)")
            else:
                skipped.append(n + " (no binaries)")
        except Exception as e:                              # noqa: BLE001
            errors.append(f"{n} ({e})")
    print(f"rendered {ok}, skipped {len(skipped)}, errors {len(errors)}")
    for entry in skipped:
        print("  skipped:", entry)
    for entry in errors:
        print("  ERROR:", entry)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
