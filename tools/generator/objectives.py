"""Decode ObjectiveSetup assets: rewards, required components, dependencies.

Writes data/objectives.json.

Run:  python -m generator.objectives
"""
from __future__ import annotations

import collections
import sys

import UnityPy

from . import config, parse_cs, typetree
from .text import clean_text

LOC_FIELDS = ("title", "obj", "desc", "hints")


def prefab_owners(env) -> dict:
    """MonoBehaviour path_id -> the `SC_*` prefab it belongs to, without the prefix.

    Rewards and requirements point at a component's MonoBehaviour, not at its
    GameObject, so resolving one to a component id takes this reverse index.
    """
    go_name = {}
    for o in env.objects:
        if o.type.name != "GameObject" or b"SC_" not in o.get_raw_data():
            continue
        n = o.read().m_Name
        if n.startswith("SC_"):
            go_name[o.path_id] = n[len("SC_"):]

    objs = {o.path_id: o for o in env.objects}
    owners = {}
    for pid, name in go_name.items():
        for c in objs[pid].read().m_Components:
            owners[c.deref().path_id] = name
    return owners


def amounts(lst, owners: dict, warnings: list, ctx: str = "") -> list[dict]:
    """ComponentAmount entries -> resolved {component, amount} dicts.

    This project exists to get the numbers right, so a pointer that fails to
    resolve to a prefab is not silently dropped -- it is collected into
    `warnings` (with the m_PathID and, when given, which objective/field it
    was found in) so an under-counted reward/requirement list is reported
    rather than passed through looking complete.
    """
    out = []
    for e in lst or []:
        pid = e["_sc"]["m_PathID"]
        nm = owners.get(pid)
        if nm:
            out.append({"component": nm, "amount": e["_amount"]})
        else:
            warnings.append("unresolved component pointer (m_PathID={}){}".format(
                pid, " in " + ctx if ctx else ""))
    return out


def texts(oid_label: str, loc: dict) -> dict:
    """The objective's localization block, keyed off the ObjectID label's stem."""
    stem = oid_label.split("_")[-1]
    return {k.lower(): clean_text(loc.get(f"OBJ_{stem}_{k}", ""))
            for k in ("Title", "Obj", "Desc", "Hints")}


def stem_collisions(records: list[dict]) -> list[str]:
    """Objectives whose ObjectID stems collide on the same OBJ_<stem>_* block.

    `texts()` keys localisation off oid_label.split("_")[-1] (the stem), so two
    objectives sharing a stem -- e.g. "Package_Ashbelt_DamagedThruster" and a
    hypothetical "DamagedThruster" -- would silently collide on the same
    OBJ_<stem>_* loc rows. The mapping itself is not changed (no ground truth
    for what the "correct" key would be, and changing it risks silently
    altering objectives.json). Checked against the real dataset: the one
    collision that exists today (Package_Ashbelt_DamagedThruster /
    DamagedThruster) is genuinely benign -- there is no OBJ_DamagedThruster_*
    block in Localization.csv at all, so both objectives resolve to empty
    text, exactly what each would get on its own; nothing is mis-assigned. A
    permanently-red pipeline step trains a reader to ignore the exit code, so
    this is surfaced as a loud warning rather than a failure -- but the
    wording tells the reader exactly what to check, since a *future* stem
    collision where one objective actually carries real text would be a
    genuinely ambiguous mapping in need of a proper per-objective key.
    """
    by_stem = collections.defaultdict(list)
    for o in records:
        by_stem[o["key"].split("_")[-1]].append(o)

    out = []
    for stem, group in sorted(by_stem.items()):
        if len(group) <= 1:
            continue
        keys = [o["key"] for o in group]
        if any(o.get(f) for o in group for f in LOC_FIELDS):
            out.append(
                f"localisation stem collision: {keys} all resolve to OBJ_{stem}_* -- "
                "and at least one of them currently carries real text, so this mapping "
                "is genuinely ambiguous and needs a proper per-objective key (not "
                "changed here: no ground truth for what the correct key would be).")
        else:
            out.append(
                f"localisation stem collision: {keys} all resolve to OBJ_{stem}_*, but "
                f"there is no OBJ_{stem}_* block in Localization.csv -- all of them "
                "currently resolve to empty text (benign, same as each would get on its "
                "own). Re-check this if any of them ever gains real text: the mapping "
                "would then be ambiguous.")
    return out


def build(env, trees: typetree.TypeTrees, enums: dict, loc: dict, warnings: list):
    """Every ObjectiveSetup in the file, as records sorted by ObjectID."""
    oid_labels = enums["ObjectID"]
    objective_types = enums.get("ObjectiveType", {})
    owners = prefab_owners(env)
    nodes = trees.require("ObjectiveSetup")

    out = []
    for o in env.objects:
        if o.type.name != "MonoBehaviour":
            continue
        try:
            if o.read(check_read=False).m_Script.read().m_ClassName != "ObjectiveSetup":
                continue
        except Exception:                                   # noqa: BLE001
            # A MonoBehaviour whose script reference will not resolve cannot be
            # identified at all; there are thousands in this file and only 69
            # objectives, so this is the normal case, not a failure.
            continue
        d = o.read_typetree(nodes)
        oid = d["_objectiveID"]
        label = oid_labels.get(oid, str(oid))
        out.append({
            "id": oid,
            "key": label,
            "type": objective_types.get(d["_objectiveType"], d["_objectiveType"]),
            "hidden": bool(d["_hidden"]),
            "start": oid_labels.get(d["_start"], d["_start"]),
            "end": oid_labels.get(d["_end"], d["_end"]),
            "requires_components": amounts(
                d.get("_objectiveComponents"), owners, warnings,
                f"{label} requires_components"),
            "reward": amounts(d.get("_reward"), owners, warnings, f"{label} reward"),
            "dependencies": [oid_labels.get(x, x) for x in d.get("_dependencies") or []],
            **texts(label, loc),
        })
    out.sort(key=lambda x: x["id"])
    return out


def main() -> int:
    config.require_game()
    config.require_extracted()

    _, enums = parse_cs.parse(config.IL2CPP_CS)
    trees = typetree.TypeTrees()
    loc = config.load_localization()
    env = UnityPy.load(config.GLOBAL_GAME_MANAGERS)

    # `warnings`: unresolved reward/requirement pointers -- real data loss in
    # the numbers this project exists to produce, so these drive exit 1.
    # `collisions`: localisation-stem collisions -- reported just as loudly
    # but never fail the run; see stem_collisions() for why.
    warnings: list[str] = []
    records = build(env, trees, enums, loc, warnings)
    collisions = stem_collisions(records)

    config.write_json("objectives.json", records)
    print("objectives:", len(records), "-> objectives.json")
    print("with rewards:", sum(1 for o in records if o["reward"]))
    for w in warnings + collisions:
        print("  WARNING:", w)

    # An unresolved reward/requirement pointer is real data loss -- a component
    # silently missing from a reward list -- so that alone fails the run. A
    # localisation-stem collision is reported just as loudly but does not: a
    # pipeline step that is permanently red trains a reader to ignore the exit
    # code, destroying the signal for when a pointer failure actually happens.
    return 1 if warnings else 0


if __name__ == "__main__":
    sys.exit(main())
