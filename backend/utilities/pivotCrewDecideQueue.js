const { OPEN_BALLOT_STATUSES } = require('./pivotCrewBorda');

function isJudgementWindowOpen(judgementWindowEndsAt, now = new Date()) {
  if (!judgementWindowEndsAt) {
    return false;
  }
  const endsAtMs = new Date(judgementWindowEndsAt).getTime();
  if (Number.isNaN(endsAtMs)) {
    return false;
  }
  return now.getTime() <= endsAtMs;
}

/** Open decide statuses for Borda balloting (+ legacy open consensus during cutover). */
const OPEN_CONSENSUS_STATUSES = new Set([
  'balloting',
  'proposed',
  'split',
  'deciding',
]);

/** @deprecated use OPEN_CONSENSUS_STATUSES — kept for callers that import the name */
const JUDGEMENT_READY_STATUSES = OPEN_CONSENSUS_STATUSES;

function pickCrewsNeedingDecide(crews, now = new Date()) {
  return crews.filter(
    (crew) =>
      crew.quorumMet &&
      OPEN_CONSENSUS_STATUSES.has(crew.judgementStatus) &&
      isJudgementWindowOpen(crew.judgementWindowEndsAt || crew.ballot?.endsAt, now),
  );
}

function pickCrewsWithPendingJudgement(crews) {
  return crews.filter(
    (crew) =>
      crew.quorumMet && OPEN_CONSENSUS_STATUSES.has(crew.judgementStatus),
  );
}

function buildDecideQueueOrder(crews, now = new Date(), options = {}) {
  const requireOpenWindow = options.requireOpenWindow !== false;
  const source = requireOpenWindow
    ? pickCrewsNeedingDecide(crews, now)
    : pickCrewsWithPendingJudgement(crews);
  return source.map((crew) => crew.crewId);
}

function crewNeedsUserAction(crew, now = new Date()) {
  if (
    !crew.quorumMet ||
    !OPEN_CONSENSUS_STATUSES.has(crew.judgementStatus) ||
    !isJudgementWindowOpen(crew.judgementWindowEndsAt || crew.ballot?.endsAt, now)
  ) {
    return false;
  }

  if (crew.viewerHasBalloted === true || crew.viewerHasConfirmedCurrent === true) {
    return false;
  }

  return true;
}

module.exports = {
  JUDGEMENT_READY_STATUSES,
  OPEN_CONSENSUS_STATUSES,
  OPEN_BALLOT_STATUSES,
  isJudgementWindowOpen,
  pickCrewsNeedingDecide,
  pickCrewsWithPendingJudgement,
  buildDecideQueueOrder,
  crewNeedsUserAction,
};
