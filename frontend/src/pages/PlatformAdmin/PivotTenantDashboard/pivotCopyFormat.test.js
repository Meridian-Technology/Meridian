import {
  formatPivotCopyTemplate,
  nestedTokenParams,
} from './pivotCopyFormat';

describe('formatPivotCopyTemplate', () => {
  it('interpolates a simple placeholder', () => {
    expect(formatPivotCopyTemplate('{brand.cta} in {city}', {
      'brand.cta': 'go',
      city: 'brooklyn',
    })).toEqual({ ok: true, text: 'go in brooklyn' });
  });

  it('formats ICU plural one / other', () => {
    const template = '{count, plural, one {# friend} other {# friends}}';
    expect(formatPivotCopyTemplate(template, { count: 1 })).toEqual({
      ok: true,
      text: '1 friend',
    });
    expect(formatPivotCopyTemplate(template, { count: 2 })).toEqual({
      ok: true,
      text: '2 friends',
    });
  });

  it('returns the raw template when a param is missing', () => {
    const result = formatPivotCopyTemplate('go in {city}', {});
    expect(result.ok).toBe(false);
    expect(result.text).toBe('go in {city}');
  });
});

describe('nestedTokenParams', () => {
  it('exposes dotted and nested token names', () => {
    const params = nestedTokenParams({
      'brand.name': 'just go',
      'group.singular': 'circle',
    });
    expect(params.brand.name).toBe('just go');
    expect(params.group.singular).toBe('circle');
  });
});
