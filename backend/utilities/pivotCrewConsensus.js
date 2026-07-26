/**
 * Pure helpers for democratic crew consensus (timer + shared swaps).
 */

const OPEN_CONSENSUS_STATUSES = new Set(['proposed', 'split', 'deciding']);
const LOCKED_JUDGEMENT_STATUSES = new Set(['confirmed', 'swapped']);

function toMs(value) {
  if (!value) {
    return null;
  }
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function resolveEffectiveConsensusEndsAt(consensusEndsAt, judgementWindowEndsAt) {
  const consensusMs = toMs(consensusEndsAt);
  const hardMs = toMs(judgementWindowEndsAt);
  if (consensusMs == null && hardMs == null) {
    return null;
  }
  if (consensusMs == null) {
    return new Date(hardMs).toISOString();
  }
  if (hardMs == null) {
    return new Date(consensusMs).toISOString();
  }
  return new Date(Math.min(consensusMs, hardMs)).toISOString();
}

function startConsensusWindow(now, crewConfig, judgementWindowEndsAt) {
  const windowMinutes =
    Number(crewConfig?.judgement?.consensusWindowMinutes) || 180;
  const startedAt = now instanceof Date ? now : new Date(now);
  const rawEndsAt = new Date(startedAt.getTime() + windowMinutes * 60 * 1000);
  const endsAtIso = resolveEffectiveConsensusEndsAt(
    rawEndsAt.toISOString(),
    judgementWindowEndsAt,
  );
  return {
    consensusStartedAt: startedAt.toISOString(),
    consensusEndsAt: endsAtIso,
  };
}

function extendConsensusWindowOnSwap(
  weekState,
  now,
  crewConfig,
  judgementWindowEndsAt,
) {
  const bonusMinutes = Number(crewConfig?.judgement?.swapResetBonusMinutes);
  const bonusMs =
    (Number.isFinite(bonusMinutes) ? bonusMinutes : 15) * 60 * 1000;
  const nowDate = now instanceof Date ? now : new Date(now);
  const currentEndsMs = toMs(weekState?.consensusEndsAt);
  const baseMs = Math.max(currentEndsMs ?? 0, nowDate.getTime());
  const extended = new Date(baseMs + bonusMs);
  const startedMs = toMs(weekState?.consensusStartedAt);

  return {
    consensusStartedAt: startedMs
      ? new Date(startedMs).toISOString()
      : nowDate.toISOString(),
    consensusEndsAt: resolveEffectiveConsensusEndsAt(
      extended.toISOString(),
      judgementWindowEndsAt,
    ),
  };
}

function isConsensusExpired(weekState, judgementWindowEndsAt, now = new Date()) {
  if (weekState?.judgementStatus !== 'deciding') {
    return false;
  }
  const effectiveEndsAt = resolveEffectiveConsensusEndsAt(
    weekState.consensusEndsAt,
    judgementWindowEndsAt,
  );
  const endsMs = toMs(effectiveEndsAt);
  if (endsMs == null) {
    return false;
  }
  return now.getTime() >= endsMs;
}

function resolveLockedJudgementStatus(weekState, lockedEventId) {
  const originalId =
    weekState?.originalProposedEventId?.toString?.() ||
    weekState?.originalProposedEventId ||
    null;
  if (originalId && lockedEventId && lockedEventId !== originalId) {
    return 'swapped';
  }
  return 'confirmed';
}

function memberConfirmedCurrentProposal(memberJudgements, userId, proposedEventId) {
  if (!userId || !proposedEventId) {
    return false;
  }
  const row = (memberJudgements || []).find(
    (entry) => entry.userId?.toString?.() === userId || entry.userId === userId,
  );
  if (!row) {
    return false;
  }
  const eventId = row.eventId?.toString?.() || row.eventId;
  return (
    (row.action === 'confirmed' || row.action === 'swapped') &&
    eventId === proposedEventId
  );
}

function countConfirmedOnCurrentProposal(memberJudgements, proposedEventId) {
  if (!proposedEventId) {
    return 0;
  }
  return (memberJudgements || []).filter((entry) => {
    const eventId = entry.eventId?.toString?.() || entry.eventId;
    return (
      (entry.action === 'confirmed' || entry.action === 'swapped') &&
      eventId === proposedEventId
    );
  }).length;
}

function isUnanimousOnCurrentProposal({
  activeMemberUserIds,
  memberJudgements,
  proposedEventId,
}) {
  if (!proposedEventId || !activeMemberUserIds?.length) {
    return false;
  }
  return activeMemberUserIds.every((userId) =>
    memberConfirmedCurrentProposal(memberJudgements, userId, proposedEventId),
  );
}

function upsertMemberJudgement(memberJudgements, { userId, action, eventId, at }) {
  const next = (memberJudgements || []).filter(
    (entry) =>
      entry.userId?.toString?.() !== userId && entry.userId !== userId,
  );
  next.push({
    userId,
    action,
    eventId,
    at: at instanceof Date ? at : new Date(at),
  });
  return next;
}

function resolveViewerAction(memberJudgements, userId) {
  if (!userId) {
    return null;
  }
  const row = (memberJudgements || []).find(
    (entry) => entry.userId?.toString?.() === userId || entry.userId === userId,
  );
  return row?.action || null;
}

module.exports = {
  OPEN_CONSENSUS_STATUSES,
  LOCKED_JUDGEMENT_STATUSES,
  resolveEffectiveConsensusEndsAt,
  startConsensusWindow,
  extendConsensusWindowOnSwap,
  isConsensusExpired,
  resolveLockedJudgementStatus,
  memberConfirmedCurrentProposal,
  countConfirmedOnCurrentProposal,
  isUnanimousOnCurrentProposal,
  upsertMemberJudgement,
  resolveViewerAction,
};
