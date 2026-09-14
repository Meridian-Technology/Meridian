const EDITORIAL_TIERS = Object.freeze([
  'demote',
  'promote',
  'strong_promote',
  'must_show',
  'hidden',
]);

const PROMOTION_TIERS = new Set(['promote', 'strong_promote']);
const EDITORIAL_AUDIENCES = Object.freeze(['everyone', 'matching_interests']);
const EDITORIAL_ADJUSTMENTS = Object.freeze({
  demote: -0.7,
  promote: 0.7,
  strong_promote: 1.5,
  must_show: 0,
  hidden: 0,
});

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function actorFromReq(req) {
  return (
    trimString(req?.user?.email) ||
    trimString(req?.user?.globalUserId) ||
    trimString(req?.user?.userId) ||
    'platform-admin'
  );
}

function normalizeRankingOverride(raw, options = {}) {
  if (raw === undefined) return { unchanged: true };
  if (raw === null || raw === false || raw?.tier === 'standard') {
    return { value: null };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      error: 'rankingOverride must be an object or null.',
      status: 400,
      code: 'INVALID_RANKING_OVERRIDE',
    };
  }

  const tier = trimString(raw.tier).toLowerCase();
  if (!EDITORIAL_TIERS.includes(tier)) {
    return {
      error: `rankingOverride.tier must be one of: ${EDITORIAL_TIERS.join(', ')}, or standard to clear it.`,
      status: 400,
      code: 'INVALID_EDITORIAL_TIER',
    };
  }

  const audience = trimString(raw.audience || 'everyone').toLowerCase();
  if (!EDITORIAL_AUDIENCES.includes(audience)) {
    return {
      error: `rankingOverride.audience must be one of: ${EDITORIAL_AUDIENCES.join(', ')}.`,
      status: 400,
      code: 'INVALID_EDITORIAL_AUDIENCE',
    };
  }
  if (!PROMOTION_TIERS.has(tier) && audience !== 'everyone') {
    return {
      error: 'Matching-interest targeting is only available for Promote and Strong promote.',
      status: 400,
      code: 'INVALID_EDITORIAL_AUDIENCE',
    };
  }

  const note = trimString(raw.note);
  if (note.length > 500) {
    return {
      error: 'rankingOverride.note must be 500 characters or fewer.',
      status: 400,
      code: 'INVALID_EDITORIAL_NOTE',
    };
  }

  const at = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  return {
    value: {
      tier,
      audience,
      ...(note ? { note } : {}),
      updatedBy: trimString(options.actor) || 'platform-admin',
      updatedAt: at.toISOString(),
    },
  };
}

function readRankingOverride(event) {
  const raw = event?.customFields?.pivot?.rankingOverride;
  if (!raw || !EDITORIAL_TIERS.includes(raw.tier)) return null;
  return {
    tier: raw.tier,
    audience: EDITORIAL_AUDIENCES.includes(raw.audience) ? raw.audience : 'everyone',
    ...(trimString(raw.note) ? { note: trimString(raw.note) } : {}),
    updatedBy: trimString(raw.updatedBy) || null,
    updatedAt: raw.updatedAt || null,
  };
}

function editorialAdjustmentForEvent(event, userInterestTags = new Set()) {
  const override = readRankingOverride(event);
  if (!override) return { adjustment: 0, matched: false, override: null };

  let matched = override.audience === 'everyone';
  if (override.audience === 'matching_interests') {
    const tags = event?.customFields?.pivot?.tags;
    matched = Array.isArray(tags)
      && tags.some((tag) => userInterestTags.has(String(tag || '').trim().toLowerCase()));
  }

  return {
    adjustment: matched ? EDITORIAL_ADJUSTMENTS[override.tier] || 0 : 0,
    matched,
    override,
  };
}

module.exports = {
  EDITORIAL_TIERS,
  PROMOTION_TIERS,
  EDITORIAL_AUDIENCES,
  EDITORIAL_ADJUSTMENTS,
  actorFromReq,
  normalizeRankingOverride,
  readRankingOverride,
  editorialAdjustmentForEvent,
};
