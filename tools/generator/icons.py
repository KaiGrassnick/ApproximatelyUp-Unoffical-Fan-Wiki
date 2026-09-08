"""Export each component's inventory icon to data/icons/<id>.png.

The icon is the `_iconTexture2D` field on the component's MonoBehaviour; where
that is empty we fall back to a Texture2D whose name matches the prefab.

Run:  python -m generator.icons
"""
from __future__ import annotations

import os
import sys

import UnityPy

from . import config, images, typetree

# Two sizes per icon, because the components grid draws 310 of them at 64 CSS
# px and a reader's screen decides how many device pixels that is.
#
#   ICON_PX_1X (64)  what a 1x screen needs for the grid, and all it needs
#   ICON_PX    (128) what a 2x screen needs for the grid; also what the
#                    component detail page uses, which draws one at 96
#
# The grid picks between them with a srcset (see DataService.iconSrcset), so a
# reader on an ordinary monitor fetches half the bytes and a reader on a
# retina display gets the sharp one. The game's own textures are 256, which is
# 4x what the grid needs on any screen.
ICON_PX = 128
ICON_PX_1X = 64

# The MonoBehaviour that carries `_iconTexture2D`: every concrete part
# class is an `EPC_SC*`, and the plain base class is used by a few.
ICON_CLASS_PREFIX = "EPC_SC"
ICON_CLASS_BASE = "EPC_SpaceshipComponent"


def textures_by_name(env) -> dict:
    """Every readable Texture2D in the file, by name -- the fallback lookup."""
    out = {}
    for o in env.objects:
        if o.type.name != "Texture2D":
            continue
        try:
            out.setdefault(o.read().m_Name, o)
        except Exception:                                   # noqa: BLE001
            # A texture whose data cannot be decoded is no use as a fallback,
            # and the prefab's own _iconTexture2D is the primary path anyway.
            continue
    return out


def read_prefabs(env) -> dict:
    """Every `SC_*` GameObject in the asset file, by name."""
    prefabs = {}
    for o in env.objects:
        if o.type.name != "GameObject" or b"SC_" not in o.get_raw_data():
            continue
        go = o.read()
        if go.m_Name.startswith("SC_"):
            prefabs[go.m_Name] = go
    return prefabs


def icon_texture(go, objs: dict, trees: typetree.TypeTrees):
    """The Texture2D a prefab's component MonoBehaviour points at, or None."""
    for c in go.m_Components:
        co = c.deref()
        if co.type.name != "MonoBehaviour":
            continue
        try:
            cls = co.read(check_read=False).m_Script.read().m_ClassName
        except Exception:                                   # noqa: BLE001
            continue
        if not (cls.startswith(ICON_CLASS_PREFIX) or cls == ICON_CLASS_BASE):
            continue
        nd = trees.nodes(cls)
        if not nd:
            continue
        try:
            d = co.read_typetree(nd)
        except Exception:                                   # noqa: BLE001
            continue
        pid = (d.get("_iconTexture2D") or {}).get("m_PathID", 0)
        if pid and pid in objs:
            return objs[pid]
    return None


def export(env, out_dir: str, trees: typetree.TypeTrees):
    """Save every icon under `out_dir`; return (manifest, missing, failed)."""
    objs = {o.path_id: o for o in env.objects}
    by_name = textures_by_name(env)
    manifest, missing, failed = {}, [], []

    for name, go in sorted(read_prefabs(env).items()):
        cid = name[len("SC_"):]
        tex_obj = icon_texture(go, objs, trees) or by_name.get(name)
        if tex_obj is None:
            missing.append(cid)
            continue
        try:
            tex = tex_obj.read()
            img = tex.image
            written = images.save_web(img, os.path.join(out_dir, cid + ".webp"),
                                      lossy=True, fit=ICON_PX)
            images.save_web(img, os.path.join(out_dir, str(ICON_PX_1X), cid + ".webp"),
                            lossy=True, fit=ICON_PX_1X)
            # The size of the FILE, not of the game's texture: those parted
            # company when ICON_PX arrived, and this sits next to "file".
            manifest[cid] = {"file": f"icons/{cid}.webp",
                             "file_1x": f"icons/{ICON_PX_1X}/{cid}.webp",
                             "size": "{}x{}".format(*written),
                             "texture": tex.m_Name}
        except Exception as e:                              # noqa: BLE001
            failed.append((cid, str(e)[:80]))
    return manifest, missing, failed


def main() -> int:
    config.require_game()
    config.require_extracted()

    out_dir = os.path.join(config.DATA, "icons")
    os.makedirs(out_dir, exist_ok=True)

    trees = typetree.TypeTrees()
    env = UnityPy.load(config.GLOBAL_GAME_MANAGERS)
    manifest, missing, failed = export(env, out_dir, trees)

    config.write_json("icons.json", manifest)
    print("saved:", len(manifest), " no icon:", len(missing), " failed:", len(failed))
    if missing:
        print("  no icon:", ", ".join(missing[:20]))
    for c, e in failed[:10]:
        print("  failed:", c, e)
    # A texture that resolved but would not decode is a lost icon, not a
    # cosmetic hiccup: the wiki renders a blank tile for it. A prefab with no
    # icon at all is normal -- 51 localization entries have no prefab either.
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
