"""What a save can actually build: stock pools, and the parts they unlock.

Components sharing an `_scGroup` (Frame, Glass, MathBlock, Pipe, ...) draw from
one stock pool: a single reward of "Frame Full x630" makes every frame shape
placeable. Any consumer that ignores this badly undercounts what is buildable.

Ported to src/app/core/availability.ts, which recomputes this in the
browser from the reader's own save. The two must agree exactly -- a divergence
would silently misreport what is buildable -- which is what
generator/availability_fixture.py freezes a fixture for.
"""
from __future__ import annotations

import collections
from dataclasses import dataclass, field


@dataclass
class Availability:
    have: set = field(default_factory=set)
    gate: dict = field(default_factory=dict)
    members: dict = field(default_factory=dict)
    group: dict = field(default_factory=dict)
    done: dict = field(default_factory=dict)
    visited: set = field(default_factory=set)
    world: dict | None = None


# A frame block with a pipe through it eats pipe stock as well as frame
# stock. The prefab says so through `_pipeInventoryConsumePrefab`, a
# reference to the pipe it consumes -- a PPtr, which components.py drops
# along with every other object reference, so the target is not in
# components_full.json to read. There are exactly two such parts
# (EPC_SCFramePipe: Frame Quarter With Pipe and its nanoframe twin) and
# exactly two pipe pools, so the mapping is pinned by its own arity.
# Confirmed against the game: with no pipes unlocked, neither is placeable,
# though both sit in a frame pool that is full.
PIPE_CONSUMERS = {"EPC_SCFramePipe": {"Frame": "Pipe", "Nanoframe": "Nanopipe"}}


def pools_needed(cid: str, st: dict, group: dict, cls: str | None = None) -> set[str]:
    """Every stock pool a component spends when it is placed.

    Three sources, all of them the game's own:
      - `_scGroup`, the pool the part is made of (its own id when ungrouped),
      - `_scSecondaryGroup`, a second material it also spends -- set on the
        20 windows, which are a frame AND a pane,
      - the pipe a frame-with-pipe consumes, see PIPE_CONSUMERS.
    """
    primary = group.get(cid) or cid
    out = {primary}
    sec = (st.get("_scSecondaryGroup") or "None (0)").split(" (")[0]
    if sec != "None":
        out.add(sec)
    consumes = PIPE_CONSUMERS.get(cls or st.get("_class") or "")
    if consumes and group.get(cid) in consumes:
        out.add(consumes[group[cid]])
    return out


def compute_availability(comps: list, objs: list, world: dict | None) -> Availability:
    byid = {o["id"]: o for o in objs}
    av = Availability(world=world)

    stats = {}
    for c in comps:
        if not c["in_build"]:
            continue
        st = dict(next(iter(c["stats"].values()), {}))
        # The class decides whether a part consumes a pipe; carry it along so
        # pools_needed() does not need the whole component record.
        st["_class"] = c.get("class")
        stats[c["id"]] = st
        g = (st.get("_scGroup") or "None (0)").split(" (")[0]
        av.group[c["id"]] = g if g != "None" else None

    members = collections.defaultdict(list)
    for cid, g in av.group.items():
        if g:
            members[g].append(cid)
    av.members = {k: sorted(v) for k, v in members.items()}

    if world is None:
        return av

    av.done = dict(zip(world["_objectives"]["m_Keys"],
                       [v["_completed"] for v in world["_objectives"]["m_Values"]],
                       strict=True))
    av.visited = set(world["_universeLocations"]["m_Keys"])

    def pool(cid: str) -> str:
        return av.group[cid] or cid

    # Which stock pools have anything in them. Base stock and the rewards of
    # completed objectives both count; the amounts themselves are not kept,
    # only whether a pool is non-empty, which is what decides placeability.
    held = set()
    for cid, st in stats.items():
        if st.get("_availableAmount"):
            held.add(pool(cid))
    for oid, completed in av.done.items():
        if not completed:
            continue
        for r in byid.get(oid, {}).get("reward", []):
            if r["component"] in stats:
                held.add(pool(r["component"]))

    # A part is placeable only when EVERY pool it draws on is non-empty --
    # see pools_needed(). Placing a window spends frame and glass both.
    for cid, st in stats.items():
        if all(p in held for p in pools_needed(cid, st, av.group)):
            av.have.add(cid)

    for o in objs:
        if o["id"] in av.done:
            continue
        for r in o["reward"]:
            if r["component"] not in av.have and r["component"] not in av.gate:
                av.gate[r["component"]] = "{} ({})".format(
                    o["title"] or o["key"], o["start"])
    return av
