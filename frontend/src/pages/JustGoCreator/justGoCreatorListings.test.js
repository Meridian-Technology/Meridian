import {
  CREATOR_LIST_FILTERS,
  countListingsByStatus,
  describeIngestStatus,
  formatListingWhen,
} from './justGoCreatorListings';
import justGoCreatorCopy from './justGoCreatorCopy';

describe('justGoCreatorListings', () => {
  it('maps pivot ingest statuses to creator-facing pills', () => {
    expect(describeIngestStatus('draft').label).toBe(justGoCreatorCopy.status.draft);
    expect(describeIngestStatus('staged').label).toBe(justGoCreatorCopy.status.staged);
    expect(describeIngestStatus('published').label).toBe(justGoCreatorCopy.status.published);
  });

  it('keeps pill tones inside the reskin register', () => {
    expect(describeIngestStatus('draft').tone).toBe('draft');
    expect(describeIngestStatus('staged').tone).toBe('staged');
    expect(describeIngestStatus('published').tone).toBe('published');
  });

  it('falls back to an unknown pill for a missing or unexpected status', () => {
    expect(describeIngestStatus(null).tone).toBe('unknown');
    expect(describeIngestStatus(undefined).tone).toBe('unknown');
    expect(describeIngestStatus('archived').tone).toBe('unknown');
  });

  it('counts listings per filter bucket', () => {
    const counts = countListingsByStatus([
      { ingestStatus: 'draft' },
      { ingestStatus: 'draft' },
      { ingestStatus: 'staged' },
      { ingestStatus: 'published' },
    ]);

    expect(counts).toEqual({ all: 4, draft: 2, staged: 1, published: 1 });
  });

  it('counts unexpected statuses in the total only', () => {
    const counts = countListingsByStatus([{ ingestStatus: 'archived' }, { ingestStatus: null }]);

    expect(counts).toEqual({ all: 2, draft: 0, staged: 0, published: 0 });
  });

  it('handles a missing list without throwing', () => {
    expect(countListingsByStatus(undefined)).toEqual({
      all: 0,
      draft: 0,
      staged: 0,
      published: 0,
    });
  });

  it('exposes a count bucket for every filter chip', () => {
    const counts = countListingsByStatus([]);
    CREATOR_LIST_FILTERS.forEach((filter) => {
      expect(counts[filter.id]).toBe(0);
    });
  });

  it('formats a start time for the row meta line', () => {
    expect(formatListingWhen('2026-08-15T20:00:00.000Z')).toMatch(/\d/);
  });

  it('returns an empty string for a missing or unparseable start time', () => {
    expect(formatListingWhen(null)).toBe('');
    expect(formatListingWhen('')).toBe('');
    expect(formatListingWhen('not-a-date')).toBe('');
  });
});
