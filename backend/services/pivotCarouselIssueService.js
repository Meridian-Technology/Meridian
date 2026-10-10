/**
 * Editorial accounts and issues.
 *
 * Issues live in the existing carousel deck collection. Legacy rows keep
 * tenantKey, title, and slides. New writes require an account, a matching
 * owner tenant, allowed source tenants, and the revision the caller read.
 */

const { randomUUID } = require('crypto');
const getGlobalModels = require('./getGlobalModelService');
const { getTenantByKey } = require('./tenantConfigService');
const { isPivotTenant } = require('../utilities/pivotDropSchedule');
const { FORMATS } = require('../schemas/pivotCarouselAccount');
const {
  MAX_SOCIAL_CAPTION_LENGTH,
  MAX_POST_HISTORY,
} = require('../schemas/pivotCarouselDeck');
const { slideTypeFor } = require('../constants/zineSlideTypes');
const {
  LIMITS: ISSUE_LIMITS,
  prepareDocument,
  materializeVoice,
} = require('./pivotCarouselDocument');

const PAGE_DEFAULT = 20;
const PAGE_MAX = 50;

function fail(error, status, code, extra = {}) {
  return { error, status, code, ...extra };
}

function actorId(req) {
  return req.user?.globalUserId || req.user?.userId || null;
}

function text(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

async function pivotTenant(req, tenantKey) {
  const key = String(tenantKey || '').trim().toLowerCase();
  if (!key) return fail('tenantKey is required.', 400, 'TENANT_KEY_REQUIRED');
  const tenant = await getTenantByKey(req, key);
  if (!tenant) return fail('Tenant not found.', 404, 'TENANT_NOT_FOUND');
  if (!isPivotTenant(tenant)) {
    return fail('Carousels are only available for Pivot city tenants.', 403, 'NOT_PIVOT_TENANT');
  }
  return { tenantKey: key };
}

function checkRevision(stored, presented) {
  if (!Number.isInteger(presented) || presented !== stored) {
    return fail('The issue changed since it was opened.', 409, 'REVISION_CONFLICT', {
      storedRevision: stored,
      presentedRevision: presented,
    });
  }
  return null;
}

function walkElements(node, visit) {
  visit(node);
  for (const child of node?.children || node?.elements || []) walkElements(child, visit);
}

function validateDocument(document) {
  const prepared = prepareDocument(document);
  if (prepared.error) return prepared;
  return null;
}

async function voiceLayers(req, account, issueVoice) {
  const { PivotCarouselVoice } = getGlobalModels(req, 'PivotCarouselVoice');
  const city = await PivotCarouselVoice.findOne({ tenantKey: account.ownerTenantKey }).lean();
  return {
    version: `city:${city?.updatedAt ? new Date(city.updatedAt).toISOString() : 'none'}`,
    city: city?.entries || {},
    account: account.voice || {},
    issue: issueVoice || {},
  };
}

function reassignIds(document) {
  if (!document) return null;
  const next = JSON.parse(JSON.stringify(document));
  const visit = (node) => {
    if (node && typeof node === 'object' && node.id) node.id = randomUUID();
  };
  for (const slide of next.slides || []) {
    slide.id = randomUUID();
    for (const element of slide.elements || []) walkElements(element, visit);
  }
  return next;
}

function serializeAccount(doc) {
  const row = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(row._id),
    displayName: row.displayName,
    handle: row.handle || null,
    ownerTenantKey: row.ownerTenantKey,
    sourceTenantKeys: row.sourceTenantKeys || [],
    voice: row.voice || {},
    defaultFormat: row.defaultFormat,
    limits: ISSUE_LIMITS,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function serializePosting(posting) {
  if (!posting) return null;
  return {
    revision: posting.revision,
    captionRevision: posting.captionRevision,
    postedAt: posting.postedAt,
    postedBy: posting.postedBy || null,
    recordedAt: posting.recordedAt,
    instagramUrl: posting.instagramUrl || null,
    snapshotRevisionId: posting.snapshotRevisionId ? String(posting.snapshotRevisionId) : null,
  };
}

function serializeIssue(doc) {
  const row = doc.toObject ? doc.toObject() : doc;
  const origin = row.origin || 'manual';
  return {
    id: String(row._id),
    accountId: row.accountId ? String(row.accountId) : null,
    ownerTenantKey: row.tenantKey,
    name: row.name || row.title,
    title: row.title,
    format: row.format || null,
    status: row.status || 'active',
    schemaVersion: row.schemaVersion || 1,
    revision: row.revision || 1,
    slideCount: (row.slides || []).length || (row.document?.slides || []).length,
    document: row.document || null,
    curation: row.curation || null,
    sources: row.sources || [],
    limits: ISSUE_LIMITS,
    origin,
    // Only a generated issue has a review state. A manual issue reads as null
    // so the editor cannot show "Unapproved draft" over someone's own work.
    reviewState: origin === 'agent-generated' ? (row.reviewState || 'unapproved-draft') : null,
    socialCaption: row.socialCaption || '',
    captionRevision: row.captionRevision || 1,
    generation: row.generation
      ? {
        jobId: row.generation.jobId || null,
        attemptId: row.generation.attemptId || null,
        contextVersion: row.generation.contextVersion || null,
        policyVersion: row.generation.policyVersion || null,
        feedbackVersion: row.generation.feedbackVersion || null,
        implementationRevision: row.generation.implementationRevision || null,
        generatedAt: row.generation.generatedAt || null,
        baselineRevisionId: row.generation.baselineRevisionId
          ? String(row.generation.baselineRevisionId)
          : null,
      }
      : null,
    approval: row.approval
      ? {
        revision: row.approval.revision,
        captionRevision: row.approval.captionRevision,
        approvedAt: row.approval.approvedAt,
        approvedBy: row.approval.approvedBy || null,
        note: row.approval.note || null,
      }
      : null,
    posting: serializePosting(row.posting),
    postHistory: (row.postHistory || []).map(serializePosting),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function loadAccount(req, accountId) {
  const { PivotCarouselAccount } = getGlobalModels(req, 'PivotCarouselAccount');
  if (!accountId || !String(accountId).match(/^[0-9a-f]{24}$/i)) {
    return fail('Account not found.', 404, 'ACCOUNT_NOT_FOUND');
  }
  const account = await PivotCarouselAccount.findById(accountId);
  if (!account) return fail('Account not found.', 404, 'ACCOUNT_NOT_FOUND');
  const owner = await pivotTenant(req, account.ownerTenantKey);
  if (owner.error) return owner;
  return { account };
}

async function assertSources(req, account, sources) {
  if (sources != null && !Array.isArray(sources)) return fail('Sources must be a list.', 422, 'INVALID_CURATION');
  const allowed = new Set(account.sourceTenantKeys);
  for (const source of sources || []) {
    const key = String(source?.sourceTenantKey || '').trim().toLowerCase();
    if (!allowed.has(key)) {
      return fail('That source tenant is not allowed for this account.', 403, 'SOURCE_NOT_ALLOWED');
    }
    const gate = await pivotTenant(req, key);
    if (gate.error) return gate;
  }
  return null;
}

async function createCarouselAccount(req, body = {}) {
  const displayName = text(body.displayName, 80);
  if (!displayName) return fail('A display name is required.', 400, 'NAME_REQUIRED');
  const owner = await pivotTenant(req, body.ownerTenantKey);
  if (owner.error) return owner;
  const sources = (Array.isArray(body.sourceTenantKeys) ? body.sourceTenantKeys : [])
    .map((key) => String(key).trim().toLowerCase())
    .filter(Boolean);
  if (!sources.length) return fail('An account needs at least one source tenant.', 400, 'SOURCES_REQUIRED');
  for (const key of sources) {
    const gate = await pivotTenant(req, key);
    if (gate.error) return gate;
  }
  const format = body.defaultFormat || 'city-picks';
  if (!FORMATS.includes(format)) return fail('Unknown account format.', 400, 'FORMAT_INVALID');

  const { PivotCarouselAccount } = getGlobalModels(req, 'PivotCarouselAccount');
  const doc = await PivotCarouselAccount.create({
    displayName,
    handle: text(body.handle, 40) || null,
    ownerTenantKey: owner.tenantKey,
    sourceTenantKeys: sources,
    voice: body.voice && typeof body.voice === 'object' ? body.voice : {},
    defaultFormat: format,
    createdBy: actorId(req),
    updatedBy: actorId(req),
  });
  return { data: { account: serializeAccount(doc) } };
}

async function getCarouselAccount(req, accountId) {
  const loaded = await loadAccount(req, accountId);
  if (loaded.error) return loaded;
  return { data: { account: serializeAccount(loaded.account) } };
}

async function listCarouselIssues(req, accountId, query = {}) {
  const loaded = await loadAccount(req, accountId);
  if (loaded.error) return loaded;
  const limit = Math.min(Math.max(Number(query.limit) || PAGE_DEFAULT, 1), PAGE_MAX);
  const filter = { accountId: loaded.account._id };
  if (query.status === 'active' || query.status === 'archived') filter.status = query.status;
  if (query.cursor) {
    const [stamp, id] = String(query.cursor).split('|');
    const updatedAt = new Date(stamp);
    if (!Number.isNaN(updatedAt.getTime()) && id) {
      filter.$or = [
        { updatedAt: { $lt: updatedAt } },
        { updatedAt, _id: { $lt: id } },
      ];
    }
  }
  const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
  const docs = await PivotCarouselDeck.find(filter)
    .sort({ updatedAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean();
  const page = docs.slice(0, limit);
  const last = page[page.length - 1];
  return {
    data: {
      accountId: String(loaded.account._id),
      limits: ISSUE_LIMITS,
      issues: page.map(serializeIssue),
      nextCursor: docs.length > limit && last
        ? `${new Date(last.updatedAt).toISOString()}|${last._id}`
        : null,
    },
  };
}

async function createCarouselIssue(req, accountId, body = {}) {
  const loaded = await loadAccount(req, accountId);
  if (loaded.error) return loaded;
  const name = text(body.name, 80);
  if (!name) return fail('An issue name is required.', 400, 'NAME_REQUIRED');
  if (body.ownerTenantKey && String(body.ownerTenantKey).trim().toLowerCase() !== loaded.account.ownerTenantKey) {
    return fail('The issue owner must be the account owner.', 403, 'OWNER_MISMATCH');
  }
  const format = body.format || loaded.account.defaultFormat;
  if (!FORMATS.includes(format)) return fail('Unknown issue format.', 400, 'FORMAT_INVALID');
  const sourceError = await assertSources(req, loaded.account, body.sources);
  if (sourceError) return sourceError;
  const slides = Array.isArray(body.slides) ? body.slides : [];
  if (slides.length > ISSUE_LIMITS.maxSlides) {
    return fail(`An issue can hold ${ISSUE_LIMITS.maxSlides} slides.`, 422, 'SLIDE_CAP', { limits: ISSUE_LIMITS });
  }
  const prepared = prepareDocument(body.document);
  if (prepared.error) return prepared;
  const document = prepared.document
    ? materializeVoice(prepared.document, await voiceLayers(req, loaded.account, body.voice))
    : null;

  const assetError = await require('./pivotCarouselAssetService').validateAssetOwnership(req, accountId, document);
  if (assetError) return assetError;
  const documentSourceError = await assertSources(req, loaded.account, (document?.slides || []).map(slide => slide.source).filter(Boolean));
  if (documentSourceError) return documentSourceError;
  let socialCaption = '';
  if (body.socialCaption !== undefined) {
    const normalized = normalizeCaption(body.socialCaption);
    if (normalized.error) return normalized;
    socialCaption = normalized.caption;
  }
  const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
  const doc = await PivotCarouselDeck.create({
    tenantKey: loaded.account.ownerTenantKey,
    title: name,
    name,
    accountId: loaded.account._id,
    format,
    status: 'active',
    schemaVersion: document ? 2 : 1,
    revision: 1,
    slides,
    document,
    curation: body.curation || null,
    sources: body.sources || [],
    // This route creates human issues. Generated drafts arrive through the
    // compute apply path, which is the only caller allowed to set an origin.
    origin: 'manual',
    reviewState: null,
    socialCaption,
    captionRevision: 1,
    createdBy: actorId(req),
    updatedBy: actorId(req),
  });
  return { data: { issue: serializeIssue(doc) } };
}

async function getCarouselIssue(req, accountId, issueId) {
  const loaded = await loadAccount(req, accountId);
  if (loaded.error) return loaded;
  const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
  const doc = await PivotCarouselDeck.findOne({ _id: issueId, accountId: loaded.account._id });
  if (!doc) return fail('Issue not found.', 404, 'ISSUE_NOT_FOUND');
  return { data: { issue: serializeIssue(doc) } };
}

/**
 * A caption is content: it is approved with the slides, it goes out with the
 * post, and it is saved under the same revision contract.
 */
function normalizeCaption(value) {
  if (typeof value !== 'string') {
    return fail('A social caption must be text.', 422, 'INVALID_CAPTION');
  }
  const caption = value.replace(/\r\n/g, '\n').trim();
  if (caption.length > MAX_SOCIAL_CAPTION_LENGTH) {
    return fail(
      `A social caption can hold ${MAX_SOCIAL_CAPTION_LENGTH} characters.`,
      422,
      'CAPTION_TOO_LONG',
      { limits: { maxSocialCaption: MAX_SOCIAL_CAPTION_LENGTH } },
    );
  }
  return { caption };
}

async function writeIssue(req, accountId, issueId, body, mutate, snapshotMeta = null) {
  const loaded = await getCarouselIssue(req, accountId, issueId);
  if (loaded.error) return loaded;
  const revisions = require('./pivotCarouselRevisionService');
  const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
  let doc = await PivotCarouselDeck.findOne({ _id: issueId, accountId });
  if (doc.pendingSnapshot) {
    // A previous write was interrupted between its head update and its history
    // commit. Settle that before layering another revision on top.
    await revisions.reconcileIssueSnapshots(req, doc._id);
    doc = await PivotCarouselDeck.findOne({ _id: issueId, accountId });
  }
  const conflict = checkRevision(doc.revision || 1, body.revision);
  if (conflict) return { ...conflict, issue: serializeIssue(doc) };
  const account = (await loadAccount(req, accountId)).account;
  const sourceError = await assertSources(req, account, body.sources);
  if (sourceError) return sourceError;
  if (body.document !== undefined) {
    const prepared = prepareDocument(body.document);
    if (prepared.error) return prepared;
    const assetError = await require('./pivotCarouselAssetService').validateAssetOwnership(req, accountId, prepared.document);
    if (assetError) return assetError;
    const refs = (prepared.document?.slides || []).map(slide => slide.source).filter(Boolean);
    const refError = await assertSources(req, account, refs);
    if (refError) return refError;
    doc.document = prepared.document;
    doc.schemaVersion = prepared.document ? 2 : doc.schemaVersion;
    doc.markModified('document');
  }
  if (body.curation !== undefined) {
    const curation = body.curation;
    if (!curation || typeof curation !== 'object' || Array.isArray(curation)) return fail('Invalid curation metadata.', 422, 'INVALID_CURATION');
    const refs = curation.refs || [];
    if (!Array.isArray(refs) || !Array.isArray(curation.snapshots || []) || refs.length > 19) return fail('Invalid selection.', 422, 'INVALID_CURATION');
    const scopeError = await assertSources(req, account, [...refs, ...(curation.snapshots || []).map(item => item.ref)]);
    if (scopeError) return scopeError;
    if (body.sources && JSON.stringify(body.sources) !== JSON.stringify(refs)) return fail('Sources must match the reviewed selection.', 422, 'INVALID_CURATION');
    if (curation.draftId && JSON.stringify(curation) !== JSON.stringify(doc.curation)) {
      const { PivotCarouselCurationDraft } = getGlobalModels(req, 'PivotCarouselCurationDraft');
      if (!/^[0-9a-f]{24}$/i.test(curation.draftId)) return fail('Curation draft not found.', 422, 'INVALID_CURATION');
      const draft = await PivotCarouselCurationDraft.findOne({ _id: curation.draftId, accountId });
      if (!draft) return fail('Curation draft not found in this account.', 403, 'SOURCE_NOT_ALLOWED');
      const selected = new Map((draft.selected || []).map(item => [`${item.ref.sourceTenantKey}:${item.ref.eventId}`, item]));
      if (refs.some(ref => !selected.has(`${ref.sourceTenantKey}:${ref.eventId}`))) return fail('The selection does not match its curation draft.', 422, 'INVALID_CURATION');
      body = { ...body, curation: { ...curation, snapshots: refs.map(ref => {
        const item = selected.get(`${ref.sourceTenantKey}:${ref.eventId}`);
        return { ref, snapshot: item.snapshot, recapNote: item.recapNote || '', capturedAt: item.provenance?.capturedAt || null };
      }) } };
    }
  }
  if (body.sources !== undefined) doc.sources = body.sources;
  const nextRevision = (doc.revision || 1) + 1;
  let captionChanged = false;
  if (body.socialCaption !== undefined) {
    const normalized = normalizeCaption(body.socialCaption);
    if (normalized.error) return normalized;
    if (normalized.caption !== (doc.socialCaption || '')) {
      doc.socialCaption = normalized.caption;
      doc.captionRevision = nextRevision;
      captionChanged = true;
    }
  }
  await mutate(doc, loaded);
  if (body.curation !== undefined) { doc.curation = body.curation; doc.markModified('curation'); }
  doc.revision = nextRevision;
  doc.updatedBy = actorId(req);
  // A generated issue that moves to a new revision is no longer the thing
  // anybody approved, so it goes back to being an unapproved draft. Approval
  // names one exact revision and is never carried forward to another.
  const generated = (doc.origin || 'manual') === 'agent-generated';
  if (generated) {
    doc.approval = null;
    doc.reviewState = 'unapproved-draft';
  }
  await doc.validate();

  // Persist the history row before the head moves. If this throws the save
  // fails and nothing changed, which is the point: an acknowledged write can
  // never be missing its record of what was written.
  let pending = null;
  try {
    pending = await revisions.beginHeadSnapshot(req, {
      doc,
      targetRevision: nextRevision,
      meta: snapshotMeta || {},
    });
  } catch (err) {
    console.error('carousel revision snapshot could not be staged', err);
    return fail(
      'The issue could not be saved because its history could not be recorded. Your local edits are still available.',
      503,
      'HISTORY_UNAVAILABLE',
    );
  }
  if (pending) {
    doc.pendingSnapshot = {
      revisionId: pending._id,
      headRevision: nextRevision,
      requestedAt: new Date(),
    };
  }

  const changes = doc.getChanges();
  if (generated) {
    // Written unconditionally, not just when this copy of the issue happened
    // to be holding an approval. An approval can land between the read above
    // and the swap below, and the compare-and-swap would still match because
    // approving does not move the revision. Clearing it here is what stops an
    // approval from silently covering an edit nobody approved.
    changes.$set = { ...(changes.$set || {}), approval: null, reviewState: 'unapproved-draft' };
    if (changes.$unset) {
      delete changes.$unset.approval;
      delete changes.$unset.reviewState;
      if (!Object.keys(changes.$unset).length) delete changes.$unset;
    }
  }
  const saved = await PivotCarouselDeck.findOneAndUpdate(
    { _id: issueId, accountId, revision: body.revision }, changes, { new: true, runValidators: true },
  );
  if (!saved) {
    await revisions.abandonHeadSnapshot(req, pending);
    const current = await PivotCarouselDeck.findOne({ _id: issueId, accountId });
    return fail('The issue changed while saving. Your local edits are still available.', 409, 'REVISION_CONFLICT', {
      storedRevision: current?.revision,
      presentedRevision: body.revision,
      issue: current ? serializeIssue(current) : undefined,
    });
  }
  if (pending) {
    await revisions.commitHeadSnapshot(req, pending, saved.revision);
    await PivotCarouselDeck.updateOne(
      { _id: issueId, 'pendingSnapshot.revisionId': pending._id },
      { $set: { pendingSnapshot: null } },
    );
    saved.pendingSnapshot = null;
  }
  return { data: { issue: serializeIssue(saved), captionChanged } };
}

async function renameCarouselIssue(req, accountId, issueId, body = {}) {
  const name = text(body.name, 80);
  if (!name) return fail('An issue name is required.', 400, 'NAME_REQUIRED');
  return writeIssue(req, accountId, issueId, body, (doc) => {
    doc.name = name;
    doc.title = name;
  });
}

async function updateCarouselIssue(req, accountId, issueId, body = {}, snapshotMeta = null) {
  if (body.format && !FORMATS.includes(body.format)) {
    return fail('Unknown issue format.', 400, 'FORMAT_INVALID');
  }
  return writeIssue(req, accountId, issueId, body, (doc) => {
    if (body.format) doc.format = body.format;
    if (body.curation !== undefined) {
      doc.curation = body.curation;
      doc.markModified('curation');
    }
  }, snapshotMeta);
}

async function archiveCarouselIssue(req, accountId, issueId, body = {}) {
  return writeIssue(req, accountId, issueId, body, (doc) => {
    doc.status = 'archived';
  });
}

async function restoreCarouselIssue(req, accountId, issueId, body = {}) {
  return writeIssue(req, accountId, issueId, body, (doc) => {
    doc.status = 'active';
  });
}

/**
 * Creates the one new unapproved draft a generated proposal becomes.
 *
 * Deliberately not reachable from the admin routes: an admin creating an issue
 * is creating their own work, and nothing a human types should be able to
 * claim it came from the editorial pipeline.
 */
async function createGeneratedCarouselIssue(req, accountId, body = {}) {
  const created = await createCarouselIssue(req, accountId, body);
  if (created.error) return created;
  const revisions = require('./pivotCarouselRevisionService');
  const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
  const doc = await PivotCarouselDeck.findById(created.data.issue.id);
  doc.origin = 'agent-generated';
  doc.reviewState = 'unapproved-draft';
  doc.generation = {
    jobId: text(body.generation?.jobId, 128) || null,
    attemptId: text(body.generation?.attemptId, 128) || null,
    proposalIdempotencyKey: text(body.generation?.proposalIdempotencyKey, 128) || null,
    contextVersion: text(body.generation?.contextVersion, 128) || null,
    policyVersion: text(body.generation?.policyVersion, 128) || null,
    feedbackVersion: text(body.generation?.feedbackVersion, 128) || null,
    implementationRevision: text(body.generation?.implementationRevision, 128) || null,
    generatedAt: body.generation?.generatedAt ? new Date(body.generation.generatedAt) : new Date(),
    baselineRevisionId: null,
  };
  await doc.save();
  // The baseline is what the agent produced, before any human touched it. It
  // is what "generated versus approved" comparisons are read against later.
  const baseline = await revisions.recordProtectedBaseline(req, doc, 'generation');
  doc.generation.baselineRevisionId = baseline._id;
  await PivotCarouselDeck.updateOne(
    { _id: doc._id },
    { $set: { 'generation.baselineRevisionId': baseline._id } },
  );
  return { data: { issue: serializeIssue(doc), baselineRevisionId: String(baseline._id) } };
}

async function loadIssueForDecision(req, accountId, issueId) {
  const loaded = await loadAccount(req, accountId);
  if (loaded.error) return loaded;
  const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
  const doc = await PivotCarouselDeck.findOne({ _id: issueId, accountId: loaded.account._id });
  if (!doc) return fail('Issue not found.', 404, 'ISSUE_NOT_FOUND');
  return { account: loaded.account, doc };
}

/**
 * Approve one exact revision, slides and caption together.
 *
 * The compare-and-swap is on `revision` without changing it: approving is not
 * an edit, but it must fail outright if the issue moved since the approver
 * read it. Two approvals of the same revision are the same approval.
 */
async function approveCarouselIssue(req, accountId, issueId, body = {}) {
  const loaded = await loadIssueForDecision(req, accountId, issueId);
  if (loaded.error) return loaded;
  const { doc } = loaded;
  if ((doc.origin || 'manual') !== 'agent-generated') {
    return fail('Only a generated issue is approved. Manual issues are already yours.', 409, 'NOT_GENERATED_ISSUE');
  }
  const conflict = checkRevision(doc.revision || 1, body.revision);
  if (conflict) return { ...conflict, issue: serializeIssue(doc) };
  if (body.captionRevision !== undefined && body.captionRevision !== (doc.captionRevision || 1)) {
    return fail('The caption changed since it was reviewed.', 409, 'REVISION_CONFLICT', {
      storedRevision: doc.revision,
      storedCaptionRevision: doc.captionRevision || 1,
      presentedRevision: body.revision,
      issue: serializeIssue(doc),
    });
  }
  const note = body.note === undefined ? null : text(body.note, 1000) || null;

  if (doc.approval && doc.approval.revision === (doc.revision || 1)) {
    return { data: { issue: serializeIssue(doc), alreadyApproved: true } };
  }

  const revisions = require('./pivotCarouselRevisionService');
  const baseline = await revisions.recordProtectedBaseline(req, doc, 'approval', {
    actedAt: new Date(),
    actedBy: actorId(req),
    name: note,
  });
  const approval = {
    revision: doc.revision || 1,
    captionRevision: doc.captionRevision || 1,
    approvedAt: new Date(),
    approvedBy: actorId(req),
    note,
    baselineRevisionId: baseline._id,
  };
  const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
  const saved = await PivotCarouselDeck.findOneAndUpdate(
    {
      _id: issueId,
      accountId: loaded.account._id,
      revision: body.revision,
      captionRevision: doc.captionRevision || 1,
    },
    { $set: { reviewState: 'approved', approval, updatedBy: actorId(req) } },
    { new: true },
  );
  if (!saved) {
    const current = await PivotCarouselDeck.findOne({ _id: issueId, accountId: loaded.account._id });
    return fail('The issue changed while approving it.', 409, 'REVISION_CONFLICT', {
      storedRevision: current?.revision,
      presentedRevision: body.revision,
      issue: current ? serializeIssue(current) : undefined,
    });
  }
  return { data: { issue: serializeIssue(saved) } };
}

/**
 * Reject or request changes. This never posts, never deletes, and never
 * silently edits: it returns the issue to being an unapproved draft and, if
 * asked, archives it. Rejecting an issue is not the same as it having been
 * posted and taken down.
 */
async function rejectCarouselIssue(req, accountId, issueId, body = {}) {
  const loaded = await loadIssueForDecision(req, accountId, issueId);
  if (loaded.error) return loaded;
  const { doc } = loaded;
  if ((doc.origin || 'manual') !== 'agent-generated') {
    return fail('Only a generated issue is approved or rejected.', 409, 'NOT_GENERATED_ISSUE');
  }
  const conflict = checkRevision(doc.revision || 1, body.revision);
  if (conflict) return { ...conflict, issue: serializeIssue(doc) };

  const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
  const saved = await PivotCarouselDeck.findOneAndUpdate(
    { _id: issueId, accountId: loaded.account._id, revision: body.revision },
    {
      $set: {
        reviewState: 'unapproved-draft',
        approval: null,
        updatedBy: actorId(req),
        ...(body.archive === true ? { status: 'archived' } : {}),
      },
    },
    { new: true },
  );
  if (!saved) {
    const current = await PivotCarouselDeck.findOne({ _id: issueId, accountId: loaded.account._id });
    return fail('The issue changed while rejecting it.', 409, 'REVISION_CONFLICT', {
      storedRevision: current?.revision,
      presentedRevision: body.revision,
      issue: current ? serializeIssue(current) : undefined,
    });
  }
  return { data: { issue: serializeIssue(saved) } };
}

/**
 * Record that a human posted this exact revision by hand.
 *
 * Nothing else in the system implies this. Generating, exporting, archiving
 * and approving an issue all leave it unposted; only an admin saying so here
 * creates a posted record, and that record is an immutable snapshot of what
 * actually went out.
 */
async function markCarouselIssuePosted(req, accountId, issueId, body = {}) {
  const loaded = await loadIssueForDecision(req, accountId, issueId);
  if (loaded.error) return loaded;
  let { doc } = loaded;
  const generated = (doc.origin || 'manual') === 'agent-generated';
  const conflict = checkRevision(doc.revision || 1, body.revision);
  if (conflict) return { ...conflict, issue: serializeIssue(doc) };

  if (generated && body.approve === true && !(doc.approval && doc.approval.revision === doc.revision)) {
    const approved = await approveCarouselIssue(req, accountId, issueId, {
      revision: body.revision,
      note: body.note,
    });
    if (approved.error) return approved;
    const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
    doc = await PivotCarouselDeck.findOne({ _id: issueId, accountId: loaded.account._id });
  }
  // A generated issue is posted from an approved revision, never from one
  // someone merely looked at. Manual issues keep their existing workflow and
  // acquire posted history without ever entering the generated review state.
  if (generated && !(doc.approval && doc.approval.revision === (doc.revision || 1))) {
    return fail(
      'Approve this exact revision before recording it as posted.',
      409,
      'APPROVAL_REQUIRED',
      { storedRevision: doc.revision, issue: serializeIssue(doc) },
    );
  }

  const postedAt = body.postedAt === undefined ? new Date() : new Date(body.postedAt);
  if (Number.isNaN(postedAt.getTime())) {
    return fail('A publication time must be a date.', 422, 'INVALID_POSTED_AT');
  }
  if (postedAt.getTime() > Date.now() + 60_000) {
    return fail('A publication time cannot be in the future.', 422, 'INVALID_POSTED_AT');
  }
  let instagramUrl = null;
  if (body.instagramUrl !== undefined && body.instagramUrl !== null && body.instagramUrl !== '') {
    instagramUrl = text(body.instagramUrl, 2048);
    if (!/^https:\/\/(www\.)?instagram\.com\/[\w./?=&%-]*$/i.test(instagramUrl)) {
      return fail('That does not look like an Instagram URL.', 422, 'INVALID_INSTAGRAM_URL');
    }
  }

  // One posted record per revision. A retried request returns the record it
  // already made instead of claiming the issue went out twice.
  const existing = (doc.postHistory || []).find((entry) => entry.revision === (doc.revision || 1));
  if (existing) {
    return { data: { issue: serializeIssue(doc), alreadyPosted: true } };
  }
  if ((doc.postHistory || []).length >= MAX_POST_HISTORY) {
    return fail('This issue already has the maximum number of posted records.', 409, 'POST_HISTORY_FULL');
  }

  const revisions = require('./pivotCarouselRevisionService');
  const snapshot = await revisions.recordProtectedBaseline(req, doc, 'posted', {
    actedAt: postedAt,
    actedBy: actorId(req),
    instagramUrl,
  });
  const posting = {
    revision: doc.revision || 1,
    captionRevision: doc.captionRevision || 1,
    postedAt,
    postedBy: actorId(req),
    recordedAt: new Date(),
    instagramUrl,
    snapshotRevisionId: snapshot._id,
  };
  const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
  const saved = await PivotCarouselDeck.findOneAndUpdate(
    {
      _id: issueId,
      accountId: loaded.account._id,
      revision: body.revision,
      'postHistory.revision': { $ne: doc.revision || 1 },
    },
    { $set: { posting, updatedBy: actorId(req) }, $push: { postHistory: posting } },
    { new: true },
  );
  if (!saved) {
    const current = await PivotCarouselDeck.findOne({ _id: issueId, accountId: loaded.account._id });
    if (current && (current.postHistory || []).some((entry) => entry.revision === body.revision)) {
      return { data: { issue: serializeIssue(current), alreadyPosted: true } };
    }
    return fail('The issue changed while recording the post.', 409, 'REVISION_CONFLICT', {
      storedRevision: current?.revision,
      presentedRevision: body.revision,
      issue: current ? serializeIssue(current) : undefined,
    });
  }
  return { data: { issue: serializeIssue(saved), snapshotRevisionId: String(snapshot._id) } };
}

async function duplicateCarouselIssue(req, accountId, issueId) {
  const loaded = await getCarouselIssue(req, accountId, issueId);
  if (loaded.error) return loaded;
  const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
  const source = await PivotCarouselDeck.findOne({ _id: issueId, accountId }).lean();
  const name = `${source.name || source.title} copy`.slice(0, 80);
  const slides = (source.slides || []).map((slide) => {
    const copy = { ...slide };
    delete copy._id;
    return copy;
  });
  const doc = await PivotCarouselDeck.create({
    tenantKey: source.tenantKey,
    title: name,
    name,
    accountId: source.accountId,
    format: source.format,
    status: 'active',
    schemaVersion: source.schemaVersion || 1,
    revision: 1,
    slides,
    document: reassignIds(source.document),
    curation: source.curation || null,
    sources: source.sources || [],
    batchWeek: source.batchWeek || null,
    edition: source.edition,
    inkPlate: source.inkPlate,
    showIssueNumber: source.showIssueNumber,
    issue: source.issue,
    voice: source.voice,
    // A copy is new human work. It inherits the words, never the provenance,
    // the approval or the record that something went out.
    origin: 'manual',
    reviewState: null,
    socialCaption: source.socialCaption || '',
    captionRevision: 1,
    createdBy: actorId(req),
    updatedBy: actorId(req),
  });
  return { data: { issue: serializeIssue(doc) } };
}

async function listCarouselAccounts(req, query = {}) {
  const owner = await pivotTenant(req, query.ownerTenantKey);
  if (owner.error) return owner;
  const { PivotCarouselAccount } = getGlobalModels(req, 'PivotCarouselAccount');
  const docs = await PivotCarouselAccount.find({ ownerTenantKey: owner.tenantKey }).sort({ displayName: 1 }).lean();
  return { data: { accounts: docs.map(serializeAccount), limits: ISSUE_LIMITS } };
}

function convertLegacySlide(slide, index) {
  const spec = slideTypeFor(slide?.type);
  const slideId = randomUUID();
  if (!spec) {
    return {
      slide: {
        id: slideId,
        elements: [{
          id: randomUUID(),
          kind: 'text',
          text: `Unsupported slide: ${slide?.type || 'unknown'}`,
          unsupported: true,
          frame: { x: 40, y: 40 + index * 20, width: 1000, height: 80 },
        }],
      },
      unsupported: [{ index, slideType: slide?.type || null, reason: 'unknown slide type' }],
    };
  }
  const elements = [];
  const unsupported = [];
  const image = slide.events?.[0]?.imageOverride?.url || slide.events?.[0]?.snapshot?.image;
  if (image) {
    elements.push({
      id: randomUUID(),
      kind: 'image',
      frame: { x: 80, y: 80, width: 920, height: 700 },
      crop: { focalX: 0.5, focalY: 0.5, scale: 1 },
      asset: { src: image, key: slide.events?.[0]?.imageOverride?.key || null },
    });
  }
  const values = slide.values || {};
  let y = 820;
  for (const field of spec.fields || []) {
    const raw = values[field.key];
    if (raw == null || raw === '') continue;
    if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean') {
      unsupported.push({ index, slideType: slide.type, field: field.key, reason: 'unsupported field value' });
      elements.push({
        id: randomUUID(),
        kind: 'text',
        text: `[unsupported ${field.key}]`,
        unsupported: true,
        frame: { x: 80, y, width: 920, height: 48 },
      });
    } else {
      elements.push({
        id: randomUUID(),
        kind: 'text',
        text: String(raw),
        presence: 'custom',
        frame: { x: 80, y, width: 920, height: 48 },
      });
    }
    y += 56;
  }
  return { slide: { id: slideId, legacyType: slide.type, elements }, unsupported };
}

function convertLegacyDeck(deck) {
  const unsupported = [];
  const slides = (deck.slides || []).map((slide, index) => {
    const converted = convertLegacySlide(slide, index);
    unsupported.push(...converted.unsupported);
    return converted.slide;
  });
  return {
    document: { schemaVersion: 2, width: 1080, height: 1350, slides },
    unsupported,
  };
}

async function createEditableCopy(req, accountId, issueId) {
  const loaded = await getCarouselIssue(req, accountId, issueId);
  if (loaded.error) return loaded;
  if ((loaded.data.issue.schemaVersion || 1) !== 1) {
    return fail('Only a legacy issue can be copied into an editable document.', 409, 'NOT_LEGACY');
  }
  const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
  const source = await PivotCarouselDeck.findOne({ _id: issueId, accountId }).lean();
  const converted = convertLegacyDeck(source);
  const name = `${source.name || source.title} editable`.slice(0, 80);
  const doc = await PivotCarouselDeck.create({
    tenantKey: source.tenantKey,
    title: name,
    name,
    accountId: source.accountId,
    format: source.format || 'sorry-you-missed-it',
    status: 'active',
    schemaVersion: 2,
    revision: 1,
    slides: [],
    document: converted.document,
    curation: { copiedFromIssueId: String(source._id), unsupported: converted.unsupported },
    sources: source.sources || [],
    origin: 'manual',
    reviewState: null,
    socialCaption: source.socialCaption || '',
    captionRevision: 1,
    createdBy: actorId(req),
    updatedBy: actorId(req),
  });
  return { data: { issue: serializeIssue(doc), unsupported: converted.unsupported } };
}

module.exports = {
  ISSUE_LIMITS,
  MAX_SOCIAL_CAPTION_LENGTH,
  normalizeCaption,
  createGeneratedCarouselIssue,
  approveCarouselIssue,
  rejectCarouselIssue,
  markCarouselIssuePosted,
  createCarouselAccount,
  getCarouselAccount,
  listCarouselIssues,
  createCarouselIssue,
  getCarouselIssue,
  renameCarouselIssue,
  updateCarouselIssue,
  archiveCarouselIssue,
  restoreCarouselIssue,
  duplicateCarouselIssue,
  validateDocument,
  checkRevision,
  listCarouselAccounts,
  createEditableCopy,
  convertLegacySlide,
  loadAccount,
  assertSources,
};
