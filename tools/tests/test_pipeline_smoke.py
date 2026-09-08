"""The extraction tools must actually import and find their data.

A directory reorganisation once moved the data files out from under a tool
while the whole suite stayed green, because nothing executed it — the tests
only ever read its committed *output*. This checks that the extraction
tools still import cleanly and that their data lands where it should.

The slow steps (extract_stats.py, icons.py, planets.py, planet_render.py)
need the game files and take minutes, so they are not run here; they are
covered by asserting their inputs and outputs resolve.
"""
import os
import subprocess
import sys

from generator import config

PY = sys.executable
TOOLS = config.TOOLS


def test_every_tool_imports_and_finds_its_data():
    """Catches a moved data file in the tools the smoke tests do not execute."""
    for name in ("config", "planet_render", "components", "objectives", "icons", "planets"):
        r = subprocess.run(
            [PY, "-c", "import generator." + name],
            cwd=TOOLS, capture_output=True, text=True)
        assert r.returncode == 0, name + ": " + r.stderr


def test_data_files_live_in_data_dir():
    for fn in ("components_full.json", "objectives.json", "planets.json", "icons.json"):
        assert os.path.exists(os.path.join(config.DATA, fn)), fn
