const { ruleFromCorrection, activeRuleHints, applyStructuredRules, isDateOnlyDescription } =
  require('../../utilities/pivotStructuredExtractionRules');

describe('structured extraction rules', () => {
  it('creates a proposed rule without applying it until approval', () => {
    const rule = ruleFromCorrection({ field: 'image', reason: 'venue_logo',
      before: 'https://venue.example/logo.png', after: 'https://venue.example/show.jpg', eventId: 'event-1' });
    expect(rule).toMatchObject({ id: 'event-1:image:venue_logo', status: 'proposed' });
    expect(activeRuleHints([rule])).toEqual([]);
    expect(applyStructuredRules({ imageUrl: rule.badValue,
      imageCandidates: ['https://venue.example/show.jpg'] }, [rule]).row.imageUrl).toBe(rule.badValue);
  });

  it('replaces a known logo with a candidate from the same event', () => {
    const rule = { id: 'logo-rule', field: 'image', reason: 'venue_logo',
      badValue: 'https://venue.example/logo.png', status: 'active' };
    expect(applyStructuredRules({ imageUrl: rule.badValue, imageCandidates: [
      'https://venue.example/icon.png', 'https://venue.example/show.jpg',
    ] }, [rule])).toEqual({ row: { imageUrl: 'https://venue.example/show.jpg', imageCandidates: [
      'https://venue.example/icon.png', 'https://venue.example/show.jpg',
    ] }, applied: ['logo-rule'] });
  });

  it('removes standalone dates from descriptions while keeping real copy', () => {
    const rule = { id: 'date-rule', field: 'description', reason: 'date_not_description',
      badValue: 'Friday, Sep 25 at 8pm', status: 'active' };
    expect(isDateOnlyDescription('Friday, Sep 25 at 8pm')).toBe(true);
    expect(isDateOnlyDescription('Friday screening with live music')).toBe(false);
    expect(applyStructuredRules({ description: 'Friday, Sep 25 at 8pm' }, [rule]).row.description).toBe('');
    expect(applyStructuredRules({ description: 'Friday screening with live music' }, [rule]).row.description)
      .toBe('Friday screening with live music');
  });
});
