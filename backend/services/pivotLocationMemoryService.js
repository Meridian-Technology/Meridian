const getModels = require('./getModelService');

// No tenant resolution here: ingest imports this module, and the routes that
// list or forget memories live in pivotLocationReviewService.
const TEMPLATE_OMIT_FIELDS = ['_id', 'originalInput', 'createdAt', 'updatedAt'];

function trimString(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

/**
 * Normalize source location text so trivial differences ("The Bell House!",
 * "the bell house") share one remembered decision. Deliberately conservative:
 * it never drops words, so "Bell House" and "Bell House Rooftop" stay distinct.
 */
function locationMatchKey(text) {
  return trimString(text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function memoryTemplate(richLocation) {
  if (!richLocation || typeof richLocation !== 'object') return null;
  const template = JSON.parse(JSON.stringify(richLocation));
  TEMPLATE_OMIT_FIELDS.forEach((field) => { delete template[field]; });
  return template;
}

/** Rebuild a remembered representation for one event's own source text. */
function richLocationFromMemory(memory, originalInput, now = new Date()) {
  const template = memoryTemplate(memory?.richLocation);
  if (!template) return null;
  return {
    ...template,
    originalInput: trimString(originalInput) || trimString(memory.sourceText),
    createdAt: now,
    updatedAt: now,
  };
}

function serializeMemory(memory) {
  if (!memory) return null;
  return {
    id: String(memory._id),
    matchKey: memory.matchKey,
    sourceText: memory.sourceText,
    richLocation: memoryTemplate(memory.richLocation),
    action: memory.action,
    rememberedBy: memory.rememberedBy || null,
    useCount: Number(memory.useCount) || 0,
    lastUsedAt: memory.lastUsedAt || null,
    updatedAt: memory.updatedAt || null,
  };
}

function memoryModel(db, tenantKey) {
  return getModels({ db, school: tenantKey }, 'PivotLocationMemory').PivotLocationMemory;
}

async function findMemoriesForTexts(db, tenantKey, texts = []) {
  const keys = [...new Set(texts.map(locationMatchKey).filter(Boolean))];
  if (!keys.length) return new Map();
  const memories = await memoryModel(db, tenantKey)
    .find({ tenantKey, matchKey: { $in: keys } })
    .lean();
  return new Map(memories.map((memory) => [memory.matchKey, memory]));
}

/**
 * Returns `(text) => Promise<{ richLocation, memoryId } | null>` for ingest and
 * backfill. A lookup failure falls through to the normal Google path rather
 * than blocking the crawl.
 */
function createLocationMemoryLookup({ db, tenantKey, now, recordUse = true } = {}) {
  const normalizedTenant = trimString(tenantKey).toLowerCase();
  if (!db || !normalizedTenant) return async () => null;
  return async (text) => {
    const matchKey = locationMatchKey(text);
    if (!matchKey) return null;
    try {
      const Model = memoryModel(db, normalizedTenant);
      if (!Model) return null;
      const memory = await Model.findOne({ tenantKey: normalizedTenant, matchKey }).lean();
      if (!memory) return null;
      const at = now ? new Date(typeof now === 'function' ? now() : now) : new Date();
      if (recordUse) {
        await Model.updateOne(
          { _id: memory._id },
          { $inc: { useCount: 1 }, $set: { lastUsedAt: at } },
        );
      }
      return {
        memoryId: String(memory._id),
        richLocation: richLocationFromMemory(memory, text, at),
      };
    } catch (error) {
      console.warn('Location memory lookup failed:', error.message);
      return null;
    }
  };
}

async function rememberLocation({
  db,
  tenantKey,
  sourceText,
  richLocation,
  action,
  reviewer,
  eventId,
}) {
  const matchKey = locationMatchKey(sourceText);
  const template = memoryTemplate(richLocation);
  if (!matchKey || !template) return null;
  const normalizedTenant = trimString(tenantKey).toLowerCase();
  return memoryModel(db, normalizedTenant).findOneAndUpdate(
    { tenantKey: normalizedTenant, matchKey },
    {
      $set: {
        tenantKey: normalizedTenant,
        matchKey,
        sourceText: trimString(sourceText),
        richLocation: template,
        action,
        rememberedBy: { id: reviewer?.id || null, email: reviewer?.email || null },
        sourceEventId: eventId ? String(eventId) : null,
      },
      $setOnInsert: { useCount: 0 },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
}

module.exports = {
  locationMatchKey,
  memoryTemplate,
  richLocationFromMemory,
  serializeMemory,
  findMemoriesForTexts,
  createLocationMemoryLookup,
  memoryModel,
  rememberLocation,
};
