/**
 * How a finished drop week's batch landed, across cities, for the weekly report:
 * how much of the catalog reached a deck, how people swiped on it, which cards
 * carried the week, and which ones everyone passed on.
 *
 * Swipe totals count every intent for the batch week (same basis as the ops
 * Overview funnel), so this week and last week compare like for like. Per-card
 * numbers only cover the week's published events.
 */
const getModels = require('./getModelService');
const { connectToDatabase } = require('../connectionsManager');
const { PUBLISHED_EVENT_QUERY } = require('./pivotWeeklySnapshotService');
const { loadIntentStatsByEventId } = require('./pivotLabEventsService');
const { aggregateRegisteredFeedback } = require('./pivotAdminOverviewService');
const { shiftIsoWeek } = require('../utilities/pivotIsoWeek');

/** A card needs this many swipes before its rate means anything. */
const MIN_REACH = 5;
const LIST_LENGTH = 3;

async function countIntentsByStatus(PivotEventIntent, batchWeek) {
  const rows = await PivotEventIntent.aggregate([
    { $match: { batchWeek } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const counts = Object.fromEntries(rows.map((row) => [row._id, row.count]));
  const right = (counts.interested || 0) + (counts.registered || 0);
  return { swipes: right + (counts.passed || 0), right, going: counts.registered || 0 };
}

async function loadCityBatch(tenantKey, batchWeek) {
  const db = await connectToDatabase(tenantKey);
  const { Event, PivotEventIntent, PivotDeckSnapshot, UniversalFeedback } = getModels(
    { db },
    'Event',
    'PivotEventIntent',
    'PivotDeckSnapshot',
    'UniversalFeedback',
  );
  const events = await Event.find(PUBLISHED_EVENT_QUERY(batchWeek)).select('name image description').lean();
  const eventIds = events.map((event) => event._id);
  const [stats, dealtRows, current, previous, feedback] = await Promise.all([
    loadIntentStatsByEventId(PivotEventIntent, eventIds, { batchWeek }),
    PivotDeckSnapshot.aggregate([
      { $match: { batchWeek } },
      { $unwind: '$orderedEventIds' },
      { $group: { _id: '$orderedEventIds' } },
    ]),
    countIntentsByStatus(PivotEventIntent, batchWeek),
    countIntentsByStatus(PivotEventIntent, shiftIsoWeek(batchWeek, -1)),
    aggregateRegisteredFeedback(PivotEventIntent, UniversalFeedback, batchWeek, eventIds),
  ]);
  const dealt = new Set(dealtRows.map((row) => String(row._id)));
  return {
    events: events.map((event) => {
      const row = stats.get(String(event._id)) || {};
      const right = (row.interested || 0) + (row.registered || 0);
      return {
        eventId: String(event._id),
        name: event.name || '',
        right,
        reached: right + (row.passed || 0),
        dealt: dealt.has(String(event._id)),
        missingDetails: !String(event.description || '').trim() || !String(event.image || '').trim(),
      };
    }),
    current,
    previous,
    feedback,
  };
}

/**
 * Pure: per-city batches in, one summary out.
 * @param {Array<{ name: string, events: object[], current: object, previous: object, feedback: object }>} cities
 */
function summarizeBatchQuality(cities) {
  const cards = cities.flatMap((city) => city.events.map((event) => ({ ...event, city: city.name })));
  const sum = (pick) => cities.reduce((total, city) => total + (pick(city) || 0), 0);
  const rated = cities.filter((city) => city.feedback?.feedbackAvg != null && city.feedback.feedbackCount);
  const ratingCount = rated.reduce((total, city) => total + city.feedback.feedbackCount, 0);
  const reachedEnough = cards.filter((card) => card.reached >= MIN_REACH);
  const card = ({ eventId, name, city, right, reached }) => ({ eventId, name, city, right, reached });

  const top = cards
    .filter((row) => row.right > 0)
    .sort((a, b) => b.right - a.right || b.reached - a.reached)
    .slice(0, LIST_LENGTH);
  const topIds = new Set(top.map((row) => row.eventId));
  const misses = reachedEnough
    .filter((row) => !topIds.has(row.eventId))
    .sort((a, b) => a.right / a.reached - b.right / b.reached || b.reached - a.reached)
    .slice(0, LIST_LENGTH);

  return {
    minReach: MIN_REACH,
    cityCount: cities.length,
    events: cards.length,
    dealt: cards.filter((row) => row.dealt).length,
    landed: cards.filter((row) => row.right > 0).length,
    passedByAll: reachedEnough.filter((row) => !row.right).length,
    missingDetails: cards.filter((row) => row.missingDetails).length,
    swipes: sum((city) => city.current?.swipes),
    right: sum((city) => city.current?.right),
    going: sum((city) => city.current?.going),
    swipesPrevious: sum((city) => city.previous?.swipes),
    rightPrevious: sum((city) => city.previous?.right),
    rating: ratingCount
      ? {
          average: Math.round((rated.reduce((total, city) => total + city.feedback.feedbackAvg * city.feedback.feedbackCount, 0) / ratingCount) * 10) / 10,
          count: ratingCount,
        }
      : null,
    top: top.map(card),
    misses: misses.map(card),
  };
}

/**
 * Load and summarize the batch for `batchWeek` in each city. A city that fails
 * is named in `failedCities` and left out of the totals.
 * @param {Array<{ tenantKey: string, name: string }>} cities
 */
async function getWeeklyBatchQuality(cities, batchWeek) {
  const loaded = await Promise.all(
    cities.map(async (city) => {
      try {
        return { ...city, ...(await loadCityBatch(city.tenantKey, batchWeek)) };
      } catch (error) {
        console.error(`[pivotWeeklyBatchQuality] load failed tenant=${city.tenantKey} batchWeek=${batchWeek}:`, error);
        return { ...city, error: true };
      }
    }),
  );
  return {
    ...summarizeBatchQuality(loaded.filter((city) => !city.error)),
    failedCities: loaded.filter((city) => city.error).map((city) => city.name),
  };
}

module.exports = {
  getWeeklyBatchQuality,
  summarizeBatchQuality,
  MIN_REACH,
};
