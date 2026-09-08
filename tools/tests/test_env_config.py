"""Game and save locations come from tools/.env, not from six hardcoded strings.

`tools/.env` is gitignored (paths are per-machine); `tools/.env.template` is
committed so a new machine knows what to fill in.
"""
import os
import subprocess

import pytest

from generator import config

ROOT = config.ROOT
TOOLS = config.TOOLS
GENERATOR = config.GENERATOR


# ---------------- the files ----------------

def test_template_is_committed_and_env_is_not():
    assert os.path.isfile(os.path.join(TOOLS, ".env.template"))
    tracked = subprocess.run(["git", "ls-files", "tools/.env"], cwd=ROOT,
                             capture_output=True, text=True).stdout.strip()
    assert tracked == "", "tools/.env must never be committed — it is machine-specific"
    ignored = subprocess.run(["git", "check-ignore", "tools/.env"], cwd=ROOT,
                             capture_output=True, text=True)
    assert ignored.returncode == 0, "tools/.env is not gitignored"


def test_template_documents_every_variable_the_code_reads():
    tpl = open(os.path.join(TOOLS, ".env.template"), encoding="utf-8").read()
    for var in config.ENV_VARS:
        assert var in tpl, f"{var} is read by the code but absent from .env.template"


# ---------------- parsing ----------------

def test_parses_keys_comments_blanks_and_quotes(tmp_path):
    p = tmp_path / ".env"
    p.write_text(
        "# a comment\n"
        "\n"
        "PLAIN=C:\\Games\\Thing\n"
        'QUOTED="C:\\Games\\With Space"\n'
        "SPACED  =  trailing-and-leading  \n"
        "EMPTY=\n"
        "NOT_A_PAIR\n",
        encoding="utf-8")
    got = config.parse_env_file(str(p))
    assert got["PLAIN"] == "C:\\Games\\Thing"
    assert got["QUOTED"] == "C:\\Games\\With Space"
    assert got["SPACED"] == "trailing-and-leading"
    assert got["EMPTY"] == ""
    assert "NOT_A_PAIR" not in got
    assert "# a comment" not in got


def test_missing_env_file_is_not_an_error(tmp_path):
    assert config.parse_env_file(str(tmp_path / "absent")) == {}


def test_real_environment_wins_over_the_file(tmp_path, monkeypatch):
    p = tmp_path / ".env"
    p.write_text("APPROXIMATELY_UP_GAME=C:\\from-file\n", encoding="utf-8")
    monkeypatch.setenv("APPROXIMATELY_UP_GAME", "C:\\from-environment")
    got = config.env_value("APPROXIMATELY_UP_GAME", "fallback", str(p))
    assert got == "C:\\from-environment"


def test_file_wins_over_the_built_in_default(tmp_path, monkeypatch):
    p = tmp_path / ".env"
    p.write_text("APPROXIMATELY_UP_GAME=C:\\from-file\n", encoding="utf-8")
    monkeypatch.delenv("APPROXIMATELY_UP_GAME", raising=False)
    assert config.env_value("APPROXIMATELY_UP_GAME", "fallback", str(p)) == "C:\\from-file"


def test_default_is_used_when_nothing_is_set(tmp_path, monkeypatch):
    monkeypatch.delenv("APPROXIMATELY_UP_GAME", raising=False)
    assert config.env_value("APPROXIMATELY_UP_GAME", "fallback",
                              str(tmp_path / "absent")) == "fallback"


# ---------------- use ----------------

def test_game_paths_resolve_on_this_machine():
    assert os.path.isdir(config.GAME), config.GAME
    assert os.path.isdir(config.GAME_DATA), config.GAME_DATA
    config.require_game()          # must not raise here


def test_require_game_points_at_the_env_file_when_wrong(monkeypatch):
    monkeypatch.setattr(config, "GAME", r"C:\definitely\not\here")
    monkeypatch.setattr(config, "GAME_DATA", r"C:\definitely\not\here\ApproximatelyUp_Data")
    with pytest.raises(SystemExit) as e:
        config.require_game()
    msg = str(e.value)
    assert ".env" in msg and "APPROXIMATELY_UP_GAME" in msg


def test_no_tool_hardcodes_the_install_path():
    offenders = []
    for fn in sorted(os.listdir(GENERATOR)):
        if not fn.endswith(".py"):
            continue
        src = open(os.path.join(GENERATOR, fn), encoding="utf-8").read()
        if "steamapps" in src.lower() and fn != "config.py":
            offenders.append(fn)
    assert offenders == [], f"hardcoded game path in: {offenders}"
