/**
 * The Markdown setup every generator shares: `[[part:Id]]` chips, escaped raw
 * HTML, and the set of parts a new game can already place.
 *
 * Extracted from gen-guides.mjs so gen-circuits.ts can compile a circuit's
 * notes with exactly the rules a guide follows -- one vocabulary, one escaping
 * policy, one chip. The comments below still say "a guide" where they were
 * written for one; they hold for any prose that comes through here.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, '..', '..', 'data');

/**
 * Markdown to HTML, with raw HTML neutered.
 *
 * `renderer.html` returns its token's text verbatim by default, which is how a
 * `<script>` in a guide would reach the page. Escaping it instead means a
 * contributor who writes HTML sees it as text and fixes it, rather than
 * shipping markup nobody reviewed as markup.
 */
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = (s) => s.replace(/[&<>"']/g, (c) => ESCAPES[c]);

/**
 * The parts a guide is allowed to name with `[[part:Id]]`, and how to draw one.
 *
 * Guides are the only prose on the site, and they spend most of their length
 * naming components. Written flat they are a wall of proper nouns; the icon is
 * what makes a paragraph scannable, and it is the one image the wiki already
 * has for every part. (Rendered circuits would be the other, when they exist.)
 */
const components = JSON.parse(readFileSync(join(DATA, 'components_full.json'), 'utf8'));
const icons = JSON.parse(readFileSync(join(DATA, 'icons.json'), 'utf8'));
const nameOf = new Map(components.map((c) => [c.id, c.name]));

/**
 * The parts a new game can already place, by the pool rule availability.ts
 * documents: a part is placeable when every stock pool it draws on is
 * non-empty, and a pool starts non-empty if any member has an
 * `_availableAmount`.
 *
 * A deliberately small port. It reads `_scGroup` and `_scSecondaryGroup` and
 * stops there, leaving out the two frame-with-pipe parts that also spend pipe
 * stock -- this set only decides whether a guide must warn that it names
 * locked parts, and no guide names either of those. The real rule, in both its
 * implementations, lives in src/app/core/availability.ts and
 * tools/availability.py.
 */
const newGameParts = (() => {
  const statsOf = (c) => Object.values(c.stats ?? {})[0] ?? {};
  const groupOf = (c) => {
    const g = (statsOf(c)['_scGroup'] || 'None (0)').split(' (')[0];
    return g === 'None' ? c.id : g;
  };
  const stocked = new Set();
  for (const c of components) {
    if (statsOf(c)['_availableAmount'] > 0) stocked.add(groupOf(c));
  }
  const out = new Set();
  for (const c of components) {
    const need = new Set([groupOf(c)]);
    const sec = (statsOf(c)['_scSecondaryGroup'] || 'None (0)').split(' (')[0];
    if (sec !== 'None') need.add(sec);
    if ([...need].every((p) => stocked.has(p))) out.add(c.id);
  }
  return out;
})();

/**
 * The icon URL for a part, carrying the same `?v=` content hash the manifest
 * will give it.
 *
 * gen-data-manifest.mjs runs AFTER this script and hashes the HTML we write,
 * so we cannot read the manifest -- but we can hash the icon the identical way
 * (sha256, first 8 hex) and arrive at the same string. The alternative is an
 * unversioned URL, which works but gives up the immutable caching every other
 * image on the site gets.
 *
 * The 1x file is the 64px icon, which is already better than twice the 20px a
 * chip draws it at; there is no second file worth fetching here.
 */
function iconUrl(id) {
  const entry = icons[id];
  if (!entry) return null;
  const path = entry.file_1x ?? entry.file;
  const hash = createHash('sha256')
    .update(readFileSync(join(DATA, path)))
    .digest('hex')
    .slice(0, 8);
  return `data/${path}?v=${hash}`;
}

/** The ids the guide currently being compiled has named. Reset per file. */
const namedParts = new Set();

/**
 * `[[part:AtmosphericFan]]` -> the part's icon and name, linked to its page.
 *
 * An inline marked extension rather than a search-and-replace over the output,
 * so the syntax is inert inside code spans and fenced blocks the way a reader
 * writing about the syntax would expect.
 *
 * An unknown id fails the build. A guide that names a part the game does not
 * have is wrong in a way no reader can catch, which is exactly the class of
 * error this wiki exists to avoid.
 */
const partChip = {
  name: 'partChip',
  level: 'inline',
  start: (src) => src.indexOf('[[part:'),
  tokenizer(src) {
    const m = /^\[\[part:([A-Za-z0-9_]+)\]\]/.exec(src);
    if (!m) return undefined;
    return { type: 'partChip', raw: m[0], id: m[1] };
  },
  renderer({ id }) {
    namedParts.add(id);
    const name = nameOf.get(id);
    if (!name) throw new Error(`[[part:${id}]] is not a component id`);
    const url = iconUrl(id);
    // Decorative: the chip's own text is the part's name, and a screen reader
    // announcing it twice adds nothing.
    const img = url
      ? `<img src="${escape(url)}" alt="" width="20" height="20" loading="lazy" />`
      : '';
    return `<a class="part" href="/components/${escape(id)}">${img}<span>${escape(name)}</span></a>`;
  },
};

marked.use({
  gfm: true,
  extensions: [partChip],
  renderer: {
    html: ({ text }) => escape(text),
  },
});

export { escape, newGameParts, namedParts, nameOf };
/** Markdown -> HTML with this site's rules. Resets the named-parts set first. */
export function render(md) {
  namedParts.clear();
  return marked.parse(md.trim()) + '\n';
}
