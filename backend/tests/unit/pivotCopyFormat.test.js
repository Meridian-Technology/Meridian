const {
  formatPivotCopyTemplate,
  nestedTokenParams,
} = require('../../utilities/pivotCopyFormat');
const {
  resolveOverlayPushBody,
} = require('../../utilities/pivotCopyPushResolve');

describe('pivotCopyFormat', () => {
  it('interpolates a simple placeholder', () => {
    expect(
      formatPivotCopyTemplate('{brand.cta} in {city}', {
        'brand.cta': 'go',
        city: 'brooklyn',
      }),
    ).toEqual({ ok: true, text: 'go in brooklyn' });
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

describe('resolveOverlayPushBody', () => {
  it('returns the bundled fallback for an empty pack', () => {
    expect(resolveOverlayPushBody('crew.push.weeklyDrop.ritualBody', null, 'fallback')).toBe(
      'fallback',
    );
    expect(
      resolveOverlayPushBody('crew.push.weeklyDrop.ritualBody', { entries: {}, tokens: {} }, 'fallback'),
    ).toBe('fallback');
  });

  it('formats an overlay template with shipped token defaults', () => {
    expect(
      resolveOverlayPushBody(
        'crew.push.weeklyDrop.ritualBody',
        {
          entries: {
            'crew.push.weeklyDrop.ritualBody': "where's your {group.singular} going?",
          },
        },
        'fallback',
      ),
    ).toBe("where's your circle going?");
  });
});
