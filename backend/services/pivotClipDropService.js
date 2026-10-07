/**
 * Just Go App Clip deck: the clip-curated cards for the live week, ranked as
 * if the deck opened at that week's drop instant. A demo an hour before the
 * next drop still plays the whole week.
 *
 * Curated with internal `customFields.pivot.clipDrop`. Falls back to the
 * landing's featured segment, then to last week. Neither flag is returned.
 * No ticket links: the clip is a no-account preview, like the landing.
 * Carries the city's Voice overrides for the pack's text (`copy`).
 */

const { connectToDatabase } = require('../connectionsManager');
const getModels = require('./getModelService');
const { shiftIsoWeek } = require('../utilities/pivotIsoWeek');
const {
  resolvePivotLiveBatchWeek,
  resolvePivotDropInstant,
} = require('../utilities/pivotDropSchedule');
const { mergePivotDeckConfig } = require('../utilities/pivotDeckConfig');
const { buildPublishedCatalogQuery } = require('./pivotFeedService');
const { isRichLocationCapabilityEnabled } = require('../utilities/justGoRichLocationControls');
const {
  LANDING_EVENT_FIELDS,
  buildFeaturedLandingQuery,
  loadDropSegmentWeek,
  resolvePublicDropTenant,
  serializeLandingDropEvent,
} = require('./pivotLandingDropService');
const { getClipDropCopy } = require('./pivotCopyService');

const CLIP_DROP_LIMIT = 12;
const CLIP_DESCRIPTION_MAX = 600;
const CLIP_EVENT_FIELDS = `${LANDING_EVENT_FIELDS} description end_time`;

function buildClipDropQuery(batchWeek, dropAt) {
  return {
    ...buildPublishedCatalogQuery(batchWeek, dropAt),
    'customFields.pivot.clipDrop': true,
  };
}

/** Clip-curated cards first; the landing's featured cards if none are flagged. */
const CLIP_SEGMENTS = [
  { segment: 'clip', buildQuery: buildClipDropQuery },
  { segment: 'featured', buildQuery: buildFeaturedLandingQuery },
];

function clipDescription(event) {
  const source = event.customFields?.pivot?.movie?.synopsis || event.description || '';
  const text = String(source).replace(/\s+/g, ' ').trim();
  if (text.length <= CLIP_DESCRIPTION_MAX) return text;
  return `${text.slice(0, CLIP_DESCRIPTION_MAX - 1).trimEnd()}…`;
}

function serializeClipDropEvent(event, options = {}) {
  const card = serializeLandingDropEvent(event, options);
  const tags = Array.isArray(event.customFields?.pivot?.tags)
    ? event.customFields.pivot.tags
      .filter((tag) => typeof tag === 'string' && tag.trim())
      .map((tag) => tag.trim())
    : [];
  const description = clipDescription(event);

  return {
    ...card,
    ...(event.end_time ? { endTime: event.end_time } : {}),
    ...(description ? { description } : {}),
    ...(tags.length ? { tags } : {}),
  };
}

function nextDropAtAfter(tenant, liveWeek, now) {
  const nextWeek = shiftIsoWeek(liveWeek, 1);
  if (!nextWeek) return null;
  try {
    return resolvePivotDropInstant(tenant, nextWeek, now).dropAt;
  } catch {
    return null;
  }
}

async function getPivotClipDrop(req, options = {}) {
  const resolved = await resolvePublicDropTenant(req, options.tenantKey);
  if (resolved.error) return resolved;
  const { tenant } = resolved;

  const now = options.now || new Date();
  const liveWeek = resolvePivotLiveBatchWeek(tenant, now);
  const deckConfig = mergePivotDeckConfig(tenant.pivotDeckConfig);

  const db = await connectToDatabase(tenant.tenantKey);
  const scopedReq = { db, school: tenant.tenantKey };
  const { Event } = getModels(scopedReq, 'Event');

  const weeks = [liveWeek, shiftIsoWeek(liveWeek, -1)].filter(Boolean);
  let loaded = null;
  let segment = null;
  for (const week of weeks) {
    for (const candidate of CLIP_SEGMENTS) {
      const result = await loadDropSegmentWeek(Event, tenant, week, now, deckConfig, {
        buildQuery: candidate.buildQuery,
        fields: CLIP_EVENT_FIELDS,
      });
      if (result.ranked.length > 0) {
        loaded = result;
        segment = candidate.segment;
        break;
      }
    }
    if (loaded) break;
  }

  const nextDropAt = nextDropAtAfter(tenant, liveWeek, now);
  const copy = await getClipDropCopy(req, { tenantKey: tenant.tenantKey });
  const readsEnabled = isRichLocationCapabilityEnabled(tenant, 'reads');
  const dropAt = loaded
    ? loaded.dropAt
    : resolvePivotDropInstant(tenant, liveWeek, now).dropAt;

  return {
    data: {
      tenantKey: tenant.tenantKey,
      cityDisplayName: tenant.location || tenant.name || tenant.tenantKey,
      batchWeek: loaded ? loaded.batchWeek : liveWeek,
      liveWeek,
      fallback: Boolean(loaded && loaded.batchWeek !== liveWeek),
      segment,
      dropAt: dropAt.toISOString(),
      ...(nextDropAt ? { nextDropAt: nextDropAt.toISOString() } : {}),
      events: loaded
        ? loaded.ranked.slice(0, CLIP_DROP_LIMIT).map((event) =>
          serializeClipDropEvent(event, { readsEnabled }))
        : [],
      /** Voice overrides for the pack's text; the clip has no account to fetch them. */
      copy,
    },
  };
}

module.exports = {
  getPivotClipDrop,
  serializeClipDropEvent,
  buildClipDropQuery,
  CLIP_DROP_LIMIT,
  CLIP_EVENT_FIELDS,
};
