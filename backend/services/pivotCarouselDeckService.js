/**
 * Carousel decks — CRUD for the "sorry u missed it" Instagram deck.
 *
 * Every write is coerced through constants/zineSlideTypes.js, so the manifest
 * is the only description of a slide's shape and the database cannot end up
 * holding copy the frames have no room to render.
 *
 * The deck's demo content lives in the frontend, not here: it is example data
 * for a UI, and seeding it is an ordinary create with a body the editor sends.
 */

const getGlobalModels = require('./getGlobalModelService');
const { getTenantByKey } = require('./tenantConfigService');
const { isPivotTenant } = require('../utilities/pivotDropSchedule');
const {
  ZINE_SLIDE_TYPES,
  ZINE_ADDABLE_TYPES,
  slideTypeFor,
  emptySlideOf,
  coerceSlide,
  slideGaps,
} = require('../constants/zineSlideTypes');
const { isValidIsoWeek } = require('../utilities/pivotIsoWeek');
const { uploadImageToS3 } = require('./imageUploadService');

const TITLE_MAX = 80;
const DECK_SLIDE_MAX = 20;

async function requirePivotTenant(req, tenantKey) {
  const key = String(tenantKey || '').trim().toLowerCase();
  if (!key) return { error: 'tenantKey is required.', status: 400, code: 'TENANT_KEY_REQUIRED' };

  const tenant = await getTenantByKey(req, key);
  if (!tenant) return { error: 'Tenant not found.', status: 404, code: 'TENANT_NOT_FOUND' };
  if (!isPivotTenant(tenant)) {
    return {
      error: 'Carousels are only available for Pivot city tenants.',
      status: 403,
      code: 'NOT_PIVOT_TENANT',
    };
  }
  return { tenant, tenantKey: key };
}

function text(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function serializeSlide(slide) {
  const row = slide?.toObject ? slide.toObject() : slide;
  return {
    _id: String(row._id),
    type: row.type,
    values: row.values || {},
    options: row.options || {},
    events: (row.events || []).map((entry) => ({
      eventId: entry.eventId ? String(entry.eventId) : null,
      label: entry.label || null,
      snapshot: entry.snapshot?.name || entry.snapshot?.image ? entry.snapshot : null,
      imageOverride: entry.imageOverride?.url ? entry.imageOverride : null,
      values: entry.values || {},
    })),
    gaps: slideGaps(row),
  };
}

function coverImageOf(row) {
  const event = row.slides?.[0]?.events?.[0];
  return event?.imageOverride?.url || event?.snapshot?.image || row.document?.slides?.[0]?.elements?.find((element) => element.kind === 'image')?.asset?.src || null;
}

function serializeDeck(doc, { withSlides = true } = {}) {
  const row = doc?.toObject ? doc.toObject() : doc;
  const base = {
    _id: String(row._id),
    tenantKey: row.tenantKey,
    title: row.title,
    batchWeek: row.batchWeek || null,
    edition: row.edition || 'night',
    inkPlate: row.inkPlate !== false,
    showIssueNumber: row.showIssueNumber !== false,
    issue: row.issue || {},
    slideCount: (row.slides || []).length,
    lastExportedAt: row.lastExportedAt || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    accountId: row.accountId ? String(row.accountId) : null,
    name: row.name || row.title,
    format: row.format || null,
    status: row.status || 'active',
    schemaVersion: row.schemaVersion || 1,
    revision: row.revision || 1,
    coverType: row.slides?.[0]?.type || row.document?.slides?.[0]?.preset?.id || null,
    coverImage: coverImageOf(row),
  };
  if (!withSlides) return base;
  return {
    ...base,
    voice: row.voice || { entries: {}, tokens: {} },
    slides: (row.slides || []).map(serializeSlide),
    document: row.document || null,
    curation: row.curation || null,
    sources: row.sources || [],
  };
}

/**
 * A new deck opens on the cover and closes on the back, both empty. Neither is
 * removable — every carousel opening and closing the same way is what makes
 * the format recognisable at a glance in a feed.
 */
function seedSlides() {
  return [emptySlideOf('cover'), emptySlideOf('back')];
}

/**
 * Hold the fixed pair at the ends regardless of what the client sent. A deck
 * missing either gets it back; a stray second one is dropped.
 */
function enforceFixedEnds(slides) {
  const middle = slides.filter((slide) => !slideTypeFor(slide.type)?.fixed);
  const first = slides.find((slide) => slideTypeFor(slide.type)?.fixed === 'first')
    || emptySlideOf('cover');
  const last = slides.find((slide) => slideTypeFor(slide.type)?.fixed === 'last')
    || emptySlideOf('back');
  return [first, ...middle, last];
}

function coerceSlides(rawSlides) {
  const notes = [];
  const slides = [];

  for (const raw of (Array.isArray(rawSlides) ? rawSlides : []).slice(0, DECK_SLIDE_MAX)) {
    const result = coerceSlide(raw);
    if (result.code === 'SCHEMA_VERSION_UNSUPPORTED') return result;
    if (result.error) {
      notes.push(result.error);
      continue;
    }
    notes.push(...result.notes);
    slides.push(result.slide);
  }

  return { slides: enforceFixedEnds(slides), notes };
}

function coerceIssue(raw = {}) {
  return {
    number: text(raw.number, 8),
    city: text(raw.city, 40),
    dateline: text(raw.dateline, 32),
    week: text(raw.week, 40),
    scanned: text(raw.scanned, 6).replace(/[^0-9]/g, ''),
  };
}

function coerceVoice(raw = {}) {
  const pick = (map) => {
    const out = {};
    for (const [key, value] of Object.entries(map || {})) {
      if (typeof value === 'string' && value.trim()) out[key] = value.slice(0, 500);
    }
    return out;
  };
  return { entries: pick(raw.entries), tokens: pick(raw.tokens) };
}

/* --------------------------------------------------------------- reads */

async function listCarouselDecks(req, tenantKey) {
  const gate = await requirePivotTenant(req, tenantKey);
  if (gate.error) return gate;

  const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
  const docs = await PivotCarouselDeck.find({ tenantKey: gate.tenantKey })
    .sort({ updatedAt: -1 })
    .lean();

  return {
    data: {
      tenantKey: gate.tenantKey,
      decks: docs.map((doc) => serializeDeck(doc, { withSlides: false })),
    },
  };
}

async function getCarouselDeck(req, tenantKey, deckId) {
  const gate = await requirePivotTenant(req, tenantKey);
  if (gate.error) return gate;

  const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
  const doc = await PivotCarouselDeck.findOne({ _id: deckId, tenantKey: gate.tenantKey }).lean();
  if (!doc) return { error: 'Deck not found.', status: 404, code: 'DECK_NOT_FOUND' };

  /*
   * The city's static copy rides alongside rather than inside the deck. Merging
   * it into deck.voice would mean the next save wrote the city's values onto
   * this deck, quietly turning a shared default into a private override.
   */
  const { PivotCarouselVoice } = getGlobalModels(req, 'PivotCarouselVoice');
  const voiceDoc = await PivotCarouselVoice.findOne({ tenantKey: gate.tenantKey }).lean();

  return {
    data: {
      deck: serializeDeck(doc),
      cityVoice: voiceDoc?.entries || {},
      // The editor gets the manifest with the deck so it never ships its own
      // copy of the slide contract.
      manifest: { types: ZINE_SLIDE_TYPES, addable: ZINE_ADDABLE_TYPES },
    },
  };
}

/* -------------------------------------------------------------- writes */

async function createCarouselDeck(req, tenantKey, body = {}) {
  const gate = await requirePivotTenant(req, tenantKey);
  if (gate.error) return gate;

  const title = text(body.title, TITLE_MAX);
  if (!title) return { error: 'A deck title is required.', status: 400, code: 'TITLE_REQUIRED' };

  const batchWeek = text(body.batchWeek, 8) || null;
  if (batchWeek && !isValidIsoWeek(batchWeek)) {
    return { error: 'batchWeek must be ISO week format YYYY-Www.', status: 400 };
  }

  // A body with slides is a seed (the editor posting its reference issue);
  // without them it is an empty deck, which opens on cover and back.
  if (Number(body.schemaVersion) >= 2 || body.document?.schemaVersion >= 2) {
    return {
      error: 'Schema version 2 issues are not created through the legacy slide manifest.',
      status: 422,
      code: 'SCHEMA_VERSION_UNSUPPORTED',
    };
  }

  const hasSlides = Array.isArray(body.slides) && body.slides.length > 0;
  const coerced = hasSlides ? coerceSlides(body.slides) : { slides: seedSlides(), notes: [] };
  if (coerced.code) return { error: coerced.error, status: 422, code: coerced.code };
  const { slides, notes } = coerced;

  const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
  const doc = await PivotCarouselDeck.create({
    tenantKey: gate.tenantKey,
    title,
    batchWeek,
    edition: body.edition === 'paper' ? 'paper' : 'night',
    inkPlate: body.inkPlate !== false,
    showIssueNumber: body.showIssueNumber !== false,
    issue: coerceIssue(body.issue),
    voice: coerceVoice(body.voice),
    slides,
    createdBy: req.user?.globalUserId || req.user?.userId || null,
    updatedBy: req.user?.globalUserId || req.user?.userId || null,
  });

  return { data: { deck: serializeDeck(doc), notes } };
}

async function updateCarouselDeck(req, tenantKey, deckId, body = {}) {
  const gate = await requirePivotTenant(req, tenantKey);
  if (gate.error) return gate;

  const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
  const doc = await PivotCarouselDeck.findOne({ _id: deckId, tenantKey: gate.tenantKey });
  if (!doc) return { error: 'Deck not found.', status: 404, code: 'DECK_NOT_FOUND' };

  const notes = [];

  if (body.title !== undefined) {
    const title = text(body.title, TITLE_MAX);
    if (!title) return { error: 'A deck title is required.', status: 400 };
    doc.title = title;
  }

  if (body.batchWeek !== undefined) {
    const batchWeek = text(body.batchWeek, 8) || null;
    if (batchWeek && !isValidIsoWeek(batchWeek)) {
      return { error: 'batchWeek must be ISO week format YYYY-Www.', status: 400 };
    }
    doc.batchWeek = batchWeek;
  }

  if (body.edition !== undefined) doc.edition = body.edition === 'paper' ? 'paper' : 'night';
  if (body.inkPlate !== undefined) doc.inkPlate = body.inkPlate !== false;
  if (body.showIssueNumber !== undefined) doc.showIssueNumber = body.showIssueNumber !== false;
  if (body.issue !== undefined) doc.issue = coerceIssue(body.issue);
  if (body.voice !== undefined) doc.voice = coerceVoice(body.voice);

  if ((doc.schemaVersion || 1) >= 2 && (body.slides !== undefined || body.document !== undefined)) {
    return {
      error: 'Schema version 2 issues are saved as documents, not trimmed into legacy slides.',
      status: 422,
      code: 'SCHEMA_VERSION_UNSUPPORTED',
    };
  }

  if (body.slides !== undefined) {
    const coerced = coerceSlides(body.slides);
    if (coerced.code) return { error: coerced.error, status: 422, code: coerced.code };
    doc.slides = coerced.slides;
    notes.push(...coerced.notes);
  }

  doc.updatedBy = req.user?.globalUserId || req.user?.userId || null;
  await doc.save();

  return { data: { deck: serializeDeck(doc), notes } };
}

async function deleteCarouselDeck(req, tenantKey, deckId) {
  const gate = await requirePivotTenant(req, tenantKey);
  if (gate.error) return gate;

  const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
  const result = await PivotCarouselDeck.deleteOne({ _id: deckId, tenantKey: gate.tenantKey });
  if (!result.deletedCount) return { error: 'Deck not found.', status: 404, code: 'DECK_NOT_FOUND' };

  return { data: { deleted: true, deckId: String(deckId) } };
}

/**
 * Replace one event slot's photograph. Slots default to the event's own flier,
 * so this is only reached when someone deliberately supplies a better one; the
 * override sits beside the snapshot rather than overwriting it, so clearing it
 * falls back to the flier rather than to nothing.
 */
async function setSlideImage(req, tenantKey, deckId, slideId, slotIndex, file) {
  const gate = await requirePivotTenant(req, tenantKey);
  if (gate.error) return gate;

  const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
  const doc = await PivotCarouselDeck.findOne({ _id: deckId, tenantKey: gate.tenantKey });
  if (!doc) return { error: 'Deck not found.', status: 404, code: 'DECK_NOT_FOUND' };

  const slide = doc.slides.id(slideId);
  if (!slide) return { error: 'Slide not found.', status: 404, code: 'SLIDE_NOT_FOUND' };

  const index = Number(slotIndex) || 0;
  const entry = slide.events[index];
  if (!entry) return { error: 'Event slot not found.', status: 404, code: 'SLOT_NOT_FOUND' };

  if (!file) {
    // No file is a clear, which is why it is not an error.
    entry.imageOverride = { url: null, key: null };
  } else {
    let location;
    try {
      // Returns the S3 Location string; the generated key stays internal to the
      // upload service, so there is nothing to record for a later delete.
      location = await uploadImageToS3(file, `pivot-carousel/${gate.tenantKey}`);
    } catch (err) {
      return { error: err.message || 'Could not upload the image.', status: 400 };
    }
    entry.imageOverride = { url: location, key: null };
  }

  doc.updatedBy = req.user?.globalUserId || req.user?.userId || null;
  await doc.save();

  return { data: { deck: serializeDeck(doc) } };
}

module.exports = {
  setSlideImage,
  listCarouselDecks,
  getCarouselDeck,
  createCarouselDeck,
  updateCarouselDeck,
  deleteCarouselDeck,
  serializeDeck,
};
