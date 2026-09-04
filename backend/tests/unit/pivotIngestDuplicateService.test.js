jest.mock('../../services/getModelService', () => jest.fn());
jest.mock('../../connectionsManager', () => ({
  connectToDatabase: jest.fn(),
}));

const {
  normalizeIngestSourceUrl,
  buildEventFingerprint,
  findCatalogDuplicate,
  annotateImportDrafts,
  formatDuplicateWarning,
  isBlockingDuplicate,
  classifyIngestSourceFamily,
  measureNativeVenueOverlap,
  rollupShowtimeDrafts,
  mergeIngestIntoExisting,
} = require('../../services/pivotIngestDuplicateService');

describe('pivotIngestDuplicateService', () => {
  describe('normalizeIngestSourceUrl', () => {
    it('canonicalizes Luma short links', () => {
      expect(normalizeIngestSourceUrl('https://lu.ma/open-mic')).toBe('luma.com/open-mic');
      expect(normalizeIngestSourceUrl('https://www.luma.com/open-mic/')).toBe('luma.com/open-mic');
    });

    it('strips www and trailing slashes from Partiful URLs', () => {
      expect(normalizeIngestSourceUrl('https://www.partiful.com/e/sunset/')).toBe(
        'partiful.com/e/sunset',
      );
    });
  });

  describe('buildEventFingerprint', () => {
    it('matches events with the same title, minute, and location', () => {
      const left = buildEventFingerprint({
        name: 'Sunset Party!',
        start_time: '2026-07-12T18:00:00-04:00',
        location: 'Brooklyn Bridge Park',
      });
      const right = buildEventFingerprint({
        name: 'sunset party',
        start_time: '2026-07-12T22:00:00.000Z',
        location: 'brooklyn bridge park',
      });

      expect(left).toBeTruthy();
      expect(left).toBe(right);
    });
  });

  it('uses a public rich-location label for draft duplicate matching', () => {
    const rolled = rollupShowtimeDrafts([
      {
        sourceUrl: 'https://example.com/one',
        draft: {
          name: 'Supper Club',
          start_time: '2026-07-12T22:00:00.000Z',
          location: 'Secret exact address A',
          richLocation: {
            mode: 'registration_gated',
            venueName: 'Private supper club',
            publicDisplayLabel: 'Private venue · SoHo',
          },
        },
      },
      {
        sourceUrl: 'https://example.com/two',
        draft: {
          name: 'Supper Club',
          start_time: '2026-07-12T23:00:00.000Z',
          location: 'Secret exact address B',
          richLocation: {
            mode: 'registration_gated',
            venueName: 'Private supper club',
            publicDisplayLabel: 'Private venue · SoHo',
          },
        },
      },
    ]);
    expect(rolled.rolledUpCount).toBe(1);
    expect(rolled.drafts).toHaveLength(1);
  });

  describe('findCatalogDuplicate', () => {
    const catalogIndex = [
      {
        _id: 'existing-1',
        name: 'Sunset Listening Party',
        batchWeek: '2026-W26',
        organizerName: 'Brooklyn Board Game Cafe',
        sourceKey: 'partiful.com/e/sunset-listening',
        fingerprint: buildEventFingerprint({
          name: 'Sunset Listening Party',
          start_time: '2026-07-12T18:00:00-04:00',
          location: 'Brooklyn Bridge Park',
        }),
      },
    ];

    it('treats matching source URLs as updates', () => {
      const duplicate = findCatalogDuplicate(catalogIndex, {
        sourceUrl: 'https://partiful.com/e/sunset-listening',
        name: 'Updated title',
        start_time: '2026-07-12T18:00:00-04:00',
        location: 'Brooklyn Bridge Park',
      });

      expect(duplicate.matchType).toBe('sourceUrl');
      expect(duplicate.willUpdate).toBe(true);
      expect(isBlockingDuplicate(duplicate)).toBe(false);
    });

    it('treats fingerprint matches as fuzzy updates, not blockers', () => {
      const duplicate = findCatalogDuplicate(catalogIndex, {
        sourceUrl: 'https://partiful.com/e/different-slug',
        name: 'Sunset Listening Party',
        start_time: '2026-07-12T18:00:00-04:00',
        location: 'Brooklyn Bridge Park',
      });

      expect(duplicate.matchType).toBe('fingerprint');
      expect(duplicate.willUpdate).toBe(true);
      expect(duplicate.existingEventId).toBe('existing-1');
      expect(isBlockingDuplicate(duplicate)).toBe(false);
      expect(formatDuplicateWarning(duplicate, 'Sunset Listening Party')).toMatch(
        /will update it/,
      );
    });

    it('ignores the source URL when it is a shared listing page', () => {
      const duplicate = findCatalogDuplicate(
        catalogIndex,
        {
          sourceUrl: 'https://partiful.com/e/sunset-listening',
          name: 'A different event on the same calendar',
          start_time: '2026-07-19T18:00:00-04:00',
          location: 'Brooklyn Bridge Park',
        },
        { sharedSourceUrl: true },
      );

      expect(duplicate).toBeNull();
    });

    it('treats same-night different times at the same venue as a showtime update', () => {
      const catalogIndex = [
        {
          _id: 'existing-1',
          name: 'Comedy Night',
          location: "Gabe's",
          start_time: '2026-08-14T01:00:00.000Z',
          organizerName: "Gabe's",
          source: 'generic-site',
          sourceFamily: 'generic-site',
          fingerprint: 'x',
        },
      ];

      const duplicate = findCatalogDuplicate(catalogIndex, {
        name: 'Comedy Night',
        location: "Gabe's, Iowa City",
        start_time: '2026-08-14T03:30:00.000Z',
        sourceUrl: 'https://gabes.example/calendar#comedy-930',
      });

      expect(duplicate.matchType).toBe('showtime');
      expect(duplicate.willUpdate).toBe(true);
      expect(duplicate.mergeSlots).toBe(true);
      expect(isBlockingDuplicate(duplicate)).toBe(false);
      expect(formatDuplicateWarning(duplicate, 'Comedy Night')).toMatch(/another showtime/);
    });

    it('merges a venue listing into the native row on fuzzy title+venue+day', () => {
      const catalogIndex = [
        {
          _id: 'native-1',
          name: 'Sunset Listening Party',
          location: 'Brooklyn Bridge Park',
          start_time: '2026-07-12T22:00:00.000Z',
          source: 'partiful',
          sourceFamily: 'partiful',
          sourceKey: 'partiful.com/e/sunset',
          fingerprint: 'other',
        },
      ];

      const duplicate = findCatalogDuplicate(catalogIndex, {
        name: 'Sunset Listening Party at Brooklyn Bridge Park',
        location: 'Brooklyn Bridge Park',
        start_time: '2026-07-12T22:00:00.000Z',
        sourceUrl: 'https://bridgepark.example/calendar#sunset',
        source: 'generic-site',
      });

      expect(duplicate.matchType).toBe('similarity');
      expect(duplicate.existingEventId).toBe('native-1');
      expect(duplicate.willUpdate).toBe(true);
    });

    it('does not fuzzy-match the same generic title at a different venue', () => {
      const catalogIndex = [
        {
          _id: 'existing-1',
          name: 'Comedy Night',
          location: 'The Chapel',
          start_time: '2026-07-12T03:00:00.000Z',
          fingerprint: 'chapel',
        },
      ];

      const duplicate = findCatalogDuplicate(catalogIndex, {
        name: 'Comedy Night',
        location: 'Neck of the Woods',
        start_time: '2026-07-12T03:00:00.000Z',
        sourceUrl: 'https://notw.example/comedy',
      });

      expect(duplicate).toBeNull();
    });

    it('skips fuzzy matching when force-create is requested', () => {
      const catalogIndex = [
        {
          _id: 'existing-1',
          name: 'Comedy Night',
          location: "Gabe's",
          start_time: '2026-08-14T01:00:00.000Z',
          fingerprint: 'x',
        },
      ];

      const duplicate = findCatalogDuplicate(
        catalogIndex,
        {
          name: 'Comedy Night',
          location: "Gabe's",
          start_time: '2026-08-14T03:30:00.000Z',
          sourceUrl: 'https://gabes.example/calendar#comedy-930',
        },
        { skipFuzzy: true },
      );

      expect(duplicate).toBeNull();
    });

    it('still matches a shared-listing import on its fingerprint', () => {
      const duplicate = findCatalogDuplicate(
        catalogIndex,
        {
          sourceUrl: 'https://partiful.com/e/sunset-listening',
          name: 'Sunset Listening Party',
          start_time: '2026-07-12T18:00:00-04:00',
          location: 'Brooklyn Bridge Park',
        },
        { sharedSourceUrl: true },
      );

      expect(duplicate.matchType).toBe('fingerprint');
      expect(duplicate.existingEventId).toBe('existing-1');
    });
  });

  describe('annotateImportDrafts', () => {
    it('detects duplicates within a batch import', () => {
      const drafts = [
        {
          sourceUrl: 'https://partiful.com/e/one',
          draft: {
            name: 'Open Mic Night',
            start_time: '2026-07-15T20:00:00-04:00',
            location: 'East Village Studio',
            hostName: 'Host A',
          },
        },
        {
          sourceUrl: 'https://partiful.com/e/two',
          draft: {
            name: 'Open Mic Night',
            start_time: '2026-07-15T20:00:00-04:00',
            location: 'East Village Studio',
            hostName: 'Host B',
          },
        },
      ];

      const { drafts: annotated, duplicateWarnings } = annotateImportDrafts(drafts, []);

      expect(annotated[0].duplicate).toBeNull();
      expect(annotated[1].duplicate?.matchType).toBe('batchFingerprint');
      expect(isBlockingDuplicate(annotated[1].duplicate)).toBe(true);
      expect(duplicateWarnings).toHaveLength(1);
    });

    it('rolls same-night showtimes in a batch into one draft', () => {
      const drafts = [
        {
          sourceUrl: 'https://gabes.example/cal#7pm',
          draft: {
            name: 'Comedy Night',
            start_time: '2026-08-14T01:00:00.000Z',
            location: "Gabe's",
            hostName: "Gabe's",
          },
        },
        {
          sourceUrl: 'https://gabes.example/cal#930pm',
          draft: {
            name: 'Comedy Night',
            start_time: '2026-08-14T03:30:00.000Z',
            location: "Gabe's",
            hostName: "Gabe's",
          },
        },
      ];

      const { drafts: annotated, rolledUpCount } = annotateImportDrafts(drafts, []);

      expect(rolledUpCount).toBe(1);
      expect(annotated).toHaveLength(1);
      expect(annotated[0].draft.timeSlots).toHaveLength(2);
      expect(annotated[0].duplicate).toBeNull();
    });
  });

  describe('rollupShowtimeDrafts', () => {
    it('does not collapse the same title at two venues', () => {
      const { drafts, rolledUpCount } = rollupShowtimeDrafts([
        {
          sourceUrl: 'https://a.example/1',
          draft: {
            name: 'Comedy Night',
            start_time: '2026-08-14T01:00:00.000Z',
            location: 'The Chapel',
          },
        },
        {
          sourceUrl: 'https://b.example/1',
          draft: {
            name: 'Comedy Night',
            start_time: '2026-08-14T01:00:00.000Z',
            location: 'Neck of the Woods',
          },
        },
      ]);

      expect(rolledUpCount).toBe(0);
      expect(drafts).toHaveLength(2);
    });
  });

  describe('mergeIngestIntoExisting', () => {
    it('keeps the native permalink when a venue page matches', () => {
      const existing = {
        name: 'Sunset Listening Party',
        description: 'Short',
        location: 'Brooklyn Bridge Park',
        start_time: new Date('2026-07-12T22:00:00.000Z'),
        customFields: {
          pivot: {
            source: 'partiful',
            sourceUrl: 'https://partiful.com/e/sunset',
            host: { name: 'Park Crew' },
          },
        },
      };

      const merged = mergeIngestIntoExisting(
        existing,
        {
          name: 'Sunset Listening Party at Brooklyn Bridge Park',
          description: 'A longer writeup from the venue calendar with more detail.',
          location: 'Brooklyn Bridge Park, Brooklyn, NY',
          startTime: new Date('2026-07-12T22:00:00.000Z'),
          source: 'generic-site',
        },
        { matchType: 'similarity', score: 0.91, reasons: ['title-venue-time'] },
        'https://bridgepark.example/calendar#sunset',
      );

      expect(merged.source).toBe('partiful');
      expect(merged.sourceUrl).toBe('https://partiful.com/e/sunset');
      expect(merged.description).toContain('longer writeup');
      expect(merged.duplicateRollup.matchType).toBe('similarity');
    });

    it('unions host identities and does not drop the other side', () => {
      const existing = {
        name: 'Sunset Listening Party',
        location: 'Brooklyn Bridge Park',
        start_time: new Date('2026-07-12T22:00:00.000Z'),
        customFields: {
          pivot: {
            source: 'partiful',
            sourceUrl: 'https://partiful.com/e/sunset',
            host: {
              name: 'Alice',
              identities: [{ provider: 'partiful', name: 'Alice', externalId: 'alice' }],
            },
          },
        },
      };

      const merged = mergeIngestIntoExisting(
        existing,
        {
          name: 'Sunset Listening Party',
          location: 'Brooklyn Bridge Park',
          startTime: new Date('2026-07-12T22:00:00.000Z'),
          source: 'luma',
          hostName: 'Alice & Bob',
          hostIdentities: [{ provider: 'luma', name: 'Bob', externalId: 'bob' }],
        },
        { matchType: 'fingerprint' },
        'https://luma.com/sunset',
      );

      expect(merged.hostIdentities).toEqual([
        expect.objectContaining({ provider: 'partiful', name: 'Alice' }),
        expect.objectContaining({ provider: 'luma', name: 'Bob' }),
      ]);
      expect(merged.hostName).toBe('Alice');
    });

    it('unions organizerIds from both sources and keeps the existing display name', () => {
      const existing = {
        name: 'Sunset Listening Party',
        location: 'Brooklyn Bridge Park',
        start_time: new Date('2026-07-12T22:00:00.000Z'),
        customFields: {
          pivot: {
            source: 'partiful',
            sourceUrl: 'https://partiful.com/e/sunset',
            host: {
              name: 'Alice',
              identities: [{ provider: 'partiful', name: 'Alice', externalId: 'alice' }],
              organizerIds: ['665a1b2c3d4e5f6789012aaa'],
            },
          },
        },
      };

      const merged = mergeIngestIntoExisting(
        existing,
        {
          name: 'Sunset Listening Party',
          location: 'Brooklyn Bridge Park',
          startTime: new Date('2026-07-12T22:00:00.000Z'),
          source: 'luma',
          hostName: 'Bob',
          hostIdentities: [{ provider: 'luma', name: 'Bob', externalId: 'bob' }],
          organizerIds: ['665a1b2c3d4e5f6789012bbb'],
        },
        { matchType: 'fingerprint' },
        'https://luma.com/sunset',
      );

      expect(merged.organizerIds).toEqual([
        '665a1b2c3d4e5f6789012aaa',
        '665a1b2c3d4e5f6789012bbb',
      ]);
      expect(merged.hostIdentities).toEqual([
        expect.objectContaining({ provider: 'partiful', name: 'Alice' }),
        expect.objectContaining({ provider: 'luma', name: 'Bob' }),
      ]);
      expect(merged.hostName).toBe('Alice');
    });

    it('does not let an empty incoming organizerIds wipe existing ids', () => {
      const existing = {
        name: 'Sunset Listening Party',
        location: 'Brooklyn Bridge Park',
        start_time: new Date('2026-07-12T22:00:00.000Z'),
        customFields: {
          pivot: {
            host: {
              name: 'Alice',
              organizerIds: ['665a1b2c3d4e5f6789012aaa'],
            },
          },
        },
      };

      const merged = mergeIngestIntoExisting(
        existing,
        {
          name: 'Sunset Listening Party',
          location: 'Brooklyn Bridge Park',
          startTime: new Date('2026-07-12T22:00:00.000Z'),
          hostName: 'Alice',
          organizerIds: [],
        },
        { matchType: 'fingerprint' },
        'https://luma.com/sunset',
      );

      expect(merged.organizerIds).toEqual(['665a1b2c3d4e5f6789012aaa']);
    });

    it('uses incoming hostName when the existing event has none', () => {
      const existing = {
        name: 'Sunset Listening Party',
        location: 'Brooklyn Bridge Park',
        start_time: new Date('2026-07-12T22:00:00.000Z'),
        customFields: { pivot: { host: {} } },
      };

      const merged = mergeIngestIntoExisting(
        existing,
        {
          name: 'Sunset Listening Party',
          location: 'Brooklyn Bridge Park',
          startTime: new Date('2026-07-12T22:00:00.000Z'),
          hostName: 'Alice',
        },
        { matchType: 'fingerprint' },
        'https://partiful.com/e/sunset',
      );

      expect(merged.hostName).toBe('Alice');
    });

    it('unions showtimes onto the existing event', () => {
      const existing = {
        name: 'Comedy Night',
        location: "Gabe's",
        start_time: new Date('2026-08-14T01:00:00.000Z'),
        customFields: { pivot: { source: 'generic-site', sourceUrl: 'https://gabes.example/cal#7pm' } },
      };

      const merged = mergeIngestIntoExisting(
        existing,
        {
          name: 'Comedy Night',
          location: "Gabe's",
          startTime: new Date('2026-08-14T03:30:00.000Z'),
          source: 'generic-site',
        },
        { matchType: 'showtime', mergeSlots: true },
        'https://gabes.example/cal#930pm',
      );

      expect(merged.timeSlots).toHaveLength(2);
    });
  });

  describe('classifyIngestSourceFamily', () => {
    it('prefers the declared source over the URL host', () => {
      expect(
        classifyIngestSourceFamily({
          source: 'generic-site',
          sourceUrl: 'https://luma.com/e/secret-show',
        }),
      ).toBe('generic-site');
    });

    it('falls back to Luma/Partiful from the URL when source is unset', () => {
      expect(classifyIngestSourceFamily({ sourceUrl: 'https://lu.ma/open-mic' })).toBe('luma');
      expect(classifyIngestSourceFamily({ sourceUrl: 'https://partiful.com/e/xyz' })).toBe('partiful');
    });
  });

  describe('measureNativeVenueOverlap', () => {
    const start = '2026-07-12T18:00:00-04:00';

    function event({ id, name, source, sourceUrl, location = 'Brooklyn Bridge Park' }) {
      return {
        _id: id,
        name,
        start_time: start,
        location,
        customFields: { pivot: { source, sourceUrl } },
      };
    }

    it('counts a venue row whose eventUrl is a Luma permalink as a sourceUrl hit', () => {
      const overlap = measureNativeVenueOverlap([
        event({
          id: 'native-1',
          name: 'Sunset Listening Party',
          source: 'luma',
          sourceUrl: 'https://luma.com/e/sunset-listening',
        }),
        event({
          id: 'venue-1',
          name: 'Different title on the venue page',
          source: 'generic-site',
          sourceUrl: 'https://luma.com/e/sunset-listening',
        }),
      ]);

      expect(overlap.native).toBe(1);
      expect(overlap.genericSite).toBe(1);
      expect(overlap.venueWithNativeUrlCount).toBe(1);
      expect(overlap.wouldMatchNative.sourceUrl).toBe(1);
      expect(overlap.wouldMatchNative.fingerprint).toBe(0);
      expect(overlap.survivingMixedFingerprintPairs).toBe(0);
    });

    it('counts a venue row with a derived listing URL as a fingerprint hit', () => {
      const overlap = measureNativeVenueOverlap([
        event({
          id: 'native-1',
          name: 'Sunset Listening Party',
          source: 'partiful',
          sourceUrl: 'https://partiful.com/e/sunset-listening',
        }),
        event({
          id: 'venue-1',
          name: 'Sunset Listening Party',
          source: 'generic-site',
          sourceUrl: 'https://bridgepark.example/calendar#sunset-listening-party-2026-07-12',
        }),
      ]);

      expect(overlap.wouldMatchNative.fingerprint).toBe(1);
      expect(overlap.wouldMatchNative.sourceUrl).toBe(0);
      expect(overlap.survivingMixedFingerprintPairs).toBe(1);
    });

    it('reports remaining title+day near-misses that fuzzy matching still rejects', () => {
      const overlap = measureNativeVenueOverlap([
        event({
          id: 'native-1',
          name: 'Comedy Night',
          source: 'luma',
          sourceUrl: 'https://luma.com/e/comedy',
          location: 'The Chapel, SF',
        }),
        event({
          id: 'venue-1',
          name: 'Comedy Night',
          source: 'generic-site',
          sourceUrl: 'https://neckofthewoods.com/events#comedy-night-2026-07-12',
          location: 'Neck of the Woods',
        }),
      ]);

      expect(overlap.wouldMatchNative.none).toBe(1);
      expect(overlap.wouldMatchNative.similarity).toBe(0);
      expect(overlap.nearMissCount).toBe(1);
      expect(overlap.survivingMixedFingerprintPairs).toBe(0);
    });

    it('counts a venue listing at the same park as a similarity hit', () => {
      const overlap = measureNativeVenueOverlap([
        event({
          id: 'native-1',
          name: 'Sunset Listening Party',
          source: 'partiful',
          sourceUrl: 'https://partiful.com/e/sunset-listening',
        }),
        event({
          id: 'venue-1',
          name: 'Sunset Listening Party at Brooklyn Bridge Park',
          source: 'generic-site',
          sourceUrl: 'https://bridgepark.example/calendar#sunset-listening-party-2026-07-12',
        }),
      ]);

      expect(overlap.wouldMatchNative.similarity).toBe(1);
      expect(overlap.wouldMatchNative.none).toBe(0);
    });
  });
});
