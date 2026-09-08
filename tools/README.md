# `tools/` — the extraction pipeline

Game files in, [`data/`](../data) out.

Almost everything the wiki shows is read out of an installed copy of
**Approximately Up** by the Python package in this directory. The exception is
`data/guides.json` and `data/guides/`, which are compiled from the hand-written
Markdown in `content/guides/` by `scripts/gen-guides.mjs` and have nothing to do
with the pipeline. The result is committed, so the
wiki itself needs neither Python nor the game — see the
[root README](../README.md). You only come here when a game patch has made the
data stale, or when you want the wiki to show something the pipeline does not
extract yet.

> **You need the game installed on the machine you run this on.** There is no
> way around that and no fixture that stands in for it: the tools open Unity's
> serialized asset files directly.

## Why it is shaped like this

The game is a **Unity IL2CPP build with type trees stripped**. That is the one
fact that explains the whole design:

- A `MonoBehaviour`'s serialized bytes carry no field names, so nothing can be
  read out of the assets until the types are reconstructed.
- `bootstrap` runs an IL2CPP dumper to produce a C# type dump (`il2cpp.cs`) and
  stub assemblies (`DummyDll/`); `parse_cs` reads the former for field types,
  inheritance and enums, and `typetree` feeds the latter to
  `TypeTreeGenerator` to rebuild the trees UnityPy needs.
- Only then can `components`, `objectives`, `planets` and the rest decode
  anything.

The dumper is pinned to **Il2CppInspectorRedux**, not the better-known
Perfare `Il2CppDumper`: the game ships IL2CPP metadata **version 39**, which
Perfare's tool stops short of and refuses outright.

## Setup

Python **3.10+**.

```bash
# from the repo root
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -e "tools/[dev]"
```

`generator` is a real package, so an editable install puts it on the path and
every tool runs as `python -m generator.<name>` from anywhere. Without the
install, run them from this `tools/` directory.

### Point it at your game

```bash
cp tools/.env.template tools/.env    # Windows: copy tools\.env.template tools\.env
```

Then edit `tools/.env`. It has two variables and both have defaults that are
right for a stock Steam install:

| Variable                 | What it points at                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `APPROXIMATELY_UP_GAME`  | The folder holding `GameAssembly.dll` and `ApproximatelyUp_Data\`                      |
| `APPROXIMATELY_UP_SAVES` | The save folder holding `Worlds\<id>.world` — only needed for the availability fixture |

Precedence is **real environment → `tools/.env` → built-in default**, and
`%VARS%` and `~` are expanded, so you can write
`%USERPROFILE%\AppData\LocalLow\...` rather than hardcoding a username.
`tools/.env` is gitignored; these paths are per-machine and must not be
committed.

Every path in the project is derived in `generator/config.py` and nowhere else.
If a tool cannot find the game or the dump, it exits with a message telling you
which variable to set or which command to run — that is `require_game()` and
`require_extracted()` doing their job, not a crash.

### Bootstrap the dump

```bash
python -m generator.bootstrap            # fetch the dumper, produce whatever is missing
python -m generator.bootstrap --check    # report what is present, download nothing
python -m generator.bootstrap --force    # redo both steps from scratch
```

This downloads Il2CppInspectorRedux into `tools/.cache/` and writes:

```
tools/extracted/il2cpp.cs     full C# type dump (~19 MB)
tools/extracted/DummyDll/     stub assemblies the type-tree generator reads
```

Both are gitignored and both go stale on every game update — rerun `bootstrap`
after a patch before anything else.

The dumper is a .NET 10 application and the download carries no runtime. If it
exits complaining a framework is missing, install one for your user alone (no
root, nothing outside your home directory):

```bash
curl -sSL https://dot.net/v1/dotnet-install.sh | bash -s -- \
    --channel 10.0 --runtime dotnet --install-dir "$HOME/.dotnet"
```

## Running the pipeline

Each step is independent and writes its own outputs. Run them in this order —
`planet_render` reads `planets.json`, and the fixture reads two of the others:

| Command                                            | Writes                                                 |
| -------------------------------------------------- | ------------------------------------------------------ |
| `python -m generator.bootstrap`                    | `tools/extracted/` (prerequisite for everything below) |
| `python -m generator.stat_labels`                  | `data/stat_labels.json`                                |
| `python -m generator.components`                   | `data/components_full.json`                            |
| `python -m generator.icons`                        | `data/icons/*.webp`, `data/icons.json`                 |
| `python -m generator.meshes`                       | `data/meshes.json`                                     |
| `python -m generator.objectives`                   | `data/objectives.json`                                 |
| `python -m generator.planets`                      | `data/planets.json`, `data/star_noise/`                |
| `python -m generator.planet_render [ids...]`       | `data/planets/*.webp`, `data/planets/maps/*.webp`      |
| `python -m generator.availability_fixture [world]` | `src/app/core/__fixtures__/`                           |

`planet_render` with no arguments renders every planet and star; name ids to
redo only some. `availability_fixture` defaults to the world `Story-Welt`.

`star_noise/` and `meshes.json` are build inputs, not wiki data — the first for
`planet_render`, the second for `scripts/gen-circuits.ts`. Both live under
`data/` but are left out of the manifest and the asset copy, so neither is
served.

Afterwards, from the repo root:

```bash
npm run gen:manifest      # refresh the content hashes for the new data
```

and commit that alongside the data. CI fails if it is stale, because a data
change under an old `?v=` hash pins wrong bytes in readers' caches for a year.

### Exit codes mean something

The tools distinguish _expected_ failures from _data loss_, and only the second
kind fails the run:

- A stub assembly that will not load, a prefab with no icon, a body with no
  terrain binaries — expected, printed as a note, exit 0.
- An unresolved reward pointer, a body that could not be read, a stat label
  the game no longer ships, an icon texture that would not decode — real data
  loss that would show up as a hole in the wiki, exit 1.

So a non-zero exit is worth reading the output over. Warnings on a zero exit
usually are not.

## The modules

**Runnable**

| Module                 | What it does                                                       |
| ---------------------- | ------------------------------------------------------------------ |
| `bootstrap`            | Fetches the dumper and rebuilds `tools/extracted/`                 |
| `components`           | Joins each component's localized text with its prefab stats        |
| `icons`                | Exports inventory icons from `_iconTexture2D`                      |
| `meshes`               | Exports the circuit parts' block, glyph and port meshes            |
| `objectives`           | Decodes `ObjectiveSetup`: rewards, requirements, dependencies      |
| `planets`              | Extracts planets, stars, stations and the black hole from `level0` |
| `planet_render`        | Renders globes and surface maps from terrain cubemaps              |
| `stat_labels`          | The game's own names and units for the 25 stats the wiki shows     |
| `availability_fixture` | Freezes one save's availability result for the TS parity test      |

**Shared**

| Module                          | What it does                                                            |
| ------------------------------- | ----------------------------------------------------------------------- |
| `config`                        | Every path, `.env` loading, and the guards that explain what is missing |
| `parse_cs`                      | Parses `il2cpp.cs` into class fields, inheritance and enums             |
| `typetree`                      | Rebuilds Unity type trees from the stub assemblies                      |
| `images`                        | The one place that decides image encoding — see below                   |
| `availability`, `stats`, `text` | Mirrored one-for-one in the Angular app                                 |

### Ports that must move together

Three modules exist twice, once here and once in TypeScript, because the wiki
recomputes them in the reader's browser:

| Python                      | TypeScript                     |
| --------------------------- | ------------------------------ |
| `generator/availability.py` | `src/app/core/availability.ts` |
| `generator/stats.py`        | `src/app/core/stats.ts`        |
| `generator/text.py`         | `src/app/core/text.ts`         |

**Change one side, change the other.** For availability there is a guard:
`availability_fixture` freezes a real save's result and
`src/app/core/availability.spec.ts` asserts the TypeScript port reproduces it
exactly. For `stats` and `text` there is no such net — a divergence there is
silent, and the wiki will simply describe a component differently from the
pipeline that produced it.

The circuit engine in `src/app/core/circuits/` is a fourth reader of the same
extraction: it takes `_electricPorts`, `_bounds`, `_mass` and `_scGroup` off
each component in `components_full.json` and the block geometry from
`meshes.json`, so `components` and `meshes` are regenerated together after a
game patch — a mesh from one version against ports from another draws cables
into the wrong faces.

### Image encoding

Everything served is WebP at q90 lossy, and `images.py` is the only place that
decides how. Star noise textures are inputs to `planet_render` and never
served, so they stay lossless PNG.

Images are also written no larger than the page draws them, via `save_web`'s
`fit`. Planet discs get one size, `DISC_PX` (288, twice the 140 px of the
detail page); they are still _rendered_ at 512 and shrunk, which antialiases
the limb better than rasterising at 288.

Icons get two, because the components grid draws 310 of them at 64 CSS px and
the reader's screen decides how many device pixels that is: `ICON_PX_1X` (64)
into `data/icons/64/`, and `ICON_PX` (128) into `data/icons/`. The grid offers
both through a `srcset` (`DataService.iconSrcset`), so an ordinary monitor
fetches 0.64 MB of icons where a retina one fetches 1.36 MB. The component
detail page draws a single icon at 96 px and just uses the 128.

Icons were lossless until a Lighthouse audit, on the reasoning that lossy
encoding fringes flat art against transparency. Measured at the size the page
draws them, it does not: q90 moved silhouette pixels by 3.01/255 where the
downscale alone already moved them 2.66, and alpha bleed into transparent
pixels was identical.

`data/` went 4.67 MB -> 3.05 MB on the resize and re-encode, then back up to
3.70 MB for the second icon set — which is a fair trade, because no reader
downloads both.

## Tests and lint

```bash
pytest                              # needs the game installed
pytest tests/test_availability.py   # runs anywhere — reads only committed files
ruff check .
```

CI runs `ruff` and only `test_availability.py`, because no runner has the game
and most of the suite opens `globalgamemanagers.assets` and `level0` directly.
The rest is your responsibility to run locally before you push a pipeline
change.

`pyproject.toml` sets `pythonpath = ["."]`, so `pytest` works from `tools/`
whether or not you installed the package.

## Dependency pins

`UnityPy` and `TypeTreeGeneratorAPI` are pinned **exactly**: both reach into
Unity's serialized-file internals and have broken their APIs across patch
releases, and the committed data was produced by these versions. `numpy` and
`Pillow` are only used for array maths and image I/O, so a major-version bound
is enough. Don't loosen the first two without re-running the whole pipeline and
diffing `data/`.

## After a game update

1. `python -m generator.bootstrap --force`
2. Re-run every step in the table above.
3. Check `git diff data/` — it should be readable. A step that suddenly emits
   far fewer entries means a type or field got renamed upstream, not that the
   game removed content.
4. `npm run gen:manifest` from the repo root.
5. Run the web test suite; the availability parity fixture and the
   `models.ts` contract spec are what catch a shape change.
6. If `UNITY_VERSION` in `config.py` no longer matches the build, update it —
   the type-tree generator has to be told, since the build carries none.
