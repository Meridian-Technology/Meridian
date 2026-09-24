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
const { slideTypeFor } = require('../constants/zineSlideTypes');

const ISSUE_LIMITS = Object.freeze({
  maxSlides: 20,
  maxElementsPerSlide: 64,
  minFrame: 8,
  maxFrame: 4320,
  minCropScale: 1,
  maxCropScale: 8,
  maxTextLength: 8000,
  maxDocumentBytes: 1_500_000,
});

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
  if (document == null) return null;
  if (document.schemaVersion !== 2) {
    return fail('Editable issues use schemaVersion 2.', 422, 'SCHEMA_VERSION_UNSUPPORTED');
  }
  const encoded = JSON.stringify(document);
  if (Buffer.byteLength(encoded) > ISSUE_LIMITS.maxDocumentBytes) {
    return fail('The issue document is too large.', 422, 'DOCUMENT_TOO_LARGE', { limits: ISSUE_LIMITS });
  }
  const slides = Array.isArray(document.slides) ? document.slides : [];
  if (slides.length > ISSUE_LIMITS.maxSlides) {
    return fail(
      `An issue can hold ${ISSUE_LIMITS.maxSlides} slides.`,
      422,
      'SLIDE_CAP',
      { limits: ISSUE_LIMITS },
    );
  }
  for (const slide of slides) {
    const elements = [];
    for (const element of slide.elements || []) walkElements(element, (node) => elements.push(node));
    if (elements.length > ISSUE_LIMITS.maxElementsPerSlide) {
      return fail('A slide has too many elements.', 422, 'ELEMENT_CAP', { limits: ISSUE_LIMITS });
    }
    for (const element of elements) {
      const frame = element.frame;
      if (!frame) return fail(`Element ${element.id || ''} is missing a frame.`, 422, 'INVALID_DOCUMENT');
      if (frame.width < ISSUE_LIMITS.minFrame || frame.height < ISSUE_LIMITS.minFrame
        || frame.width > ISSUE_LIMITS.maxFrame || frame.height > ISSUE_LIMITS.maxFrame) {
        return fail(`Element ${element.id || ''} is outside the frame bounds.`, 422, 'INVALID_DOCUMENT');
      }
      if (element.crop) {
        const scale = element.crop.scale ?? 1;
        if (scale < ISSUE_LIMITS.minCropScale || scale > ISSUE_LIMITS.maxCropScale) {
          return fail(`Element ${element.id || ''} has an invalid crop.`, 422, 'INVALID_DOCUMENT');
        }
      }
      if (element.kind === 'text' && String(element.text || '').length > ISSUE_LIMITS.maxTextLength) {
        return fail(`Element ${element.id || ''} text is too long.`, 422, 'INVALID_DOCUMENT');
      }
    }
  }
  return null;
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

function serializeIssue(doc) {
  const row = doc.toObject ? doc.toObject() : doc;
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
  const documentError = validateDocument(body.document);
  if (documentError) return documentError;

  const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
  const doc = await PivotCarouselDeck.create({
    tenantKey: loaded.account.ownerTenantKey,
    title: name,
    name,
    accountId: loaded.account._id,
    format,
    status: 'active',
    schemaVersion: body.document ? 2 : 1,
    revision: 1,
    slides,
    document: body.document || null,
    curation: body.curation || null,
    sources: body.sources || [],
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

async function writeIssue(req, accountId, issueId, body, mutate) {
  const loaded = await getCarouselIssue(req, accountId, issueId);
  if (loaded.error) return loaded;
  const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
  const doc = await PivotCarouselDeck.findOne({ _id: issueId, accountId });
  const conflict = checkRevision(doc.revision || 1, body.revision);
  if (conflict) return conflict;
  const sourceError = await assertSources(req, (await loadAccount(req, accountId)).account, body.sources);
  if (sourceError) return sourceError;
  if (body.document !== undefined) {
    const documentError = validateDocument(body.document);
    if (documentError) return documentError;
    doc.document = body.document;
    doc.schemaVersion = 2;
    doc.markModified('document');
  }
  if (body.sources !== undefined) doc.sources = body.sources;
  await mutate(doc, loaded);
  doc.revision = (doc.revision || 1) + 1;
  doc.updatedBy = actorId(req);
  await doc.save();
  return { data: { issue: serializeIssue(doc) } };
}

async function renameCarouselIssue(req, accountId, issueId, body = {}) {
  const name = text(body.name, 80);
  if (!name) return fail('An issue name is required.', 400, 'NAME_REQUIRED');
  return writeIssue(req, accountId, issueId, body, (doc) => {
    doc.name = name;
    doc.title = name;
  });
}

async function updateCarouselIssue(req, accountId, issueId, body = {}) {
  if (body.format && !FORMATS.includes(body.format)) {
    return fail('Unknown issue format.', 400, 'FORMAT_INVALID');
  }
  return writeIssue(req, accountId, issueId, body, (doc) => {
    if (body.format) doc.format = body.format;
    if (body.curation !== undefined) {
      doc.curation = body.curation;
      doc.markModified('curation');
    }
  });
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
    createdBy: actorId(req),
    updatedBy: actorId(req),
  });
  return { data: { issue: serializeIssue(doc), unsupported: converted.unsupported } };
}

module.exports = {
  ISSUE_LIMITS,
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
  listCarouselAccounts,
  createEditableCopy,
  convertLegacySlide,
  loadAccount,
  assertSources,
};
