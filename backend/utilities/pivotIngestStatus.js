/**
 * Pivot catalog ingestStatus lifecycle (Choice A feed gate).
 * @see Meridian-Mintlify/strategy/pivot-metadata-contract.mdx
 */

const PIVOT_INGEST_STATUSES = Object.freeze(['draft', 'staged', 'published']);

/** Only `published` events are eligible for GET /pivot/feed (Choice A). */
const PIVOT_FEED_INGEST_STATUS = 'published';

function isValidIngestStatus(value) {
  return PIVOT_INGEST_STATUSES.includes(value);
}

function isFeedEligibleIngestStatus(value) {
  return value === PIVOT_FEED_INGEST_STATUS;
}

/**
 * @param {unknown} value
 * @returns {{ ingestStatus: string } | { error: string, status: number, code: string }}
 */
function normalizeIngestStatus(value) {
  const ingestStatus = typeof value === 'string' ? value.trim() : '';
  if (!isValidIngestStatus(ingestStatus)) {
    return {
      error: 'ingestStatus must be draft, staged, or published.',
      status: 400,
      code: 'INVALID_INGEST_STATUS',
    };
  }
  return { ingestStatus };
}

module.exports = {
  PIVOT_INGEST_STATUSES,
  PIVOT_FEED_INGEST_STATUS,
  isValidIngestStatus,
  isFeedEligibleIngestStatus,
  normalizeIngestStatus,
};
