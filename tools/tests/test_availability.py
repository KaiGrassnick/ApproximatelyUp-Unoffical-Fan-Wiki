"""The availability engine, and the text rules the Angular port mirrors.

generator/availability.py is the reference implementation of what a save can
build; src/app/core/availability.ts recomputes the same thing in the
browser. These tests pin the Python side against a committed fixture save.
"""
import json
import os

from generator import availability, config, text

# The same trimmed save the Angular app's parity test (availability.spec.ts)
# checks against, committed so these tests are machine-independent — they
# used to load a save named "Story-Welt" out of the developer's personal
# save folder via config.load_world(), which meant they failed on any
# other machine. Regenerate with `python -m generator.availability_fixture`.
FIXTURE_WORLD = os.path.join(
    config.ROOT, "src", "app", "core", "__fixtures__", "story-welt.world.json")


def load():
    comps = config.load_json("components_full.json")
    objs = config.load_json("objectives.json")
    return comps, objs


def load_fixture_world():
    with open(FIXTURE_WORLD, encoding="utf-8") as f:
        return json.load(f)


def test_pooling_covers_whole_frame_family():
    """One Frame reward must make every frame shape placeable."""
    comps, objs = load()
    av = availability.compute_availability(comps, objs, load_fixture_world())
    assert "FrameA" in av.have
    assert "FrameHalfC" in av.have          # never rewarded on its own
    assert av.group["FrameHalfC"] == "Frame"
    assert len(av.members["Frame"]) == 36


def test_story_welt_counts_match_progress_report():
    comps, objs = load()
    av = availability.compute_availability(comps, objs, load_fixture_world())
    in_build = [c for c in comps if c["in_build"]]
    assert len(in_build) == 310
    assert len(av.have) == 191


def test_a_part_needs_every_pool_it_spends_not_just_its_own():
    """Frame Quarter With Pipe is frame stock AND pipe stock.

    The frame pool is full in this save and the pipe pool is empty, and the
    game will not let you place it -- checked in game, which is what turned
    this up. Pooling on `_scGroup` alone said it was placeable.
    """
    comps, objs = load()
    av = availability.compute_availability(comps, objs, load_fixture_world())
    assert "FrameA" in av.have
    assert "PipeFull" not in av.have
    assert "FrameQuarterPipe" not in av.have
    assert "NanoframeQuarterPipe" not in av.have


def test_a_window_is_a_frame_and_a_pane():
    comps, objs = load()
    stats = {c["id"]: next(iter(c["stats"].values()), {}) for c in comps}
    group = {cid: (st.get("_scGroup") or "None (0)").split(" (")[0]
             for cid, st in stats.items()}
    group = {k: (v if v != "None" else None) for k, v in group.items()}

    # `_scSecondaryGroup` is set on exactly the 20 windows.
    needed = availability.pools_needed("WindowDualA", stats["WindowDualA"], group)
    assert needed == {"Frame", "Glass"}
    # This save has both, so the windows stay placeable.
    av = availability.compute_availability(comps, objs, load_fixture_world())
    assert "WindowDualA" in av.have
    assert "GlassA" in av.have


def test_locked_component_names_its_gate():
    comps, objs = load()
    av = availability.compute_availability(comps, objs, load_fixture_world())
    assert "PipeQuarter" not in av.have
    assert "First Pipes" in av.gate["PipeQuarter"]


def test_no_world_degrades_to_unknown():
    comps, objs = load()
    av = availability.compute_availability(comps, objs, None)
    assert av.have == set()
    assert av.gate == {}
    assert av.world is None


def test_missing_world_name_returns_none():
    assert config.load_world("no-such-world-here") is None


def _atmospheric_fan_stats():
    comps = config.load_json("components_full.json")
    fan = next(c for c in comps if c["id"] == "AtmosphericFan")
    return fan, next(iter(fan["stats"].values()), {})


def test_resolve_fills_placeholder_from_flat_stats():
    """AtmosphericFan's port text 'Requires {0} P/s.' is filled from
    _powerConsumptionPerSec (8.0 in components_full.json)."""
    fan, flat = _atmospheric_fan_stats()
    assert flat["_powerConsumptionPerSec"] == 8.0
    port = next(p for p in fan["ports"] if "{0}" in p)
    assert port == "Requires {0} P/s."
    assert text.resolve(port, flat) == "Requires 8 P/s."


def test_resolve_leaves_text_without_placeholder_unchanged():
    fan, flat = _atmospheric_fan_stats()
    assert "{0}" not in fan["desc"]
    assert text.resolve(fan["desc"], flat) == fan["desc"]
