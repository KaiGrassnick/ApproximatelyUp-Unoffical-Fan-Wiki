"""Where everything lives, and the guards that say so when it does not.

Every other tool imports its paths from here rather than rebuilding them, so
the game install is described in exactly one place. Where that install *is* is
per-machine, and comes from `tools/.env` (gitignored); `tools/.env.template`
is committed and lists every variable.
"""
from __future__ import annotations

import csv
import json
import os

# Three anchors, all derived from this file rather than from the working
# directory, so a tool writes to the same place wherever it is launched from.
GENERATOR = os.path.dirname(os.path.abspath(__file__))   # the package itself
TOOLS = os.path.dirname(GENERATOR)                       # the Python project
ROOT = os.path.dirname(TOOLS)                            # the repo

# The wiki is data/'s only consumer, and the Angular workspace is the repo
# root: @angular/build refuses an asset input that resolves outside the
# directory holding angular.json, which is what lets the app reference this
# directly instead of through a link.
DATA = os.path.join(ROOT, "data")

# Derived from the installed game, gitignored, and stale after every update.
EXTRACTED = os.path.join(TOOLS, "extracted")
IL2CPP_CS = os.path.join(EXTRACTED, "il2cpp.cs")
DUMMY_DLL = os.path.join(EXTRACTED, "DummyDll")

# Downloaded third-party binaries. Not ours and not source, so they sit in a
# dotted cache directory rather than among the modules that shell out to them.
CACHE = os.path.join(TOOLS, ".cache")

# The Unity version the game was built with, which the type-tree generator has
# to be told because a stripped IL2CPP build carries no type trees of its own.
# One constant: four tools used to hardcode this string separately.
UNITY_VERSION = "6000.4.7f1"

# ---------------------------------------------------------------- configuration
# Precedence: real environment > .env > default.
ENV_FILE = os.path.join(TOOLS, ".env")
ENV_VARS = ("APPROXIMATELY_UP_GAME", "APPROXIMATELY_UP_SAVES")

_DEFAULT_GAME = r"C:\Program Files (x86)\Steam\steamapps\common\Approximately Up"
_DEFAULT_SAVES = os.path.join(os.environ.get("USERPROFILE", ""), "AppData", "LocalLow",
                              "ApproximatelyGames", "ApproximatelyUp")


def parse_env_file(path: str | None = None) -> dict[str, str]:
    """`KEY=VALUE` pairs from a .env file. Missing file -> {}.

    Deliberately tiny: blank lines and `#` comments are skipped, surrounding
    quotes are stripped, and a line with no `=` is ignored rather than being
    an error. Values are taken literally — no escape processing — because
    these are Windows paths full of backslashes.
    """
    path = ENV_FILE if path is None else path
    out: dict[str, str] = {}
    try:
        with open(path, encoding="utf-8") as f:
            lines = f.readlines()
    except OSError:
        return out
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        out[key.strip()] = value
    return out


def env_value(name: str, default: str, path: str | None = None) -> str:
    """Config lookup: real environment first, then .env, then the default.

    `%VARS%` and `~` in the result are expanded, so a .env can say
    `%USERPROFILE%\\AppData\\...` instead of hardcoding a username.
    """
    value = os.environ.get(name) or parse_env_file(path).get(name) or default
    return os.path.expanduser(os.path.expandvars(value))


GAME = env_value("APPROXIMATELY_UP_GAME", _DEFAULT_GAME)
GAME_DATA = os.path.join(GAME, "ApproximatelyUp_Data")
SAVES = env_value("APPROXIMATELY_UP_SAVES", _DEFAULT_SAVES)
WORLDS = os.path.join(SAVES, "Worlds")

# the individual inputs, so no tool has to rebuild these paths itself
GAME_ASSEMBLY = os.path.join(GAME, "GameAssembly.dll")
METADATA = os.path.join(GAME_DATA, "il2cpp_data", "Metadata", "global-metadata.dat")
LOCALIZATION = os.path.join(GAME_DATA, "StreamingAssets", "Localization.csv")
SPHEROIDS = os.path.join(GAME_DATA, "StreamingAssets", "UniverseSpheroids")
GLOBAL_GAME_MANAGERS = os.path.join(GAME_DATA, "globalgamemanagers.assets")
SHARED_ASSETS0 = os.path.join(GAME_DATA, "sharedassets0.assets")
LEVEL0 = os.path.join(GAME_DATA, "level0")


def require_game() -> None:
    """Fail with an actionable message when the game install cannot be found."""
    if os.path.isdir(GAME_DATA):
        return
    raise SystemExit(
        f"Cannot find the game at:\n  {GAME}\n\n"
        "Set APPROXIMATELY_UP_GAME to the folder containing GameAssembly.dll,\n"
        f"either in the environment or in {ENV_FILE}:\n\n"
        "    APPROXIMATELY_UP_GAME=D:\\SteamLibrary\\steamapps\\common\\Approximately Up\n\n"
        "See tools/.env.template for every variable.")


def require_extracted() -> None:
    """Fail with an actionable message when the IL2CPP dump is missing.

    `tools/extracted/` is gitignored -- it is derived from the installed game and
    goes stale on every update -- so a fresh clone has none of it. Without
    this, the extraction tools die on a bare FileNotFoundError from
    os.listdir() that says nothing about what is missing or how to get it.
    """
    dll = os.path.join(EXTRACTED, "DummyDll")
    cs = os.path.join(EXTRACTED, "il2cpp.cs")
    missing = []
    if not os.path.isdir(dll) or not any(
            f.endswith(".dll") for f in (os.listdir(dll) if os.path.isdir(dll) else [])):
        missing.append("tools/extracted/DummyDll/ (stub assemblies)")
    if not os.path.isfile(cs) or os.path.getsize(cs) == 0:
        missing.append("tools/extracted/il2cpp.cs (C# type dump)")
    if missing:
        raise SystemExit(
            "Missing IL2CPP dump:\n  " + "\n  ".join(missing)
            + "\n\nThese are derived from the installed game and are not in git.\n"
              "Generate them with:\n\n    python -m generator.bootstrap\n")


def load_json(name: str):
    """Read one of the extracted data files from data/."""
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


def write_json(name: str, payload) -> str:
    """Write one of the extracted data files into data/, and return its path.

    One place decides the on-disk shape of every committed data file:
    `indent=1`, non-ASCII kept as-is, and a trailing newline so the files are
    diffable and do not end mid-line.
    """
    path = os.path.join(DATA, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=1, ensure_ascii=False)
        f.write("\n")
    return path


def load_localization() -> dict[str, str]:
    """`key -> english` from the game's Localization.csv.

    utf-8-sig because the file is written with a BOM, which utf-8 would leave
    on the front of the very first key.
    """
    with open(LOCALIZATION, encoding="utf-8-sig") as f:
        return {row["key"]: row["english"] for row in csv.DictReader(f)}


def load_world(name: str) -> dict | None:
    """Parsed .world JSON whose _name matches `name`, else None."""
    if not os.path.isdir(WORLDS):
        return None
    for fn in sorted(os.listdir(WORLDS)):
        if not fn.endswith(".world"):
            continue
        with open(os.path.join(WORLDS, fn), encoding="utf-8") as f:
            w = json.load(f)
        if name.lower() in (w["_name"].lower(), fn.lower()):
            w["_file"] = fn
            return w
    return None
