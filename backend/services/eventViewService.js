const getModels = require('./getModelService');
const { connectToDatabase } = require('../connectionsManager');
const { analyticsHash } = require('../utilities/analyticsHash');

/**
 * Page views on `EventAnalytics`: the counters and `viewHistory` behind the
 * campus event dashboards and the Just Go creator Insights tab.
 *
 * Every write is a single atomic update, so concurrent views cannot lose
 * increments. Unique views are decided inside that update too. The history
 * stores a keyed visitor hash, never a raw IP address or user agent.
 */

// Named crawlers and link unfurlers, plus a standalone "bot" token. Not a bare /bot/, which
// matches CUBOT phones, and not messaging apps, whose in-app browsers are real visitors.
const BOT_USER_AGENT = /googlebot|bingbot|applebot|duckduckbot|yandexbot|baiduspider|adsbot|petalbot|bytespider|gptbot|claudebot|ccbot|semrushbot|ahrefsbot|mj12bot|twitterbot|linkedinbot|slackbot|discordbot|telegrambot|pinterestbot|redditbot|facebookexternalhit|facebookcatalog|embedly|skypeuripreview|slurp|headlesschrome|lighthouse|crawler|spider|(?:^|[^a-z])bot(?:[^a-z]|$)/i;
// Newest entries kept per event. Bounds document size (MongoDB caps documents at
// 16 MB) and the cost of the unique-visitor check; covers the dashboards' windows.
const MAX_VIEW_HISTORY = 5000;
const VISITOR_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

function isLikelyBot(userAgent) {
  return BOT_USER_AGENT.test(String(userAgent || ''));
}

function requestIp(req) {
  return req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || '';
}

/**
 * Keyed visitor hash for an anonymous view. A client-supplied visitor id wins
 * when it looks like one; otherwise IP plus user agent, in the same
 * `ip-userAgent` form the old tracker stored raw, so migrated history keeps
 * matching new views.
 */
function anonymousVisitorKey(req, visitorId) {
  if (typeof visitorId === 'string' && VISITOR_ID_PATTERN.test(visitorId)) {
    return analyticsHash(visitorId);
  }
  const header = req.headers?.['x-anonymous-id'];
  if (typeof header === 'string' && header) return analyticsHash(header);
  return analyticsHash(`${requestIp(req)}-${req.headers?.['user-agent'] || ''}`);
}

async function ensureAnalyticsDoc(EventAnalytics, eventId) {
  try {
    await EventAnalytics.updateOne(
      { eventId },
      { $setOnInsert: { eventId } },
      { upsert: true },
    );
  } catch (error) {
    // Two first views racing on the unique eventId index: the other one created it.
    if (error?.code !== 11000) throw error;
  }
}

/**
 * @param {import('mongoose').Model} EventAnalytics
 * @param {string|import('mongoose').Types.ObjectId} eventId
 * @param {{ userId?: string|null, visitorKey?: string|null, source?: string|null,
 *   sourceEventId?: string|null, timestamp?: Date, live?: boolean }} [view]
 *   `sourceEventId` skips a view already recorded with that id. `live: false`
 *   marks a replayed view (backfills); live views keep `firstLiveViewAt`, the
 *   earliest one, so backfills know where recorded history begins.
 * @returns {Promise<{ recorded: boolean, unique: boolean }>}
 */
async function recordEventView(EventAnalytics, eventId, view = {}) {
  const userId = view.userId || null;
  const isAnonymous = !userId;
  const visitorKey = isAnonymous ? view.visitorKey || null : null;
  const totalField = isAnonymous ? 'anonymousViews' : 'views';
  const uniqueField = isAnonymous ? 'uniqueAnonymousViews' : 'uniqueViews';

  const entry = {
    userId,
    isAnonymous,
    anonymousId: visitorKey,
    timestamp: view.timestamp || new Date(),
    source: view.source || null,
    sourceEventId: view.sourceEventId || null,
  };

  await ensureAnalyticsDoc(EventAnalytics, eventId);

  const base = { eventId };
  if (entry.sourceEventId) base['viewHistory.sourceEventId'] = { $ne: entry.sourceEventId };

  const identity = isAnonymous
    ? (visitorKey ? { isAnonymous: true, anonymousId: visitorKey } : null)
    : { isAnonymous: false, userId };

  const push = { viewHistory: { $each: [entry], $slice: -MAX_VIEW_HISTORY } };
  const live = view.live !== false ? { $min: { firstLiveViewAt: entry.timestamp } } : {};
  // firstLiveViewAt is not in the Events-Backend schema yet, so strict mode would drop it.
  const options = { strict: false };

  if (identity) {
    const first = await EventAnalytics.updateOne(
      { ...base, viewHistory: { $not: { $elemMatch: identity } } },
      { $inc: { [totalField]: 1, [uniqueField]: 1 }, $push: push, ...live },
      options,
    );
    if (first.matchedCount > 0) return { recorded: true, unique: true };
  }

  const repeat = await EventAnalytics.updateOne(
    base,
    { $inc: { [totalField]: 1 }, $push: push, ...live },
    options,
  );
  return { recorded: repeat.matchedCount > 0, unique: false };
}

/**
 * View from a request on a campus event page. Admins and obvious bots are not
 * counted. Never throws: a view is not worth failing the page over.
 */
async function recordEventPageView(req, eventId, options = {}) {
  try {
    if (isLikelyBot(req.headers?.['user-agent'])) return { recorded: false, unique: false };
    const { EventAnalytics, User } = getModels(req, 'EventAnalytics', 'User');
    const userId = req.user?.userId || null;
    if (userId) {
      const user = await User.findById(userId).select('roles').lean();
      if (user?.roles?.includes('admin')) return { recorded: false, unique: false, excluded: 'admin' };
    }
    return await recordEventView(EventAnalytics, eventId, {
      userId,
      visitorKey: userId ? null : anonymousVisitorKey(req, options.visitorId),
      source: options.source || 'event_page',
    });
  } catch (error) {
    console.error('[event-view] record failed', { errorName: error?.name || 'Error' });
    return { recorded: false, unique: false };
  }
}

/**
 * View of a Just Go listing's public web page, written to the city database
 * that owns the event: the views behind the creator Insights tab. Always
 * anonymous; the page is served without a session.
 */
async function recordJustGoListingView(req, { tenantKey, eventId, visitorId }, deps = {}) {
  const connect = deps.connectToDatabase || connectToDatabase;
  const db = await connect(tenantKey);
  const { EventAnalytics } = getModels({ db, school: tenantKey }, 'EventAnalytics');
  return recordEventView(EventAnalytics, eventId, {
    visitorKey: anonymousVisitorKey(req, visitorId),
    source: 'justgo_public',
  });
}

/** `viewHistory` entry as returned to organizers: no visitor hash. */
function publicViewHistoryEntry(entry) {
  return {
    userId: entry?.userId || null,
    isAnonymous: Boolean(entry?.isAnonymous),
    timestamp: entry?.timestamp,
  };
}

/**
 * An `EventAnalytics` document as returned to organizers and operators: every
 * `viewHistory` entry reduced to `publicViewHistoryEntry`. Documents written
 * before the identifier migration can still hold raw IPs and user agents.
 */
function organizerEventAnalytics(doc) {
  if (!doc) return doc;
  const plain = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  if (Array.isArray(plain.viewHistory)) {
    plain.viewHistory = plain.viewHistory.map(publicViewHistoryEntry);
  }
  return plain;
}

module.exports = {
  MAX_VIEW_HISTORY,
  isLikelyBot,
  anonymousVisitorKey,
  recordEventView,
  recordEventPageView,
  recordJustGoListingView,
  publicViewHistoryEntry,
  organizerEventAnalytics,
};
