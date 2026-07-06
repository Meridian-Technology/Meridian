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

    it('flags fingerprint matches as blocking duplicates', () => {
      const duplicate = findCatalogDuplicate(catalogIndex, {
        sourceUrl: 'https://partiful.com/e/different-slug',
        name: 'Sunset Listening Party',
        start_time: '2026-07-12T18:00:00-04:00',
        location: 'Brooklyn Bridge Park',
      });

      expect(duplicate.matchType).toBe('fingerprint');
      expect(isBlockingDuplicate(duplicate)).toBe(true);
      expect(formatDuplicateWarning(duplicate, 'Sunset Listening Party')).toMatch(
        /duplicate of "Sunset Listening Party"/,
      );
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
  });
});
