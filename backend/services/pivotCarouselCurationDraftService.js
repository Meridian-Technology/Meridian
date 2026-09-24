/**
 * Persist a curation draft, revalidate its selection, and create or revise
 * an issue only after the author has named it.
 */

const { FORMATS } = require('../schemas/pivotCarouselAccount');
const getGlobalModels = require('./getGlobalModelService');
const { loadAccount, createCarouselIssue, getCarouselIssue, ISSUE_LIMITS } = require('./pivotCarouselIssueService');
const { parseCurationQuery } = require('./pivotCarouselCurationQuery');
const { loadCurationSnapshots } = require('./pivotCarouselCurationQueryService');
const {
  COVER_PRESETS,
  EVENT_PRESETS,
  MAX_SELECTED,
  eventRefKey,
  normalizeSelection,
  slideEstimate,
  selectionWarnings,
  snapshotChanges,
  generateIssueDocument,
  applyCurationToDocument,
} = require('./pivotCarouselCurationDraft');

function fail(error, status, code, extra = {}) {
  return { error, status, code, ...extra };
}

function actorId(req) {
  return req.user?.globalUserId || req.user?.userId || null;
}

function text(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function asId(value) {
  return value && String(value).match(/^[0-9a-f]{24}$/i) ? String(value) : null;
}

function serializeDraft(doc) {
  const row = doc.toObject ? doc.toObject() : doc;
  const estimate = slideEstimate((row.selected || []).length);
  return {
    id: String(row._id),
    accountId: String(row.accountId),
    issueId: row.issueId ? String(row.issueId) : null,
    format: row.format,
    query: row.query || {},
    selected: row.selected || [],
    theme: row.theme || '',
    recapNotes: row.recapNotes || {},
    coverPreset: row.coverPreset,
    eventPreset: row.eventPreset,
    revision: row.revision || 1,
    status: row.status,
    idempotencyKey: row.idempotencyKey || null,
    createdIssueId: row.createdIssueId ? String(row.createdIssueId) : null,
    estimate,
    warnings: selectionWarnings(row.selected || [], { format: row.format }),
    limits: { ...ISSUE_LIMITS, maxSelected: MAX_SELECTED },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function parseBody(body = {}) {
  const format = body.format;
  if (format && !FORMATS.includes(format)) return fail('Unknown issue format.', 400, 'FORMAT_INVALID');
  if (body.query) {
    const parsed = parseCurationQuery({ ...body.query, cursor: null });
    if (parsed.error) return parsed;
  }
  const coverPreset = body.coverPreset ? text(body.coverPreset, 40) : null;
  if (coverPreset && !COVER_PRESETS.includes(coverPreset)) {
    return fail('Unknown cover preset.', 400, 'UNSUPPORTED_FILTER');
  }
  const eventPreset = body.eventPreset ? text(body.eventPreset, 40) : null;
  if (eventPreset && !EVENT_PRESETS.includes(eventPreset)) {
    return fail('Unknown event preset.', 400, 'UNSUPPORTED_FILTER');
  }
  return {
    format: format || null,
    query: body.query ? parseCurationQuery({ ...body.query, cursor: null }).spec : null,
    selected: body.selected !== undefined ? normalizeSelection(body.selected).selected : null,
    theme: body.theme !== undefined ? text(body.theme, 120) : undefined,
    recapNotes: body.recapNotes && typeof body.recapNotes === 'object' ? body.recapNotes : undefined,
    coverPreset,
    eventPreset,
    issueId: asId(body.issueId),
    idempotencyKey: body.idempotencyKey ? text(body.idempotencyKey, 128) : null,
  };
}

async function loadDraft(req, accountId, draftId) {
  const loaded = await loadAccount(req, accountId);
  if (loaded.error) return loaded;
  if (!asId(draftId)) return fail('Curation draft not found.', 404, 'DRAFT_NOT_FOUND');
  const { PivotCarouselCurationDraft } = getGlobalModels(req, 'PivotCarouselCurationDraft');
  const doc = await PivotCarouselCurationDraft.findOne({ _id: draftId, accountId: loaded.account._id });
  if (!doc) return fail('Curation draft not found.', 404, 'DRAFT_NOT_FOUND');
  return { account: loaded.account, draft: doc };
}

async function createCurationDraft(req, accountId, body = {}) {
  const loaded = await loadAccount(req, accountId);
  if (loaded.error) return loaded;
  const parsed = parseBody(body);
  if (parsed.error) return parsed;
  if (parsed.selected && parsed.selected.length > MAX_SELECTED) {
    return fail(
      `Select at most ${MAX_SELECTED} events so the cover still fits the slide cap.`,
      422,
      'SLIDE_CAP',
      { limits: ISSUE_LIMITS, estimate: slideEstimate(parsed.selected.length) },
    );
  }
  if (parsed.issueId) {
    const issue = await getCarouselIssue(req, accountId, parsed.issueId);
    if (issue.error) return issue;
  }
  const { PivotCarouselCurationDraft } = getGlobalModels(req, 'PivotCarouselCurationDraft');
  const doc = await PivotCarouselCurationDraft.create({
    accountId: loaded.account._id,
    issueId: parsed.issueId,
    format: parsed.format || loaded.account.defaultFormat,
    query: parsed.query || {},
    selected: parsed.selected || [],
    theme: parsed.theme || '',
    recapNotes: parsed.recapNotes || {},
    coverPreset: parsed.coverPreset || 'loose-letters',
    eventPreset: parsed.eventPreset || 'photo-note',
    createdBy: actorId(req),
    updatedBy: actorId(req),
  });
  return { data: { draft: serializeDraft(doc) } };
}

async function getCurationDraft(req, accountId, draftId) {
  const loaded = await loadDraft(req, accountId, draftId);
  if (loaded.error) return loaded;
  return { data: { draft: serializeDraft(loaded.draft) } };
}

async function updateCurationDraft(req, accountId, draftId, body = {}) {
  const loaded = await loadDraft(req, accountId, draftId);
  if (loaded.error) return loaded;
  if (loaded.draft.status === 'consumed') {
    return fail('This curation draft already created an issue.', 409, 'DRAFT_CONSUMED', {
      createdIssueId: String(loaded.draft.createdIssueId || ''),
    });
  }
  const parsed = parseBody(body);
  if (parsed.error) return parsed;
  if (parsed.selected && parsed.selected.length > MAX_SELECTED) {
    return fail(
      `Select at most ${MAX_SELECTED} events so the cover still fits the slide cap.`,
      422,
      'SLIDE_CAP',
      { limits: ISSUE_LIMITS, estimate: slideEstimate(parsed.selected.length) },
    );
  }
  if (parsed.format) loaded.draft.format = parsed.format;
  if (parsed.query) loaded.draft.query = parsed.query;
  if (parsed.selected) loaded.draft.selected = parsed.selected;
  if (parsed.theme !== undefined) loaded.draft.theme = parsed.theme;
  if (parsed.recapNotes) loaded.draft.recapNotes = parsed.recapNotes;
  if (parsed.coverPreset) loaded.draft.coverPreset = parsed.coverPreset;
  if (parsed.eventPreset) loaded.draft.eventPreset = parsed.eventPreset;
  if (parsed.issueId) loaded.draft.issueId = parsed.issueId;
  if (parsed.idempotencyKey && !loaded.draft.idempotencyKey) {
    loaded.draft.idempotencyKey = parsed.idempotencyKey;
  }
  loaded.draft.revision = (loaded.draft.revision || 1) + 1;
  loaded.draft.updatedBy = actorId(req);
  loaded.draft.markModified('selected');
  loaded.draft.markModified('query');
  await loaded.draft.save();
  return { data: { draft: serializeDraft(loaded.draft) } };
}

function compareSelection(previous, liveByKey, { requirePublished = true } = {}) {
  const missing = [];
  const changed = [];
  const unavailable = [];
  const next = [];
  for (const item of previous) {
    const live = liveByKey.get(eventRefKey(item.ref));
    if (!live) {
      missing.push(item.ref);
      continue;
    }
    if (requirePublished && live.provenance?.publication && live.provenance.publication !== 'published') {
      unavailable.push({ ref: item.ref, publication: live.provenance.publication });
    }
    const fields = snapshotChanges(item.snapshot, live.snapshot);
    if (fields.length) changed.push({ ref: item.ref, fields });
    next.push({
      ...item,
      snapshot: live.snapshot,
      provenance: live.provenance,
      inspectUnreleased: live.inspectUnreleased,
    });
  }
  return { missing, changed, unavailable, selected: next };
}

async function revalidateCurationDraft(req, accountId, draftId, options = {}) {
  const loaded = await loadDraft(req, accountId, draftId);
  if (loaded.error) return loaded;
  const snapshots = await loadCurationSnapshots(
    req,
    loaded.account,
    loaded.draft.selected.map((item) => item.ref),
    { now: options.now },
  );
  if (snapshots.error) return snapshots;
  const requirePublished = loaded.draft.query?.publication !== 'inspect-unreleased';
  const report = compareSelection(loaded.draft.selected, snapshots.data.byKey, { requirePublished });
  loaded.draft.selected = report.selected;
  loaded.draft.revision = (loaded.draft.revision || 1) + 1;
  loaded.draft.updatedBy = actorId(req);
  loaded.draft.markModified('selected');
  await loaded.draft.save();
  return {
    data: {
      draft: serializeDraft(loaded.draft),
      revalidation: {
        missing: report.missing,
        changed: report.changed,
        unavailable: report.unavailable,
        failures: snapshots.data.failures,
        complete: snapshots.data.failures.length === 0,
      },
    },
  };
}

function curationPayload(draft, selected) {
  return {
    draftId: String(draft._id),
    format: draft.format,
    query: draft.query,
    theme: draft.theme,
    coverPreset: draft.coverPreset,
    eventPreset: draft.eventPreset,
    refs: selected.map((item) => item.ref),
    snapshots: selected.map((item) => ({
      ref: item.ref,
      snapshot: item.snapshot,
      capturedAt: item.provenance?.capturedAt || null,
    })),
  };
}

async function createIssueFromCurationDraft(req, accountId, draftId, body = {}) {
  const loaded = await loadDraft(req, accountId, draftId);
  if (loaded.error) return loaded;
  const name = text(body.name, 80);
  if (!name) return fail('An issue name is required.', 400, 'NAME_REQUIRED');
  const idempotencyKey = text(body.idempotencyKey || loaded.draft.idempotencyKey, 128);
  if (!idempotencyKey) return fail('An idempotency key is required.', 400, 'IDEMPOTENCY_REQUIRED');

  const { PivotCarouselCurationDraft, PivotCarouselDeck } = getGlobalModels(
    req,
    'PivotCarouselCurationDraft',
    'PivotCarouselDeck',
  );
  if (loaded.draft.createdIssueId) {
    const existing = await getCarouselIssue(req, accountId, loaded.draft.createdIssueId);
    if (!existing.error) return { data: { issue: existing.data.issue, reused: true } };
  }
  const reused = await PivotCarouselCurationDraft.findOne({
    accountId: loaded.account._id,
    idempotencyKey,
    createdIssueId: { $ne: null },
  });
  if (reused?.createdIssueId) {
    const existing = await getCarouselIssue(req, accountId, reused.createdIssueId);
    if (!existing.error) return { data: { issue: existing.data.issue, reused: true } };
  }

  const validated = await revalidateCurationDraft(req, accountId, draftId, { now: body.now });
  if (validated.error) return validated;
  const draft = (await loadDraft(req, accountId, draftId)).draft;
  const selected = draft.selected || [];
  if (!selected.length) return fail('Select at least one event.', 400, 'SELECTION_REQUIRED');
  if (!body.acceptChanges && (
    validated.data.revalidation.missing.length
    || validated.data.revalidation.unavailable.length
    || !validated.data.revalidation.complete
  )) {
    return fail(
      'The selection changed. Review the report before creating the issue.',
      409,
      'SELECTION_STALE',
      { details: validated.data.revalidation },
    );
  }
  const usable = selected.filter((item) => {
    const key = eventRefKey(item.ref);
    return !validated.data.revalidation.missing.some((ref) => eventRefKey(ref) === key)
      && !validated.data.revalidation.unavailable.some((row) => eventRefKey(row.ref) === key);
  });
  if (!usable.length) return fail('No selected events are still available.', 409, 'SELECTION_EMPTY');
  const estimate = slideEstimate(usable.length);
  if (estimate.overflow) {
    return fail(`An issue can hold ${ISSUE_LIMITS.maxSlides} slides.`, 422, 'SLIDE_CAP', {
      limits: ISSUE_LIMITS,
      estimate,
    });
  }

  const document = generateIssueDocument({
    selected: usable,
    theme: draft.theme,
    coverPreset: draft.coverPreset,
    eventPreset: draft.eventPreset,
  });
  const created = await createCarouselIssue(req, accountId, {
    name,
    format: draft.format,
    document,
    sources: usable.map((item) => item.ref),
    curation: {
      ...curationPayload(draft, usable),
      idempotencyKey,
    },
  });
  if (created.error) return created;

  draft.status = 'consumed';
  draft.idempotencyKey = idempotencyKey;
  draft.createdIssueId = created.data.issue.id;
  draft.selected = usable;
  draft.updatedBy = actorId(req);
  try {
    await draft.save();
  } catch (err) {
    if (err?.code === 11000) {
      const other = await PivotCarouselCurationDraft.findOne({ idempotencyKey });
      if (other?.createdIssueId) {
        await PivotCarouselDeck.deleteOne({ _id: created.data.issue.id, accountId });
        const existing = await getCarouselIssue(req, accountId, other.createdIssueId);
        if (!existing.error) return { data: { issue: existing.data.issue, reused: true } };
      }
    }
    throw err;
  }
  return { data: { issue: created.data.issue, reused: false, revalidation: validated.data.revalidation } };
}

async function applyCurationDraftToIssue(req, accountId, draftId, body = {}) {
  const loaded = await loadDraft(req, accountId, draftId);
  if (loaded.error) return loaded;
  const issueId = asId(body.issueId || loaded.draft.issueId);
  if (!issueId) return fail('Issue not found.', 404, 'ISSUE_NOT_FOUND');
  const issueLoaded = await getCarouselIssue(req, accountId, issueId);
  if (issueLoaded.error) return issueLoaded;
  const issue = issueLoaded.data.issue;
  if (!Number.isInteger(body.revision)) {
    return fail('The issue revision is required.', 400, 'REVISION_REQUIRED');
  }

  const validated = await revalidateCurationDraft(req, accountId, draftId, { now: body.now });
  if (validated.error) return validated;
  if (!body.acceptChanges && (
    validated.data.revalidation.missing.length
    || validated.data.revalidation.unavailable.length
    || !validated.data.revalidation.complete
  )) {
    return fail(
      'The selection changed. Review the report before updating the issue.',
      409,
      'SELECTION_STALE',
      { details: validated.data.revalidation },
    );
  }

  const draft = (await loadDraft(req, accountId, draftId)).draft;
  const selected = draft.selected || [];
  const previousRefs = (issue.curation?.refs || issue.sources || []).map((ref) => (
    ref.sourceTenantKey ? ref : ref.ref
  ));
  const applied = applyCurationToDocument(issue.document, {
    previousRefs,
    selected,
    theme: draft.theme,
    coverPreset: draft.coverPreset,
    eventPreset: draft.eventPreset,
  });
  if (applied.document.slides.length > ISSUE_LIMITS.maxSlides) {
    return fail(`An issue can hold ${ISSUE_LIMITS.maxSlides} slides.`, 422, 'SLIDE_CAP', {
      limits: ISSUE_LIMITS,
      estimate: applied.estimate,
      details: applied.diff,
    });
  }

  const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
  const doc = await PivotCarouselDeck.findOne({ _id: issueId, accountId });
  if ((doc.revision || 1) !== body.revision) {
    return fail('The issue changed since it was opened.', 409, 'REVISION_CONFLICT', {
      storedRevision: doc.revision || 1,
      presentedRevision: body.revision,
    });
  }
  doc.document = applied.document;
  doc.schemaVersion = 2;
  doc.sources = selected.map((item) => item.ref);
  doc.curation = {
    ...(doc.curation || {}),
    ...curationPayload(draft, selected),
    diff: applied.diff,
  };
  doc.markModified('document');
  doc.markModified('curation');
  doc.revision = (doc.revision || 1) + 1;
  doc.updatedBy = actorId(req);
  await doc.save();
  draft.issueId = doc._id;
  draft.status = 'consumed';
  draft.createdIssueId = doc._id;
  draft.updatedBy = actorId(req);
  await draft.save();
  return {
    data: {
      issue: (await getCarouselIssue(req, accountId, issueId)).data.issue,
      diff: applied.diff,
      revalidation: validated.data.revalidation,
    },
  };
}

module.exports = {
  createCurationDraft,
  getCurationDraft,
  updateCurationDraft,
  revalidateCurationDraft,
  createIssueFromCurationDraft,
  applyCurationDraftToIssue,
  serializeDraft,
  compareSelection,
};
