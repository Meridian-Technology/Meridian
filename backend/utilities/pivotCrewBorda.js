/**
 * Borda tally helpers for Just Go crew shortlist ballots.
 * Points for n candidates: n - rankIndex - 1 (for 3: 2, 1, 0).
 */

/** Active Borda window. Legacy open consensus statuses migrate → balloting on read. */
const OPEN_BALLOT_STATUSES = new Set(['balloting']);
/** In-flight pre-Borda rows that should still accept a ranking. */
const LEGACY_OPEN_JUDGEMENT_STATUSES = new Set([
  'proposed',
  'split',
  'deciding',
]);
const LOCKED_JUDGEMENT_STATUSES = new Set(['confirmed', 'swapped']);

function isOpenBallotStatus(status) {
  return (
    OPEN_BALLOT_STATUSES.has(status) || LEGACY_OPEN_JUDGEMENT_STATUSES.has(status)
  );
}

function toIdString(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value.toString === 'function') return value.toString();
  return String(value);
}

function normalizeRanking(ranking, shortlistEventIds) {
  const shortlist = (Array.isArray(shortlistEventIds) ? shortlistEventIds : [])
    .map(toIdString)
    .filter(Boolean);
  const shortlistSet = new Set(shortlist);
  const seen = new Set();
  const out = [];

  for (const raw of Array.isArray(ranking) ? ranking : []) {
    const id = toIdString(raw);
    if (!id || !shortlistSet.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }

  return out;
}

function validateRankingAgainstShortlist(ranking, shortlistEventIds) {
  const shortlist = (Array.isArray(shortlistEventIds) ? shortlistEventIds : [])
    .map(toIdString)
    .filter(Boolean);
  if (!shortlist.length) {
    return { ok: false, error: 'SHORTLIST_EMPTY', message: 'No shortlist to rank.' };
  }
  if (!Array.isArray(ranking) || ranking.length === 0) {
    return { ok: false, error: 'RANKING_REQUIRED', message: 'ranking must be a non-empty array.' };
  }

  const shortlistSet = new Set(shortlist);
  const seen = new Set();
  for (const raw of ranking) {
    const id = toIdString(raw);
    if (!id || !shortlistSet.has(id)) {
      return {
        ok: false,
        error: 'RANKING_INVALID',
        message: 'ranking may only include shortlist event ids.',
      };
    }
    if (seen.has(id)) {
      return {
        ok: false,
        error: 'RANKING_DUPLICATE',
        message: 'ranking must not contain duplicate event ids.',
      };
    }
    seen.add(id);
  }

  return { ok: true, ranking: normalizeRanking(ranking, shortlist) };
}

/**
 * @param {Array<{ ranking?: unknown[] }>} ballots
 * @param {unknown[]} shortlistEventIds
 * @returns {Map<string, { score: number, firstPlaceCount: number }>}
 */
function scoreBordaBallots(ballots, shortlistEventIds) {
  const shortlist = (Array.isArray(shortlistEventIds) ? shortlistEventIds : [])
    .map(toIdString)
    .filter(Boolean);
  const n = shortlist.length;
  const scores = new Map(
    shortlist.map((id) => [id, { score: 0, firstPlaceCount: 0 }]),
  );

  for (const ballot of Array.isArray(ballots) ? ballots : []) {
    const ranking = normalizeRanking(ballot?.ranking, shortlist);
    ranking.forEach((eventId, rankIndex) => {
      const entry = scores.get(eventId);
      if (!entry) return;
      entry.score += n - rankIndex - 1;
      if (rankIndex === 0) entry.firstPlaceCount += 1;
    });
  }

  return scores;
}

/**
 * Rank shortlist by Borda and take the top N winners (crew maxPickSlots).
 * Tie-break: most #1s, then optional comparator on event meta.
 *
 * @param {object} params
 * @param {Array<{ ranking?: unknown[] }>} params.ballots
 * @param {unknown[]} params.shortlistEventIds
 * @param {number} [params.maxWinners=1] — how many events to lock (1–2)
 * @param {(aId: string, bId: string) => number} [params.compareEvents]
 *   Negative if a should rank before b (better). Used only when score + #1s tie.
 */
function resolveBordaWinner({
  ballots,
  shortlistEventIds,
  compareEvents,
  maxWinners = 1,
} = {}) {
  const shortlist = (Array.isArray(shortlistEventIds) ? shortlistEventIds : [])
    .map(toIdString)
    .filter(Boolean);
  if (!shortlist.length) {
    return { winnerEventId: null, winnerEventIds: [], scores: [] };
  }

  const scoreMap = scoreBordaBallots(ballots, shortlist);
  const ranked = shortlist
    .map((eventId) => {
      const entry = scoreMap.get(eventId) || { score: 0, firstPlaceCount: 0 };
      return {
        eventId,
        score: entry.score,
        firstPlaceCount: entry.firstPlaceCount,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.firstPlaceCount !== a.firstPlaceCount) {
        return b.firstPlaceCount - a.firstPlaceCount;
      }
      if (typeof compareEvents === 'function') {
        return compareEvents(a.eventId, b.eventId);
      }
      return 0;
    });

  const limitRaw = Number(maxWinners);
  const limit = Number.isInteger(limitRaw)
    ? Math.max(1, Math.min(shortlist.length, limitRaw))
    : 1;
  const winnerEventIds = ranked.slice(0, limit).map((row) => row.eventId);

  return {
    winnerEventId: winnerEventIds[0] || null,
    winnerEventIds,
    scores: ranked,
  };
}

function upsertMemberBallot(memberBallots, { userId, ranking, at }) {
  const uid = toIdString(userId);
  const next = (Array.isArray(memberBallots) ? memberBallots : [])
    .filter((row) => toIdString(row?.userId) !== uid)
    .map((row) => ({
      userId: row.userId,
      ranking: Array.isArray(row.ranking) ? [...row.ranking] : [],
      at: row.at,
    }));

  next.push({
    userId,
    ranking: Array.isArray(ranking) ? [...ranking] : [],
    at: at || new Date(),
  });

  return next;
}

function memberHasBalloted(memberBallots, userId) {
  const uid = toIdString(userId);
  if (!uid) return false;
  return (Array.isArray(memberBallots) ? memberBallots : []).some(
    (row) => toIdString(row?.userId) === uid,
  );
}

function getMemberRanking(memberBallots, userId) {
  const uid = toIdString(userId);
  const row = (Array.isArray(memberBallots) ? memberBallots : []).find(
    (entry) => toIdString(entry?.userId) === uid,
  );
  if (!row) return null;
  return Array.isArray(row.ranking) ? row.ranking.map(toIdString).filter(Boolean) : [];
}

function countBallotsFromActives(memberBallots, activeUserIds) {
  const activeSet = new Set(
    (Array.isArray(activeUserIds) ? activeUserIds : []).map(toIdString).filter(Boolean),
  );
  let count = 0;
  for (const row of Array.isArray(memberBallots) ? memberBallots : []) {
    if (activeSet.has(toIdString(row?.userId))) count += 1;
  }
  return count;
}

function allActivesHaveBalloted(memberBallots, activeUserIds) {
  const actives = (Array.isArray(activeUserIds) ? activeUserIds : [])
    .map(toIdString)
    .filter(Boolean);
  if (!actives.length) return false;
  return countBallotsFromActives(memberBallots, actives) >= actives.length;
}

function isBallotExpired(weekState, now = new Date()) {
  if (!weekState || weekState.judgementStatus !== 'balloting') return false;
  const endsAt = weekState.ballotEndsAt;
  if (!endsAt) return false;
  const endMs = endsAt instanceof Date ? endsAt.getTime() : new Date(endsAt).getTime();
  if (Number.isNaN(endMs)) return false;
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  return nowMs >= endMs;
}

function computeBallotEndsAt({
  quorumMetAt,
  hardWindowEndsAt,
  ballotWindowMinutes,
  now = new Date(),
}) {
  const softMinutes = Number(ballotWindowMinutes);
  const softMs =
    Number.isFinite(softMinutes) && softMinutes > 0
      ? softMinutes * 60 * 1000
      : 180 * 60 * 1000;

  const start =
    quorumMetAt instanceof Date
      ? quorumMetAt
      : quorumMetAt
        ? new Date(quorumMetAt)
        : now instanceof Date
          ? now
          : new Date(now);
  const startMs = start.getTime();
  if (Number.isNaN(startMs)) return null;

  let endMs = startMs + softMs;

  if (hardWindowEndsAt) {
    const hardMs =
      hardWindowEndsAt instanceof Date
        ? hardWindowEndsAt.getTime()
        : new Date(hardWindowEndsAt).getTime();
    if (!Number.isNaN(hardMs)) {
      endMs = Math.min(endMs, hardMs);
    }
  }

  return new Date(endMs);
}

module.exports = {
  OPEN_BALLOT_STATUSES,
  LEGACY_OPEN_JUDGEMENT_STATUSES,
  LOCKED_JUDGEMENT_STATUSES,
  isOpenBallotStatus,
  toIdString,
  normalizeRanking,
  validateRankingAgainstShortlist,
  scoreBordaBallots,
  resolveBordaWinner,
  upsertMemberBallot,
  memberHasBalloted,
  getMemberRanking,
  countBallotsFromActives,
  allActivesHaveBalloted,
  isBallotExpired,
  computeBallotEndsAt,
};
