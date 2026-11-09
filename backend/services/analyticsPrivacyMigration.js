/**
 * Rewrites analytics identifiers stored before they were keyed, in one
 * database. See migrations/scrubAnalyticsIdentifiers.js.
 *
 * - `analytics_events.ip_hash` was a plain SHA-256 of the IP: becomes
 *   `keyDigest(old)`, exactly what ingestion now writes for that IP.
 * - QR scan `anonymous_id`s (analytics events and `event_qrs.scanHistory`) were
 *   a truncated SHA-256 of IP plus user agent: become `keyDigest(old)`, exactly
 *   what the QR routes now write.
 * - `eventAnalytics.viewHistory` stored the raw IP and user agent, and an
 *   `anonymousId` that was often the raw `ip-userAgent` string: the IP and user
 *   agent are removed and the id becomes `analyticsHash(old)`, exactly what the
 *   view service now writes for that visitor.
 *
 * Already-keyed values (`k1:`) are left alone, so the migration can be re-run.
 */

const { analyticsHash, keyDigest, isKeyedHash } = require('../utilities/analyticsHash');

const BATCH = 500;
const MAX_ARRAY_RETRIES = 3;
const QR_SCAN_EVENTS = Object.freeze(['event_qr_scan', 'admin_qr_scan']);
const UNKEYED = { $type: 'string', $not: /^k1:/ };

function emptyCounts() {
  return {
    ipHashes: 0,
    qrAnonymousIds: 0,
    viewHistoryDocs: 0,
    viewHistoryEntries: 0,
    qrScanDocs: 0,
    skippedConcurrentDocs: 0,
  };
}

/** Rekeys one viewHistory entry and drops its raw IP and user agent. */
function scrubViewHistoryEntry(entry) {
  const { ipAddress: _ip, userAgent: _ua, ...rest } = entry || {};
  if (typeof rest.anonymousId === 'string' && rest.anonymousId && !isKeyedHash(rest.anonymousId)) {
    rest.anonymousId = analyticsHash(rest.anonymousId);
  }
  return rest;
}

function viewHistoryEntryNeedsScrub(entry) {
  if (!entry) return false;
  if (Object.prototype.hasOwnProperty.call(entry, 'ipAddress')) return true;
  if (Object.prototype.hasOwnProperty.call(entry, 'userAgent')) return true;
  return typeof entry.anonymousId === 'string' && entry.anonymousId !== '' && !isKeyedHash(entry.anonymousId);
}

function rekeyScanHistoryEntry(entry) {
  if (!entry || typeof entry.anonymousId !== 'string' || !entry.anonymousId) return entry;
  if (isKeyedHash(entry.anonymousId)) return entry;
  return { ...entry, anonymousId: keyDigest(entry.anonymousId) };
}

function scanHistoryEntryNeedsRekey(entry) {
  return typeof entry?.anonymousId === 'string' && entry.anonymousId !== '' && !isKeyedHash(entry.anonymousId);
}

async function flushBulk(collection, ops, dryRun) {
  if (!ops.length || dryRun) return;
  await collection.bulkWrite(ops, { ordered: false });
}

async function rekeyField(collection, field, filter, dryRun) {
  let count = 0;
  let ops = [];
  const cursor = collection.find({ ...filter, [field]: UNKEYED }, { projection: { [field]: 1 } });
  for await (const doc of cursor) {
    count += 1;
    ops.push({
      updateOne: {
        filter: { _id: doc._id, [field]: doc[field] },
        update: { $set: { [field]: keyDigest(doc[field]) } },
      },
    });
    if (ops.length >= BATCH) {
      await flushBulk(collection, ops, dryRun);
      ops = [];
    }
  }
  await flushBulk(collection, ops, dryRun);
  return count;
}

/**
 * Rewrites an array field on one document, guarded by the array's length so a
 * view or scan pushed meanwhile is never overwritten. Re-reads and retries.
 */
async function rewriteArray(collection, id, field, needsChange, rewrite, dryRun) {
  for (let attempt = 0; attempt < MAX_ARRAY_RETRIES; attempt += 1) {
    const doc = await collection.findOne({ _id: id }, { projection: { [field]: 1 } });
    const entries = Array.isArray(doc?.[field]) ? doc[field] : [];
    const changed = entries.filter(needsChange).length;
    if (!changed) return { changed: 0, skipped: false };
    if (dryRun) return { changed, skipped: false };
    const result = await collection.updateOne(
      { _id: id, [field]: { $size: entries.length } },
      { $set: { [field]: entries.map(rewrite) } },
    );
    if (result.matchedCount > 0) return { changed, skipped: false };
  }
  return { changed: 0, skipped: true };
}

/**
 * @param {{ AnalyticsEvent?: import('mongoose').Model, EventAnalytics?: import('mongoose').Model,
 *   EventQR?: import('mongoose').Model }} models
 * @param {{ dryRun?: boolean }} [options]
 */
async function scrubAnalyticsIdentifiers(models, { dryRun = false } = {}) {
  if (!keyDigest('probe')) {
    // Without a key every rewrite would be null and the old values would be lost.
    throw new Error('No analytics hash key: set ANALYTICS_HASH_SECRET (or JWT_SECRET) to the server value.');
  }
  const counts = emptyCounts();

  if (models.AnalyticsEvent) {
    const events = models.AnalyticsEvent.collection;
    counts.ipHashes = await rekeyField(events, 'ip_hash', {}, dryRun);
    counts.qrAnonymousIds = await rekeyField(
      events,
      'anonymous_id',
      { event: { $in: QR_SCAN_EVENTS } },
      dryRun,
    );
  }

  if (models.EventAnalytics) {
    const analytics = models.EventAnalytics.collection;
    const cursor = analytics.find(
      {
        $or: [
          { 'viewHistory.ipAddress': { $exists: true } },
          { 'viewHistory.userAgent': { $exists: true } },
          { 'viewHistory.anonymousId': UNKEYED },
        ],
      },
      { projection: { _id: 1 } },
    );
    for await (const { _id } of cursor) {
      const result = await rewriteArray(
        analytics, _id, 'viewHistory', viewHistoryEntryNeedsScrub, scrubViewHistoryEntry, dryRun,
      );
      if (result.skipped) counts.skippedConcurrentDocs += 1;
      if (result.changed) {
        counts.viewHistoryDocs += 1;
        counts.viewHistoryEntries += result.changed;
      }
    }
  }

  if (models.EventQR) {
    const qrs = models.EventQR.collection;
    const cursor = qrs.find({ 'scanHistory.anonymousId': UNKEYED }, { projection: { _id: 1 } });
    for await (const { _id } of cursor) {
      const result = await rewriteArray(
        qrs, _id, 'scanHistory', scanHistoryEntryNeedsRekey, rekeyScanHistoryEntry, dryRun,
      );
      if (result.skipped) counts.skippedConcurrentDocs += 1;
      if (result.changed) counts.qrScanDocs += 1;
    }
  }

  return counts;
}

/**
 * The eventId index must be unique for concurrent first views to share one
 * document. Older databases may have built the plain index first.
 */
async function checkEventAnalyticsIndex(EventAnalytics) {
  let indexes = [];
  try {
    indexes = await EventAnalytics.collection.indexes();
  } catch (error) {
    if (error?.codeName === 'NamespaceNotFound' || error?.code === 26) return { ok: true, missing: true };
    throw error;
  }
  const eventIdIndex = indexes.find((index) => index.name === 'eventId_1');
  if (eventIdIndex?.unique) return { ok: true };
  const duplicates = await EventAnalytics.collection.aggregate([
    { $group: { _id: '$eventId', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $count: 'eventIds' },
  ]).toArray();
  return {
    ok: false,
    hasIndex: Boolean(eventIdIndex),
    duplicateEventIds: duplicates[0]?.eventIds || 0,
  };
}

module.exports = {
  emptyCounts,
  scrubViewHistoryEntry,
  rekeyScanHistoryEntry,
  scrubAnalyticsIdentifiers,
  checkEventAnalyticsIndex,
};
