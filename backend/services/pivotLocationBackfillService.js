const getModels = require('./getModelService');
const googleLocationService = require('./googleLocationService');
const { preciseLocationInScope } = require('./justGoRichLocationWriteService');
const {
  validateJustGoLocationConstraints,
} = require('../utilities/justGoLocationConstraints');

const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 200;
const DEFAULT_MIN_INTERVAL_MS = 100;
const MAX_MIN_INTERVAL_MS = 60_000;
const DEFAULT_AUTO_APPLY_CONFIDENCE = 0.9;
const DEFAULT_REVIEW_CONFIDENCE = 0.6;
const MAX_PROVIDER_OPERATIONS_PER_BATCH = 200;
const AUDIT_HISTORY_LIMIT = 50;
const LIVE_SCOPE = 'live';
const HISTORICAL_SCOPE = 'historical';
const BACKFILL_SCOPES = new Set([LIVE_SCOPE, HISTORICAL_SCOPE]);
const BROAD_PLACE_TYPES = new Set([
  'administrative_area_level_1',
  'administrative_area_level_2',
  'administrative_area_level_3',
  'locality',
  'neighborhood',
  'postal_code',
  'sublocality',
  'sublocality_level_1',
]);

const MODE_PATTERNS = Object.freeze({
  online: [
    /^(?:online|virtual|zoom|google meet|livestream|live stream|webinar|remote)(?:\s+(?:event|only))?$/i,
    /\b(?:zoom\.us|meet\.google\.com|teams\.microsoft\.com)\b/i,
  ],
  tbd: [
    /^(?:location|venue|address)?\s*(?:tbd|tba)$/i,
    /^(?:location|venue|address)\s+(?:to be determined|to be announced|coming soon)$/i,
  ],
  registration_gated: [
    /\b(?:address|location|venue)\s+(?:revealed|shared|sent|provided)\s+(?:after|upon|with)\s+(?:registration|registering|rsvp|rsvping)\b/i,
    /\b(?:register|rsvp)\s+(?:to receive|for)\s+(?:the\s+)?(?:address|location|venue)\b/i,
  ],
  approximate: [
    /^(?:near|around|somewhere\s+(?:in|near))\s+\S.+$/i,
    /^(?:the\s+)?.+\s+(?:area|neighborhood|vicinity)$/i,
    /^(?:in|near|around)\s+.+\s+(?:district|neighborhood|area)$/i,
    /^(?:downtown|uptown|midtown)(?:\s+\S.*)?$/i,
  ],
});

function trimString(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function boundedInteger(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.min(Math.max(Math.floor(number), min), max)
    : fallback;
}

function normalizeBackfillScope(value) {
  const scope = trimString(value || LIVE_SCOPE).toLowerCase();
  if (!BACKFILL_SCOPES.has(scope)) {
    throw new Error('Location backfill scope must be live or historical.');
  }
  return scope;
}

function normalizeBatchWeek(value) {
  const batchWeek = trimString(value);
  if (!batchWeek) return null;
  if (!/^\d{4}-W\d{2}$/.test(batchWeek)) {
    throw new Error('Location backfill batchWeek must use ISO format YYYY-Www.');
  }
  return batchWeek;
}

function historicalGateError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function confidenceThresholds(options = {}) {
  const autoApplyConfidence = Number(
    options.autoApplyConfidence ?? DEFAULT_AUTO_APPLY_CONFIDENCE,
  );
  const reviewConfidence = Number(options.reviewConfidence ?? DEFAULT_REVIEW_CONFIDENCE);
  if (![autoApplyConfidence, reviewConfidence].every(
    (value) => Number.isFinite(value) && value >= 0 && value <= 1,
  ) || reviewConfidence > autoApplyConfidence) {
    throw new Error(
      'Location backfill confidence thresholds must satisfy 0 <= review <= auto-apply <= 1.',
    );
  }
  return { autoApplyConfidence, reviewConfidence };
}

function emptyCounts() {
  return {
    scanned: 0,
    applied: 0,
    needsReview: 0,
    providerFailures: 0,
    providerOperations: 0,
    quotaStops: 0,
    skipped: 0,
    physical: 0,
    approximate: 0,
    online: 0,
    tbd: 0,
    registrationGated: 0,
    ambiguous: 0,
  };
}

function addCounts(first = {}, second = {}) {
  const result = emptyCounts();
  Object.keys(result).forEach((key) => {
    result[key] = Number(first[key] || 0) + Number(second[key] || 0);
  });
  return result;
}

function createProviderPacer(options = {}) {
  const intervalMs = boundedInteger(
    options.minIntervalMs,
    DEFAULT_MIN_INTERVAL_MS,
    0,
    MAX_MIN_INTERVAL_MS,
  );
  const now = options.nowMs || Date.now;
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let nextAllowedAt = 0;

  return {
    intervalMs,
    async wait() {
      const waitMs = Math.max(0, nextAllowedAt - now());
      if (waitMs) await sleep(waitMs);
      nextAllowedAt = Math.max(nextAllowedAt, now()) + intervalMs;
    },
  };
}

function normalizedSearchText(location) {
  return [...new Set([
    location.venueName,
    location.publicDisplayLabel,
    location.formattedAddress,
    location.neighborhood,
    location.city,
    location.region,
    location.countryCode,
    ...(Array.isArray(location.aliases) ? location.aliases : []),
  ].map(trimString).filter(Boolean))].join(' ').toLocaleLowerCase();
}

function classifyLegacyLocation(input, tenant = {}) {
  const originalInput = trimString(input);
  if (!originalInput) return { kind: 'ambiguous', reason: 'missing_location_text' };
  if (/\b(?:hybrid|online\s+(?:and|\+)\s+in[ -]?person|virtual\s+(?:and|\+)\s+in[ -]?person)\b/i
    .test(originalInput)) {
    return { kind: 'ambiguous', reason: 'mixed_location_modes' };
  }

  const matches = Object.entries(MODE_PATTERNS)
    .filter(([, patterns]) => patterns.some((pattern) => pattern.test(originalInput)))
    .map(([mode]) => mode);
  if (matches.length > 1) {
    return { kind: 'ambiguous', reason: 'mixed_location_modes', modes: matches };
  }
  if (matches.length === 1) {
    const [mode] = matches;
    return {
      kind: mode === 'registration_gated' ? 'gated' : 'categorical',
      mode,
    };
  }
  const configuredArea = trimString(tenant.location).toLocaleLowerCase();
  const configuredCity = configuredArea.split(',')[0]?.trim();
  const normalizedInput = originalInput.toLocaleLowerCase();
  if (configuredArea && [configuredArea, configuredCity].includes(normalizedInput)) {
    return { kind: 'categorical', mode: 'approximate' };
  }
  return { kind: 'physical', mode: 'physical' };
}

function tenantArea(tenant = {}) {
  const parts = trimString(tenant.location).split(',').map(trimString).filter(Boolean);
  return {
    ...(parts[0] ? { city: parts[0] } : {}),
    ...(parts[1] ? { region: parts[1] } : {}),
    countryCode: trimString(tenant.richLocationConstraints?.countryCode).toUpperCase(),
  };
}

function categoricalLocation(mode, originalInput, tenant, now) {
  if (mode === 'approximate') {
    return {
      mode,
      originalInput,
      ...tenantArea(tenant),
      approximateLabel: originalInput,
      publicDisplayLabel: originalInput,
      resolutionStatus: 'not_applicable',
      revealPolicy: 'public',
      createdAt: now,
      updatedAt: now,
    };
  }
  return {
    mode,
    originalInput,
    publicDisplayLabel: mode === 'online' ? 'Online' : 'Location TBD',
    resolutionStatus: 'not_applicable',
    revealPolicy: 'public',
    createdAt: now,
    updatedAt: now,
  };
}

function isBroadProviderLocation(location) {
  const types = Array.isArray(location?.placeTypes) ? location.placeTypes : [];
  return types.length > 0 && types.every(
    (type) => BROAD_PLACE_TYPES.has(type) || type === 'political',
  );
}

function approximateLocationFromCanonical(canonical, originalInput, tenant, now) {
  const area = tenantArea(tenant);
  return {
    mode: 'approximate',
    originalInput,
    ...(trimString(canonical.neighborhood) ? { neighborhood: trimString(canonical.neighborhood) } : {}),
    ...(trimString(canonical.city) ? { city: trimString(canonical.city) } : {}),
    ...(trimString(canonical.region) ? { region: trimString(canonical.region) } : {}),
    countryCode: trimString(canonical.countryCode).toUpperCase() || area.countryCode,
    approximateLabel: originalInput,
    publicDisplayLabel: originalInput,
    resolutionStatus: 'not_applicable',
    revealPolicy: 'public',
    createdAt: now,
    updatedAt: now,
  };
}

function resolvedPhysicalLocation(canonical, originalInput, now) {
  const {
    _backfillMatchCount,
    _backfillCandidates,
    providerMatchCount,
    ambiguous,
    ...persistableCanonical
  } = canonical || {};
  const richLocation = {
    ...persistableCanonical,
    mode: 'physical',
    originalInput,
    resolutionStatus: 'resolved',
    createdAt: now,
    updatedAt: now,
    resolvedAt: canonical.resolvedAt || now,
    publicDisplayLabel: trimString(canonical.publicDisplayLabel)
      || trimString(canonical.venueName)
      || trimString(canonical.formattedAddress),
    revealPolicy: 'public',
  };
  richLocation.normalizedSearchText = normalizedSearchText(richLocation);
  return richLocation;
}

function reviewSet(event, options) {
  const pivot = event.customFields?.pivot || {};
  const existingReview = pivot.locationReview || {};
  return {
    'customFields.pivot.rawLocationText': options.originalInput,
    'customFields.pivot.locationReview': {
      ...existingReview,
      status: 'needs_review',
      reason: options.reason,
      candidateMatches: Array.isArray(options.candidates)
        ? options.candidates
        : options.candidate ? [options.candidate] : [],
      updatedAt: options.now.toISOString(),
      source: 'rich_location_backfill',
      ...(options.batchWeek ? { batchWeek: options.batchWeek } : {}),
      ...(Number.isFinite(options.candidateCount)
        ? { candidateCount: options.candidateCount }
        : {}),
      ...(Number.isFinite(options.confidence) ? { confidence: options.confidence } : {}),
      ...(options.suggestedMode ? { suggestedMode: options.suggestedMode } : {}),
    },
    'customFields.pivot.locationBackfill': {
      version: 1,
      scope: options.scope || LIVE_SCOPE,
      outcome: 'needs_review',
      processedAt: options.now,
      reason: options.reason,
      ...(options.batchWeek ? { batchWeek: options.batchWeek } : {}),
      ...(Number.isFinite(options.confidence) ? { confidence: options.confidence } : {}),
      ...(options.suggestedMode ? { suggestedMode: options.suggestedMode } : {}),
    },
  };
}

function appliedSet(originalInput, richLocation, now, scope = LIVE_SCOPE, batchWeek = null) {
  return {
    richLocation,
    'customFields.pivot.rawLocationText': originalInput,
    'customFields.pivot.locationBackfill': {
      version: 1,
      scope,
      ...(batchWeek ? { batchWeek } : {}),
      outcome: 'applied',
      processedAt: now,
      mode: richLocation.mode,
      ...(Number.isFinite(richLocation.resolutionConfidence)
        ? { confidence: richLocation.resolutionConfidence }
        : {}),
    },
  };
}

function backfillEventFilter(eventId) {
  return {
    _id: eventId,
    $or: [
      { richLocation: { $exists: false } },
      { richLocation: null },
    ],
    'customFields.pivot.locationBackfill.processedAt': { $exists: false },
  };
}

async function persistCheckpoint(model, stateFilter, checkpoint, counts) {
  await model.updateOne(
    stateFilter,
    {
      $set: {
        ...stateFilter,
        version: 1,
        status: 'running',
        checkpoint: { lastEventId: checkpoint, processedAt: new Date() },
        cumulativeCounts: counts,
      },
    },
    { upsert: true },
  );
}

async function persistAudit(model, stateFilter, options) {
  const previous = await model.findOne(stateFilter).lean();
  const history = [
    ...(Array.isArray(previous?.auditSummaries) ? previous.auditSummaries : []),
    options.summary,
  ].slice(-AUDIT_HISTORY_LIMIT);
  await model.findOneAndUpdate(
    stateFilter,
    {
      $set: {
        ...stateFilter,
        version: 1,
        status: options.summary.status,
        checkpoint: options.checkpoint
          ? { lastEventId: options.checkpoint, processedAt: options.finishedAt }
          : previous?.checkpoint,
        cumulativeCounts: options.cumulativeCounts,
        lastBatch: options.summary,
        auditSummaries: history,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

/**
 * Process at most one bounded page for one Just Go tenant. Repeated calls resume
 * strictly after the persisted ObjectId checkpoint. A dry run reads the same
 * checkpoint and calls the same provider path but performs no database writes.
 */
async function runLocationBackfill(params = {}) {
  if (!params.db) throw new Error('runLocationBackfill requires db (tenant connection).');
  const tenantKey = trimString(params.tenantKey).toLowerCase();
  if (!tenantKey) throw new Error('runLocationBackfill requires tenantKey.');

  const constraintResult = validateJustGoLocationConstraints(
    params.tenant?.richLocationConstraints,
  );
  if (constraintResult.error) {
    throw new Error(`Location backfill requires valid city constraints: ${constraintResult.error}`);
  }

  const batchSize = boundedInteger(
    params.batchSize,
    DEFAULT_BATCH_SIZE,
    1,
    MAX_BATCH_SIZE,
  );
  const thresholds = confidenceThresholds(params);
  const maxProviderOperations = boundedInteger(
    params.maxProviderOperations,
    batchSize,
    0,
    MAX_PROVIDER_OPERATIONS_PER_BATCH,
  );
  const pacer = createProviderPacer(params);
  const adapter = params.googleAdapter || googleLocationService;
  const dryRun = Boolean(params.dryRun);
  const dateNow = () => {
    const value = params.now ? params.now() : new Date();
    return new Date(value);
  };
  const startedAt = dateNow();
  const scope = normalizeBackfillScope(params.scope);
  const batchWeek = normalizeBatchWeek(params.batchWeek);
  const { Event, PivotLocationBackfillRun, PivotLocationBackfillWeekRun } = getModels(
    { db: params.db, school: tenantKey },
    'Event',
    'PivotLocationBackfillRun',
    'PivotLocationBackfillWeekRun',
  );
  const RunModel = batchWeek ? PivotLocationBackfillWeekRun : PivotLocationBackfillRun;
  const stateFilter = batchWeek ? { tenantKey, batchWeek } : { tenantKey, scope };
  const priorRun = await RunModel.findOne(stateFilter).lean();
  if (!batchWeek && scope === HISTORICAL_SCOPE) {
    if (params.liveCatalogStable !== true) {
      throw historicalGateError(
        'Historical location backfill requires explicit live-catalog stability confirmation.',
        'LIVE_CATALOG_STABILITY_CONFIRMATION_REQUIRED',
      );
    }
    const liveRun = await PivotLocationBackfillRun.findOne({
      tenantKey,
      scope: LIVE_SCOPE,
    }).lean();
    if (liveRun?.status !== 'completed') {
      throw historicalGateError(
        'Historical location backfill requires a completed live backfill.',
        'LIVE_LOCATION_BACKFILL_INCOMPLETE',
      );
    }
  }
  const requestedAsOf = params.asOf ? new Date(params.asOf) : null;
  if (requestedAsOf && Number.isNaN(requestedAsOf.getTime())) {
    throw new Error('Location backfill asOf must be a valid date.');
  }
  const persistedAsOf = priorRun?.catalogAsOf || priorRun?.lastBatch?.catalogAsOf;
  const catalogAsOf = persistedAsOf ? new Date(persistedAsOf) : requestedAsOf || startedAt;
  if (requestedAsOf && persistedAsOf
    && requestedAsOf.getTime() !== catalogAsOf.getTime()) {
    throw historicalGateError(
      'A resumed location backfill must use its original catalog cutoff.',
      'LOCATION_BACKFILL_CUTOFF_MISMATCH',
    );
  }
  if (!dryRun) {
    await RunModel.updateOne(
      stateFilter,
      {
        $set: {
          tenantKey,
          scope,
          ...(batchWeek ? { batchWeek } : {}),
          version: 1,
          status: 'running',
          catalogAsOf,
          cumulativeCounts: addCounts(priorRun?.cumulativeCounts),
        },
      },
      { upsert: true },
    );
  }
  const startingCheckpoint = priorRun?.checkpoint?.lastEventId || null;
  const query = {
    'customFields.pivot': { $exists: true },
    isDeleted: { $ne: true },
    location: { $type: 'string', $ne: '' },
    ...(batchWeek
      ? { 'customFields.pivot.batchWeek': batchWeek }
      : { end_time: scope === LIVE_SCOPE ? { $gte: catalogAsOf } : { $lt: catalogAsOf } }),
    $or: [
      { richLocation: { $exists: false } },
      { richLocation: null },
    ],
    'customFields.pivot.locationBackfill.processedAt': { $exists: false },
    'customFields.pivot.locationReview.reviewedAt': { $exists: false },
    ...(startingCheckpoint ? { _id: { $gt: startingCheckpoint } } : {}),
  };
  const page = await Event.find(query)
    .sort({ _id: 1 })
    .limit(batchSize + 1)
    .select('_id location richLocation start_time end_time customFields.pivot')
    .lean();
  const events = page.slice(0, batchSize);
  const counts = emptyCounts();
  const items = [];
  let checkpoint = startingCheckpoint;
  let pausedError = null;
  let quotaReached = false;

  for (const event of events) {
    counts.scanned += 1;
    const originalInput = trimString(
      event.customFields?.pivot?.rawLocationText || event.location,
    );
    const classification = classifyLegacyLocation(originalInput, params.tenant);
    const now = dateNow();

    if (classification.kind === 'categorical') {
      const richLocation = categoricalLocation(
        classification.mode,
        originalInput,
        params.tenant,
        now,
      );
      counts.applied += 1;
      counts[classification.mode === 'approximate' ? 'approximate' : classification.mode] += 1;
      items.push({
        eventId: String(event._id),
        outcome: 'applied',
        mode: classification.mode,
      });
      if (!dryRun) {
        const result = await Event.updateOne(
          backfillEventFilter(event._id),
          { $set: appliedSet(originalInput, richLocation, now, scope, batchWeek) },
          { runValidators: true },
        );
        if (!result.modifiedCount) counts.skipped += 1;
      }
      checkpoint = event._id;
      if (!dryRun) {
        await persistCheckpoint(
          RunModel,
          stateFilter,
          checkpoint,
          addCounts(priorRun?.cumulativeCounts, counts),
        );
      }
      continue;
    }

    if (classification.kind === 'gated' || classification.kind === 'ambiguous') {
      const reason = classification.kind === 'gated'
        ? 'registration_gated_requires_review'
        : classification.reason;
      counts.needsReview += 1;
      if (classification.kind === 'gated') counts.registrationGated += 1;
      else counts.ambiguous += 1;
      items.push({
        eventId: String(event._id),
        outcome: 'needs_review',
        mode: classification.mode,
        reason,
      });
      if (!dryRun) {
        const result = await Event.updateOne(
          backfillEventFilter(event._id),
          { $set: reviewSet(event, {
            originalInput,
            reason,
            suggestedMode: classification.mode,
            scope,
            batchWeek,
            now,
          }) },
        );
        if (!result.modifiedCount) counts.skipped += 1;
      }
      checkpoint = event._id;
      if (!dryRun) {
        await persistCheckpoint(
          RunModel,
          stateFilter,
          checkpoint,
          addCounts(priorRun?.cumulativeCounts, counts),
        );
      }
      continue;
    }

    if (counts.providerOperations >= maxProviderOperations) {
      counts.scanned -= 1;
      counts.quotaStops += 1;
      quotaReached = true;
      items.push({
        eventId: String(event._id),
        outcome: 'quota_deferred',
        mode: 'physical',
      });
      break;
    }
    counts.physical += 1;
    counts.providerOperations += 1;
    await pacer.wait();
    let canonical;
    try {
      canonical = await adapter.geocodeAddress(originalInput, {
        regionCode: constraintResult.constraints.countryCode,
        languageCode: params.languageCode || 'en',
      });
    } catch (error) {
      counts.providerFailures += 1;
      items.push({
        eventId: String(event._id),
        outcome: error?.retryable ? 'retry_later' : 'needs_review',
        code: trimString(error?.code) || 'GOOGLE_LOCATION_FAILED',
      });
      if (error?.retryable) {
        pausedError = error;
        break;
      }

      counts.needsReview += 1;
      const failureReason = ['GOOGLE_GEOCODE_NOT_FOUND', 'GOOGLE_PLACE_NOT_FOUND']
        .includes(error?.code)
        ? 'unmatched_physical'
        : 'provider_terminal_failure';
      if (!dryRun) {
        const result = await Event.updateOne(
          backfillEventFilter(event._id),
          { $set: reviewSet(event, {
            originalInput,
            reason: failureReason,
            scope,
            batchWeek,
            now,
          }) },
        );
        if (!result.modifiedCount) counts.skipped += 1;
      }
      checkpoint = event._id;
      if (!dryRun) {
        await persistCheckpoint(
          RunModel,
          stateFilter,
          checkpoint,
          addCounts(priorRun?.cumulativeCounts, counts),
        );
      }
      continue;
    }

    const providerMatchCount = Number(
      canonical?._backfillMatchCount ?? canonical?.providerMatchCount ?? 1,
    );
    const providerAmbiguous = canonical?.ambiguous === true || providerMatchCount !== 1;
    if (providerAmbiguous) counts.ambiguous += 1;
    const providerCandidates = Array.isArray(canonical?._backfillCandidates)
      && canonical._backfillCandidates.length
      ? canonical._backfillCandidates
      : [canonical];
    const candidates = providerCandidates.map((providerCandidate) =>
      resolvedPhysicalLocation(providerCandidate, originalInput, now));
    const candidate = candidates[0];
    const confidence = Number(candidate.resolutionConfidence);
    const locationScope = preciseLocationInScope(candidate, constraintResult.constraints);
    const broadProviderLocation = isBroadProviderLocation(canonical);
    const canApplyApproximate = broadProviderLocation
      && !providerAmbiguous
      && locationScope.ok
      && Number.isFinite(confidence)
      && confidence >= thresholds.autoApplyConfidence;
    if (canApplyApproximate) {
      const richLocation = approximateLocationFromCanonical(
        canonical,
        originalInput,
        params.tenant,
        now,
      );
      counts.physical -= 1;
      counts.approximate += 1;
      counts.applied += 1;
      items.push({
        eventId: String(event._id),
        outcome: 'applied',
        mode: 'approximate',
        confidence,
      });
      if (!dryRun) {
        const result = await Event.updateOne(
          backfillEventFilter(event._id),
          { $set: appliedSet(originalInput, richLocation, now, scope, batchWeek) },
          { runValidators: true },
        );
        if (!result.modifiedCount) counts.skipped += 1;
      }
      checkpoint = event._id;
      if (!dryRun) {
        await persistCheckpoint(
          RunModel,
          stateFilter,
          checkpoint,
          addCounts(priorRun?.cumulativeCounts, counts),
        );
      }
      continue;
    }
    const canApply = !providerAmbiguous
      && locationScope.ok
      && Number.isFinite(confidence)
      && confidence >= thresholds.autoApplyConfidence;

    if (canApply) {
      counts.applied += 1;
      items.push({ eventId: String(event._id), outcome: 'applied', confidence });
      if (!dryRun) {
        const result = await Event.updateOne(
          backfillEventFilter(event._id),
          { $set: appliedSet(originalInput, candidate, now, scope, batchWeek) },
          { runValidators: true },
        );
        if (!result.modifiedCount) counts.skipped += 1;
      }
    } else {
      counts.needsReview += 1;
      const reason = providerAmbiguous
        ? 'ambiguous_provider_matches'
        : !locationScope.ok
        ? 'out_of_scope'
        : confidence >= thresholds.reviewConfidence
          ? 'confidence_below_auto_apply'
          : 'confidence_below_review';
      items.push({ eventId: String(event._id), outcome: 'needs_review', confidence, reason });
      if (!dryRun) {
        const result = await Event.updateOne(
          backfillEventFilter(event._id),
          { $set: reviewSet(event, {
            originalInput,
            reason,
            candidate: confidence >= thresholds.reviewConfidence ? candidate : undefined,
            candidates: confidence >= thresholds.reviewConfidence ? candidates : undefined,
            confidence: Number.isFinite(confidence) ? confidence : undefined,
            scope,
            batchWeek,
            candidateCount: providerMatchCount,
            now,
          }) },
        );
        if (!result.modifiedCount) counts.skipped += 1;
      }
    }

    checkpoint = event._id;
    if (!dryRun) {
      await persistCheckpoint(
        RunModel,
        stateFilter,
        checkpoint,
        addCounts(priorRun?.cumulativeCounts, counts),
      );
    }
  }

  const hasMore = Boolean(pausedError) || quotaReached || page.length > batchSize;
  const status = pausedError
    ? 'paused'
    : quotaReached
      ? 'quota_reached'
      : hasMore ? 'batch_complete' : 'completed';
  const finishedAt = dateNow();
  const cumulativeCounts = addCounts(priorRun?.cumulativeCounts, counts);
  const summary = {
    scope,
    ...(batchWeek ? { batchWeek } : {}),
    catalogAsOf,
    startedAt,
    finishedAt,
    status,
    batchSize,
    maxProviderOperations,
    minIntervalMs: pacer.intervalMs,
    ...thresholds,
    counts,
    ...(pausedError ? {
      lastErrorCode: trimString(pausedError.code) || 'GOOGLE_LOCATION_FAILED',
    } : {}),
  };

  if (!dryRun) {
    await persistAudit(RunModel, stateFilter, {
      checkpoint,
      cumulativeCounts,
      summary,
      finishedAt,
    });
  }

  return {
    tenantKey,
    scope,
    batchWeek,
    catalogAsOf,
    dryRun,
    status,
    hasMore,
    checkpoint: checkpoint ? String(checkpoint) : null,
    counts,
    cumulativeCounts,
    items,
    auditSummary: summary,
  };
}

module.exports = {
  runLocationBackfill,
  createProviderPacer,
  confidenceThresholds,
  normalizeBackfillScope,
  normalizeBatchWeek,
  resolvedPhysicalLocation,
  classifyLegacyLocation,
  categoricalLocation,
  isBroadProviderLocation,
  approximateLocationFromCanonical,
  emptyCounts,
  constants: {
    DEFAULT_BATCH_SIZE,
    MAX_BATCH_SIZE,
    DEFAULT_MIN_INTERVAL_MS,
    DEFAULT_AUTO_APPLY_CONFIDENCE,
    DEFAULT_REVIEW_CONFIDENCE,
    AUDIT_HISTORY_LIMIT,
    MAX_PROVIDER_OPERATIONS_PER_BATCH,
    LIVE_SCOPE,
    HISTORICAL_SCOPE,
  },
};
