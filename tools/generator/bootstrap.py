"""Rebuild tools/extracted/ from the installed game.

`tools/extracted/` and `tools/.cache/Il2CppInspectorRedux/` are gitignored:
both are derived from the game install and go stale on every update, so a
fresh clone has neither and the extraction tools cannot run. This fetches the
dumper and produces the two things they need:

    tools/extracted/il2cpp.cs   full C# type dump (~19 MB)
    tools/extracted/DummyDll/   stub assemblies the type-tree generator reads

The game ships IL2CPP metadata **version 39**. Perfare's Il2CppDumper stops at
31 and refuses the file outright; Il2CppInspectorRedux is what handles v39,
which is why it is pinned here rather than swapped for the better-known tool.

The dumper is a .NET 10 application and the download does not carry a runtime.
If it exits complaining that a framework is missing, install one for the user
alone -- no root, nothing outside your home directory:

    curl -sSL https://dot.net/v1/dotnet-install.sh | bash -s -- \
        --channel 10.0 --runtime dotnet --install-dir "$HOME/.dotnet"

Usage:
    python -m generator.bootstrap            fetch + dump whatever is missing
    python -m generator.bootstrap --check    report what is present, download nothing
    python -m generator.bootstrap --force    redo both steps from scratch
"""
import os
import platform
import shutil
import stat
import subprocess
import sys
import zipfile

from . import config

ROOT = config.ROOT
GAME = config.GAME
GAME_ASSEMBLY = config.GAME_ASSEMBLY
METADATA = config.METADATA

RELEASE = "2026.2"

# The release ships a build per platform. Picking the host's own is not a
# nicety on WSL: the win-x64 build runs through the interop layer, needs
# Windows-shaped paths, and fails on a host whose .NET runtime is older than
# the one it was built against — all of which the native build sidesteps.
_UNIX_EXE = "Il2CppInspector.Redux.CLI"
_ASSETS = {
    ("Linux", "x86_64"): ("Il2CppInspectorRedux.CLI-linux-x64.zip", _UNIX_EXE),
    ("Linux", "aarch64"): ("Il2CppInspectorRedux.CLI-linux-arm64.zip", _UNIX_EXE),
    ("Darwin", "x86_64"): ("Il2CppInspectorRedux.CLI-osx-x64.zip", _UNIX_EXE),
    ("Darwin", "arm64"): ("Il2CppInspectorRedux.CLI-osx-arm64.zip", _UNIX_EXE),
}
_ASSET, DUMPER_EXE_NAME = _ASSETS.get(
    (platform.system(), platform.machine()),
    ("Il2CppInspectorRedux.CLI-win-x64.zip", "Il2CppInspector.Redux.CLI.exe"))

DUMPER_URL = ("https://github.com/LukeFZ/Il2CppInspectorRedux/releases/download/"
              + RELEASE + "/" + _ASSET)
DUMPER_DIR = os.path.join(config.CACHE, "Il2CppInspectorRedux")


def _is_wsl():
    """True when this Linux is running under WSL.

    Only matters as a fallback: if the host has no native build in _ASSETS,
    the win-x64 one is launched through WSL's interop layer, which needs the
    exec bit set and Windows-shaped paths — neither of which a zip extracted
    on Linux gives you.
    """
    return "microsoft" in os.uname().release.lower()


def win_path(p):
    """A path the dumper can open — converted only for a Windows binary."""
    if not _is_wsl() or not DUMPER_EXE_NAME.endswith(".exe"):
        return p
    return subprocess.run(["wslpath", "-w", p], capture_output=True, text=True,
                          check=True).stdout.strip()


def dumper_exe():
    """Locate the CLI under DUMPER_DIR.

    Searched rather than hardcoded: the release zip has nested the exe one
    level deep in some versions and at the top level in others, and guessing
    wrong makes an already-installed dumper look missing and get re-downloaded.
    """
    for root, _, files in os.walk(DUMPER_DIR):
        if DUMPER_EXE_NAME in files:
            return os.path.join(root, DUMPER_EXE_NAME)
    return None

EXTRACTED = config.EXTRACTED
CS_OUT = config.IL2CPP_CS
DLL_OUT = config.DUMMY_DLL


def have_dumper():
    return dumper_exe() is not None


def have_dump():
    return (os.path.isfile(CS_OUT) and os.path.getsize(CS_OUT) > 0
            and os.path.isdir(DLL_OUT)
            and any(f.endswith(".dll") for f in os.listdir(DLL_OUT)))


def check():
    game_ok = os.path.isfile(GAME_ASSEMBLY) and os.path.isfile(METADATA)
    print("game install     : {}  {}".format("found" if game_ok else "MISSING", GAME))
    print("dumper           : {}  {} ({})".format(
        "found" if have_dumper() else "missing", DUMPER_DIR, RELEASE))
    print("extracted/il2cpp.cs : {}".format(
        f"{os.path.getsize(CS_OUT) / 1e6:.1f} MB"
        if os.path.isfile(CS_OUT) else "missing"))
    print("extracted/DummyDll  : {}".format(
        "{} dlls".format(sum(1 for f in os.listdir(DLL_OUT) if f.endswith(".dll")))
        if os.path.isdir(DLL_OUT) else "missing"))
    if not game_ok:
        print("\nThe game install is where everything is derived from. If it lives\n"
              "elsewhere, set APPROXIMATELY_UP_GAME in .env (see .env.template).")
    return 0


def fetch_dumper():
    import urllib.request
    print(f"downloading Il2CppInspectorRedux {RELEASE} ...")
    os.makedirs(DUMPER_DIR, exist_ok=True)
    zip_path = os.path.join(DUMPER_DIR, "dumper.zip")
    urllib.request.urlretrieve(DUMPER_URL, zip_path)
    with zipfile.ZipFile(zip_path) as z:
        z.extractall(DUMPER_DIR)
    os.remove(zip_path)
    # Zip carries no Unix mode bits, so everything lands non-executable and
    # WSL's interop layer refuses to launch the .exe.
    exe = dumper_exe()
    if exe:
        os.chmod(exe, os.stat(exe).st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    if not have_dumper():
        raise SystemExit(
            f"downloaded the dumper but {DUMPER_EXE_NAME} is not inside the archive.\n"
            f"The release layout may have changed; check {DUMPER_URL}")
    print(f"  -> {dumper_exe()}")


def stage(paths, into):
    """Copy the dumper's inputs onto the local filesystem, if they are not.

    Reading GameAssembly.dll (92 MB) and global-metadata.dat over a Windows
    drive mounted into WSL is brutally slow — the dumper spent over twenty
    minutes on it and had produced nothing. Copied to the Linux filesystem
    first, the same dump finishes in about ninety seconds. The copy itself
    takes under a second, so it is not worth being clever about when to do it.
    """
    if not any(p.startswith("/mnt/") for p in paths):
        return list(paths)
    os.makedirs(into, exist_ok=True)
    out = []
    for p in paths:
        dst = os.path.join(into, os.path.basename(p))
        shutil.copyfile(p, dst)
        out.append(dst)
    return out


def run_dump():
    tmp = os.path.join(ROOT, "extracted", "_dump")
    if os.path.isdir(tmp):
        shutil.rmtree(tmp)
    os.makedirs(tmp, exist_ok=True)
    print("dumping IL2CPP metadata (a few minutes) ...")
    staged = os.path.join(tmp, "_in")
    binary, metadata = stage([GAME_ASSEMBLY, METADATA], staged)
    r = subprocess.run([dumper_exe(), win_path(binary), win_path(metadata),
                        "-o", win_path(tmp), "-s", "-d"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"dumper failed (exit {r.returncode}):\n"
                         f"{r.stdout[-2000:]}\n{r.stderr[-2000:]}")

    src_cs = os.path.join(tmp, "cs", "il2cpp.cs")
    src_dll = os.path.join(tmp, "dll")
    if not os.path.isfile(src_cs) or not os.path.isdir(src_dll):
        raise SystemExit("dumper produced no cs/il2cpp.cs or dll/ under " + tmp)

    os.makedirs(EXTRACTED, exist_ok=True)
    shutil.copyfile(src_cs, CS_OUT)
    if os.path.isdir(DLL_OUT):
        shutil.rmtree(DLL_OUT)
    shutil.copytree(src_dll, DLL_OUT)
    shutil.rmtree(tmp)

    n = sum(1 for f in os.listdir(DLL_OUT) if f.endswith(".dll"))
    print(f"  -> extracted/il2cpp.cs ({os.path.getsize(CS_OUT) / 1e6:.1f} MB)")
    print(f"  -> extracted/DummyDll/ ({n} dlls)")
    if not os.path.isfile(os.path.join(DLL_OUT, "Assembly-CSharp.dll")):
        raise SystemExit("Assembly-CSharp.dll is missing from the dump — the type-tree "
                         "generator cannot resolve game classes without it.")


def main():
    args = set(sys.argv[1:])
    if "--check" in args:
        return check()
    force = "--force" in args

    config.require_game()
    if not os.path.isfile(GAME_ASSEMBLY) or not os.path.isfile(METADATA):
        raise SystemExit("Found the game folder but not its IL2CPP files:\n"
                         f"  {GAME_ASSEMBLY}\n  {METADATA}\n\n"
                         "Is APPROXIMATELY_UP_GAME pointing at the right install?")

    if force or not have_dumper():
        fetch_dumper()
    else:
        print(f"dumper already present ({RELEASE})")

    if force or not have_dump():
        run_dump()
    else:
        print("extracted/ already complete — nothing to do (use --force to redo)")

    config.require_extracted()
    print("\nReady. Next:\n"
          "    python -m generator.components\n"
          "    python -m generator.objectives\n"
          "    python -m generator.planets\n"
          "    python -m generator.icons\n"
          "    python -m generator.planet_render\n"
          "    cd web && npm ci && npm start")
    return 0


if __name__ == "__main__":
    sys.exit(main())
