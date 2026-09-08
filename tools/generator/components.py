"""Merge every component's localized text with its prefab stats.

Two sources, joined on the prefab name:

1. **Text** -- StreamingAssets/Localization.csv, where component keys are
   `SC_<id>_Name`, `_Desc` and `_Port0..N`.
2. **Numbers** -- the `SC_<id>` GameObjects in globalgamemanagers.assets,
   whose `EPC_SC*` MonoBehaviours hold the actual stats.

Writes data/components_full.json.

Run:  python -m generator.components
"""
from __future__ import annotations

import collections
import sys

import UnityPy

from . import config, parse_cs, typetree
from .text import clean_text

# These carry no stat worth publishing: renderers, collider geometry and
# netcode plumbing. Skipping them by name keeps the per-prefab loop from
# deserializing a type tree it will only throw away.
SKIP_CLASSES = {"EPC_Renderer", "DOTSColliderBox", "DOTSColliderSphere",
                "EPC_NetcoreServerValue", "EPC_ThrusterBlow"}

# Unity's own MonoBehaviour header fields, present on every object and
# meaningless as component stats.
UNITY_FIELDS = ("m_GameObject", "m_Script", "m_Enabled", "m_Name", "m_ObjectHideFlags")

PPTR_KEYS = {"m_FileID", "m_PathID"}


def is_pptr(v) -> bool:
    return isinstance(v, dict) and set(v.keys()) == PPTR_KEYS


def scrub(v):
    """Drop PPtrs / empty containers; keep numbers, bools, strings, vectors."""
    if is_pptr(v):
        return None
    if isinstance(v, dict):
        out = {}
        for k, x in v.items():
            s = scrub(x)
            if s is not None:
                out[k] = s
        return out or None
    if isinstance(v, list):
        out = [s for s in (scrub(x) for x in v) if s is not None]
        return out or None
    if isinstance(v, (bytes, bytearray)):
        return None
    return v


class Decoder:
    """Turns raw deserialized MonoBehaviour data into publishable values.

    Needs the parsed il2cpp.cs to do it: the type trees give field *names*,
    but only the C# dump says which of those fields are enums, and what their
    integer values mean.
    """

    def __init__(self, classes: dict, enums: dict) -> None:
        self.classes = classes
        self.enums = enums

    def enum_label_in(self, e: dict, value) -> str | None:
        if not isinstance(value, int):
            return None
        if value in e:
            return e[value]
        # flags
        parts = [lbl for v, lbl in sorted(e.items()) if v and (value & v) == v]
        if parts and sum({v for v in e if v and (value & v) == v}) == value:
            return "|".join(parts)
        return None

    def decorate(self, cls: str, data: dict) -> dict:
        """Replace enum-typed values with readable labels, recursing into structs."""
        out = {}
        for k, v in data.items():
            if k in UNITY_FIELDS:
                continue
            r = self.convert(parse_cs.field_type(self.classes, cls, k), v, owner=cls)
            if r is not None:
                out[k] = r
        return out

    def enum_named(self, t: str | None, owner: str | None) -> dict | None:
        """The enum a field of declared type `t` in class `owner` means.

        Three lookups, most specific first: `Owner.Enum` for an enum nested
        in the class that declares the field; the declared name as written
        when it is already qualified (`SCTypeSignalProcessor.Type`); and the
        bare short name, which is a merge of every enum by that name and
        only right when the name is unique.
        """
        declared = (t or "").replace("[]", "").strip()
        base = declared.split(".")[-1]
        for key in (f"{owner}.{base}" if owner else None, declared, base):
            if key and key in self.enums:
                return self.enums[key]
        return None

    def convert(self, t: str | None, v, owner: str | None = None):
        base = (t or "").replace("[]", "").split(".")[-1].strip()
        if isinstance(v, list):
            out = [x for x in (self.convert(t, e, owner) for e in v) if x is not None]
            return out or None
        if isinstance(v, dict):
            if is_pptr(v):
                return None
            if base in self.classes:
                return self.decorate(base, v) or None
            return scrub(v)
        e = self.enum_named(t, owner)
        if e is not None:
            lab = self.enum_label_in(e, v)
            if lab is not None:
                return f"{lab} ({v})"
        return scrub(v)


def read_prefabs(env) -> dict:
    """Every `SC_*` GameObject in the asset file, by name.

    The raw-bytes pre-filter is what makes this bearable: reading every
    GameObject in globalgamemanagers.assets to check its name takes minutes,
    and the ones we want all carry the literal "SC_" in their serialized form.
    """
    prefabs = {}
    for o in env.objects:
        if o.type.name != "GameObject" or b"SC_" not in o.get_raw_data():
            continue
        go = o.read()
        if go.m_Name.startswith("SC_"):
            prefabs[go.m_Name] = go
    return prefabs


def read_stats(prefabs: dict, trees: typetree.TypeTrees, decoder: Decoder):
    """prefab name -> {class, stats}, plus per-prefab failures and class counts."""
    results = {}
    class_counts: collections.Counter = collections.Counter()
    errors = []
    for name, go in sorted(prefabs.items()):
        stats = {}
        main_cls = None
        for c in go.m_Components:
            co = c.deref()
            if co.type.name != "MonoBehaviour":
                continue
            try:
                cls = co.read(check_read=False).m_Script.read().m_ClassName
            except Exception as e:                          # noqa: BLE001
                errors.append((name, f"script read: {e}"))
                continue
            class_counts[cls] += 1
            if cls in SKIP_CLASSES:
                continue
            nd = trees.nodes(cls)
            if not nd:
                errors.append((name, f"no typetree for {cls}"))
                continue
            try:
                data = co.read_typetree(nd)
            except Exception as e:                          # noqa: BLE001
                errors.append((name, f"{cls}: {e}"))
                continue
            if main_cls is None or cls.startswith("EPC_SC"):
                main_cls = cls
            stats[cls] = decoder.decorate(cls, data)
        results[name] = {"class": main_cls, "stats": stats}
    return results, class_counts, errors


def merge(loc: dict, results: dict) -> list[dict]:
    """One record per `SC_*_Name` localization key, with its prefab data if any.

    The localization file is the spine, not the asset file: 51 of the 361
    entries have no prefab in this build (stale or upcoming strings), and they
    are carried through with `in_build: false` rather than dropped, so the
    wiki can say so.
    """
    items = []
    for key in sorted(loc):
        if not key.startswith("SC_") or not key.endswith("_Name"):
            continue
        cid = key[:-len("_Name")]
        ports = []
        i = 0
        while f"{cid}_Port{i}" in loc:
            ports.append(clean_text(loc[f"{cid}_Port{i}"]))
            i += 1
        r = results.get(cid)
        items.append({
            "id": cid[len("SC_"):],
            "prefab": cid,
            "name": loc[key],
            "desc": clean_text(loc.get(f"{cid}_Desc", "")),
            "ports": ports,
            "in_build": r is not None,
            "class": (r or {}).get("class"),
            "stats": (r or {}).get("stats", {}),
        })
    return items


def main() -> int:
    config.require_game()
    config.require_extracted()

    print("parsing il2cpp.cs ...")
    classes, enums = parse_cs.parse(config.IL2CPP_CS)
    print(f"  classes={len(classes)} enums={len(enums)}")

    print("loading dummy dlls ...")
    trees = typetree.TypeTrees()
    decoder = Decoder(classes, enums)

    loc = config.load_localization()

    print("loading globalgamemanagers.assets ...")
    env = UnityPy.load(config.GLOBAL_GAME_MANAGERS)
    prefabs = read_prefabs(env)
    print(f"  prefabs: {len(prefabs)}")

    results, class_counts, errors = read_stats(prefabs, trees, decoder)
    print(f"  decoded: {len(results)}  errors: {len(errors)}")
    for e in errors[:15]:
        print("   !", e)

    items = merge(loc, results)
    path = config.write_json("components_full.json", items)
    print("wrote {}: {} entries, {} with prefab data".format(
        path, len(items), sum(1 for i in items if i["in_build"])))
    print("top classes:", class_counts.most_common(8))
    return 0


if __name__ == "__main__":
    sys.exit(main())
