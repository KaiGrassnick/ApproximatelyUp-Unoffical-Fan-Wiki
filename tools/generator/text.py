"""The game's text, cleaned up and with its placeholders filled in.

Ported to src/app/core/text.ts for the Angular app; keep the two in step
so they never disagree about how a description renders.
"""
from __future__ import annotations

import re

_COLOR_TAG = re.compile(r"</?color[^>]*>")
_SIZE_TAG = re.compile(r"</?size[^>]*>")


def clean_text(t: str | None) -> str:
    """Unity rich text -> the markdown-ish convention the data files use.

    `<b>`/`<u>`/`<i>` become `**`/`_`/`*`; `<color>` and `<size>` carry no
    meaning outside the game's own renderer and are dropped. Localization.csv
    escapes its line breaks as a literal backslash-n, which is turned into a
    real newline here rather than being left for every consumer to handle.
    """
    if not t:
        return ""
    t = t.replace("\\n", "\n")
    t = _COLOR_TAG.sub("", t)
    t = _SIZE_TAG.sub("", t)
    t = t.replace("<b>", "**").replace("</b>", "**")
    t = t.replace("<u>", "_").replace("</u>", "_")
    t = t.replace("<i>", "*").replace("</i>", "*")
    return t.strip()


# ---- resolve "{0}" placeholders in the localized text from the prefab fields ----
GEN_FIELDS = ("_maxPowerGenerationPerSec", "_maxGenerationPerSecond")
IGNITE_FIELDS = ("_solidFuelRequiredIgnitionPower",)
USE_FIELDS = ("_powerConsumptionPerSec", "_consumptionPerSec",
              "_maxPowerConsumption", "_idlePowerConsumptionPerSec")


def fmt(v) -> str:
    if isinstance(v, float):
        return format(v, "g")
    return str(v)


def resolve(text: str, flat: dict) -> str:
    """Substitute {0} with the matching prefab value; leave it alone if unsure."""
    if "{0}" not in text or text.count("{0}") != 1:
        return text
    low = text.lower()
    if "p/s" not in low:
        return text
    if "generate" in low:
        cands = GEN_FIELDS
    elif "ignite" in low:
        cands = IGNITE_FIELDS
    else:
        cands = USE_FIELDS
    for c in cands:
        if c in flat:
            return text.replace("{0}", fmt(flat[c]))
    return text
