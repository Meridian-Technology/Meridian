const getModels = require('./getModelService');
const {
  getMergedTenants,
  provisionPivotCatalogOrg,
} = require('./tenantConfigService');
const { isPivotTenant } = require('./pivotReferralCodeService');
const { connectToDatabase } = require('../connectionsManager');
const { normalizeBatchWeek } = require('./pivotWeeklySnapshotService');
const { previewIngestUrl, normalizeUrl, sanitizeEventPosterImage } = require('./pivotIngestPreviewService');
const {
  formatDuplicateWarning,
  isBlockingDuplicate,
  resolveImportDuplicate,
} = require('./pivotIngestDuplicateService');
const { serializeLabEvent } = require('./pivotLabEventsService');
const { validatePivotEventTags } = require('./pivotTagCatalogService');

const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;

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

function mergeDraftWithOverrides(draft = {}, overrides = {}) {
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
    source: draft.source || null,
    sourceUrl: draft.sourceUrl || null,
    tags: Array.isArray(overrides.tags) ? overrides.tags : [],
  };
}

function validateMergedDraft(merged) {
  const missing = [];
  if (!merged.hostName) missing.push('hostName');
  if (!merged.name) missing.push('name');
  if (!merged.location) missing.push('location');
  if (!merged.start_time) missing.push('start_time');

  if (missing.length) {
    return {
      error: `Missing required fields after merge: ${missing.join(', ')}.`,
      status: 400,
      code: 'MISSING_REQUIRED_FIELDS',
    };
  }

  const startTime = parseDateTime(merged.start_time);
  if (!startTime) {
    return {
      error: 'start_time must be a valid datetime.',
      status: 400,
      code: 'INVALID_START_TIME',
    };
  }

  let endTime = parseDateTime(merged.end_time);
  if (!endTime || endTime <= startTime) {
    endTime = new Date(startTime.getTime() + DEFAULT_DURATION_MS);
  }

  return { merged: { ...merged, startTime, endTime } };
}

function buildPivotMetadata(merged, { batchWeek, sourceUrl, importedBy, tags }) {
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
    ingestStatus: 'published',
    importedAt: new Date().toISOString(),
    importedBy,
  };
}

function buildEventPayload(merged, { catalogOrgId, sourceUrl, batchWeek, importedBy, tags }) {
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
    externalLink: sourceUrl,
    hostingType: 'Org',
    hostingId: catalogOrgId,
    isDeleted: false,
    ...(merged.image ? { image: merged.image } : {}),
    customFields: {
      pivot: buildPivotMetadata(merged, { batchWeek, sourceUrl, importedBy, tags }),
    },
  };
}

async function publishIngestEvent(req, options = {}) {
  const batchNormalized = normalizeBatchWeek(options.batchWeek, options.now);
  if (batchNormalized.error) {
    return batchNormalized;
  }

  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) {
    return tenantResult;
  }

  const urlNormalized = normalizeUrl(options.url);
  if (urlNormalized.error) {
    return urlNormalized;
  }

  const previewResult = await previewIngestUrl(req, { url: urlNormalized.url });
  if (previewResult.error) {
    return previewResult;
  }

  const previewDraft =
    previewResult.data?.mode === 'single'
      ? previewResult.data.draft
      : previewResult.data?.draft;

  if (!previewDraft) {
    return {
      error: 'Explore links must be published from batch import.',
      status: 400,
      code: 'BATCH_URL_REQUIRES_BATCH_PUBLISH',
    };
  }

  const mergedInput = mergeDraftWithOverrides(previewDraft, options.overrides || {});
  mergedInput.sourceUrl = urlNormalized.url;
  mergedInput.source = previewDraft?.source || urlNormalized.provider;

  const validated = validateMergedDraft(mergedInput);
  if (validated.error) {
    return validated;
  }

  const tagResult = await validatePivotEventTags(req, mergedInput.tags, { required: true });
  if (tagResult.error) {
    return tagResult;
  }

  const { duplicate } = await resolveImportDuplicate(req, {
    tenantKey: tenantResult.tenant.tenantKey,
    candidate: {
      name: validated.merged.name,
      start_time: validated.merged.start_time,
      location: validated.merged.location,
      sourceUrl: urlNormalized.url,
    },
  });

  if (isBlockingDuplicate(duplicate)) {
    return {
      error: formatDuplicateWarning(duplicate, validated.merged.name),
      status: 409,
      code: 'DUPLICATE_EVENT',
      data: { duplicate },
    };
  }

  const catalogResult = await resolveCatalogOrgId(req, tenantResult.tenant);
  const importedBy = resolveImportedBy(req);
  const eventPayload = buildEventPayload(validated.merged, {
    catalogOrgId: catalogResult.orgId,
    sourceUrl: urlNormalized.url,
    batchWeek: batchNormalized.batchWeek,
    importedBy,
    tags: tagResult.tags,
  });

  const db = await connectToDatabase(tenantResult.tenant.tenantKey);
  const tenantReq = { db };
  const { Event } = getModels(tenantReq, 'Event');

  const event = await Event.findOneAndUpdate(
    { 'customFields.pivot.sourceUrl': urlNormalized.url },
    { $set: eventPayload },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();

  return {
    data: {
      event: serializeLabEvent(event),
      created: true,
    },
  };
}

async function publishBatchIngestEvents(req, options = {}) {
  const batchNormalized = normalizeBatchWeek(options.batchWeek, options.now);
  if (batchNormalized.error) {
    return batchNormalized;
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

  for (const entry of events) {
    const url = trimString(entry?.url);
    if (!url) {
      failures.push({ url: null, message: 'Event URL is required.' });
      continue;
    }

    const result = await publishIngestEvent(req, {
      tenantKey: options.tenantKey,
      batchWeek: batchNormalized.batchWeek,
      url,
      overrides: entry.overrides || {},
      now: options.now,
    });

    if (result.error) {
      failures.push({ url, message: result.error, code: result.code });
      continue;
    }

    published.push(result.data.event);
  }

  if (!published.length) {
    return {
      error: failures[0]?.message || 'Unable to publish any events.',
      status: 400,
      code: failures[0]?.code || 'BATCH_PUBLISH_FAILED',
      data: { published, failures },
    };
  }

  return {
    data: {
      published,
      failures,
      publishedCount: published.length,
      failedCount: failures.length,
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
    const ingestStatus = trimString(overrides.ingestStatus);
    if (!['draft', 'published'].includes(ingestStatus)) {
      return {
        error: 'ingestStatus must be draft or published.',
        status: 400,
        code: 'INVALID_INGEST_STATUS',
      };
    }
    pivotPatch.ingestStatus = ingestStatus;
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
};
