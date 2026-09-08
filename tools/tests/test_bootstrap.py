"""The repo must be able to rebuild its own tools/extracted/ inputs.

`tools/extracted/` and `tools/.cache/` are gitignored, so a fresh
clone has neither. Nothing in the repo used to fetch the dumper, and the four
extraction tools died on a bare FileNotFoundError with no hint of what was
missing. These pin both halves of the fix: a bootstrap script, and a guard
that names it.
"""
import os
import subprocess
import sys

import pytest

from generator import config

GENERATOR = config.GENERATOR

# every tool that reads tools/extracted/ must refuse to start without it
EXTRACTION_TOOLS = ("components.py", "objectives.py", "planets.py", "icons.py")


def test_require_extracted_accepts_a_complete_tree():
    config.require_extracted()   # this repo has one; must not raise


def test_require_extracted_names_the_bootstrap_script(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "EXTRACTED", str(tmp_path / "nothing-here"))
    with pytest.raises(SystemExit) as e:
        config.require_extracted()
    msg = str(e.value)
    assert "bootstrap" in msg, "the error must say how to fix itself: " + msg
    assert "extracted" in msg


def test_require_extracted_reports_a_partial_tree(tmp_path, monkeypatch):
    """il2cpp.cs present but DummyDll absent is the likelier half-failure."""
    (tmp_path / "il2cpp.cs").write_text("// dump", encoding="utf-8")
    monkeypatch.setattr(config, "EXTRACTED", str(tmp_path))
    with pytest.raises(SystemExit) as e:
        config.require_extracted()
    assert "DummyDll" in str(e.value)


def test_every_extraction_tool_calls_the_guard():
    for fn in EXTRACTION_TOOLS:
        src = open(os.path.join(GENERATOR, fn), encoding="utf-8").read()
        assert "require_extracted()" in src, (
            f"{fn} reads tools/extracted/ but does not guard it")


def test_bootstrap_pins_the_dumper_version():
    """An unpinned 'latest' would silently change the dump between runs."""
    src = open(os.path.join(GENERATOR, "bootstrap.py"), encoding="utf-8").read()
    assert "latest" not in src.lower().split("release")[0][-200:] or "RELEASE" in src
    from generator import bootstrap
    assert bootstrap.RELEASE, "no pinned release"
    assert bootstrap.RELEASE[0].isdigit(), \
        "release should be a version, got " + bootstrap.RELEASE
    assert bootstrap.RELEASE in bootstrap.DUMPER_URL


def test_bootstrap_runs_without_arguments_and_reports_what_it_would_do():
    """--check must work offline: it inspects, it does not download."""
    r = subprocess.run([sys.executable, "-m", "generator.bootstrap", "--check"],
                       cwd=config.TOOLS, capture_output=True, text=True, timeout=120)
    assert r.returncode == 0, r.stdout + r.stderr
    out = r.stdout.lower()
    assert "il2cpp.cs" in out and "dummydll" in out
