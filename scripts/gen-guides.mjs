#!/usr/bin/env node
/**
 * Compiles content/guides/*.md into data/guides.json and data/guides/<id>.html.
 *
 * Guides are the one part of the wiki a person writes rather than the
 * extraction pipeline generates, so they live in Markdown where a contributor
 * can edit them without knowing Angular. The reader gets HTML: the conversion
 * happens once here rather than in every visitor's browser, which is the same
 * bargain the rest of the build makes.
 *
 * Two properties are load-bearing:
 *
 *   - Output is deterministic. The index is sorted by (order, id) and the
 *     bodies are written verbatim, so the same sources always produce the same
 *     bytes -- data-manifest.ts hashes them, and CI fails on a diff.
 *   - Raw HTML in a guide is escaped, not passed through. The app binds these
 *     bodies with [innerHTML], and a guide arriving by pull request is not
 *     trusted markup. Markdown's own syntax is the whole vocabulary -- plus
 *     one addition of our own, `[[part:Id]]`, which is the subject of the
 *     part-chip section below.
 */
import { readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, newGameParts, namedParts } from './lib/markdown.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', 'content', 'guides');
const DATA = join(here, '..', 'data');
const OUT_DIR = join(DATA, 'guides');
const OUT_INDEX = join(DATA, 'guides.json');

/**
 * What a guide warns it gives away, or 'none'. These are the RevealKind values
 * from src/app/core/spoiler.service.ts.
 *
 * Unlike every list on the site, this does not gate anything: a guide's body is
 * always served. It is a note in the list, so a reader mid-playthrough can see
 * what a guide is about to tell them and decide. Prose is not a lookup table,
 * and someone who opened a guide called "what the missions unlock" has already
 * made the choice a switch would be asking them to make.
 */
const SPOILER_KINDS = new Set(['none', 'missions', 'components', 'planets', 'stations']);

/**
 * `key: value` pairs from a leading `---` block. A deliberately small subset of
 * YAML: values are taken literally to the end of the line, with surrounding
 * quotes stripped. Anything needing more structure than that belongs in the
 * prose, not in the header.
 */
function frontmatter(text, file) {
  if (!text.startsWith('---\n')) {
    throw new Error(`${file}: no frontmatter -- the file must open with a --- block`);
  }
  const end = text.indexOf('\n---', 3);
  if (end === -1) throw new Error(`${file}: frontmatter is never closed`);

  const meta = {};
  for (const raw of text.slice(4, end).split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const at = line.indexOf(':');
    if (at === -1) throw new Error(`${file}: frontmatter line is not "key: value": ${line}`);
    let value = line.slice(at + 1).trim();
    if (value.length >= 2 && value[0] === value.at(-1) && (value[0] === '"' || value[0] === "'")) {
      value = value.slice(1, -1);
    }
    meta[line.slice(0, at).trim()] = value;
  }
  return { meta, body: text.slice(end + 4) };
}

function build() {
  let files;
  try {
    files = readdirSync(SRC)
      .filter((f) => f.endsWith('.md'))
      .sort();
  } catch {
    files = [];
  }

  const index = [];
  const bodies = new Map();

  for (const file of files) {
    const id = file.replace(/\.md$/, '');
    const { meta, body } = frontmatter(readFileSync(join(SRC, file), 'utf8'), file);

    for (const key of ['title', 'summary', 'updated']) {
      if (!meta[key]) throw new Error(`${file}: frontmatter is missing "${key}"`);
    }
    bodies.set(id, render(body));

    const spoiler = meta.spoiler ?? 'none';
    if (!SPOILER_KINDS.has(spoiler)) {
      throw new Error(
        `${file}: spoiler must be one of ${[...SPOILER_KINDS].join(', ')}, got "${spoiler}"`,
      );
    }

    // A guide that names a part a new game cannot place is telling the reader
    // about something the game has not given them yet, which is exactly what
    // the note in the list is for. Checked here rather than left to a
    // reviewer's eye: the chips make the reference machine-readable, so the
    // build can hold the frontmatter to what the prose actually does.
    if (spoiler === 'none') {
      const locked = [...namedParts].filter((p) => !newGameParts.has(p)).sort();
      if (locked.length) {
        throw new Error(
          `${file}: names ${locked.length} part(s) a new game cannot place ` +
            `(${locked.slice(0, 3).join(', ')}${locked.length > 3 ? ', ...' : ''}) ` +
            `but declares "spoiler: none" -- it should be "spoiler: components"`,
        );
      }
    }

    index.push({
      id,
      title: meta.title,
      summary: meta.summary,
      spoiler,
      updated: meta.updated,
      // Guides are read in an order the author chose, not alphabetically.
      // Ties fall back to the id, so the sort is total and the output stable.
      order: Number(meta.order ?? 100),
    });
  }

  index.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

  // Removed and rebuilt, so a deleted guide does not linger as a served file
  // that nothing links to and the manifest still hashes.
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  for (const [id, html] of bodies) writeFileSync(join(OUT_DIR, `${id}.html`), html);

  // `order` is only here to sort by; the app reads the array as given.
  const served = index.map(({ order: _order, ...rest }) => rest);
  writeFileSync(OUT_INDEX, JSON.stringify(served, null, 1) + '\n');

  console.log(`guides: ${index.length} -> data/guides.json + data/guides/`);
}

build();
