const crypto = require('crypto');
const getGlobalModels = require('./getGlobalModelService');
const { getTenantByKey } = require('./tenantConfigService');
const { resolvePivotTenant } = require('./pivotIngestPublishService');

const CODE_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const ID_PATTERN = /^[a-f\d]{24}$/i;
const STATUSES = new Set(['active', 'revoked']);
const LIST_LIMIT = 500;
const NUMBER_ATTEMPTS = 25;

const missing = () => ({ error: 'Tag not found.', status: 404, code: 'TAG_NOT_FOUND' });
const invalid = (error) => ({ error, status: 400, code: 'INVALID_TAG_INPUT' });
/** 128 random bits, 22 URL-safe characters: short enough for the smallest NTAG. */
const newCode = () => crypto.randomBytes(16).toString('base64url');
const codeHash = (code) => crypto.createHash('sha256').update(code).digest('hex');
const validId = (id) => ID_PATTERN.test(String(id || ''));

function tagUrl(code) {
  const base = (process.env.JUSTGO_TAG_URL_BASE || 'https://justgo.lol/pivot/tag').replace(/\/+$/, '');
  return `${base}/${code}`;
}

function tagData(row) {
  return {
    id: String(row._id),
    tenantKey: row.tenantKey,
    number: row.number,
    status: row.status,
    note: row.note || '',
    writtenAt: row.writtenAt || null,
    createdAt: row.createdAt,
  };
}

/** What the admin's phone writes: the code and URL, returned once. */
function writableTag(row, code) {
  return { data: { tag: tagData(row), code, url: tagUrl(code) } };
}

function cleanNote(note) {
  if (note === undefined || note === null) return '';
  if (typeof note !== 'string') return null;
  const trimmed = note.trim();
  return trimmed.length <= 120 ? trimmed : null;
}

const cityName = (tenant) => tenant?.location || tenant?.name || tenant?.tenantKey || '';

/** Every admin call is scoped to one Just Go city. */
async function withCity(req, tenantKey, run) {
  const resolved = await resolvePivotTenant(req, tenantKey);
  if (resolved.error) return resolved;
  return run(resolved.tenant.tenantKey, resolved.tenant);
}

function listTags(req, tenantKey) {
  return withCity(req, tenantKey, async (city, tenant) => {
    const { JustGoTag } = getGlobalModels(req, 'JustGoTag');
    const rows = await JustGoTag.find({ tenantKey: city }).sort({ number: -1 }).limit(LIST_LIMIT).lean();
    return { data: { tenantKey: city, cityDisplayName: cityName(tenant), tags: rows.map(tagData) } };
  });
}

/**
 * The next number is one past the city's highest so far. Two admins making
 * tags at once collide on the unique index, and the loser takes the next one.
 */
function createTag(req, tenantKey, body = {}) {
  return withCity(req, tenantKey, async (city) => {
    const note = cleanNote(body.note);
    if (note === null) return invalid('A note is at most 120 characters.');
    const { JustGoTag } = getGlobalModels(req, 'JustGoTag');

    for (let attempt = 0; attempt < NUMBER_ATTEMPTS; attempt += 1) {
      const last = await JustGoTag.findOne({ tenantKey: city }).sort({ number: -1 }).select('number').lean();
      const code = newCode();
      try {
        const row = await JustGoTag.create({
          tenantKey: city,
          number: (last?.number || 0) + 1,
          tokenHash: codeHash(code),
          note,
          createdBy: req.user.globalUserId,
        });
        return { status: 201, ...writableTag(row, code) };
      } catch (error) {
        if (error?.code !== 11000) throw error;
      }
    }
    return { error: 'Too many tags are being made at once. Try again.', status: 409, code: 'TAG_NUMBER_CONFLICT' };
  });
}

/**
 * New code for rewriting a tag (a failed write, or a tag that was lost). The
 * old code stops working, so a copy of the old URL is dead too.
 */
function rotateTagCode(req, tenantKey, tagId) {
  return withCity(req, tenantKey, async (city) => {
    if (!validId(tagId)) return missing();
    const { JustGoTag } = getGlobalModels(req, 'JustGoTag');
    const code = newCode();
    const row = await JustGoTag.findOneAndUpdate(
      { _id: tagId, tenantKey: city },
      { $set: { tokenHash: codeHash(code), writtenAt: null, writtenBy: null } },
      { new: true },
    ).lean();
    return row ? writableTag(row, code) : missing();
  });
}

/**
 * An admin phone wiped the tag holding this code. The code stops working and
 * the tag reads as not written, keeping its number so it can be written again
 * (writing rotates a fresh code). Nobody gets the replacement code.
 */
function eraseTag(req, tenantKey, body = {}) {
  return withCity(req, tenantKey, async () => {
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!CODE_PATTERN.test(code)) return missing();
    const { JustGoTag } = getGlobalModels(req, 'JustGoTag');
    // Not limited to this city: the tag in hand is already wiped, so its
    // record follows wherever it belongs. The response carries its city.
    const row = await JustGoTag.findOneAndUpdate(
      { tokenHash: codeHash(code) },
      { $set: { tokenHash: codeHash(newCode()), writtenAt: null, writtenBy: null } },
      { new: true },
    ).lean();
    return row ? { data: { tag: tagData(row) } } : missing();
  });
}

function markTagWritten(req, tenantKey, tagId) {
  return withCity(req, tenantKey, async (city) => {
    if (!validId(tagId)) return missing();
    const { JustGoTag } = getGlobalModels(req, 'JustGoTag');
    const row = await JustGoTag.findOneAndUpdate(
      { _id: tagId, tenantKey: city },
      { $set: { writtenAt: new Date(), writtenBy: req.user.globalUserId } },
      { new: true },
    ).lean();
    return row ? { data: { tag: tagData(row) } } : missing();
  });
}

function setTagStatus(req, tenantKey, tagId, body = {}) {
  return withCity(req, tenantKey, async (city) => {
    if (!validId(tagId)) return missing();
    if (!STATUSES.has(body.status)) return invalid('Status must be active or revoked.');
    const { JustGoTag } = getGlobalModels(req, 'JustGoTag');
    const row = await JustGoTag.findOneAndUpdate(
      { _id: tagId, tenantKey: city },
      { $set: { status: body.status } },
      { new: true },
    ).lean();
    return row ? { data: { tag: tagData(row) } } : missing();
  });
}

/**
 * Public: the number, state and city behind a tapped code. Nothing about
 * holders. The city lets the clip, which has no city of its own, label it.
 */
async function lookupTag(req, body = {}) {
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!CODE_PATTERN.test(code)) return missing();
  const { JustGoTag } = getGlobalModels(req, 'JustGoTag');
  const row = await JustGoTag.findOne({ tokenHash: codeHash(code) }).select('tenantKey number status').lean();
  if (!row) return missing();
  const tenant = await getTenantByKey(req, row.tenantKey, { exact: true }).catch(() => null);
  return {
    data: {
      tag: {
        number: row.number,
        status: row.status,
        tenantKey: row.tenantKey,
        cityDisplayName: cityName(tenant) || row.tenantKey,
      },
    },
  };
}

module.exports = {
  listTags,
  createTag,
  rotateTagCode,
  eraseTag,
  markTagWritten,
  setTagStatus,
  lookupTag,
  tagUrl,
};
