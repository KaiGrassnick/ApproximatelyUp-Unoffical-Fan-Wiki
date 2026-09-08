import { esc, richtext } from './text';

describe('text', () => {
  it('escapes markup in the source text', () => {
    expect(esc('a <b> & "c"')).toBe('a &lt;b&gt; &amp; &quot;c&quot;');
  });

  it('turns literal and real newlines into breaks', () => {
    expect(richtext('a\\nb')).toBe('a<br>b');
    expect(richtext('a\nb')).toBe('a<br>b');
  });

  it('renders paired bold and underscore emphasis', () => {
    expect(richtext('**hot** and _cold_')).toBe('<strong>hot</strong> and <em>cold</em>');
  });

  it('leaves an unpaired bold marker as literal text', () => {
    expect(richtext('50% **more')).toBe('50% **more');
  });

  it('escapes before adding markup, so source HTML cannot inject', () => {
    expect(richtext('<script>x</script>')).toBe('&lt;script&gt;x&lt;/script&gt;');
  });
});
