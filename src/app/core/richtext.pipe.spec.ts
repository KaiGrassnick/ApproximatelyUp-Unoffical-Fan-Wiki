import { RichtextPipe, IdentPipe } from './richtext.pipe';

describe('richtext pipes', () => {
  it('renders prose markers as markup', () => {
    expect(new RichtextPipe().transform('**hot** and _cold_')).toBe(
      '<strong>hot</strong> and <em>cold</em>',
    );
  });

  it('never applies emphasis to an identifier', () => {
    expect(new IdentPipe().transform('Package_Ashbelt_DamagedThruster')).toBe(
      'Package Ashbelt DamagedThruster',
    );
  });

  it('renders an empty value as an empty string', () => {
    expect(new RichtextPipe().transform('')).toBe('');
    expect(new RichtextPipe().transform(null)).toBe('');
  });
});
