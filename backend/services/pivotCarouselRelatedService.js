/** Curator-only seed-and-neighbor proposals. Nothing here writes a draft. */
const mongoose = require('mongoose');
const { connectToDatabase } = require('../connectionsManager');
const getModels = require('./getModelService');
const { getTenantByKey } = require('./tenantConfigService');
const { loadAccount } = require('./pivotCarouselIssueService');
const { parseCurationQuery, buildCurationMongoQuery, serializeCurationCandidate } = require('./pivotCarouselCurationQuery');
const { buildJustGoSemanticText } = require('../utilities/justGoSemanticText');

const INDEX_NAME = 'just_go_event_autoembed_v1';
const TEXT_PATH = 'customFields.pivot.semanticText';
const FETCH_LIMIT = 60;
const RESULT_LIMIT = 5;

function relatedPipeline(text) {
  return [
    { $vectorSearch: {
      index: INDEX_NAME,
      path: TEXT_PATH,
      query: { text },
      filter: { 'customFields.pivot.ingestStatus': 'published' },
      numCandidates: 1200,
      limit: FETCH_LIMIT,
    } },
    { $project: { _id: 1, score: { $meta: 'vectorSearchScore' } } },
  ];
}

function dedupeKey(event) {
  const title = String(event.name || '').normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
  const day = event.start_time ? new Date(event.start_time).toISOString().slice(0, 10) : '';
  return `${title}:${day}`;
}

function chooseNeighbors(hits, events, seed, limit = RESULT_LIMIT) {
  const byId = new Map(events.map((event) => [String(event._id), event]));
  const seen = new Set([dedupeKey(seed)]);
  const chosen = [];
  for (const hit of hits) {
    const id = String(hit._id);
    if (id === String(seed._id)) continue;
    const event = byId.get(id);
    if (!event) continue;
    const key = dedupeKey(event);
    if (seen.has(key)) continue;
    seen.add(key);
    chosen.push({ event, score: hit.score });
    if (chosen.length === limit) break;
  }
  return chosen;
}

async function findRelatedCurationEvents(req, accountId, raw = {}, options = {}) {
  if (process.env.PIVOT_CURATION_RELATED_ENABLED !== 'true' && !options.enabled) {
    return { error: 'Related-event proposals are disabled.', status: 503, code: 'PROVIDER_UNAVAILABLE' };
  }
  const loaded = await loadAccount(req, accountId);
  if (loaded.error) return loaded;
  const tenantKey = String(raw.sourceTenantKey || '').trim().toLowerCase();
  const eventId = String(raw.eventId || '').trim();
  if (!loaded.account.sourceTenantKeys.includes(tenantKey)) {
    return { error: 'That source tenant is not allowed for this account.', status: 403, code: 'SOURCE_NOT_ALLOWED' };
  }
  if (!mongoose.isValidObjectId(eventId)) {
    return { error: 'A valid seed event is required.', status: 400, code: 'INVALID_EVENT_ID' };
  }
  const parsed = parseCurationQuery({ temporalMode: 'upcoming', publication: 'published' });
  const now = options.now || new Date();
  const db = await connectToDatabase(tenantKey);
  const { Event } = getModels({ db }, 'Event');
  const match = buildCurationMongoQuery(parsed.spec, { now });
  match.status = { $in: ['approved', 'not-applicable'] };
  match.visibility = 'public';
  match['customFields.pivot.rankingOverride.tier'] = { $ne: 'hidden' };
  const seed = await Event.findOne({ ...match, _id: eventId }).lean();
  if (!seed) return { error: 'The seed event is unavailable.', status: 404, code: 'SEED_UNAVAILABLE' };
  const semanticText = buildJustGoSemanticText(seed);
  if (!semanticText) return { error: 'The seed has no searchable text.', status: 422, code: 'SEED_TEXT_MISSING' };

  let hits;
  try {
    hits = await Event.aggregate(relatedPipeline(semanticText));
  } catch (error) {
    // A missing/unready Atlas index must not turn into unfiltered catalog search.
    return { error: 'The related-event index is unavailable.', status: 503, code: 'VECTOR_INDEX_UNAVAILABLE' };
  }
  const events = await Event.find({ ...match, _id: { $in: hits.map((hit) => hit._id) } }).lean();
  const chosen = chooseNeighbors(hits, events, seed);
  const tenant = await getTenantByKey(req, tenantKey);
  const capturedAt = now;
  const seedTags = new Set(seed.customFields?.pivot?.tags || []);
  const sharedTags = [...seedTags].filter((tag) => chosen.some(({ event }) => event.customFields?.pivot?.tags?.includes(tag)));
  const group = {
    kind: 'related-events',
    seed: { sourceTenantKey: tenantKey, eventId },
    label: sharedTags.length ? sharedTags.slice(0, 2).join(' + ') : `More like ${seed.name}`,
    explanation: 'Events with similar public descriptions, hosts, tags, and locations. Review each event before selecting it.',
    model: 'voyage-4',
    index: INDEX_NAME,
    generatedAt: capturedAt.toISOString(),
  };
  const candidates = chosen.map(({ event, score }) => {
    const candidate = serializeCurationCandidate(event, {
      sourceTenantKey: tenantKey,
      cityName: tenant?.location || tenant?.name || tenantKey,
      timezone: tenant?.pivotDropTimezone || tenant?.timezone,
      spec: { ...parsed.spec, provider: 'vector' },
      capturedAt,
    });
    return {
      ...candidate,
      provenance: {
        ...candidate.provenance,
        relatedProposal: { seed: group.seed, index: INDEX_NAME, generatedAt: group.generatedAt, score },
      },
      score,
      group,
    };
  });
  return { data: { group, candidates } };
}

module.exports = { INDEX_NAME, TEXT_PATH, relatedPipeline, chooseNeighbors, findRelatedCurationEvents };
