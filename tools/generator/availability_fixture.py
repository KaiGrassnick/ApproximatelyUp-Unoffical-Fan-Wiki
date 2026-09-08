"""Freeze one world's availability result as a fixture for the TypeScript port.

The Angular app recomputes availability in the browser. That port has to agree
with this engine exactly -- a divergence would silently misreport what is
buildable -- so this writes both the trimmed save and the expected result, and
the TS test asserts against them.

Run:  python -m generator.availability_fixture "Story-Welt"
"""
from __future__ import annotations

import json
import os
import sys

from . import availability, config

OUT = os.path.join(config.ROOT, "src", "app", "core", "__fixtures__")


def main(world_name: str) -> int:
    world = config.load_world(world_name)
    if world is None:
        raise SystemExit(f"No world named {world_name!r} under {config.WORLDS}")

    comps = config.load_json("components_full.json")
    objs = config.load_json("objectives.json")
    av = availability.compute_availability(comps, objs, world)

    os.makedirs(OUT, exist_ok=True)

    # Only the two fields the app reads. Nothing identifying travels with it.
    trimmed = {
        "_name": world["_name"],
        "_objectives": world["_objectives"],
        "_universeLocations": {"m_Keys": world["_universeLocations"]["m_Keys"]},
    }
    with open(os.path.join(OUT, "story-welt.world.json"), "w", encoding="utf-8") as f:
        json.dump(trimmed, f, indent=1, ensure_ascii=False)
        f.write("\n")

    expected = {
        "have": sorted(av.have),
        "gate": {k: av.gate[k] for k in sorted(av.gate)},
        "visited": sorted(av.visited),
    }
    with open(os.path.join(OUT, "expected-availability.json"), "w", encoding="utf-8") as f:
        json.dump(expected, f, indent=1, ensure_ascii=False)
        f.write("\n")

    print("have {}, gated {}, visited {}".format(
        len(expected["have"]), len(expected["gate"]), len(expected["visited"])))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "Story-Welt"))
