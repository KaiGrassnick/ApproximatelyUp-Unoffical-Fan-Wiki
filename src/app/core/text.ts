// Ports of tools/wiki_html.py — esc(), richtext().
//
// Order matters and matches the Python: escape first, so the <br>, <strong>
// and <em> introduced here are the only markup in the result and nothing in
// the game's own text can inject any.
//
// Only *paired* markers substitute. An odd trailing "**" survives as literal
// text rather than emitting an unclosed tag.
//
// "_..._" renders as <em>, not <u>: prose already carries plain inline links,
// which are underlined, so underlined text would read as a broken link.
//
// tools/wiki_html.py is deleted (the static generator it belonged to was
// retired in favour of this app) but survives in git at commit 0e43362.

const BOLD = /\*\*([^*]+?)\*\*/g;
const EM = /_([^_]+?)_/g;

export function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export function richtext(s: string): string {
  return esc(s)
    .replace(/\\n/g, '<br>')
    .replace(/\n/g, '<br>')
    .replace(BOLD, '<strong>$1</strong>')
    .replace(EM, '<em>$1</em>');
}

/**
 * The same source strings as richtext(), flattened to one line of plain text.
 *
 * For the places that take text rather than markup — a meta description, an
 * og:description — where "**bold**" and a literal "\n" are both noise. It is
 * the same vocabulary richtext() knows, with the markers dropped instead of
 * turned into tags, and nothing is escaped: the consumer is an attribute
 * value that the DOM escapes on its own.
 */
export function plaintext(s: string): string {
  return String(s)
    .replace(/\\n/g, ' ')
    .replace(BOLD, '$1')
    .replace(EM, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
