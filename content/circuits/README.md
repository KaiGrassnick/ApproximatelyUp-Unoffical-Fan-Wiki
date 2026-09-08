# content/circuits

Each `*.json` here is one circuit, hand-written. The build compiles it into a
picture, a placed model and a parts list; the page draws both the picture and,
on demand, the same model in 3D. This file is about running that pipeline and
seeing the result. The schema — parts, wires, notes, positions, the `spoiler`
rule — is in [CONTRIBUTING.md](../../CONTRIBUTING.md#writing-a-circuit).

`README.md` is not a circuit: the generator only reads `.json`.

## Generate

```bash
npm run gen:circuits    # this directory -> data/
npm run gen             # the same, plus guides, the data manifest and the sitemap
```

`scripts/gen-circuits.ts` is a thin Node shell (run through `tsx`) around the
engine in `src/app/core/circuits/`, which is plain TypeScript so the page can
run the very same code against a reader's save. From each file it writes:

| Output                     | What it is                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| `data/circuits/<id>.svg`   | the drawing the page shows                                                                   |
| `data/circuits/<id>.json`  | the placed model, stats, BOM and rendered notes                                              |
| `data/circuits.json`       | the index: title, summary, stats, `newGame`                                                  |
| `data/circuit-meshes.json` | geometry for the 3D view, cut down to the part types the shipped circuits actually place     |
| `data/circuit_parts.json`  | every part's port names and the game's description of each — the reference for writing wires |

`circuit_parts.json` is written first and unconditionally, so it is there to
read even when the circuits themselves fail to build.

Two properties are load-bearing. Output is **deterministic** — sorted keys,
stable layout and routing — because the data manifest hashes it, so a rerun
that changes nothing produces no diff. And an **impossible circuit fails the
build**: one that will not route, breaks a wiring rule, or needs more of a pool
than the whole game hands out prints its problems by part and wire, and _no_
circuit is written until they are fixed.

```
  warn   error-sign.json err:in: not connected
  error  anti-windup.json pool Router2: needs 12, the game holds 8
circuits: not written -- fix the errors above
```

Warnings — an unconnected input, a part a new game cannot stock — are printed
and the circuit still ships.

`data/circuits/` is removed and rebuilt each run, so a deleted circuit does not
linger as a served file.

Unlike the compiled guides, this output **is committed**. Commit the JSON, the
SVG, the index and the regenerated manifest and sitemap together — `npm run
gen` does all of it, and CI fails on a stale manifest.

## Render

```bash
npm start               # runs npm run gen, then ng serve
```

Then open `/circuits` for the list, `/circuits/<id>` for one circuit — `<id>`
is this file's name without `.json`.

The page fetches `circuits.json` once for the list and the save check, then the
circuit's own `.svg` and `.json` when you open it. The **3D view** draws the
same placed model as the picture, so a circuit needs nothing extra for it; it
lazy-loads `circuit-meshes.json` only when a reader asks for that view.

To look at a drawing without the app:

```bash
npm run gen:circuits && xdg-open data/circuits/error-sign.svg
```

If a part type is missing from the 3D view, it is missing from
`data/meshes.json` — regenerate it from the game install with `python -m
generator.meshes` (see [tools/README.md](../../tools/README.md)), then rerun
`gen:circuits` so the subset picks the part up.
