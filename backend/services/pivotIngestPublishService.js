const getModels = require('./getModelService');
const {
  getMergedTenants,
  provisionPivotCatalogOrg,
} = require('./tenantConfigService');
const { isPivotTenant } = require('./pivotReferralCodeService');
const { connectToDatabase } = require('../connectionsManager');
const { normalizeBatchWeek } = require('./pivotWeeklySnapshotService');
const { resolveEventBatchWeek } = require('../utilities/pivotIsoWeek');
const { previewIngestUrl, sanitizeEventPosterImage } = require('./pivotIngestPreviewService');
const {
  formatDuplicateWarning,
  isBlockingDuplicate,
  resolveImportDuplicate,
} = require('./pivotIngestDuplicateService');
const { serializeLabEvent } = require('./pivotLabEventsService');
const { validatePivotEventTags } = require('./pivotTagCatalogService');
const { normalizePivotTimeSlots } = require('../utilities/pivotTimeSlots');
const {
  normalizePivotMovie,
  applyMovieListingDefaults,
} = require('../utilities/pivotMovieMetadata');
const { logPivot, pivotRequestContext } = require('../utilities/pivotLogger');
const {
  normalizeIngestStatus,
  PIVOT_FEED_INGEST_STATUS,
} = require('../utilities/pivotIngestStatus');

const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;
/** Default for new Lab / URL / JSON ingest — not live until Release (Task 3.2). */
const DEFAULT_INGEST_STATUS = 'staged';
/** Typed confirm for emergency ingest that writes `published` immediately. */
const RELEASE_NOW_CONFIRM_TOKEN = 'RELEASE_NOW';

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const trimmed = trimString(value);
    if (trimmed) return trimmed;
  }
  return null;
}

function parseDateTime(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveImportedBy(req) {
  return (
    trimString(req.user?.email) ||
    trimString(req.user?.globalUserId) ||
    trimString(req.user?.userId) ||
    'pivot-lab'
  );
}

async function resolvePivotTenant(req, tenantKey) {
  const normalizedKey = tenantKey?.trim()?.toLowerCase();
  if (!normalizedKey) {
    return {
      error: 'tenantKey is required.',
      status: 400,
      code: 'TENANT_KEY_REQUIRED',
    };
  }

  const pivotTenants = (await getMergedTenants(req)).filter(isPivotTenant);
  const tenant = pivotTenants.find((row) => row.tenantKey === normalizedKey);
  if (!tenant) {
    return {
      error: 'Pivot tenant not found.',
      status: 404,
      code: 'TENANT_NOT_FOUND',
    };
  }

  return { tenant };
}

async function resolveCatalogOrgId(req, tenant) {
  if (tenant.pivotCatalogOrgId) {
    return { orgId: tenant.pivotCatalogOrgId };
  }

  const provisioned = await provisionPivotCatalogOrg(req, tenant.tenantKey, tenant);
  return { orgId: provisioned.orgId };
}

function detectIngestProvider(hostname) {
  const host = hostname.toLowerCase();
  if (host.includes('partiful')) return 'partiful';
  if (host.includes('lu.ma') || host.includes('luma')) return 'luma';
  return null;
}

function normalizePublishUrl(rawUrl) {
  const trimmed = trimString(rawUrl);
  if (!trimmed) {
    return { url: null, provider: null };
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { error: 'Invalid URL.', status: 400, code: 'INVALID_URL' };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { error: 'Only HTTP(S) URLs are supported.', status: 400, code: 'INVALID_URL' };
  }

  return {
    url: parsed.toString(),
    provider: detectIngestProvider(parsed.hostname),
  };
}

function normalizeIngestTimeSlots(rawSlots) {
  if (!Array.isArray(rawSlots) || !rawSlots.length) {
    return [];
  }

  return normalizePivotTimeSlots(rawSlots).map((slot) => ({
    id: slot.id,
    start_time: slot.start_time,
    ...(slot.end_time ? { end_time: slot.end_time } : {}),
    ...(slot.label ? { label: slot.label } : {}),
  }));
}

function mergeDraftWithOverrides(draft = {}, overrides = {}) {
  const timeSlots = normalizeIngestTimeSlots(
    Array.isArray(overrides.timeSlots)
      ? overrides.timeSlots
      : Array.isArray(draft.timeSlots)
        ? draft.timeSlots
        : [],
  );

  return {
    name: firstNonEmpty(overrides.name, draft.name),
    description: firstNonEmpty(overrides.description, draft.description) || '',
    image: sanitizeEventPosterImage(firstNonEmpty(overrides.image, draft.image)),
    location: firstNonEmpty(overrides.location, draft.location),
    start_time: firstNonEmpty(overrides.start_time, draft.start_time),
    end_time: firstNonEmpty(overrides.end_time, draft.end_time),
    hostName: firstNonEmpty(overrides.hostName, draft.hostName),
    hostImageUrl: null,
    hostProfileUrl: firstNonEmpty(overrides.hostProfileUrl, draft.hostProfileUrl),
    source: firstNonEmpty(overrides.source, draft.source),
    sourceUrl: firstNonEmpty(overrides.sourceUrl, draft.sourceUrl),
    tags: Array.isArray(overrides.tags)
      ? overrides.tags
      : Array.isArray(draft.tags)
        ? draft.tags
        : [],
    timeSlots,
    movie: normalizePivotMovie(
      overrides.movie !== undefined ? overrides.movie : draft.movie,
    ),
  };
}

function validateMergedDraft(merged) {
  const withMovieDefaults = applyMovieListingDefaults(merged);
  const missing = [];
  if (!withMovieDefaults.hostName) missing.push('hostName');
  if (!withMovieDefaults.name) missing.push('name');
  if (!withMovieDefaults.location) missing.push('location');
  if (!withMovieDefaults.start_time && !withMovieDefaults.timeSlots?.length) {
    missing.push('start_time');
  }

  if (missing.length) {
    return {
      error: `Missing required fields after merge: ${missing.join(', ')}.`,
      status: 400,
      code: 'MISSING_REQUIRED_FIELDS',
    };
  }

  const slots = normalizePivotTimeSlots(withMovieDefaults.timeSlots);
  let startTime = parseDateTime(withMovieDefaults.start_time);
  let endTime = parseDateTime(withMovieDefaults.end_time);

  if (slots.length) {
    if (!startTime) {
      startTime = slots[0].start_time;
    }
    if (!endTime) {
      endTime = slots.reduce((latest, slot) => {
        const candidate = slot.end_time || slot.start_time;
        return !latest || candidate > latest ? candidate : latest;
      }, null);
    }
  }

  if (!startTime) {
    return {
      error: 'start_time must be a valid datetime.',
      status: 400,
      code: 'INVALID_START_TIME',
    };
  }

  if (!endTime || endTime <= startTime) {
    endTime = new Date(startTime.getTime() + DEFAULT_DURATION_MS);
  }

  return {
    merged: {
      ...withMovieDefaults,
      timeSlots: slots,
      startTime,
      endTime,
    },
  };
}

function buildPivotMetadata(merged, { batchWeek, sourceUrl, importedBy, tags, ingestStatus }) {
  const host = {
    name: merged.hostName,
    ...(merged.hostProfileUrl ? { profileUrl: merged.hostProfileUrl } : {}),
  };

  return {
    batchWeek,
    source: merged.source || 'manual',
    sourceUrl,
    host,
    tags: tags || [],
    ...(merged.timeSlots?.length ? { timeSlots: merged.timeSlots } : {}),
    ...(merged.movie ? { movie: merged.movie } : {}),
    ingestStatus: ingestStatus || DEFAULT_INGEST_STATUS,
    importedAt: new Date().toISOString(),
    importedBy,
  };
}

/**
 * Resolve ingestStatus for a new catalog write.
 * Default: staged (hidden from feed until Release).
 * Emergency: releaseNow + confirm RELEASE_NOW → published.
 * Overrides may set draft|staged only (not published without releaseNow).
 */
function resolveCreateIngestStatus(options = {}, overrides = {}) {
  if (options.releaseNow) {
    const confirm = String(options.confirm || '').trim();
    if (confirm !== RELEASE_NOW_CONFIRM_TOKEN) {
      return {
        error: `Type ${RELEASE_NOW_CONFIRM_TOKEN} to confirm stage & release now. This puts the event in the live feed immediately.`,
        status: 400,
        code: 'CONFIRMATION_REQUIRED',
      };
    }
    return { ingestStatus: PIVOT_FEED_INGEST_STATUS };
  }

  if (overrides.ingestStatus !== undefined) {
    const statusResult = normalizeIngestStatus(overrides.ingestStatus);
    if (statusResult.error) {
      return statusResult;
    }
    if (statusResult.ingestStatus === PIVOT_FEED_INGEST_STATUS) {
      return {
        error:
          'New ingest cannot set ingestStatus to published. Stage the event, then use Release — or pass releaseNow with confirm RELEASE_NOW.',
        status: 400,
        code: 'RELEASE_CONFIRM_REQUIRED',
      };
    }
    return statusResult;
  }

  return { ingestStatus: DEFAULT_INGEST_STATUS };
}

function buildEventPayload(merged, { catalogOrgId, sourceUrl, batchWeek, importedBy, tags, ingestStatus }) {
  const listingUrl = trimString(sourceUrl) || null;
  return {
    name: merged.name,
    description: merged.description || '',
    type: 'social',
    location: merged.location,
    start_time: merged.startTime,
    end_time: merged.endTime,
    status: 'not-applicable',
    visibility: 'public',
    registrationEnabled: true,
    expectedAttendance: 0,
    ...(listingUrl ? { externalLink: listingUrl } : {}),
    hostingType: 'Org',
    hostingId: catalogOrgId,
    isDeleted: false,
    ...(merged.image ? { image: merged.image } : {}),
    customFields: {
      pivot: buildPivotMetadata(merged, {
        batchWeek,
        sourceUrl,
        importedBy,
        tags,
        ingestStatus,
      }),
    },
  };
}

async function savePublishedCatalogEvent(tenantReq, eventPayload, sourceUrl, updateEventId) {
  const { Event } = getModels(tenantReq, 'Event');

  // A fuzzy (fingerprint) duplicate resolves to a specific existing event that may have a
  // different or no source URL, so update it by id rather than upserting on sourceUrl.
  if (updateEventId) {
    const updated = await Event.findByIdAndUpdate(
      updateEventId,
      { $set: eventPayload },
      { new: true, runValidators: true },
    ).lean();
    if (updated) {
      return updated;
    }
  }

  const listingUrl = trimString(sourceUrl);
  if (listingUrl) {
    return Event.findOneAndUpdate(
      { 'customFields.pivot.sourceUrl': listingUrl },
      { $set: eventPayload },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    ).lean();
  }

  const created = await Event.create(eventPayload);
  return typeof created.toObject === 'function' ? created.toObject() : created;
}

async function publishIngestEvent(req, options = {}) {
  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) {
    return tenantResult;
  }

  const overrides = options.overrides || {};
  const urlNormalized = normalizePublishUrl(options.url);
  if (urlNormalized.error) {
    return urlNormalized;
  }

  let previewDraft = {};
  if (options.draft && typeof options.draft === 'object') {
    // Crawler / batch path: reuse already-parsed explore drafts (skip per-URL refetch).
    previewDraft = options.draft;
  } else if (urlNormalized.url && urlNormalized.provider) {
    const previewResult = await previewIngestUrl(req, { url: urlNormalized.url });
    if (previewResult.error) {
      return previewResult;
    }

    if (previewResult.data?.mode === 'batch') {
      return {
        error: 'Explore links must be published from batch import.',
        status: 400,
        code: 'BATCH_URL_REQUIRES_BATCH_PUBLISH',
      };
    }

    previewDraft = previewResult.data?.draft || {};
  } else if (urlNormalized.url) {
    previewDraft = {
      sourceUrl: urlNormalized.url,
      source: firstNonEmpty(overrides.source) || 'manual',
    };
  } else {
    previewDraft = {
      source: firstNonEmpty(overrides.source) || 'manual',
      sourceUrl: firstNonEmpty(overrides.sourceUrl),
    };
  }

  const mergedInput = mergeDraftWithOverrides(previewDraft, overrides);
  mergedInput.sourceUrl = firstNonEmpty(urlNormalized.url, mergedInput.sourceUrl);
  mergedInput.source =
    firstNonEmpty(mergedInput.source, urlNormalized.provider) || 'manual';

  const validated = validateMergedDraft(mergedInput);
  if (validated.error) {
    return validated;
  }

  // Default: batchWeek from the event's actual start date. Override with forceBatchWeek.
  const weekResolved = resolveEventBatchWeek({
    forceBatchWeek: options.forceBatchWeek,
    batchWeek: options.batchWeek,
    startTime: validated.merged.startTime || validated.merged.start_time,
    timeSlots: validated.merged.timeSlots,
    now: options.now,
  });
  if (weekResolved.error) {
    return weekResolved;
  }
  const resolvedBatchWeek = weekResolved.batchWeek;

  const tagsRequired = options.tagsRequired !== false;
  const tagResult = await validatePivotEventTags(req, mergedInput.tags, { required: tagsRequired });
  if (tagResult.error) {
    return tagResult;
  }

  const listingUrl = trimString(mergedInput.sourceUrl) || null;
  const { duplicate } = await resolveImportDuplicate(req, {
    tenantKey: tenantResult.tenant.tenantKey,
    candidate: {
      name: validated.merged.name,
      start_time: validated.merged.start_time,
      location: validated.merged.location,
      sourceUrl: listingUrl,
    },
  });

  // Batch-internal collisions (two rows of the same import) have nothing to update against.
  if (isBlockingDuplicate(duplicate)) {
    return {
      error: formatDuplicateWarning(duplicate, validated.merged.name),
      status: 409,
      code: 'DUPLICATE_EVENT',
      data: { duplicate },
    };
  }

  // sourceUrl and fingerprint matches resolve to an existing catalog event — update it.
  const updateEventId =
    duplicate?.willUpdate && duplicate?.existingEventId ? duplicate.existingEventId : null;

  const ingestStatusResult = resolveCreateIngestStatus(options, overrides);
  if (ingestStatusResult.error) {
    return ingestStatusResult;
  }

  const catalogResult = await resolveCatalogOrgId(req, tenantResult.tenant);
  const importedBy = resolveImportedBy(req);

  const db = await connectToDatabase(tenantResult.tenant.tenantKey);
  const tenantReq = { db };
  const { Event } = getModels(tenantReq, 'Event');

  // Re-import must not demote a live published event back to staged unless ops
  // explicitly asked for draft/staged or emergency releaseNow.
  let ingestStatus = ingestStatusResult.ingestStatus;
  if (
    updateEventId &&
    !options.releaseNow &&
    overrides.ingestStatus === undefined
  ) {
    const existing = await Event.findById(updateEventId)
      .select('customFields.pivot.ingestStatus')
      .lean();
    const existingStatus = existing?.customFields?.pivot?.ingestStatus;
    if (existingStatus === PIVOT_FEED_INGEST_STATUS || existingStatus === 'draft' || existingStatus === 'staged') {
      ingestStatus = existingStatus;
    }
  } else if (
    !updateEventId &&
    listingUrl &&
    !options.releaseNow &&
    overrides.ingestStatus === undefined
  ) {
    const existingByUrl = await Event.findOne({
      'customFields.pivot.sourceUrl': listingUrl,
    })
      .select('customFields.pivot.ingestStatus')
      .lean();
    const existingStatus = existingByUrl?.customFields?.pivot?.ingestStatus;
    if (existingStatus === PIVOT_FEED_INGEST_STATUS || existingStatus === 'draft' || existingStatus === 'staged') {
      ingestStatus = existingStatus;
    }
  }

  const eventPayload = buildEventPayload(validated.merged, {
    catalogOrgId: catalogResult.orgId,
    sourceUrl: listingUrl,
    batchWeek: resolvedBatchWeek,
    importedBy,
    tags: tagResult.tags,
    ingestStatus,
  });

  const event = await savePublishedCatalogEvent(tenantReq, eventPayload, listingUrl, updateEventId);
  const updatedExisting = Boolean(updateEventId);

  logPivot('info', updatedExisting ? 'catalog event updated' : 'catalog event staged', {
    tenantKey: tenantResult.tenant.tenantKey,
    batchWeek: resolvedBatchWeek,
    batchWeekSource: weekResolved.source,
    eventId: String(event._id),
    name: event.name,
    source: mergedInput.source,
    ingestStatus,
    releaseNow: Boolean(options.releaseNow),
    timeSlotCount: validated.merged.timeSlots?.length ?? 0,
    duplicateMatch: duplicate?.matchType || null,
    importedBy,
  });

  return {
    data: {
      event: serializeLabEvent(event),
      created: !updatedExisting,
      updated: updatedExisting,
      ingestStatus,
      batchWeek: resolvedBatchWeek,
      batchWeekSource: weekResolved.source,
    },
  };
}

async function publishBatchIngestEvents(req, options = {}) {
  const forceBatchWeek = Boolean(options.forceBatchWeek);
  if (forceBatchWeek) {
    const batchNormalized = normalizeBatchWeek(options.batchWeek, options.now);
    if (batchNormalized.error) {
      return batchNormalized;
    }
  } else if (options.batchWeek != null && String(options.batchWeek).trim()) {
    // Optional fallback week when an event has no start date.
    const batchNormalized = normalizeBatchWeek(options.batchWeek, options.now);
    if (batchNormalized.error) {
      return batchNormalized;
    }
  }

  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) {
    return tenantResult;
  }

  const events = Array.isArray(options.events) ? options.events : [];
  if (!events.length) {
    return {
      error: 'At least one event is required.',
      status: 400,
      code: 'EVENTS_REQUIRED',
    };
  }

  const published = [];
  const failures = [];
  let updatedCount = 0;
  const batchWeekCounts = {};

  for (const entry of events) {
    const url = trimString(entry?.url) || undefined;
    const entryForce =
      entry?.forceBatchWeek !== undefined
        ? Boolean(entry.forceBatchWeek)
        : forceBatchWeek;
    const entryWeek =
      entry?.batchWeek !== undefined ? entry.batchWeek : options.batchWeek;

    const result = await publishIngestEvent(req, {
      tenantKey: options.tenantKey,
      batchWeek: entryWeek,
      forceBatchWeek: entryForce,
      url,
      overrides: entry.overrides || {},
      now: options.now,
      releaseNow: options.releaseNow,
      confirm: options.confirm,
    });

    if (result.error) {
      failures.push({ url: url || null, message: result.error, code: result.code });
      continue;
    }

    if (result.data.updated) {
      updatedCount += 1;
    }
    published.push(result.data.event);
    const week = result.data.batchWeek || result.data.event?.batchWeek;
    if (week) {
      batchWeekCounts[week] = (batchWeekCounts[week] || 0) + 1;
    }
  }

  if (!published.length) {
    return {
      error: failures[0]?.message || 'Unable to stage any events.',
      status: 400,
      code: failures[0]?.code || 'BATCH_PUBLISH_FAILED',
      data: { published, failures },
    };
  }

  logPivot('info', 'batch catalog stage complete', {
    tenantKey: tenantResult.tenant.tenantKey,
    forceBatchWeek,
    batchWeekCounts,
    publishedCount: published.length,
    updatedCount,
    failedCount: failures.length,
    releaseNow: Boolean(options.releaseNow),
  });

  return {
    data: {
      published,
      failures,
      publishedCount: published.length,
      stagedCount: published.length,
      updatedCount,
      failedCount: failures.length,
      batchWeekCounts,
      forceBatchWeek,
      ingestStatus: options.releaseNow ? PIVOT_FEED_INGEST_STATUS : DEFAULT_INGEST_STATUS,
    },
  };
}

async function updateIngestEvent(req, options = {}) {
  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) {
    return tenantResult;
  }

  const eventId = trimString(options.eventId);
  if (!eventId) {
    return {
      error: 'eventId is required.',
      status: 400,
      code: 'EVENT_ID_REQUIRED',
    };
  }

  const overrides = options.overrides || {};
  const hostName = firstNonEmpty(overrides.hostName);
  if (overrides.hostName !== undefined && !hostName) {
    return {
      error: 'hostName cannot be empty.',
      status: 400,
      code: 'HOST_NAME_REQUIRED',
    };
  }

  const db = await connectToDatabase(tenantResult.tenant.tenantKey);
  const tenantReq = { db };
  const { Event } = getModels(tenantReq, 'Event');

  const existing = await Event.findOne({
    _id: eventId,
    isDeleted: { $ne: true },
    'customFields.pivot': { $exists: true },
  }).lean();

  if (!existing) {
    return {
      error: 'Pivot catalog event not found.',
      status: 404,
      code: 'EVENT_NOT_FOUND',
    };
  }

  const pivot = existing.customFields?.pivot || {};
  const host = { ...(pivot.host || {}) };
  const setPayload = {};

  if (overrides.name !== undefined) setPayload.name = trimString(overrides.name);
  if (overrides.description !== undefined) {
    setPayload.description = trimString(overrides.description);
  }
  if (overrides.location !== undefined) setPayload.location = trimString(overrides.location);
  if (overrides.image !== undefined) setPayload.image = trimString(overrides.image) || null;

  if (overrides.start_time !== undefined) {
    const startTime = parseDateTime(overrides.start_time);
    if (!startTime) {
      return {
        error: 'start_time must be a valid datetime.',
        status: 400,
        code: 'INVALID_START_TIME',
      };
    }
    setPayload.start_time = startTime;
  }

  if (overrides.end_time !== undefined) {
    const endTime = parseDateTime(overrides.end_time);
    if (!endTime) {
      return {
        error: 'end_time must be a valid datetime.',
        status: 400,
        code: 'INVALID_END_TIME',
      };
    }
    setPayload.end_time = endTime;
  }

  if (hostName) {
    host.name = hostName;
  }
  if (overrides.hostImageUrl !== undefined) {
    const imageUrl = trimString(overrides.hostImageUrl);
    if (imageUrl) host.imageUrl = imageUrl;
    else delete host.imageUrl;
  }
  if (overrides.hostProfileUrl !== undefined) {
    const profileUrl = trimString(overrides.hostProfileUrl);
    if (profileUrl) host.profileUrl = profileUrl;
    else delete host.profileUrl;
  }

  const pivotPatch = { ...pivot, host };
  if (overrides.ingestStatus !== undefined) {
    const statusResult = normalizeIngestStatus(overrides.ingestStatus);
    if (statusResult.error) {
      return statusResult;
    }
    pivotPatch.ingestStatus = statusResult.ingestStatus;
  }

  if (overrides.batchWeek !== undefined) {
    const batchNormalized = normalizeBatchWeek(overrides.batchWeek, options.now);
    if (batchNormalized.error) {
      return batchNormalized;
    }
    pivotPatch.batchWeek = batchNormalized.batchWeek;
  }

  if (overrides.tags !== undefined) {
    const tagResult = await validatePivotEventTags(req, overrides.tags, { required: false });
    if (tagResult.error) {
      return tagResult;
    }
    pivotPatch.tags = tagResult.tags;
  }

  if (overrides.timeSlots !== undefined) {
    const slots = normalizeIngestTimeSlots(overrides.timeSlots);
    if (slots.length) {
      pivotPatch.timeSlots = slots;
      if (overrides.start_time === undefined) {
        setPayload.start_time = slots[0].start_time;
      }
      if (overrides.end_time === undefined) {
        const latestEnd = slots.reduce((latest, slot) => {
          const candidate = slot.end_time || slot.start_time;
          return !latest || new Date(candidate).getTime() > new Date(latest).getTime()
            ? candidate
            : latest;
        }, null);
        if (latestEnd) {
          setPayload.end_time = latestEnd;
        }
      }
    } else {
      delete pivotPatch.timeSlots;
    }
  }

  if (overrides.sourceUrl !== undefined) {
    const sourceUrl = trimString(overrides.sourceUrl);
    if (sourceUrl) {
      pivotPatch.sourceUrl = sourceUrl;
      setPayload.externalLink = sourceUrl;
    } else {
      delete pivotPatch.sourceUrl;
      setPayload.externalLink = null;
    }
  }

  if (overrides.movie !== undefined) {
    const movie = normalizePivotMovie(overrides.movie);
    if (movie) {
      pivotPatch.movie = movie;
      if (overrides.name === undefined && movie.title) {
        setPayload.name = movie.title;
      }
      if (overrides.description === undefined && movie.synopsis) {
        setPayload.description = movie.synopsis;
      }
      if (overrides.image === undefined && movie.posterUrl) {
        setPayload.image = movie.posterUrl;
      }
    } else {
      delete pivotPatch.movie;
    }
  }

  const nextIngestStatus = pivotPatch.ingestStatus ?? pivot.ingestStatus;
  const nextTags = pivotPatch.tags ?? pivot.tags ?? [];
  if (nextIngestStatus === 'published' && nextTags.length === 0) {
    return {
      error: 'At least one catalog tag is required for published events.',
      status: 400,
      code: 'TAGS_REQUIRED',
    };
  }

  if (!host.name) {
    return {
      error: 'hostName cannot be empty.',
      status: 400,
      code: 'HOST_NAME_REQUIRED',
    };
  }

  setPayload['customFields.pivot'] = pivotPatch;

  const updated = await Event.findByIdAndUpdate(
    eventId,
    { $set: setPayload },
    { new: true, runValidators: true },
  ).lean();

  return {
    data: {
      event: serializeLabEvent(updated),
    },
  };
}

module.exports = {
  publishIngestEvent,
  publishBatchIngestEvents,
  updateIngestEvent,
  mergeDraftWithOverrides,
  validateMergedDraft,
  buildEventPayload,
  normalizePublishUrl,
  resolvePivotTenant,
  resolveCreateIngestStatus,
  DEFAULT_INGEST_STATUS,
  RELEASE_NOW_CONFIRM_TOKEN,
};
