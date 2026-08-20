const {
  normalizeOrganizerName,
  looksLikeJoinedMultiHost,
  upsertOrganizerAlias,
} = require('../../utilities/pivotOrganizerName');

describe('normalizeOrganizerName', () => {
  it('trims, lowercases, and folds punctuation and apostrophes', () => {
    expect(normalizeOrganizerName("  Gabe's  ")).toBe('gabes');
    expect(normalizeOrganizerName('Gabe\u2019s')).toBe('gabes');
    expect(normalizeOrganizerName('Gabes')).toBe('gabes');
    expect(normalizeOrganizerName('Roof Records')).toBe('roof records');
  });

  it('drops a leading the', () => {
    expect(normalizeOrganizerName('The Chapel')).toBe('chapel');
    expect(normalizeOrganizerName('THE Chapel')).toBe('chapel');
  });

  it('strips trailing Inc / LLC / Ltd (with optional comma or period)', () => {
    expect(normalizeOrganizerName('Roof Records, LLC')).toBe('roof records');
    expect(normalizeOrganizerName('Roof Records Inc.')).toBe('roof records');
    expect(normalizeOrganizerName('Acme Ltd')).toBe('acme');
    expect(normalizeOrganizerName('Acme, Inc')).toBe('acme');
    expect(normalizeOrganizerName('The Chapel, LLC')).toBe('chapel');
    expect(normalizeOrganizerName('Foo Inc LLC')).toBe('foo');
  });

  it('does not strip inc-like tokens in the middle of a name', () => {
    expect(normalizeOrganizerName('Incubator Records')).toBe('incubator records');
    expect(normalizeOrganizerName('Zinc')).toBe('zinc');
  });

  it('treats & and and as equivalent for a single name without splitting', () => {
    expect(normalizeOrganizerName('Rhythm & Blues')).toBe('rhythm and blues');
    expect(normalizeOrganizerName('Rhythm and Blues')).toBe(
      normalizeOrganizerName('Rhythm & Blues'),
    );
    expect(normalizeOrganizerName('Alice & Bob')).toBe('alice and bob');
    expect(looksLikeJoinedMultiHost('Alice & Bob')).toBe(true);
  });

  it('does not strip city suffixes', () => {
    expect(normalizeOrganizerName('roof records nyc')).toBe('roof records nyc');
    expect(normalizeOrganizerName('Roof Records')).not.toBe(
      normalizeOrganizerName('roof records nyc'),
    );
    expect(normalizeOrganizerName('Roof Records, LLC')).not.toBe(
      normalizeOrganizerName('roof records nyc'),
    );
  });

  it('returns empty for blank input', () => {
    expect(normalizeOrganizerName('')).toBe('');
    expect(normalizeOrganizerName(null)).toBe('');
  });
});

describe('looksLikeJoinedMultiHost', () => {
  it('detects ampersand and and joins', () => {
    expect(looksLikeJoinedMultiHost('Alice & Bob')).toBe(true);
    expect(looksLikeJoinedMultiHost('Alice and Bob')).toBe(true);
    expect(looksLikeJoinedMultiHost('Roof Records')).toBe(false);
  });
});

describe('upsertOrganizerAlias', () => {
  it('persists every distinct raw string even when normalized matches', () => {
    let aliases = upsertOrganizerAlias([], 'The Chapel', 'resolve');
    aliases = upsertOrganizerAlias(aliases, 'Chapel', 'resolve');
    aliases = upsertOrganizerAlias(aliases, 'The Chapel', 'resolve');
    aliases = upsertOrganizerAlias(aliases, '  Chapel  ', 'resolve');

    expect(aliases.map((row) => row.name)).toEqual(['The Chapel', 'Chapel']);
    expect(aliases.every((row) => row.normalized === 'chapel')).toBe(true);
    expect(aliases.every((row) => row.source === 'resolve')).toBe(true);
  });

  it('skips blank names and omits source when not provided', () => {
    expect(upsertOrganizerAlias([], '  ')).toEqual([]);
    expect(upsertOrganizerAlias(undefined, 'Alice')).toEqual([
      { name: 'Alice', normalized: 'alice' },
    ]);
  });
});
