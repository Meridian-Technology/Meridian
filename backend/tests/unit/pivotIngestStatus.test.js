const {
  PIVOT_INGEST_STATUSES,
  PIVOT_FEED_INGEST_STATUS,
  isValidIngestStatus,
  isFeedEligibleIngestStatus,
  normalizeIngestStatus,
} = require('../../utilities/pivotIngestStatus');

describe('pivotIngestStatus', () => {
  it('allows draft, staged, and published', () => {
    expect(PIVOT_INGEST_STATUSES).toEqual(['draft', 'staged', 'published']);
    expect(isValidIngestStatus('draft')).toBe(true);
    expect(isValidIngestStatus('staged')).toBe(true);
    expect(isValidIngestStatus('published')).toBe(true);
    expect(isValidIngestStatus('live')).toBe(false);
  });

  it('treats only published as feed-eligible (Choice A)', () => {
    expect(PIVOT_FEED_INGEST_STATUS).toBe('published');
    expect(isFeedEligibleIngestStatus('published')).toBe(true);
    expect(isFeedEligibleIngestStatus('staged')).toBe(false);
    expect(isFeedEligibleIngestStatus('draft')).toBe(false);
  });

  it('normalizes valid statuses and rejects others', () => {
    expect(normalizeIngestStatus(' staged ')).toEqual({ ingestStatus: 'staged' });
    expect(normalizeIngestStatus('bogus')).toEqual(
      expect.objectContaining({
        status: 400,
        code: 'INVALID_INGEST_STATUS',
      }),
    );
  });
});
