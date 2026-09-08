# Approximately Up — Unofficial Fan Wiki

A community-built, spoiler-aware wiki for the game **Approximately Up**: every
component, planet, station and mission, with the numbers taken straight out of
the game's own files rather than typed in by hand.

> **Live site:** <https://aup-fan-wiki.org>

This is an unofficial fan project. It is not affiliated with, endorsed by, or
supported by Approximately Games. See [Legal](#legal) below.

## What it does

- **Components** — all buildable parts with their real stats, pulled from the
  game's prefabs, plus the game's own labels for each stat.
- **Planets & stations** — the full universe, including rendered globes built
  from each body's terrain data.
- **Missions** — objectives with their rewards, required components and
  dependency chains.
- **Galaxy map** — an interactive 3D map of the system.
- **Guides** — the hand-written half: explanations and walkthroughs, in
  Markdown under [`content/guides/`](content/guides), compiled to HTML at build
  time.
- **Circuits** — signal circuits written as small JSON files under
  [`content/circuits/`](content/circuits), drawn at build time from the game's
  own block geometry, with each one's mass, power draw, parts list, whether
  your save can build it, and a 3D view you can orbit.

### It does not spoil the game

By default the wiki shows you **a new game**: the parts you start with, the
places you start in, and nothing else. Two things change that, and both are
your deliberate choice:

- **Drop a `.world` save** onto the header and the wiki opens up exactly as far
  as you have played — no further. The save is parsed **in your browser**;
  nothing is uploaded, and there is no server to upload it to.
- **Reveal switches** for missions, components, planets and stations, if you
  have finished the game or don't mind knowing.

## How it works

Two halves, and they meet at one directory:

```
tools/    Python extraction pipeline — reads the installed game, writes data/
content/  hand-written guides in Markdown and circuits in JSON, compiled into data/ at build time
data/     committed JSON + images: the wiki's entire content
src/      Angular app — reads data/*.json at runtime, computes the rest in the browser
```

The extracted data is **committed**. That means running the wiki needs no game
files at all: clone, `npm ci`, `npm start`. The pipeline in `tools/` is only
run when the game ships a patch and the data needs to be regenerated.

There is no backend. The production artifact is a static site served by nginx —
every bit of logic the wiki performs (availability, save parsing, spoiler
gating) runs in the reader's browser.

The build **prerenders every page**: 487 HTML files, one per address, each with
its real title, description and content already in it. That is what a crawler
and a link unfurl read, and it is why a deep link works with JavaScript
switched off. The prerenderer has no `localStorage`, so every page is written
as the **new game** view — which is both what a first-time reader should see
and what keeps the wiki's spoiler policy intact in a search index. Once the app
boots in the browser it renders over that HTML with whatever the reader's own
save and reveal switches say.

`data/` sits at the repo root, beside `angular.json`, because `@angular/build`
refuses an asset input that resolves outside the workspace directory. The app
reads `data/*.json` relative to the workspace and `angular.json` serves the
directory verbatim into the build output — no copy, no symlink, nothing to set
up after a clone.

## Quick start

Requires **Node 22+** and npm.

```bash
git clone git@github.com:KaiGrassnick/ApproximatelyUp-Unoffical-Fan-Wiki.git
cd ApproximatelyUp-Unoffical-Fan-Wiki
npm ci
npm start          # dev server on http://localhost:4200
```

Other commands:

```bash
npm run build:prod          # static site in dist/ — prerenders all 487 pages
npx ng test --watch=false   # unit tests (Vitest + jsdom)
npm run lint                # ESLint, including template accessibility rules
npm run format              # Prettier
```

Or run the container:

```bash
docker build -f docker/Dockerfile -t approximatelyup-unoffical-fan-wiki .
docker run --rm -p 8080:8080 approximatelyup-unoffical-fan-wiki
```

Published images are on GHCR — `latest` for the newest release, `edge` for the
tip of `main`, and `sha-<commit>` for any individual build:

```bash
docker run --rm -p 8080:8080 ghcr.io/kaigrassnick/approximatelyup-unoffical-fan-wiki:latest
```

## Contributing

Contributions are welcome — corrections, new views, bug reports, design work.
Start with **[CONTRIBUTING.md](CONTRIBUTING.md)**, which covers the dev
environment, project layout, house style and how to open a good pull request.

The Python extraction pipeline in `tools/` has its own guide —
**[tools/README.md](tools/README.md)**. You do not need it, or the game, to
work on the wiki itself.

## Legal

_Approximately Up_ and all of its assets, names and data are the property of
their respective owners. This project is an independent fan effort: it ships
data derived from the game so that players can look things up, and it exists
to send people **to** the game, not around it. If you are the rights holder and
would like something changed or removed, please open an issue.

The wiki's own source code is [MIT licensed](LICENSE).
