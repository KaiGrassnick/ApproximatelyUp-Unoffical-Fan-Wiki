"""Export the circuit parts' geometry to data/meshes.json.

A math block in this game is not a texture on a box: the build ships no
textures at all. Each part is a handful of flat-coloured meshes -- a grey
plate, a black glyph polygon, a yellow or blue ring per port -- and some of
them carry a 3D text string ("ABS") instead of a glyph. All of it is tiny
(the nineteen meshes first measured came to 687 vertices), so the honest way
to draw a circuit the way the game does is to ship the meshes and draw them.

What is exported is the circuit vocabulary, not the whole catalogue: every
in-build part with a data port and a footprint of at most CIRCUIT_MAX_CELLS
cells a side, plus the data cable's cell meshes by name. The renderer in
src/app/core/circuits/render-svg.ts reads this; a three.js view can read the
same file.

Run:  python -m generator.meshes
"""
from __future__ import annotations

import sys

import UnityPy
from UnityPy.helpers import MeshHelper

from . import config, icons, typetree

CELL = 0.125
CIRCUIT_MAX_CELLS = 4

# The cable is not a prefab with children: cells are meshes the game picks
# by shape at runtime. These three are what a renderer needs for a data
# cable; the other cable types are the same shapes in another grey.
CABLE_MESHES = ("Data Cable Straight 00", "Data Cable Curved 00", "Data Cable Holder")

RENDERER = "EPC_Renderer"
TEXT = "EPC_RendererText3D"


def circuit_part_ids(components: list[dict]) -> list[str]:
    """Which parts are circuit parts: small, in the build, with a data port."""
    out = []
    for c in components:
        if not c["in_build"] or not c["stats"]:
            continue
        st = next(iter(c["stats"].values()))
        ports = st.get("_electricPorts") or []
        if not any(p["_type"].startswith("Data") for p in ports):
            continue
        b = st["_bounds"]
        if max(b["x"], b["y"], b["z"]) > CIRCUIT_MAX_CELLS * CELL + 1e-6:
            continue
        out.append(c["id"])
    return sorted(out)


def _vec(d: dict) -> list[float]:
    return [round(float(d["x"]), 4), round(float(d["y"]), 4), round(float(d["z"]), 4)]


def _mesh_payload(mesh_obj) -> dict:
    """Positions, normals, per-vertex colours and triangles, flattened."""
    m = mesh_obj.read()
    h = MeshHelper.MeshHandler(m)
    h.process()
    verts = [round(float(v), 4) for p in h.m_Vertices for v in p]
    normals = [round(float(v), 4) for p in (h.m_Normals or []) for v in p]
    colors = ["{:02x}{:02x}{:02x}".format(*(int(c) for c in col[:3]))
              for col in (h.m_Colors or [])]
    tris = [int(i) for sub in h.get_triangles() for tri in sub for i in tri]
    return {"vertices": verts, "normals": normals, "colors": colors, "triangles": tris}


def _walk(transform, objs: dict, trees: typetree.TypeTrees, renderers: list, texts: list):
    """Every EPC_Renderer and EPC_RendererText3D below a Transform.

    Placement comes from the component's own `_position/_rotation/_scale`,
    not from the child Transform: the game bakes renderers into ECS and the
    Transform values left on the prefab are not what it draws with.
    """
    for ch in transform.m_Children:
        ct = ch.deref().read()
        go = ct.m_GameObject.deref().read()
        for c in go.m_Components:
            co = c.deref()
            if co.type.name != "MonoBehaviour":
                continue
            try:
                cls = co.read(check_read=False).m_Script.read().m_ClassName
            except Exception:                               # noqa: BLE001
                continue
            if cls not in (RENDERER, TEXT):
                continue
            nd = trees.nodes(cls)
            if not nd:
                continue
            d = co.read_typetree(nd)
            base = {"name": go.m_Name, "position": _vec(d["_position"]),
                    "rotation": _vec(d["_rotation"]), "scale": _vec(d["_scale"])}
            if cls == RENDERER:
                mesh = objs.get(d["_mesh"]["m_PathID"])
                mat = objs.get(d["_material"]["m_PathID"])
                if mesh is None:
                    continue
                renderers.append({**base, "mesh": mesh.read().m_Name,
                                  "material": mat.read().m_Name if mat else None})
            else:
                # Alignment is Left/Center/Right, valign Top/Center/Bottom,
                # both from CRPText3D; the renderer anchors the text from
                # them, so without valign every readout would hang off its
                # screen by half a line.
                texts.append({**base, "text": d["_text"],
                              "scale": round(float(d["_textScale"]), 4),
                              "alignment": int(d["_alignment"]),
                              "valign": int(d["_verticalAlignment"]),
                              "monospace": bool(d["_monospace"])})
        _walk(ct, objs, trees, renderers, texts)


def export(part_ids: list[str]) -> dict:
    trees = typetree.TypeTrees()
    env = UnityPy.load(config.GLOBAL_GAME_MANAGERS)
    objs = {o.path_id: o for o in env.objects}
    prefabs = icons.read_prefabs(env)
    mesh_by_name = {}
    for o in env.objects:
        if o.type.name == "Mesh":
            try:
                mesh_by_name.setdefault(o.read().m_Name, o)
            except Exception:                               # noqa: BLE001
                continue

    parts, wanted = {}, set(CABLE_MESHES)
    for pid in part_ids:
        go = prefabs.get("SC_" + pid)
        if go is None:
            continue
        root = next(c.deref().read() for c in go.m_Components
                    if c.deref().type.name == "Transform")
        renderers, texts = [], []
        _walk(root, objs, trees, renderers, texts)
        parts[pid] = {"renderers": renderers, "texts": texts}
        wanted.update(r["mesh"] for r in renderers)

    meshes = {}
    for name in sorted(wanted):
        if name in mesh_by_name:
            meshes[name] = _mesh_payload(mesh_by_name[name])
    return {"cell": CELL, "meshes": meshes, "parts": parts}


def main() -> int:
    config.require_game()
    config.require_extracted()
    ids = circuit_part_ids(config.load_json("components_full.json"))
    out = export(ids)
    missing = [i for i in ids if i not in out["parts"]]
    lost = [m for m in CABLE_MESHES if m not in out["meshes"]]
    path = config.write_json("meshes.json", out)
    verts = sum(len(m["vertices"]) // 3 for m in out["meshes"].values())
    print(f"wrote {path}: {len(out['parts'])} parts, {len(out['meshes'])} meshes, "
          f"{verts} vertices")
    if missing:
        print("  no prefab:", ", ".join(missing))
    if lost:
        print("  cable mesh not found:", ", ".join(lost))
    # A part with no prefab is the localisation being ahead of the build, as
    # components.py already reports. A cable mesh that is not there means the
    # renderer draws cables from nothing: real data loss.
    return 1 if lost else 0


if __name__ == "__main__":
    sys.exit(main())
