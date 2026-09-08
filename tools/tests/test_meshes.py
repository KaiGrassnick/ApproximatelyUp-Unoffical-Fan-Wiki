"""The mesh export, against the installed game. Skipped where there is none."""
import os

import pytest

from generator import config, meshes

pytestmark = pytest.mark.skipif(
    not os.path.isdir(config.GAME_DATA), reason="needs the installed game")


@pytest.fixture(scope="module")
def exported():
    return meshes.export(meshes.circuit_part_ids(config.load_json("components_full.json")))


def test_every_circuit_part_has_a_body(exported):
    parts = exported["parts"]
    assert "Adder" in parts and "Abs" in parts and "WirelessTransmitter" in parts
    for pid, p in parts.items():
        assert p["renderers"], pid


def test_adder_glyph_is_the_twelve_vertex_plus(exported):
    m = exported["meshes"]["Adder Body"]
    assert len(m["vertices"]) == 12 * 3
    assert len(m["triangles"]) % 3 == 0
    assert set(m["colors"]) == {"ffffff"}


def test_port_rings_carry_the_games_colours(exported):
    assert "fff900" in exported["meshes"]["Port Input"]["colors"]
    assert "2100ff" in exported["meshes"]["Port Output"]["colors"]


def test_text_blocks_keep_their_string(exported):
    texts = exported["parts"]["Abs"]["texts"]
    assert [t["text"] for t in texts] == ["ABS"]


def test_cable_meshes_are_exported_by_name(exported):
    for name in meshes.CABLE_MESHES:
        assert name in exported["meshes"], name
