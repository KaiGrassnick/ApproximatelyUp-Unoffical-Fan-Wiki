import { DATA_MANIFEST } from './data-manifest';

/**
 * Coverage -- "every file under data/ has an entry" -- is deliberately not
 * tested here. CI regenerates the manifest and diffs it (the "data manifest is
 * up to date" step), so a missing file already fails there, and asserting it
 * again would mean giving this browser app @types/node just to walk a
 * directory.
 *
 * What is left is what that diff cannot catch: a generator that is internally
 * consistent but wrong.
 */
describe('DATA_MANIFEST', () => {
  const keys = Object.keys(DATA_MANIFEST);

  it('covers the extracted JSON the wiki cannot render without', () => {
    expect(keys).toContain('components_full.json');
    expect(keys).toContain('planets.json');
    expect(keys).toContain('objectives.json');
    expect(keys).toContain('icons.json');
    expect(keys).toContain('stat_labels.json');
  });

  /**
   * The guides are compiled from content/guides/*.md into data/ by a second
   * generator, and the manifest step runs both. If the wiring ever comes apart
   * the guides are served unversioned and cached wrong, which nothing else
   * would notice.
   */
  it('covers the compiled guides', () => {
    expect(keys).toContain('guides.json');
    expect(keys.some((k) => k.startsWith('guides/') && k.endsWith('.html'))).toBe(true);
  });

  it('excludes star_noise, which is a render input and is never served', () => {
    expect(keys.some((k) => k.startsWith('star_noise/'))).toBe(false);
  });

  it('maps every entry to 8 lowercase hex characters', () => {
    const bad = Object.entries(DATA_MANIFEST).filter(([, v]) => !/^[0-9a-f]{8}$/.test(v));
    expect(bad).toEqual([]);
  });

  it('is emitted in sorted key order', () => {
    // The freshness check diffs a regenerated file against this one, so a
    // generator whose order depends on the filesystem would fail CI at random.
    expect(keys).toEqual([...keys].sort());
  });

  it('uses POSIX-style keys relative to data/, which is what url() looks up', () => {
    const bad = keys.filter((k) => k.includes('\\') || k.startsWith('/') || k.startsWith('data/'));
    expect(bad).toEqual([]);
  });
});
