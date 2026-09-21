const mongoose = require('mongoose');
const getModels = require('./getModelService');
const { connectToDatabase } = require('../connectionsManager');
const { resolvePivotTenant } = require('./pivotIngestPublishService');
const { normalizeBatchWeek } = require('./pivotWeeklySnapshotService');
const { resolvePivotCoverImageUrl } = require('../utilities/pivotMovieMetadata');

const SESSION_GAP_MS = 15 * 60 * 1000;
const MIN_DWELL_MS = 300;
const MAX_DWELL_MS = 5 * 60 * 1000;
const FALLBACK_DWELL_MS = 1200;
const MAX_INTERACTION_ROWS = 4000;
const DECK_ACTION_TYPES = new Set(['pass', 'interested']);
const DECK_SURFACES = new Set(['deck']);
const REPLAY_EVENT_FIELDS =
  'name description location start_time end_time image customFields.pivot';

function openTenantDb(tenantKey) {
  return connectToDatabase(tenantKey).then((db) => ({ db, school: tenantKey }));
}

function parseUserId(raw) {
  const id = String(raw || '').trim();
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return {
      error: 'userId must be a valid ObjectId.',
      status: 400,
      code: 'INVALID_USER_ID',
    };
  }
  return { userId: new mongoose.Types.ObjectId(id) };
}

function toMs(value) {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function clampDwellMs(ms) {
  return Math.min(MAX_DWELL_MS, Math.max(MIN_DWELL_MS, Math.floor(ms)));
}

function hostNameFromPivot(pivot) {
  const name = pivot?.host?.name;
  return typeof name === 'string' ? name.trim() : '';
}

function isDeckRow(row) {
  return !row.surface || DECK_SURFACES.has(row.surface);
}

/**
 * Rebuild ordered deck cards from append-only interaction rows.
 * Terminal action is pass | interested. Dwell `ms` wins when present;
 * otherwise we use impression → action span.
 */
function buildDeckReplaySessions(rows) {
  const sorted = (Array.isArray(rows) ? rows : [])
    .filter((row) => row && row.eventId && isDeckRow(row))
    .slice()
    .sort((a, b) => {
      const delta = (toMs(a.createdAt) || 0) - (toMs(b.createdAt) || 0);
      if (delta !== 0) return delta;
      return String(a._id || '').localeCompare(String(b._id || ''));
    });

  const byEvent = new Map();
  for (const row of sorted) {
    const eventId = String(row.eventId);
    if (!byEvent.has(eventId)) byEvent.set(eventId, []);
    byEvent.get(eventId).push(row);
  }

  const cards = [];
  for (const [eventId, eventRows] of byEvent) {
    const action = eventRows.find((row) => DECK_ACTION_TYPES.has(row.type));
    if (!action) continue;

    const actedAt = toMs(action.createdAt);
    if (actedAt == null) continue;

    const impression = eventRows.find((row) => row.type === 'impression');
    const detailOpen = eventRows.find((row) => row.type === 'detail_open');
    const dwells = eventRows.filter(
      (row) => row.type === 'dwell' && Number(row.ms) > 0,
    );
    const dwell = dwells.length ? dwells[dwells.length - 1] : null;
    const recordedMs = dwell ? Number(dwell.ms) : 0;

    let focusedAt;
    let dwellMs;
    if (recordedMs >= MIN_DWELL_MS) {
      dwellMs = clampDwellMs(recordedMs);
      focusedAt = actedAt - dwellMs;
    } else {
      focusedAt = impression ? toMs(impression.createdAt) : null;
      if (focusedAt == null || focusedAt > actedAt) {
        focusedAt = actedAt - FALLBACK_DWELL_MS;
      }
      dwellMs = clampDwellMs(actedAt - focusedAt);
    }

    cards.push({
      eventId,
      action: action.type,
      focusedAt,
      actedAt,
      dwellMs,
      rankInFeed:
        action.rankInFeed ??
        impression?.rankInFeed ??
        dwell?.rankInFeed ??
        null,
      openedDetail: Boolean(detailOpen),
      ...(detailOpen && toMs(detailOpen.createdAt) != null
        ? { openedDetailAt: toMs(detailOpen.createdAt) }
        : {}),
    });
  }

  cards.sort(
    (a, b) => a.focusedAt - b.focusedAt || a.actedAt - b.actedAt,
  );

  const sessions = [];
  let current = [];
  for (const card of cards) {
    const prev = current[current.length - 1];
    if (prev && card.focusedAt - prev.actedAt > SESSION_GAP_MS) {
      sessions.push(current);
      current = [];
    }
    current.push(card);
  }
  if (current.length) sessions.push(current);

  return sessions.map((sessionCards, index) => ({
    index,
    startedAt: sessionCards[0].focusedAt,
    endedAt: sessionCards[sessionCards.length - 1].actedAt,
    durationMs:
      sessionCards[sessionCards.length - 1].actedAt - sessionCards[0].focusedAt,
    cards: sessionCards,
  }));
}

function serializeReplayEvent(event) {
  const pivot = event?.customFields?.pivot || {};
  const hostName = hostNameFromPivot(pivot);
  const coverImageUrl = event ? resolvePivotCoverImageUrl(event) : null;
  const tags = Array.isArray(pivot.tags)
    ? pivot.tags.filter((tag) => typeof tag === 'string' && tag.trim())
    : [];
  const movieSynopsis =
    typeof pivot.movie?.synopsis === 'string' ? pivot.movie.synopsis.trim() : '';
  const description = movieSynopsis || event?.description || '';

  return {
    eventId: String(event._id),
    name: event.name || 'Untitled event',
    hostName,
    location: event.location || '',
    startTime: event.start_time || null,
    endTime: event.end_time || null,
    description,
    tags,
    ...(coverImageUrl ? { coverImageUrl } : {}),
  };
}

async function getUserDeckReplay(req, options = {}) {
  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) return tenantResult;

  const userIdResult = parseUserId(options.userId);
  if (userIdResult.error) return userIdResult;

  const normalized = normalizeBatchWeek(options.batchWeek, options.now);
  if (normalized.error) return normalized;

  const { batchWeek } = normalized;
  const tenantKey = tenantResult.tenant.tenantKey;
  const { userId } = userIdResult;
  const tenantReq = await openTenantDb(tenantKey);
  const { User, PivotInteraction, Event } = getModels(
    tenantReq,
    'User',
    'PivotInteraction',
    'Event',
  );

  const user = await User.findById(userId).select('name username picture').lean();
  if (!user) {
    return {
      error: 'User not found in this city.',
      status: 404,
      code: 'USER_NOT_FOUND',
    };
  }

  const rows = await PivotInteraction.find({
    userId,
    batchWeek,
    surface: 'deck',
    type: { $in: ['impression', 'dwell', 'pass', 'interested', 'detail_open'] },
  })
    .select('eventId type ms rankInFeed surface createdAt')
    .sort({ createdAt: 1 })
    .limit(MAX_INTERACTION_ROWS)
    .lean();

  const sessions = buildDeckReplaySessions(rows);
  const eventIds = [
    ...new Set(sessions.flatMap((session) => session.cards.map((card) => card.eventId))),
  ];
  const events = eventIds.length
    ? await Event.find({ _id: { $in: eventIds } })
        .select(REPLAY_EVENT_FIELDS)
        .lean()
    : [];
  const eventById = new Map(events.map((event) => [String(event._id), event]));

  const hydrated = sessions.map((session) => ({
    ...session,
    startedAt: new Date(session.startedAt).toISOString(),
    endedAt: new Date(session.endedAt).toISOString(),
    cards: session.cards.map((card) => {
      const event = eventById.get(card.eventId);
      return {
        ...card,
        focusedAt: new Date(card.focusedAt).toISOString(),
        actedAt: new Date(card.actedAt).toISOString(),
        ...(card.openedDetailAt
          ? { openedDetailAt: new Date(card.openedDetailAt).toISOString() }
          : {}),
        event: event
          ? serializeReplayEvent(event)
          : {
              eventId: card.eventId,
              name: 'Missing event',
              hostName: '',
              location: '',
              startTime: null,
              endTime: null,
              description: '',
              tags: [],
            },
      };
    }),
  }));

  return {
    data: {
      tenantKey,
      batchWeek,
      user: {
        userId: String(user._id),
        name: user.name || '',
        username: user.username || null,
        picture: user.picture || null,
      },
      sessions: hydrated,
      cardCount: hydrated.reduce((sum, session) => sum + session.cards.length, 0),
    },
  };
}

module.exports = {
  SESSION_GAP_MS,
  MIN_DWELL_MS,
  MAX_DWELL_MS,
  FALLBACK_DWELL_MS,
  buildDeckReplaySessions,
  serializeReplayEvent,
  getUserDeckReplay,
};
