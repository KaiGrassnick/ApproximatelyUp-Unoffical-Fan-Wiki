# Contributing

Thanks for wanting to help. This is a community wiki — corrections, new views,
bug reports, design work and documentation are all equally welcome, and you do
**not** need to own the game to work on it.

## Ground rules

Be decent to each other. Assume good faith, keep criticism about the code, and
remember that most people here are doing this in their spare time. Behaviour
that makes the project unpleasant to be part of gets you removed from it.

**Don't spoil people by accident.** The wiki's whole premise is that it reveals
only what the reader has earned. Any feature that surfaces content must respect
`SpoilerService` and `WorldService` — see [Spoiler discipline](#spoiler-discipline).

## Ways to contribute

There are three issue forms — **Report an issue**, **Request a feature** and
**Add new content** — and each one asks for what that kind of report actually
needs.
The wiki itself has a feedback button in the bottom-right corner that opens the
right form with the page you were on already filled in, which is the shortest
path if you spotted something while reading.

- **Report a bug or wrong number.** For a wrong value, the game's own number is
  what settles it, so include it.
- **Suggest a feature.** Open an issue first for anything sizeable, so we can
  agree on the shape before you spend an evening on it.
- **Ask for a guide or an explanation.** The generated pages carry the numbers;
  prose is the part someone has to write, and knowing what people want to read
  is what decides what gets written. You do not have to write it yourself.
- **Send a pull request.** Small and focused beats large and sweeping.

## Development environment

You need **Node 22 or newer** and npm. Nothing else — the extracted game data
is committed, so a fresh clone runs without the game installed.

```bash
git clone git@github.com:KaiGrassnick/ApproximatelyUp-Unoffical-Wiki.git
cd ApproximatelyUp-Unoffical-Wiki
npm ci
npm start
```

The dev server runs on <http://localhost:4200>. `npm start` regenerates the
data manifest first (see [The data manifest](#the-data-manifest)).

### Commands

| Command                     | What it does                                           |
| --------------------------- | ------------------------------------------------------ |
| `npm start`                 | Dev server on :4200                                    |
| `npm run build:prod`        | Production build into `dist/`, prerendering every page |
| `npx ng test --watch=false` | Unit tests — Vitest with jsdom, no browser             |
| `npm run lint`              | ESLint + template a11y rules + colour contrast         |
| `npm run format`            | Prettier, writes in place                              |
| `npm run format:check`      | Prettier, fails instead of writing (what CI runs)      |
| `npm run gen:manifest`      | Rebuild `data-manifest.ts` + index.html's preloads     |
| `npm run gen:sitemap`       | Rebuild `public/sitemap.xml` from `data/`              |

### Editor setup

`.editorconfig`, `.prettierrc` and `.vscode/` are committed. Turn on
format-on-save with Prettier and ESLint and you will not have to think about
style again.

## Project layout

```
content/guides/     Hand-written guides in Markdown (see Writing a guide)
content/circuits/   Hand-written circuits in JSON (see Writing a circuit)
src/app/core/       Data loading, models, availability engine, save parsing,
                    text rendering, spoiler state, the 3D galaxy scene
src/app/features/   One folder per route: components, planets, missions,
                    stations, galaxy, home, not-found
src/app/shared/     Reusable presentational pieces (panel, stat-table,
                    status-pill, reveal-menu, ...)
src/styles/         Design tokens and the HUD look
data/               Committed JSON + images — the wiki's content
tools/              Python extraction pipeline (see tools/README.md)
scripts/            Build-time Node helpers
docker/             Dockerfile and the nginx config it ships
src/main.server.ts  Prerenderer entry, mirroring main.ts
src/app/*.server.ts Which routes are prerendered, and with which providers
```

Routes are lazy-loaded in `src/app/app.routes.ts`; adding a page means adding a
folder under `features/` and an entry there.

A page with an **id in its path** needs one thing more: its ids belong in
`src/app/prerender-pages.ts`, or the build writes no HTML file for it and it
falls back to being an ordinary client-rendered page. `prerender-pages.spec.ts`
cross-checks that list against `public/sitemap.xml`, so a route added to one
and not the other fails the suite rather than going quietly missing.

## House style

The codebase has strong opinions. Match them rather than importing your own:

- **Angular 22, standalone components, signals.** No NgModules, no
  `@Input()`/`@Output()` decorators where `input()`/`output()` will do, no
  manual subscriptions where a signal or `httpResource` fits.
- **Strict TypeScript.** No `any` slipped in to make a type error go away.
- **Comments explain _why_, not _what_.** Look at `world.service.ts` or
  `bootstrap.py` for the register: they document the reasoning and the traps,
  not the syntax. If your comment restates the line below it, delete it.
- **Accessibility is not optional.** The linter enforces template a11y rules
  and CI fails on them.
- **Prettier decides formatting.** Don't argue with it, don't reformat files
  you aren't otherwise touching.

## Tests

Every behavioural change needs a test. The suite is Vitest with jsdom — there
is no browser runner and none is accepted.

```bash
npx ng test --watch=false
```

A few specs are load-bearing and will fail loudly if you break an invariant:

- `src/app/core/availability.spec.ts` — parity fixture. The availability engine
  exists in both Python (`tools/generator/availability.py`) and TypeScript, and
  this proves they still agree. If it fails, one of the two ports drifted.
- `src/app/core/models.contract.spec.ts` — the committed JSON still matches
  `models.ts`.
- `src/app/core/data-manifest.spec.ts` — the manifest matches `data/`.

`src/app/core/stats.ts` and `src/app/core/text.ts` are likewise hand-ports of
`tools/generator/stats.py` and `text.py`. **If you change one side, change the
other**, or the wiki and the pipeline will silently disagree.

## Spoiler discipline

Two services govern what a reader may see:

- `WorldService` — what the loaded `.world` save has unlocked. With no save it
  reasons from a fresh new game.
- `SpoilerService` — the four reveal switches (`missions`, `components`,
  `planets`, `stations`), which the reader turns on deliberately.

Any new view that lists game content must go through them. A feature that shows
everything by default is a bug, not a convenience — and save data is parsed in
the browser and never leaves it, so don't add anything that sends it anywhere.

## Writing a guide

Guides are the one part of the wiki a person writes rather than the pipeline
generates. They are Markdown files in `content/guides/`, one per guide, and the
filename is the URL: `content/guides/how-parts-unlock.md` is served at
`/guides/how-parts-unlock`.

Each file opens with a frontmatter block:

```markdown
---
title: How parts unlock
summary: Stock pools, why one reward unlocks dozens of shapes.
spoiler: none
updated: 2026-09-07
order: 20
---

The guide itself, in Markdown.
```

| Key       |                                                                                        |
| --------- | -------------------------------------------------------------------------------------- |
| `title`   | Required. Shown in the list and as the page title.                                     |
| `summary` | Required. One line, shown under the title in the list.                                 |
| `updated` | Required. `YYYY-MM-DD`.                                                                |
| `spoiler` | `none` (default), or one of `missions`, `components`, `planets`, `stations`, `guides`. |
| `order`   | Sort position, default 100. Ties fall back to the filename.                            |

`spoiler` is a **note, not a gate**. Every guide's body is served in full to
everyone; the kind is shown as "Spoilers: missions" beside the title in the
list, and again on the guide itself for a reader who arrived by link. Guides
are the one part of the wiki that works this way, because you reach a guide by
choosing its title off a list that already says what it gives away — the choice
a reveal switch exists to ask for has been made by the time the body loads.
That is also why there is no guides switch in the **Spoilers** menu.

Mark honestly: a guide that names a late-game planet spoils planets even if it
is mostly about something else. One case is checked for you — see part chips
below.

Raw HTML in a guide is escaped rather than rendered. Markdown's own syntax is
the whole vocabulary, plus one addition: a link to another wiki page is an
ordinary `[link](/planets)` and stays inside the app when clicked.

### Part chips

`[[part:AtmosphericFan]]` compiles to the component's icon and name, linked to
its page:

```markdown
The [[part:AtmosphericFan]] works underwater; the
[[part:AtmosphericThruster]] does not.
```

The id is the component's own — the last segment of its URL under
`/components`. An id the game does not have fails the build, as does a guide
that names a part **a new game cannot place** while declaring `spoiler: none`:
such a guide is telling the reader about something the game has not given them
yet, so it wants `spoiler: components`. Both checks live in
`scripts/gen-guides.mjs`.

The syntax is inert inside code spans and fenced blocks, so a guide can write
about the syntax itself. Chip the first substantive mention of a part rather
than every one — a paragraph of icons is harder to read than a paragraph
without them.

Rebuild after editing:

```bash
npm run gen:guides      # or npm run gen, which also refreshes the manifest
```

`npm start` and `npm run build:prod` both do this for you. The compiled output
lands in `data/guides.json` and `data/guides/` and is **not** committed — the
Markdown is the source, and committing both would put the same prose in the
tree twice.

## Writing a circuit

A circuit is a JSON file in `content/circuits/`, compiled by
`scripts/gen-circuits.ts` into a picture and a parts list. The smallest one:

```json
{
  "title": "Sign of an error",
  "summary": "One line high when the input is positive.",
  "spoiler": "none",
  "updated": "2026-09-07",
  "parts": [
    { "id": "v", "type": "LogicValue" },
    { "id": "n", "type": "LogicGateNot", "label": "ERR < 0" }
  ],
  "wires": [{ "from": "v:out", "to": "n:in" }]
}
```

- `type` is a component id from the [Components](https://aup-fan-wiki.org/components)
  section; `data/circuit_parts.json` lists every part's port names (such as
  `in`, `in1`, `out`, `pwr`, `plasma`, `port1`) with the game's own description
  of each.
- Leave positions out and the build lays the circuit out; add `"at": [x, z]`
  (cells, min corner) and `"rot": 90` to pin a part.
- `value`, `label` and `mode` are drawn on or under the block; `notes` can box a
  group of parts, place a callout, or add Markdown prose (`kind: "md"`).
- A wire joins one output to one input. To split a signal, use a Router2 or Router4.
- `spoiler` must be `components` if any part is not placeable in a new game;
  the build refuses `none` otherwise, the way it does for guides.
- The page's 3D view draws the same placed model as the picture, so a circuit
  needs nothing extra for it; a part type nobody has used yet only makes
  `data/circuit-meshes.json` grow the next time the meshes are generated.

Run `npm run gen:circuits`. It prints every problem it found, by part and wire,
and writes no circuit until they are fixed. Then look at `data/circuits/<id>.svg`
and commit it together with the JSON, the index and the regenerated manifest and
sitemap (`npm run gen` does all of it).

## The data manifest

`src/app/core/data-manifest.ts` carries a content hash per data file, used as a
`?v=` cache buster. Versioned URLs are served immutable for a year, so a data
change with a stale manifest would poison readers' caches with old bytes under
a new hash. CI fails if the manifest is out of date.

If you touch anything in `data/`:

```bash
npm run gen:manifest
```

and commit the regenerated files — plural, because the same hashes feed two
places. `src/app/core/data-manifest.ts` is what `dataUrl()` appends as `?v=`,
and the generated block in `src/index.html` preloads those same URLs so the
browser starts fetching them with the page instead of waiting for Angular to
boot and ask. A preload naming a stale hash is a file downloaded twice, which
is why neither is written by hand.

## Regenerating `data/`

`data/` is produced by the Python pipeline in `tools/`, which reads an
installed copy of the game, so you need the game to touch it at all. It is
documented in full in **[tools/README.md](tools/README.md)** — setup, the run
order, and what to do after a game patch. If a game patch has made the data
stale and you cannot run the pipeline yourself, open an issue rather than a
PR.

## Pull requests

1. Branch off `main`.
2. Keep the change focused. Unrelated cleanups belong in their own PR.
3. Run the full local check before pushing:
   ```bash
   npm run format:check && npm run lint && npx ng test --watch=false && npm run build:prod
   ```
4. Write a commit message that says **why**. The history uses
   `type: summary` prefixes (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`) —
   follow that.
5. Open the PR and describe what changed and how you verified it. Screenshots
   help for anything visual.

CI runs Python lint + tests, then the Angular lint/test/build, then builds the
container and smoke-tests that it actually serves the app. All of it has to be
green.

The same checks run on every branch and on `main`; the only difference is that
`main` also publishes the image to GHCR as `edge` and `sha-<commit>`. Releases
do not rebuild — pushing a `v*` tag retags the image already published for that
commit, so the released bytes are the ones CI tested. The workflows live in
`.github/workflows/`, with the shared logic in `_lint.yml` and `_image.yml`.

## Licence

By contributing you agree that your contribution is licensed under the
[MIT License](LICENSE), the same as the rest of the project.
