/**
 * Schema v2 carousel documents.
 *
 * Commands and validation are plain data. Rendering reads the stored text,
 * crop, and frames. It does not look up live tenant voice, and these nodes
 * are never passed through the legacy slide coercer.
 */

const { zineVoiceKeys } = require('../constants/zineSlideTypes');

const SCHEMA_VERSION = 2;
const SLIDE_WIDTH = 1080;
const SLIDE_HEIGHT = 1350;

const LIMITS = Object.freeze({
  maxSlides: 20,
  maxElementsPerSlide: 64,
  minFrame: 8,
  maxFrame: 4320,
  minCropScale: 1,
  maxCropScale: 8,
  maxTextLength: 8000,
  maxDocumentBytes: 1_500_000,
});

const KINDS = new Set(['text', 'image', 'card', 'sticker', 'shape']);
const PRESENCE = new Set(['default', 'custom', 'blank', 'removed']);

function fail(error, status, code, extra = {}) {
  return { error, status, code, ...extra };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function shippedCatalog() {
  const catalog = {};
  for (const row of zineVoiceKeys()) catalog[row.path] = row.shipped ?? '';
  return catalog;
}

function entriesOf(layer) {
  if (!layer || typeof layer !== 'object') return {};
  if (layer.entries && typeof layer.entries === 'object') return layer.entries;
  return layer;
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  const children = node.children || node.elements || node.slides || [];
  for (const child of children) walk(child, visit);
}

function findElement(node, id) {
  if (!node) return null;
  if (node.id === id) return node;
  const children = node.children || node.elements || [];
  for (const child of children) {
    const found = findElement(child, id);
    if (found) return found;
  }
  return null;
}

function findParent(node, id) {
  const children = node?.children || node?.elements || [];
  for (const child of children) {
    if (child.id === id) return node;
    const found = findParent(child, id);
    if (found) return found;
  }
  return null;
}

const { reflowCard, normalizeElement, normalizeSlide } = require('../../frontend/src/shared/carouselStudio/document');

/**
 * Identity migration for version 2. Any other version fails the read.
 * Version 1 stays on the manifest renderer and is not converted here.
 */
function migrateDocument(raw) {
  if (raw == null) return { document: null };
  const version = raw.schemaVersion;
  if (version === SCHEMA_VERSION) {
    return { document: normalizeDocument(raw) };
  }
  return fail(
    version === 1
      ? 'Legacy decks stay on the manifest renderer.'
      : `Unsupported document schemaVersion ${version}.`,
    422,
    'SCHEMA_VERSION_UNSUPPORTED',
    { schemaVersion: version ?? null },
  );
}

function normalizeDocument(raw) {
  const slides = Array.isArray(raw.slides)
    ? raw.slides.map(normalizeSlide)
    : [normalizeSlide(raw, 0)];
  return {
    schemaVersion: SCHEMA_VERSION,
    width: Number(raw.width || SLIDE_WIDTH),
    height: Number(raw.height || SLIDE_HEIGHT),
    presetVersion: raw.presetVersion || null,
    slides,
  };
}

function serializeDocument(document) {
  return clone(document);
}

function loadDocument(raw) {
  const migrated = migrateDocument(typeof raw === 'string' ? JSON.parse(raw) : raw);
  if (migrated.error) return migrated;
  return { document: serializeDocument(migrated.document) };
}

function validatePrepared(document) {
  if (document == null) return null;
  const encoded = JSON.stringify(document);
  if (Buffer.byteLength(encoded) > LIMITS.maxDocumentBytes) {
    return fail('The issue document is too large.', 422, 'DOCUMENT_TOO_LARGE', { limits: LIMITS });
  }
  if (document.schemaVersion !== SCHEMA_VERSION) {
    return fail('Editable issues use schemaVersion 2.', 422, 'SCHEMA_VERSION_UNSUPPORTED');
  }
  const slides = document.slides || [];
  if (slides.length > LIMITS.maxSlides) {
    return fail(`An issue can hold ${LIMITS.maxSlides} slides.`, 422, 'SLIDE_CAP', { limits: LIMITS });
  }
  for (const slide of slides) {
    const elements = [];
    for (const element of slide.elements || []) walk(element, (node) => elements.push(node));
    if (elements.length > LIMITS.maxElementsPerSlide) {
      return fail('A slide has too many elements.', 422, 'ELEMENT_CAP', { limits: LIMITS });
    }
    for (const element of elements) {
      if (!KINDS.has(element.kind)) {
        return fail(`Element ${element.id || ''} has an unknown kind.`, 422, 'INVALID_DOCUMENT');
      }
      const frame = element.frame;
      if (!frame || !Number.isFinite(frame.width) || !Number.isFinite(frame.height)) {
        return fail(`Element ${element.id || ''} is missing a frame.`, 422, 'INVALID_DOCUMENT');
      }
      if (frame.width < LIMITS.minFrame || frame.height < LIMITS.minFrame
        || frame.width > LIMITS.maxFrame || frame.height > LIMITS.maxFrame) {
        return fail(`Element ${element.id || ''} is outside the frame bounds.`, 422, 'INVALID_DOCUMENT');
      }
      if (element.crop) {
        const { scale, focalX, focalY } = element.crop;
        if (scale < LIMITS.minCropScale || scale > LIMITS.maxCropScale
          || focalX < 0 || focalX > 1 || focalY < 0 || focalY > 1) {
          return fail(`Element ${element.id || ''} has an invalid crop.`, 422, 'INVALID_DOCUMENT');
        }
      }
      if (element.kind === 'text' && element.text.length > LIMITS.maxTextLength) {
        return fail(`Element ${element.id || ''} text is too long.`, 422, 'INVALID_DOCUMENT');
      }
      if (element.kind === 'text' && !PRESENCE.has(element.presence)) {
        return fail(`Element ${element.id || ''} has an unknown text presence.`, 422, 'INVALID_DOCUMENT');
      }
    }
  }
  return null;
}

function prepareDocument(raw) {
  if (raw == null) return { document: null };
  const migrated = migrateDocument(raw);
  if (migrated.error) return migrated;
  const invalid = validatePrepared(migrated.document);
  if (invalid) return invalid;
  return { document: migrated.document };
}

function resolveVoiceValue(key, layers) {
  const shipped = { ...(shippedCatalog()), ...(entriesOf(layers?.shipped)) };
  const city = entriesOf(layers?.city);
  const account = entriesOf(layers?.account);
  const issue = entriesOf(layers?.issue);
  if (Object.prototype.hasOwnProperty.call(issue, key) && issue[key] != null && issue[key] !== '') {
    return { text: String(issue[key]), source: 'issue' };
  }
  if (Object.prototype.hasOwnProperty.call(account, key) && account[key] != null && account[key] !== '') {
    return { text: String(account[key]), source: 'account' };
  }
  if (Object.prototype.hasOwnProperty.call(city, key) && city[key] != null && city[key] !== '') {
    return { text: String(city[key]), source: 'city' };
  }
  return { text: String(shipped[key] ?? ''), source: 'shipped' };
}

/**
 * Copy resolved voice onto elements that still use the default. Custom,
 * blank, and removed text are left exactly as stored.
 */
function materializeVoice(document, layers = {}) {
  if (!document) return document;
  const next = clone(document);
  const version = layers.version || 'creation';
  walk(next, (node) => {
    if (node.kind !== 'text' || !node.voice?.key) return;
    if (node.presence === 'custom' || node.presence === 'blank' || node.presence === 'removed') return;
    const resolved = resolveVoiceValue(node.voice.key, layers);
    node.text = resolved.text;
    node.presence = 'default';
    node.voice = {
      key: node.voice.key,
      source: resolved.source,
      version,
      resolved: resolved.text,
    };
  });
  return next;
}

/** Restore the string captured at creation. Does not read live voice. */
function resetText(document, id) {
  const next = clone(document);
  const element = findInDocument(next, id);
  if (!element || element.kind !== 'text') {
    return fail(`Unknown text element ${id}.`, 422, 'INVALID_DOCUMENT');
  }
  if (!element.voice?.resolved && element.voice?.resolved !== '') {
    return fail(`Element ${id} has no captured voice default.`, 422, 'VOICE_UNCAPTURED');
  }
  element.text = element.voice.resolved;
  element.presence = 'default';
  element.voice = { ...element.voice, source: element.voice.source || 'shipped' };
  return { document: next };
}

function findInDocument(document, id) {
  if (!document) return null;
  if (document.elements) return findElement(document, id);
  for (const slide of document.slides || []) {
    const found = findElement(slide, id);
    if (found) return found;
  }
  return null;
}

function parentInDocument(document, id) {
  if (document.elements) return findParent(document, id);
  for (const slide of document.slides || []) {
    const found = findParent(slide, id);
    if (found) return found;
  }
  return null;
}

function removeField(document, id) {
  const next = clone(document);
  const element = findInDocument(next, id);
  if (!element) return fail(`Unknown element ${id}.`, 422, 'INVALID_DOCUMENT');
  element.presence = 'removed';
  const parent = parentInDocument(next, id);
  if (parent?.kind === 'card') reflowCard(parent);
  return { document: next };
}

module.exports = {
  SCHEMA_VERSION,
  SLIDE_WIDTH,
  SLIDE_HEIGHT,
  LIMITS,
  findElement,
  reflowCard,
  migrateDocument,
  serializeDocument,
  loadDocument,
  prepareDocument,
  materializeVoice,
  resolveVoiceValue,
  resetText,
  removeField,
};
