"""Write data/stat_labels.json -- the game's own names for the stats we show.

The game labels 25 stats in its inventory panel, as `InvSC*` entries in
Localization.csv ("Power consumption: {0} P/s"), translated into all 14
languages. Prefab fields are named nothing like those keys, and the pairing
lives in game code we cannot read, so FIELD_KEYS below is ours -- but every
word of text still comes out of the game's own file, never typed here.

Run:  python -m generator.stat_labels
"""
from __future__ import annotations

import sys

from . import config

# prefab field -> localization key.
#
# Evidence for the less obvious ones, all from the data rather than a guess:
#   _availablePower   is set on all six batteries          -> "Power capacity"
#   _chargeablePower  is non-zero only on the rechargeable ones
#   _maxPower         is set on cables, i.e. throughput    -> "Max power" (P/s)
#   _batteryCapacity  is the Gimbal Thruster's own buffer  -> "Power capacity"
#
# InvSCMaxHeat (_maxTemperature) is deliberately absent: the wiki does not
# show that stat, and a label for a field nothing renders is dead data.
#
# Deliberately absent: InvSCMatStr and InvSCMatDisp describe the *material* a
# prefab points at, which is a PPtr extract_stats.py drops; and InvSCLinStab,
# InvSCAngStab, InvSCForceDur, InvSCMaxFuelReact and InvSCPwrConsumActive have
# no field in the extracted data that can be matched to them with confidence.
# A wrong label is worse than a raw field name, so they stay out.
FIELD_KEYS = {
    "_maxPowerGenerationPerSec": "InvSCPwrGen",
    "_maxGenerationPerSecond": "InvSCPwrGen",
    "_powerConsumptionPerSec": "InvSCPwrConsum",
    "_consumptionPerSec": "InvSCPwrConsum",
    "_idlePowerConsumptionPerSec": "InvSCPwrConsumIdle",
    "_maxPowerConsumption": "InvSCPwrConsumMax",
    "_availablePower": "InvSCPwrCap",
    "_batteryCapacity": "InvSCPwrCap",
    "_chargeablePower": "InvSCPwrCapRechargeable",
    "_maxPower": "InvSCMaxPwr",
    "_maxTimeWithoutPower": "InvSCMaxTimeWoPwr",
    "_fuelCapacity": "InvSCFuelCap",
    "_maxFuel": "InvSCFuelCap",
    "_maxFuelConsumptionPerSecond": "InvSCFuelConsum",
    "_solidFuelRequiredIgnitionPower": "InvSCReqIgnPwr",
    "_maxForce": "InvSCMaxForceM",
    "_maxPlasma": "InvSCMaxPlasma",
    "_absorption": "InvSCImpAbsorp",
    "_mass": "InvSCMass",
}

# Suffixes we do not carry over, and why.
#
# "K"/"M" on InvSCMaxForce* are the game choosing a magnitude per value; the
# wiki prints the plain number, so either suffix would be a lie about it.
# "%" is on templates whose field holds a 0..1 fraction (_absorption is 0.93,
# shown in game as 93%): restating that as "0.93%" would be wrong, and
# scaling it is a conversion we have not verified, so the label is kept and
# the unit dropped.
DROP_SUFFIX = {"K", "M", "%"}


def split_template(text: str) -> tuple[str, str]:
    """"Power consumption: {0} P/s" -> ("Power consumption", "P/s")."""
    before, _, after = text.partition("{0}")
    label = before.rstrip().rstrip(":").rstrip()
    suffix = after.strip()
    return label, ("" if suffix in DROP_SUFFIX else suffix)


def main() -> int:
    config.require_game()
    loc = config.load_localization()

    out, missing = {}, []
    for field, key in sorted(FIELD_KEYS.items()):
        text = loc.get(key)
        if not text:
            missing.append(f"{key} ({field})")
            continue
        label, suffix = split_template(text)
        out[field] = {"key": key, "label": label, "suffix": suffix}

    path = config.write_json("stat_labels.json", dict(sorted(out.items())))
    print(f"wrote {len(out)} labels -> {path}")
    for m in missing:
        print("  MISSING from Localization.csv:", m)
    # A label the game no longer ships is a stat the wiki would print with a
    # raw field name instead, so this is a failure, not a note.
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
