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
const { MAX_SOCIAL_CAPTION_LENGTH, REVISION_REQUEST_LIMIT, MAX_REVISION_REQUEST_TEXT } = require('../schemas/pivotCarouselDeck');
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
    postedAt: posting.postedAt,
    postedBy: posting.postedBy || null,
    recordedAt: posting.recordedAt,
    instagramUrl: posting.instagramUrl || null,
    snapshotRevisionId: posting.snapshotRevisionId ? String(posting.snapshotRevisionId) : null,
  };
}

function serializeRevisionRequest(request) {
  const row = request.toObject ? request.toObject() : request;
  return {
    id: String(row._id),
    requester: row.requester || null,
    time: row.time,
    revision: row.revision,
    text: row.text,
    ...(row.reason ? { reason: row.reason } : {}),
  };
}

/** True when the agent's last write is stored, which a revise starts from. */
function hasStoredComposition(doc) {
  const composition = doc?.composition;
  return doc?.agentRevision != null && doc.contextWindow != null
    && Boolean(composition) && typeof composition === 'object' && !Array.isArray(composition)
    && Object.keys(composition).length > 0;
}

/** True once a studio save has moved the issue past the revision the agent wrote. */
function editsSinceAgent(doc) {
  return doc?.agentRevision != null && (doc.revision || 1) !== doc.agentRevision;
}

function serializeContextWindow(window) {
  if (!window) return null;
  const value = window.toObject ? window.toObject() : window;
  return {
    from: value.from,
    to: value.to,
    toExclusive: value.toExclusive,
    timezone: value.timezone,
    mode: value.mode,
    days: value.days,
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
    reviewState: origin === 'agent-generated' ? (row.reviewState || 'unapproved') : null,
    trendRefs: origin === 'agent-generated' ? [...(row.trendRefs || [])] : [],
    ...(row.optionSetId ? {
      optionSetId: row.optionSetId,
      optionIndex: row.optionIndex,
      themeLabel: row.themeLabel,
      optionPick: row.optionPick?.pickedAt ? {
        pickedAt: row.optionPick.pickedAt,
        pickedBy: row.optionPick.pickedBy || null,
      } : null,
    } : {}),
    // Present only after the agent has written this draft. A manual issue,
    // and a generated issue from before this was stored, omit all of them.
    ...(origin === 'agent-generated' && row.agentRevision != null ? {
      composition: row.composition || null,
      contextWindow: serializeContextWindow(row.contextWindow),
      agentRevision: row.agentRevision,
      hasEditsSinceAgent: (row.revision || 1) !== row.agentRevision,
    } : {}),
    socialCaption: row.socialCaption || '',
    editorialVersion: row.editorialVersion || 0,
    feedbackNotes: (row.feedbackNotes || []).map(require('./pivotCarouselEditorialFeedbackService').serializeFeedbackRecord),
    revisionRequests: (row.revisionRequests || []).map(serializeRevisionRequest),
    approval: row.approval
      ? {
        revision: row.approval.revision,
        approvedAt: row.approval.approvedAt,
        approvedBy: row.approval.approvedBy || null,
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

async function assertSources(req, account, sources, trustedTenantKeys = null) {
  if (sources != null && !Array.isArray(sources)) return fail('Sources must be a list.', 422, 'INVALID_CURATION');
  const allowed = new Set(trustedTenantKeys || account.sourceTenantKeys);
  for (const source of sources || []) {
    const key = String(source?.sourceTenantKey || '').trim().toLowerCase();
    if (!allowed.has(key)) {
      return fail('That source tenant is not allowed for this account.', 403, 'SOURCE_NOT_ALLOWED');
    }
    // Compose's fixed global policy includes every catalog tenant, including campuses.
    const gate = trustedTenantKeys
      ? (await require('./tenantConfigService').getTenantByKey(req, key) ? {} : { error: 'Source tenant not found.', status: 404, code: 'TENANT_NOT_FOUND' })
      : await pivotTenant(req, key);
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

async function createIssue(req, accountId, body, origin, trusted = {}) {
  const loaded = await loadAccount(req, accountId);
  if (loaded.error) return loaded;
  const name = text(body.name, 80);
  if (!name) return fail('An issue name is required.', 400, 'NAME_REQUIRED');
  if (body.ownerTenantKey && String(body.ownerTenantKey).trim().toLowerCase() !== loaded.account.ownerTenantKey) {
    return fail('The issue owner must be the account owner.', 403, 'OWNER_MISMATCH');
  }
  const format = body.format || loaded.account.defaultFormat;
  if (!FORMATS.includes(format)) return fail('Unknown issue format.', 400, 'FORMAT_INVALID');
  const sourceError = await assertSources(req, loaded.account, body.sources, trusted.sourceTenantKeys);
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
  const documentSourceError = await assertSources(req, loaded.account, (document?.slides || []).map(slide => slide.source).filter(Boolean), trusted.sourceTenantKeys);
  if (documentSourceError) return documentSourceError;
  let socialCaption = '';
  if (body.socialCaption !== undefined) {
    const normalized = normalizeCaption(body.socialCaption);
    if (normalized.error) return normalized;
    socialCaption = normalized.caption;
  }
  const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
  const doc = await PivotCarouselDeck.create({
    ...(trusted.issueId ? { _id: trusted.issueId, composeJobId: trusted.composeJobId } : {}),
    ...(trusted.optionSetId ? {
      optionSetId: trusted.optionSetId,
      optionIndex: trusted.optionIndex,
      themeLabel: trusted.themeLabel,
    } : {}),
    ...(trusted.trendRefs?.length ? { trendRefs: trusted.trendRefs } : {}),
    ...(trusted.agentRevision != null ? {
      composition: trusted.composition,
      contextWindow: trusted.contextWindow,
      agentRevision: trusted.agentRevision,
    } : {}),
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
    // Admin routes create human issues. Generated drafts arrive through the
    // compute apply path, which supplies its origin internally.
    origin,
    reviewState: origin === 'agent-generated' ? 'unapproved' : null,
    socialCaption,
    createdBy: actorId(req),
    updatedBy: actorId(req),
  });
  return { data: { issue: serializeIssue(doc) } };
}

async function createCarouselIssue(req, accountId, body = {}) {
  return createIssue(req, accountId, body, 'manual');
}

async function getCarouselIssue(req, accountId, issueId) {
  const loaded = await loadAccount(req, accountId);
  if (loaded.error) return loaded;
  const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
  const doc = await PivotCarouselDeck.findOne({ _id: issueId, accountId: loaded.account._id });
  if (!doc) return fail('Issue not found.', 404, 'ISSUE_NOT_FOUND');
  return { data: { issue: serializeIssue(doc) } };
}

const PREVIEW_URL_TTL_SECONDS = 60 * 60;
const EXPORT_JOB_ID_PATTERN = /^job:export:([0-9a-f]{24}):r([1-9]\d*)$/;
const SLIDE_PNG_PATTERN = /^slide-(\d{2})\.png$/;
const PREVIEW_IN_FLIGHT = new Set(['pending', 'leased', 'running', 'retryable', 'review-required', 'applying']);

function exportJobId(issueId, revision) {
  return `job:export:${issueId}:r${revision}`;
}

function slidePngs(artifacts) {
  return (artifacts || [])
    .flatMap((artifact) => {
      const match = SLIDE_PNG_PATTERN.exec(String(artifact?.logicalName || ''));
      if (!match) return [];
      return [{ artifact, slideNumber: Number(match[1]), logicalName: match[0] }];
    })
    .sort((left, right) => left.slideNumber - right.slideNumber);
}

async function loadRevisionExport(req, issueId, revision) {
  const { findJobByExternalId } = require('./pivotComputeJobStore');
  const job = await findJobByExternalId(req, exportJobId(issueId, revision));
  if (!job || job.kind !== 'carousel-export' || String(job.options?.deckId || '') !== issueId) return null;
  return job;
}

async function signReadySlides(job, revision) {
  const slides = job.status === 'completed' && !job.exportArtifacts?.expired
    ? slidePngs(job.exportArtifacts?.artifacts)
    : [];
  if (!slides.length) return { data: { status: 'failed', revision } };
  const {
    createPresignedGetUrl,
    assertObjectKeyBelongsToPrefix,
    buildExportPrefix,
  } = require('./pivotExportArtifactStorage');
  const prefix = job.exportArtifacts.prefix || buildExportPrefix({
    tenantKey: job.tenantKey,
    externalJobId: job.externalJobId,
    attemptNumber: job.exportArtifacts.attemptNumber,
  });
  const signed = [];
  for (const slide of slides) {
    try {
      assertObjectKeyBelongsToPrefix(slide.artifact.objectKey, prefix);
      const presign = await createPresignedGetUrl({
        objectKey: slide.artifact.objectKey,
        contentType: slide.artifact.mimeType || 'image/png',
        filename: slide.logicalName,
        expiresInSeconds: PREVIEW_URL_TTL_SECONDS,
      });
      signed.push({
        slideNumber: slide.slideNumber,
        logicalName: slide.logicalName,
        url: presign.downloadUrl,
        expiresInSeconds: presign.expiresInSeconds,
      });
    } catch (error) {
      if (error.code) return fail(error.message, error.status || 500, error.code);
      throw error;
    }
  }
  return {
    data: {
      status: 'ready',
      revision,
      expiresInSeconds: signed[0].expiresInSeconds,
      slides: signed.map(({ slideNumber, logicalName, url }) => ({ slideNumber, logicalName, url })),
    },
  };
}

async function newestReadyOlderRevision(req, issueId, revision) {
  const { PivotComputeJob } = getGlobalModels(req, 'PivotComputeJob');
  const jobs = await PivotComputeJob.find({
    kind: 'carousel-export',
    'options.deckId': issueId,
  }).select('externalJobId status exportArtifacts.expired exportArtifacts.artifacts.logicalName').lean();
  let older = null;
  for (const job of jobs) {
    const match = EXPORT_JOB_ID_PATTERN.exec(job.externalJobId || '');
    if (!match || match[1] !== issueId) continue;
    const jobRevision = Number(match[2]);
    if (!Number.isInteger(jobRevision) || jobRevision >= revision) continue;
    if (job.status !== 'completed' || job.exportArtifacts?.expired) continue;
    if (!slidePngs(job.exportArtifacts?.artifacts).length) continue;
    if (older == null || jobRevision > older) older = jobRevision;
  }
  return older;
}

/**
 * Preview of the issue's current revision.
 * pending and failed describe that revision's export. ready includes a new
 * one-hour URL for every slide image, in slide order. A rendered preview from
 * an earlier revision is stale and names that revision.
 */
async function getCarouselIssuePreview(req, accountId, issueId) {
  const loaded = await getCarouselIssue(req, accountId, issueId);
  if (loaded.error) return loaded;
  const id = loaded.data.issue.id;
  const revision = loaded.data.issue.revision || 1;
  const current = await loadRevisionExport(req, id, revision);
  if (current) {
    if (PREVIEW_IN_FLIGHT.has(current.status)) return { data: { status: 'pending', revision } };
    return signReadySlides(current, revision);
  }
  const older = await newestReadyOlderRevision(req, id, revision);
  if (older != null) return { data: { status: 'stale', revision: older } };
  return { data: { status: 'pending', revision } };
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

/** `guard` adds conditions the stored issue must still meet when the write lands. */
async function writeIssue(req, accountId, issueId, body, mutate, snapshotMeta = null, guard = null) {
  const loaded = await getCarouselIssue(req, accountId, issueId);
  if (loaded.error) return loaded;
  const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
  const doc = await PivotCarouselDeck.findOne({ _id: issueId, accountId });
  const conflict = checkRevision(doc.revision || 1, body.revision);
  if (conflict) return { ...conflict, issue: serializeIssue(doc) };
  const editorial = require('./pivotCarouselEditorialFeedbackService');
  const generated = doc.origin === 'agent-generated';
  const before = generated ? editorial.editorialFields(doc) : null;
  const account = (await loadAccount(req, accountId)).account;
  let composeSources = null;
  if (generated && doc.composeJobId) {
    const definition = require('../constants/pivotCarouselEditorialAccounts').editorialAccountFor(String(account.handle || '').replace(/^@/, ''));
    if (definition) composeSources = definition.sourceTenantKeys === 'all'
      ? (await require('./tenantConfigService').getMergedTenants(req)).map(tenant => tenant.tenantKey)
      : [...definition.sourceTenantKeys];
  }
  const sourceError = await assertSources(req, account, body.sources, composeSources);
  if (sourceError) return sourceError;
  if (body.document !== undefined) {
    const prepared = prepareDocument(body.document);
    if (prepared.error) return prepared;
    const assetError = await require('./pivotCarouselAssetService').validateAssetOwnership(req, accountId, prepared.document);
    if (assetError) return assetError;
    const refs = (prepared.document?.slides || []).map(slide => slide.source).filter(Boolean);
    const refError = await assertSources(req, account, refs, composeSources);
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
    const scopeError = await assertSources(req, account, [...refs, ...(curation.snapshots || []).map(item => item.ref)], composeSources);
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
  if (body.socialCaption !== undefined) {
    const normalized = normalizeCaption(body.socialCaption);
    if (normalized.error) return normalized;
    if (normalized.caption !== (doc.socialCaption || '')) {
      doc.socialCaption = normalized.caption;
    }
  }
  await mutate(doc, loaded);
  if (body.curation !== undefined) { doc.curation = body.curation; doc.markModified('curation'); }
  // Archiving or restoring moves the revision but not the content. If the
  // agent wrote the content, it still did, so agentRevision moves with it.
  const statusOnly = doc.isModified('status') && doc.modifiedPaths().every(path => path === 'status');
  if (statusOnly && doc.agentRevision != null && doc.agentRevision === body.revision) {
    doc.agentRevision = nextRevision;
  }
  doc.revision = nextRevision;
  doc.updatedBy = actorId(req);
  // A generated issue that moves to a new revision is no longer the thing
  // anybody approved, so it goes back to being an unapproved draft. Approval
  // names one exact revision and is never carried forward to another.
  if (generated) {
    doc.approval = null;
    doc.reviewState = 'unapproved';
  }
  await doc.validate();

  let changes = doc.getChanges();
  if (generated) {
    // Written unconditionally, not just when this copy of the issue happened
    // to be holding an approval. An approval can land between the read above
    // and the swap below, and the compare-and-swap would still match because
    // approving does not move the revision. Clearing it here is what stops an
    // approval from silently covering an edit nobody approved.
    changes.$set = { ...(changes.$set || {}), approval: null, reviewState: 'unapproved' };
    if (changes.$unset) {
      delete changes.$unset.approval;
      delete changes.$unset.reviewState;
      if (!Object.keys(changes.$unset).length) delete changes.$unset;
    }
    const edit = doc.editLog.create({
      actor: actorId(req), time: new Date(), version: (doc.editorialVersion || 0) + 1,
      fromRevision: body.revision, toRevision: nextRevision,
      changes: editorial.editorialChanges(before, editorial.editorialFields(doc)),
    });
    await edit.validate();
    changes = editorial.appendEditorialRecord(changes, 'editLog', edit.toObject());
  }
  const saved = await PivotCarouselDeck.findOneAndUpdate(
    { ...(guard || {}), _id: issueId, accountId, revision: body.revision }, changes, { new: true, runValidators: true },
  );
  if (!saved) {
    const current = await PivotCarouselDeck.findOne({ _id: issueId, accountId });
    return fail('The issue changed while saving. Your local edits are still available.', 409, 'REVISION_CONFLICT', {
      storedRevision: current?.revision,
      presentedRevision: body.revision,
      issue: current ? serializeIssue(current) : undefined,
    });
  }
  try {
    await require('./pivotCarouselRevisionService').recordHeadSnapshot(req, saved, snapshotMeta || {});
  } catch (err) {
    // Keep the existing save contract: the head has already committed.
    console.error('carousel revision snapshot failed', err);
  }
  return { data: { issue: serializeIssue(saved) } };
}

async function renameCarouselIssue(req, accountId, issueId, body = {}) {
  const name = text(body.name, 80);
  if (!name) return fail('An issue name is required.', 400, 'NAME_REQUIRED');
  return writeIssue(req, accountId, issueId, body, (doc) => {
    doc.name = name;
    doc.title = name;
  });
}

async function updateCarouselIssue(req, accountId, issueId, body = {}, snapshotMeta = null, trusted = null) {
  if (body.format && !FORMATS.includes(body.format)) {
    return fail('Unknown issue format.', 400, 'FORMAT_INVALID');
  }
  return writeIssue(req, accountId, issueId, body, (doc) => {
    if (body.format) doc.format = body.format;
    if (body.curation !== undefined) {
      doc.curation = body.curation;
      doc.markModified('curation');
    }
    // Only the revise apply path sets these. A studio save leaves the agent
    // composition where it was, so the next revision reads as a hand edit.
    if (trusted?.agentRevision != null) {
      doc.composition = trusted.composition;
      doc.markModified('composition');
      doc.agentRevision = trusted.agentRevision;
    }
  }, snapshotMeta, trusted?.unapprovedSince ? {
    // A revise answers a request. An approval given after that request wins.
    $or: [{ approval: null }, { 'approval.approvedAt': { $lte: trusted.unapprovedSince } }],
  } : null);
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
 * Creates a new generated issue as an unapproved draft.
 *
 * Deliberately not reachable from the admin routes: an admin creating an issue
 * is creating their own work, and nothing a human types should be able to
 * claim it came from the editorial pipeline.
 */
async function createGeneratedCarouselIssue(req, accountId, body = {}, trusted = {}) {
  return createIssue(req, accountId, body, 'agent-generated', trusted);
}

async function loadIssueForDecision(req, accountId, issueId) {
  const loaded = await loadAccount(req, accountId);
  if (loaded.error) return loaded;
  const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
  const doc = await PivotCarouselDeck.findOne({ _id: issueId, accountId: loaded.account._id });
  if (!doc) return fail('Issue not found.', 404, 'ISSUE_NOT_FOUND');
  return { account: loaded.account, doc };
}

function serializeOption(doc) {
  return { ...serializeIssue(doc), picked: Boolean(doc.optionPick?.pickedAt) };
}

/**
 * Every draft from one compose run, archived or still active.
 * An issue that is not part of a set has no options.
 */
async function listCarouselOptionSet(req, accountId, issueId) {
  const loaded = await loadIssueForDecision(req, accountId, issueId);
  if (loaded.error) return loaded;
  const { doc } = loaded;
  if (!doc.optionSetId) return { data: { optionSetId: null, pickedIssueId: null, options: [] } };
  const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
  const docs = await PivotCarouselDeck.find({
    accountId: loaded.account._id,
    optionSetId: doc.optionSetId,
  }).sort({ optionIndex: 1, _id: 1 });
  const picked = docs.find(item => item.optionPick?.pickedAt);
  return {
    data: {
      optionSetId: doc.optionSetId,
      pickedIssueId: picked ? String(picked._id) : null,
      options: docs.map(serializeOption),
    },
  };
}

function isPosted(doc) {
  return doc.reviewState === 'posted' || (doc.postHistory || []).length > 0;
}

/**
 * Keep one option and archive the others.
 *
 * The pick is recorded first, on this issue's revision and without moving it,
 * so a refused pick archives nothing and a later restore of a sibling does not
 * forget which option was chosen. Sibling archival then goes through the
 * ordinary archive path. A posted sibling is left as it is.
 */
async function pickCarouselOption(req, accountId, issueId, body = {}) {
  const loaded = await loadIssueForDecision(req, accountId, issueId);
  if (loaded.error) return loaded;
  const { doc } = loaded;
  if ((doc.origin || 'manual') !== 'agent-generated' || !doc.optionSetId) {
    return fail('Only a generated option can be picked.', 409, 'NOT_AN_OPTION');
  }
  const conflict = checkRevision(doc.revision || 1, body.revision);
  if (conflict) return { ...conflict, issue: serializeIssue(doc) };
  const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
  let saved = doc;
  if (!doc.optionPick?.pickedAt) {
    saved = await PivotCarouselDeck.findOneAndUpdate(
      { _id: doc._id, accountId: loaded.account._id, revision: body.revision },
      { $set: { optionPick: { pickedAt: new Date(), pickedBy: actorId(req) } } },
      { new: true, runValidators: true },
    );
    if (!saved) {
      const current = await PivotCarouselDeck.findOne({ _id: doc._id, accountId: loaded.account._id });
      return fail('The issue changed while picking it.', 409, 'REVISION_CONFLICT', {
        storedRevision: current?.revision,
        presentedRevision: body.revision,
        issue: current ? serializeIssue(current) : undefined,
      });
    }
  }
  await PivotCarouselDeck.updateMany(
    {
      accountId: loaded.account._id,
      optionSetId: doc.optionSetId,
      _id: { $ne: doc._id },
      'optionPick.pickedAt': { $exists: true },
    },
    { $unset: { optionPick: 1 } },
  );
  const members = await PivotCarouselDeck.find({
    accountId: loaded.account._id,
    optionSetId: doc.optionSetId,
    _id: { $ne: doc._id },
  });
  for (const sibling of members) {
    if (sibling.status === 'archived' || isPosted(sibling)) continue;
    const archived = await archiveCarouselIssue(req, accountId, sibling._id, { revision: sibling.revision || 1 });
    if (archived.error) return archived;
  }
  return { data: { issue: serializeIssue(saved) } };
}

/**
 * Approve one exact revision, slides and caption together.
 *
 * The compare-and-swap is on `revision` without changing it: approving is not
 * an edit, but it must fail outright if the issue moved since the approver
 * read it. Two approvals of the same revision are the same approval.
 * Approving an option picks it, archiving every unarchived sibling. The
 * approval lands first, so a refused approval archives nothing.
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

  const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
  let saved = doc;
  let alreadyApproved = Boolean(doc.approval && doc.approval.revision === (doc.revision || 1));
  if (!alreadyApproved) {
    const approval = {
      revision: doc.revision || 1,
      approvedAt: new Date(),
      approvedBy: actorId(req),
    };
    saved = await PivotCarouselDeck.findOneAndUpdate(
      {
        _id: issueId,
        accountId: loaded.account._id,
        revision: body.revision,
        origin: 'agent-generated',
        reviewState: 'unapproved',
        approval: null,
      },
      { $set: { reviewState: 'approved', approval, updatedBy: actorId(req) } },
      { new: true, runValidators: true },
    );
    if (!saved) {
      const current = await PivotCarouselDeck.findOne({ _id: issueId, accountId: loaded.account._id });
      // Another approver may have won on the same revision. Preserve that actor
      // and time rather than overwriting the record on a concurrent request.
      if (!(current?.revision === body.revision && current.approval?.revision === body.revision)) {
        return fail('The issue changed while approving it.', 409, 'REVISION_CONFLICT', {
          storedRevision: current?.revision,
          presentedRevision: body.revision,
          issue: current ? serializeIssue(current) : undefined,
        });
      }
      saved = current;
      alreadyApproved = true;
    }
  }

  let issue = serializeIssue(saved);
  if (doc.optionSetId) {
    const picked = await pickCarouselOption(req, accountId, issueId, { revision: body.revision });
    if (picked.error) return picked;
    issue = picked.data.issue;
  }
  return { data: { issue, ...(alreadyApproved ? { alreadyApproved: true } : {}) } };
}

/**
 * Ask the compose agent to revise this exact draft.
 *
 * The request is recorded on the issue and as editorial feedback, then a
 * carousel-revise job is queued. Nothing here rewrites the draft: the agent
 * does that later, and only if this revision is still the one it wrote.
 */
async function requestCarouselRevision(req, accountId, issueId, { revision, text } = {}) {
  const loaded = await loadIssueForDecision(req, accountId, issueId);
  if (loaded.error) return loaded;
  const { doc, account } = loaded;
  if ((doc.origin || 'manual') !== 'agent-generated') {
    return fail('Only a generated draft can be revised.', 409, 'NOT_GENERATED_ISSUE');
  }
  const conflict = checkRevision(doc.revision || 1, revision);
  if (conflict) return { ...conflict, issue: serializeIssue(doc) };
  if (doc.reviewState === 'posted') {
    return fail('A posted draft cannot be revised.', 409, 'POSTED_ISSUE');
  }
  // A draft generated before compositions were stored has nothing for the
  // agent to revise from; the worker would refuse the job.
  if (!hasStoredComposition(doc)) {
    return fail('This draft has no stored composition.', 409, 'REVISE_COMPOSITION_MISSING');
  }
  if (editsSinceAgent(doc)) {
    return fail(
      'This draft was edited in the studio after the agent last wrote it.',
      409,
      'EDITS_SINCE_AGENT',
    );
  }
  if (typeof text !== 'string' || !text.trim()) {
    return fail('A revision request needs text.', 422, 'INVALID_REVISION_REQUEST');
  }
  const trimmed = text.replace(/\r\n/g, '\n').trim();
  if (trimmed.length > MAX_REVISION_REQUEST_TEXT) {
    return fail(
      `A revision request can hold ${MAX_REVISION_REQUEST_TEXT} characters.`,
      422,
      'INVALID_REVISION_REQUEST',
    );
  }
  if ((doc.revisionRequests || []).length >= REVISION_REQUEST_LIMIT) {
    return fail('This draft already has the maximum number of revision requests.', 409, 'REVISION_THREAD_FULL');
  }

  const entry = doc.revisionRequests.create({
    requester: actorId(req),
    time: new Date(),
    revision,
    text: trimmed,
  });
  await entry.validate();
  const requestId = String(entry._id);
  const externalJobId = `job:revise:${issueId}:${requestId}`;
  const idempotencyKey = `revise:${issueId}:${requestId}`;
  const { CONTRACT_VERSION, validateJobRequest } = require('../utilities/pivotAdminComputeJobContract');
  const { resolveImplementationRevision } = require('../utilities/pivotComputeContextVersion');
  const jobRequest = {
    contractVersion: CONTRACT_VERSION,
    jobId: externalJobId,
    scheduleOccurrenceId: null,
    kind: 'carousel-revise',
    cityKey: account.ownerTenantKey,
    implementationRevision: resolveImplementationRevision(),
    contextVersion: 'ctx:revise.pending',
    requestedAt: entry.time.toISOString(),
    idempotencyKey,
    options: { issueId: String(issueId), revision, requestId },
  };
  const requestValidation = validateJobRequest(jobRequest);
  if (!requestValidation.valid) {
    return fail('Could not queue a revision of this draft.', 422, 'INVALID_REVISION_REQUEST');
  }

  const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
  const saved = await PivotCarouselDeck.findOneAndUpdate(
    {
      _id: issueId,
      accountId: account._id,
      revision,
      origin: 'agent-generated',
      reviewState: { $ne: 'posted' },
      $expr: { $lt: [{ $size: { $ifNull: ['$revisionRequests', []] } }, REVISION_REQUEST_LIMIT] },
      agentRevision: revision,
    },
    { $push: { revisionRequests: entry.toObject() } },
    { new: true, runValidators: true },
  );
  if (!saved) {
    const current = await PivotCarouselDeck.findOne({ _id: issueId, accountId: account._id });
    if (!current) return fail('Issue not found.', 404, 'ISSUE_NOT_FOUND');
    if ((current.revision || 1) !== revision) {
      return fail('The issue changed since it was opened.', 409, 'REVISION_CONFLICT', {
        storedRevision: current.revision,
        presentedRevision: revision,
        issue: serializeIssue(current),
      });
    }
    if (current.reviewState === 'posted') {
      return fail('A posted draft cannot be revised.', 409, 'POSTED_ISSUE', { issue: serializeIssue(current) });
    }
    if (!hasStoredComposition(current)) {
      return fail('This draft has no stored composition.', 409, 'REVISE_COMPOSITION_MISSING', { issue: serializeIssue(current) });
    }
    if (editsSinceAgent(current)) {
      return fail(
        'This draft was edited in the studio after the agent last wrote it.',
        409,
        'EDITS_SINCE_AGENT',
        { issue: serializeIssue(current) },
      );
    }
    return fail('This draft already has the maximum number of revision requests.', 409, 'REVISION_THREAD_FULL');
  }

  // The request, its feedback note, and its job are separate writes. If a
  // later one fails, take the earlier ones back off the issue, so no request
  // is left waiting on a job that does not exist.
  let noteId = null;
  const takeBack = async () => {
    const pull = { revisionRequests: { _id: entry._id } };
    if (noteId) pull.feedbackNotes = { _id: noteId };
    try {
      await PivotCarouselDeck.updateOne({ _id: issueId, accountId: account._id }, { $pull: pull });
    } catch (error) {
      console.error('carousel revision request rollback failed', error);
    }
  };
  let job;
  try {
    const feedback = await require('./pivotCarouselEditorialFeedbackService').addCarouselIssueFeedback(
      req, accountId, issueId, { revision, text: trimmed, disposition: 'change' },
    );
    if (feedback.error) {
      await takeBack();
      return feedback;
    }
    noteId = feedback.data.note.id;

    const { createComputeJob } = require('./pivotComputeJobStore');
    ({ job } = await createComputeJob(req, {
      externalJobId,
      kind: 'carousel-revise',
      cityKey: account.ownerTenantKey,
      contractVersion: CONTRACT_VERSION,
      implementationRevision: jobRequest.implementationRevision,
      contextVersion: jobRequest.contextVersion,
      createIdempotencyKey: idempotencyKey,
      requestedAt: entry.time.toISOString(),
      origin: { type: 'admin', requestedBy: actorId(req) },
      options: jobRequest.options,
    }));
  } catch (error) {
    await takeBack();
    throw error;
  }
  await require('./pivotComputeWakeService').notifyComputeWorkerWake({ externalJobId });

  return {
    data: {
      issue: serializeIssue(saved),
      request: serializeRevisionRequest(saved.revisionRequests.id(entry._id)),
      job,
    },
  };
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
  const { doc } = loaded;
  const generated = (doc.origin || 'manual') === 'agent-generated';
  const conflict = checkRevision(doc.revision || 1, body.revision);
  if (conflict) return { ...conflict, issue: serializeIssue(doc) };

  // A retry still has to name the current revision, but it preserves the first
  // actor, timestamp, URL and snapshot instead of writing another post.
  const existing = (doc.postHistory || []).find((entry) => entry.revision === body.revision);
  if (existing) {
    return { data: { issue: serializeIssue(doc), alreadyPosted: true } };
  }

  // A generated issue is posted from an approved revision, never from one
  // someone merely looked at. Manual issues keep their existing workflow and
  // acquire posted history without ever entering the generated review state.
  if (generated && !(doc.reviewState === 'approved' && doc.approval?.revision === body.revision)) {
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

  const revisions = require('./pivotCarouselRevisionService');
  const snapshot = await revisions.recordPostedSnapshot(req, doc, {
    actedAt: postedAt,
    actedBy: actorId(req),
    instagramUrl,
  });
  const posting = {
    revision: doc.revision || 1,
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
      // Approval must still cover the head when the write lands, not just
      // when the request loaded its copy of the issue.
      ...(generated ? {
        origin: 'agent-generated',
        reviewState: 'approved',
        'approval.revision': body.revision,
      } : {}),
    },
    { $set: { posting, updatedBy: actorId(req), ...(generated ? { reviewState: 'posted' } : {}) }, $push: { postHistory: posting } },
    { new: true, runValidators: true },
  );
  if (!saved) {
    // This request's compare-and-swap did not land. Its snapshot is unreferenced
    // and must not look like another successful post.
    const { PivotCarouselRevision } = getGlobalModels(req, 'PivotCarouselRevision');
    await PivotCarouselRevision.deleteOne({ _id: snapshot._id, issueId, kind: 'posted' });
    const current = await PivotCarouselDeck.findOne({ _id: issueId, accountId: loaded.account._id });
    if (current?.revision === body.revision && (current.postHistory || []).some((entry) => entry.revision === body.revision)) {
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
    // A copy is new human work. It inherits the words, never
    // the approval or the record that something went out.
    origin: 'manual',
    reviewState: null,
    socialCaption: source.socialCaption || '',
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
  listCarouselOptionSet,
  pickCarouselOption,
  approveCarouselIssue,
  requestCarouselRevision,
  markCarouselIssuePosted,
  createCarouselAccount,
  getCarouselAccount,
  listCarouselIssues,
  createCarouselIssue,
  getCarouselIssue,
  getCarouselIssuePreview,
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
