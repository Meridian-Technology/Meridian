const {
  parseEventDateTime,
  parseAddress,
  parsePrice,
  parseAgeRestriction,
  extractCategoryHints,
  enrichIngestDraft,
} = require('../../utilities/pivotFieldParsingUtils');

describe('pivotFieldParsingUtils', () => {
  const chicagoNow = new Date('2026-08-13T17:00:00.000Z'); // Thu 12:00 in Chicago

  describe('parseEventDateTime', () => {
    it('keeps ISO strings with offsets as the same instant', () => {
      const parsed = parseEventDateTime('2026-07-10T20:00:00-05:00');
      expect(parsed.iso).toBe('2026-07-11T01:00:00.000Z');
      expect(parsed.error).toBeNull();
      expect(parsed.raw).toBe('2026-07-10T20:00:00-05:00');
    });

    it('parses a naive ISO datetime in the city timezone', () => {
      const parsed = parseEventDateTime('2026-08-15T19:00:00', {
        timezone: 'America/Chicago',
      });
      expect(parsed.iso).toBe('2026-08-16T00:00:00.000Z');
      expect(parsed.timezone).toBe('America/Chicago');
    });

    it('does not treat month-day numbers as a clock', () => {
      const parsed = parseEventDateTime('Aug 15-16', {
        timezone: 'America/Chicago',
        now: chicagoNow,
      });
      expect(parsed.iso).toBe('2026-08-15T05:00:00.000Z');
    });

    it('resolves Friday at 8pm in the city timezone', () => {
      const parsed = parseEventDateTime('Friday at 8pm', {
        timezone: 'America/Chicago',
        now: chicagoNow,
      });
      expect(parsed.error).toBeNull();
      expect(parsed.timezone).toBe('America/Chicago');
      // Next Friday 2026-08-14 20:00 CDT = 2026-08-15T01:00:00.000Z
      expect(parsed.iso).toBe('2026-08-15T01:00:00.000Z');
    });

    it('resolves Sat 7:00 PM', () => {
      const parsed = parseEventDateTime('Sat 7:00 PM', {
        timezone: 'America/New_York',
        now: chicagoNow,
      });
      expect(parsed.iso).toBe('2026-08-15T23:00:00.000Z');
    });

    it('resolves Tonight with an explicit clock', () => {
      const parsed = parseEventDateTime('Tonight 6:30pm', {
        timezone: 'America/Chicago',
        now: chicagoNow,
      });
      expect(parsed.iso).toBe('2026-08-13T23:30:00.000Z');
    });

    it('resolves Tomorrow', () => {
      const parsed = parseEventDateTime('Tomorrow 6:30pm', {
        timezone: 'America/Chicago',
        now: chicagoNow,
      });
      expect(parsed.iso).toBe('2026-08-14T23:30:00.000Z');
    });

    it('resolves This weekend as the coming Saturday', () => {
      const parsed = parseEventDateTime('This weekend', {
        timezone: 'America/Chicago',
        now: chicagoNow,
      });
      // Saturday Aug 15 00:00 CDT
      expect(parsed.iso).toBe('2026-08-15T05:00:00.000Z');
      expect(parsed.rangeEnd).toBe('2026-08-16T05:00:00.000Z');
    });

    it('resolves Next Friday as the upcoming Friday that is not today', () => {
      const parsed = parseEventDateTime('Next Friday', {
        timezone: 'America/Chicago',
        now: chicagoNow,
      });
      expect(parsed.iso).toBe('2026-08-14T05:00:00.000Z');
    });

    it('parses Aug 15-16 as a range in the current year', () => {
      const parsed = parseEventDateTime('Aug 15-16', {
        timezone: 'America/Chicago',
        now: chicagoNow,
      });
      expect(parsed.iso).toBe('2026-08-15T05:00:00.000Z');
      expect(parsed.rangeEnd).toBe('2026-08-16T05:00:00.000Z');
    });

    it('parses Friday-Sunday as a weekday range', () => {
      const parsed = parseEventDateTime('Friday-Sunday', {
        timezone: 'America/Chicago',
        now: chicagoNow,
      });
      expect(parsed.iso).toBe('2026-08-14T05:00:00.000Z');
      expect(parsed.rangeEnd).toBe('2026-08-16T05:00:00.000Z');
    });

    it('returns UNPARSEABLE instead of throwing on garbage', () => {
      const parsed = parseEventDateTime('whenever, idk', { timezone: 'America/Chicago' });
      expect(parsed.timestamp).toBeNull();
      expect(parsed.iso).toBeNull();
      expect(parsed.error).toBe('UNPARSEABLE');
      expect(parsed.raw).toBe('whenever, idk');
    });

    it('falls back to UTC when the timezone is invalid', () => {
      const parsed = parseEventDateTime('2026-08-15T19:00:00Z', { timezone: 'Not/AZone' });
      expect(parsed.iso).toBe('2026-08-15T19:00:00.000Z');
    });
  });

  describe('parseAddress', () => {
    it('splits a venue plus street, city, state, zip', () => {
      expect(parseAddress("Gabe's, 330 E Washington St, Iowa City, IA 52240")).toMatchObject({
        street: '330 E Washington St',
        city: 'Iowa City',
        state: 'IA',
        zip: '52240',
        timezone: 'America/Chicago',
      });
    });

    it('keeps the raw string when nothing structured is found', () => {
      expect(parseAddress('Brooklyn Bridge Park')).toMatchObject({
        raw: 'Brooklyn Bridge Park',
        street: null,
        city: null,
        state: null,
        zip: null,
      });
    });
  });

  describe('parsePrice', () => {
    it('parses a free listing', () => {
      expect(parsePrice('Free')).toMatchObject({ isFree: true, min: 0, max: 0, band: 'free' });
    });

    it('parses a dollar range', () => {
      expect(parsePrice('$10-15')).toMatchObject({ min: 10, max: 15, band: 'low', isFree: false });
    });

    it('marks suggested donations', () => {
      expect(parsePrice('$25 suggested donation')).toMatchObject({
        min: 25,
        max: 25,
        suggested: true,
        band: 'mid',
      });
    });
  });

  describe('parseAgeRestriction', () => {
    it('parses 21+', () => {
      expect(parseAgeRestriction('21+')).toEqual({
        raw: '21+',
        minAge: 21,
        allAges: false,
        note: null,
      });
    });

    it('parses all ages', () => {
      expect(parseAgeRestriction('All ages')).toMatchObject({ minAge: 0, allAges: true });
    });

    it('parses 18+ after 9pm', () => {
      expect(parseAgeRestriction('18+ after 9pm')).toMatchObject({
        minAge: 18,
        allAges: false,
        note: 'after 9pm',
      });
    });
  });

  describe('extractCategoryHints', () => {
    it('maps listing copy onto catalog slugs', () => {
      expect(extractCategoryHints('Stand-up comedy night', 'Open mic at 8')).toEqual(
        expect.arrayContaining(['comedy', 'live-music']),
      );
    });

    it('does not invent slugs outside the catalog', () => {
      const { getPivotTagCatalogSeedRows } = require('../../constants/pivotTagCatalogSeed');
      const catalog = new Set(getPivotTagCatalogSeedRows().map((row) => row.slug));
      const hints = extractCategoryHints(
        'A quiet reading and a totally made-up xyzzy festival',
      );
      expect(hints.every((slug) => catalog.has(slug))).toBe(true);
      expect(hints).not.toContain('xyzzy');
    });
  });

  describe('enrichIngestDraft', () => {
    it('preserves the raw time and writes an ISO start_time', () => {
      const draft = enrichIngestDraft(
        {
          name: 'Comedy Night',
          description: '21+ · $10-15 · stand-up',
          start_time: 'Friday at 8pm',
          location: "Gabe's, 330 E Washington St, Iowa City, IA 52240",
        },
        { timezone: 'America/Chicago', now: chicagoNow },
      );

      expect(draft.start_time).toBe('2026-08-15T01:00:00.000Z');
      expect(draft.rawLocationText).toBe(
        "Gabe's, 330 E Washington St, Iowa City, IA 52240",
      );
      expect(draft.parsed.startTimeRaw).toBe('Friday at 8pm');
      expect(draft.parsed.startTimestamp).toBe('2026-08-15T01:00:00.000Z');
      expect(draft.parsed.address).toMatchObject({ city: 'Iowa City', state: 'IA', zip: '52240' });
      expect(draft.parsed.price).toMatchObject({ min: 10, max: 15 });
      expect(draft.parsed.age).toMatchObject({ minAge: 21 });
      expect(draft.parsed.categoryHints).toContain('comedy');
      expect(draft.tags).toBeUndefined();
      expect(draft.enrichment).toBeUndefined();
    });

    it('uses the city timezone instead of the address state', () => {
      const draft = enrichIngestDraft(
        {
          name: 'Show',
          start_time: 'Friday at 8pm',
          location: "Gabe's, 330 E Washington St, Iowa City, IA 52240",
        },
        { timezone: 'America/New_York', now: chicagoNow },
      );
      expect(draft.start_time).toBe('2026-08-15T00:00:00.000Z');
      expect(draft.parsed.timezone).toBe('America/New_York');
    });

    it('keeps the original listing time when re-enriching an ISO start_time', () => {
      const first = enrichIngestDraft(
        { name: 'Show', start_time: 'Friday at 8pm', location: "Gabe's" },
        { timezone: 'America/Chicago', now: chicagoNow },
      );
      const second = enrichIngestDraft(first, {
        timezone: 'America/Chicago',
        now: chicagoNow,
      });
      expect(second.start_time).toBe(first.start_time);
      expect(second.parsed.startTimeRaw).toBe('Friday at 8pm');
    });

    it('leaves a malformed start_time in place so ingest can skip it', () => {
      const draft = enrichIngestDraft({
        name: 'TBD',
        start_time: 'soon-ish',
        location: 'The Chapel',
      });
      expect(draft.start_time).toBe('soon-ish');
      expect(draft.parsed.startTimestamp).toBeNull();
    });
  });
});
