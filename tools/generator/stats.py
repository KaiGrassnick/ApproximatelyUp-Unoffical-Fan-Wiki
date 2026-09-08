"""Which prefab fields are meaningful stats and which are cosmetic noise.

Ported to src/app/core/stats.ts (useful()/cosmetic()/flatten()) for the
Angular app; keep the two lists identical so they never silently disagree
about what counts as a stat.

`flatten`, `cosmetic` and `useful` have no production caller on this side any
more -- the wiki that used to render stat tables is the Angular app now. They
are the reference implementation the TypeScript port is checked against, not
vestigial code to delete; tools/tests/test_availability.py exercises them.
"""
from __future__ import annotations

COSMETIC = ("light", "particle", "sound", "color", "fan", "indicator", "icon",
            "uipreview", "renderer", "facesetup", "mesh", "sprite", "blow",
            "propertiesmaterial", "boundscollider", "collider")
SKIP_PREFIX = ("_bounds", "_uiPreview", "_oceanFloating", "_electricPorts",
               "_scGroup", "_scSecondary")
# `_mass` is NOT here: the game labels and shows it (InvSCMass), so hiding it
# made the wiki the poorer of the two. `_maxTemperature` is, by choice -- it
# is a material class ("Iron (1)") rather than a figure worth a table row.
SKIP_EXACT = ("_categories", "_customProperties", "_availableAmount",
              "_maxTemperature")


def flatten(d: dict, prefix: str = "") -> dict:
    """Flatten scalars; vectors become x/y/z; lists collapse to a count."""
    out = {}
    for k, v in d.items():
        key = prefix + k
        if isinstance(v, dict):
            if set(v) <= {"x", "y", "z", "w"}:
                for a, b in v.items():
                    out[key + "." + a] = b
            else:
                out.update(flatten(v, key + "."))
        elif isinstance(v, list):
            out[key + ".count"] = len(v)
        else:
            out[key] = v
    return out


def cosmetic(k: str) -> bool:
    kl = k.lower()
    return any(c in kl for c in COSMETIC)


def useful(k: str) -> bool:
    return (not cosmetic(k) and k not in SKIP_EXACT
            and not any(k.startswith(p) for p in SKIP_PREFIX))
