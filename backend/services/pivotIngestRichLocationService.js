const googleLocationService = require('./googleLocationService');
const { preciseLocationInScope } = require('./justGoRichLocationWriteService');
const {
  classifyLegacyLocation,
  categoricalLocation,
  resolvedPhysicalLocation,
  isBroadProviderLocation,
  approximateLocationFromCanonical,
  confidenceThresholds,
} = require('./pivotLocationBackfillService');
const {
  validateJustGoLocationConstraints,
} = require('../utilities/justGoLocationConstraints');

function trimString(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function unresolvedLocation(mode, originalInput, now) {
  return {
    mode: mode === 'registration_gated' ? mode : 'physical',
    originalInput,
    resolutionStatus: 'unresolved',
    publicDisplayLabel: originalInput,
    revealPolicy: mode === 'registration_gated' ? 'registered_only' : 'public',
    createdAt: now,
    updatedAt: now,
  };
}

function reviewResult({
  originalInput,
  mode = 'physical',
  reason,
  now,
  candidates,
  confidence,
  candidateCount,
  providerCode,
}) {
  return {
    outcome: 'needs_review',
    richLocation: unresolvedLocation(mode, originalInput, now),
    locationReview: {
      status: 'needs_review',
      reason,
      source: 'curation_ingest',
      candidateMatches: Array.isArray(candidates) ? candidates : [],
      ...(Number.isFinite(confidence) ? { confidence } : {}),
      ...(Number.isFinite(candidateCount) ? { candidateCount } : {}),
      ...(mode ? { suggestedMode: mode } : {}),
      ...(providerCode ? { providerCode } : {}),
    },
  };
}

/**
 * Convert a newly scraped legacy location into the same rich-location shape
 * used by the migration. Resolution is best-effort: ambiguous, low-confidence,
 * out-of-scope, and provider-failure results remain staged for an operator
 * instead of making the whole discovery/refresh job fail.
 */
async function resolveIngestRichLocation(options = {}) {
  if (options.richLocation) {
    return { outcome: 'preserved', richLocation: options.richLocation };
  }

  const originalInput = trimString(options.rawLocationText || options.location);
  if (!originalInput) return { outcome: 'skipped' };

  const constraintResult = validateJustGoLocationConstraints(
    options.tenant?.richLocationConstraints,
  );
  if (constraintResult.error) {
    // Tenants that have not entered migration yet retain legacy behavior.
    return { outcome: 'skipped', reason: 'constraints_not_configured' };
  }

  const nowValue = typeof options.now === 'function'
    ? options.now()
    : options.now || new Date();
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  const classification = classifyLegacyLocation(originalInput, options.tenant);

  if (classification.kind === 'categorical') {
    return {
      outcome: 'applied',
      richLocation: categoricalLocation(
        classification.mode,
        originalInput,
        options.tenant,
        now,
      ),
    };
  }

  if (classification.kind === 'gated' || classification.kind === 'ambiguous') {
    return reviewResult({
      originalInput,
      mode: classification.mode || 'physical',
      reason: classification.kind === 'gated'
        ? 'registration_gated_requires_review'
        : classification.reason,
      now,
    });
  }

  await options.beforeProviderCall?.();
  let canonical;
  try {
    canonical = await (options.googleAdapter || googleLocationService).geocodeAddress(
      originalInput,
      {
        regionCode: constraintResult.constraints.countryCode,
        languageCode: options.languageCode || 'en',
      },
    );
  } catch (error) {
    return reviewResult({
      originalInput,
      reason: ['GOOGLE_GEOCODE_NOT_FOUND', 'GOOGLE_PLACE_NOT_FOUND'].includes(error?.code)
        ? 'unmatched_physical'
        : error?.retryable
          ? 'provider_temporary_failure'
          : 'provider_terminal_failure',
      now,
      providerCode: trimString(error?.code) || 'GOOGLE_LOCATION_FAILED',
    });
  }

  const thresholds = confidenceThresholds(options);
  const providerMatchCount = Number(
    canonical?._backfillMatchCount ?? canonical?.providerMatchCount ?? 1,
  );
  const providerAmbiguous = canonical?.ambiguous === true || providerMatchCount !== 1;
  const providerCandidates = Array.isArray(canonical?._backfillCandidates)
    && canonical._backfillCandidates.length
    ? canonical._backfillCandidates
    : [canonical];
  const candidates = providerCandidates
    .filter(Boolean)
    .map((candidate) => resolvedPhysicalLocation(candidate, originalInput, now));
  const candidate = candidates[0];
  const confidence = Number(candidate?.resolutionConfidence);
  const locationScope = candidate
    ? preciseLocationInScope(candidate, constraintResult.constraints)
    : { ok: false, reason: 'provider_result' };

  if (candidate && isBroadProviderLocation(canonical)
    && !providerAmbiguous && locationScope.ok
    && Number.isFinite(confidence) && confidence >= thresholds.autoApplyConfidence) {
    return {
      outcome: 'applied',
      richLocation: approximateLocationFromCanonical(
        canonical,
        originalInput,
        options.tenant,
        now,
      ),
    };
  }

  if (candidate && !providerAmbiguous && locationScope.ok
    && Number.isFinite(confidence) && confidence >= thresholds.autoApplyConfidence) {
    return { outcome: 'applied', richLocation: candidate };
  }

  const reason = providerAmbiguous
    ? 'ambiguous_provider_matches'
    : !locationScope.ok
      ? 'out_of_scope'
      : confidence >= thresholds.reviewConfidence
        ? 'confidence_below_auto_apply'
        : 'confidence_below_review';
  return reviewResult({
    originalInput,
    reason,
    now,
    candidates: confidence >= thresholds.reviewConfidence ? candidates : [],
    confidence: Number.isFinite(confidence) ? confidence : undefined,
    candidateCount: providerMatchCount,
  });
}

module.exports = {
  resolveIngestRichLocation,
  unresolvedLocation,
};
