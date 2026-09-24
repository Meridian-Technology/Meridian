import { reflowCard, normalizeElement } from '../../../../../shared/carouselStudio/document';
export { reflowCard };
/**
 * Schema v2 document commands for the carousel studio spike.
 *
 * Positions are logical pixels on a 1080 × 1350 slide. One container-query
 * unit (1cqw) is 10.8px, so the same numbers render at editor zoom and at
 * the export surface. Commands never read React state.
 */

export const SLIDE_WIDTH = 1080;
export const SLIDE_HEIGHT = 1350;
export const CQW = SLIDE_WIDTH / 100;

export const LIMITS = Object.freeze({
  maxSlides: 20,
  maxElements: 64,
  minSize: 8,
  maxSize: 4320,
  minCropScale: 1,
  maxCropScale: 8,
  maxTextLength: 8000,
});

export function cqw(value) {
  return value * CQW;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function findElement(node, id) {
  if (!node) return null;
  if (node.id === id) return node;
  const children = node.children || node.elements || node.slides || [];
  for (const child of children) {
    const found = findElement(child, id);
    if (found) return found;
  }
  return null;
}

export function findParent(node, id, parent = null) {
  const children = node?.children || node?.elements || [];
  for (const child of children) {
    if (child.id === id) return node;
    const found = findParent(child, id, node);
    if (found) return found;
  }
  return parent && node?.id === id ? parent : null;
}

function walk(node, visit) {
  visit(node);
  for (const child of node.children || node.elements || node.slides || []) walk(child, visit);
}

export function validateDocument(doc) {
  const errors = [];
  if (doc?.schemaVersion !== 2) errors.push('schemaVersion must be 2');
  if (doc?.width !== SLIDE_WIDTH || doc?.height !== SLIDE_HEIGHT) {
    errors.push('slide must be 1080 × 1350');
  }
  const elements = [];
  for (const element of doc?.elements || []) walk(element, (node) => elements.push(node));
  if (elements.length > LIMITS.maxElements) errors.push(`at most ${LIMITS.maxElements} elements`);
  for (const element of elements) {
    const frame = element.frame;
    if (!frame) {
      errors.push(`${element.id} is missing a frame`);
      continue;
    }
    if (frame.width < LIMITS.minSize || frame.height < LIMITS.minSize) {
      errors.push(`${element.id} frame is smaller than ${LIMITS.minSize}`);
    }
    if (frame.width > LIMITS.maxSize || frame.height > LIMITS.maxSize) {
      errors.push(`${element.id} frame exceeds ${LIMITS.maxSize}`);
    }
    if (element.kind === 'image' || element.kind === 'sticker') {
      const scale = element.crop?.scale ?? 1;
      const focalX = element.crop?.focalX ?? 0.5;
      const focalY = element.crop?.focalY ?? 0.5;
      if (scale < LIMITS.minCropScale || scale > LIMITS.maxCropScale) {
        errors.push(`${element.id} crop scale is outside 1–8`);
      }
      if (focalX < 0 || focalX > 1 || focalY < 0 || focalY > 1) {
        errors.push(`${element.id} crop focal point is outside 0–1`);
      }
    }
    if (element.kind === 'text' && String(element.text || '').length > LIMITS.maxTextLength) {
      errors.push(`${element.id} text exceeds ${LIMITS.maxTextLength}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Monotonic issue revision. A write must present the revision it read.
 * Conflict leaves both values intact; the caller does not last-write-wins.
 */
export function checkWriteRevision(storedRevision, presentedRevision) {
  if (!Number.isInteger(storedRevision) || storedRevision < 1) {
    return { ok: false, status: 409, code: 'REVISION_INVALID' };
  }
  if (presentedRevision !== storedRevision) {
    return {
      ok: false,
      status: 409,
      code: 'REVISION_CONFLICT',
      storedRevision,
      presentedRevision,
    };
  }
  return { ok: true, nextRevision: storedRevision + 1 };
}

function replaced(doc, id, recipe) {
  const next = clone(doc);
  const element = findElement(next, id);
  if (!element) throw new Error(`Unknown element ${id}`);
  recipe(element, next);
  return next;
}

/** Outer frame only. Image crop focal point and scale stay put. */
export function resizeFrame(doc, id, frame) {
  return replaced(doc, id, (element) => {
    element.frame = {
      x: frame.x,
      y: frame.y,
      width: Math.max(LIMITS.minSize, frame.width),
      height: Math.max(LIMITS.minSize, frame.height),
    };
    if (element.kind === 'card') reflowCard(element);
  });
}

/** Picture inside the frame. The frame box does not change. */
export function setCrop(doc, id, crop) {
  return replaced(doc, id, (element) => {
    if (element.kind !== 'image' && element.kind !== 'sticker') {
      throw new Error(`${id} has no crop`);
    }
    element.crop = {
      focalX: Math.min(1, Math.max(0, crop.focalX)),
      focalY: Math.min(1, Math.max(0, crop.focalY)),
      scale: Math.min(LIMITS.maxCropScale, Math.max(LIMITS.minCropScale, crop.scale)),
    };
  });
}

/**
 * Move a frame. Moving a flow child detaches it into free placement so the
 * card can keep reflowing its remaining children. Moving a card translates
 * the card only; children keep local coordinates and are reflowed.
 */
export function moveElement(doc, id, dx, dy) {
  return replaced(doc, id, (element, next) => {
    const parent = findParent(next, id);
    const insideCard = parent?.kind === 'card' && element.layout === 'flow';
    if (insideCard) {
      element.layout = 'free';
      element.frame = {
        ...element.frame,
        x: element.frame.x + dx,
        y: element.frame.y + dy,
      };
      reflowCard(parent);
      return;
    }
    element.frame = {
      ...element.frame,
      x: element.frame.x + dx,
      y: element.frame.y + dy,
    };
    if (element.kind === 'card') reflowCard(element);
  });
}

export function rotateElement(doc, id, rotation) {
  return replaced(doc, id, (element) => {
    const turns = ((rotation % 360) + 360) % 360;
    element.rotation = turns > 180 ? turns - 360 : turns;
  });
}

/** Stored in full. Blank is intentional and must not fall back to a default. */
export function setText(doc, id, text) {
  return replaced(doc, id, (element) => {
    if (element.kind !== 'text') throw new Error(`${id} is not text`);
    const value = String(text);
    if (value.length > LIMITS.maxTextLength) {
      throw new Error(`${id} text exceeds ${LIMITS.maxTextLength}`);
    }
    element.text = value;
    element.presence = value.trim() ? 'custom' : 'blank';
  });
}

export function removeField(doc, id) {
  return replaced(doc, id, (element, next) => {
    element.presence = 'removed';
    const parent = findParent(next, id);
    if (parent?.kind === 'card') reflowCard(parent);
  });
}

/**
 * Flow children stack from the top with gap. A `pin: 'end'` child stays on
 * the bottom edge of a fixed card. Free children are not rearranged.
 * Content-sized cards shrink to the stacked flow plus padding.
 */

export function createHistory(doc) {
  return { present: clone(doc), past: [], future: [] };
}

/** One gesture or one text-editing session is one entry. */
export function commitTransaction(history, next, label) {
  if (JSON.stringify(history.present) === JSON.stringify(next)) return history;
  return {
    present: clone(next),
    past: [...history.past, { label, doc: clone(history.present) }],
    future: [],
  };
}

export function undo(history) {
  const entry = history.past[history.past.length - 1];
  if (!entry) return history;
  return {
    present: clone(entry.doc),
    past: history.past.slice(0, -1),
    future: [{ label: entry.label, doc: clone(history.present) }, ...history.future],
  };
}

export function redo(history) {
  const entry = history.future[0];
  if (!entry) return history;
  return {
    present: clone(entry.doc),
    past: [...history.past, { label: entry.label, doc: clone(history.present) }],
    future: history.future.slice(1),
  };
}

/** Read overflow from the rendered node. Do not measure with a second font engine. */
export function readTextOverflow(node) {
  if (!node) return { overflow: false, overflowPx: 0 };
  const overflowPx = Math.max(0, node.scrollHeight - node.clientHeight);
  return { overflow: overflowPx > 1, overflowPx };
}

export const SLIDE_FONTS = Object.freeze(['Les Flos Sans', 'Les Flos Chaos', 'Les Flos Sage', 'Instrument Sans', 'Space Mono']);

/** Version 2 is loaded as-is. Any other version fails instead of being trimmed. */
export function loadDocument(raw) {
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (parsed?.schemaVersion !== 2) {
    return {
      ok: false,
      code: 'SCHEMA_VERSION_UNSUPPORTED',
      schemaVersion: parsed?.schemaVersion ?? null,
    };
  }
  const source = parsed.slides ? parsed.slides[0] : parsed;
  const document = {
    ...clone(parsed),
    schemaVersion: 2,
    width: SLIDE_WIDTH,
    height: SLIDE_HEIGHT,
    elements: (source.elements || []).map(normalizeElement),
  };
  if (parsed.slides) {
    document.slides = parsed.slides.map((slide, index) => ({
      ...clone(slide),
      stack: Number.isFinite(slide.stack) ? slide.stack : index,
      elements: (slide.elements || []).map(normalizeElement),
    }));
  }
  return { ok: true, document };
}

export function serializeDocument(document) {
  return JSON.parse(JSON.stringify(document));
}

/**
 * Precedence is issue, account, city, then shipped. Only untouched defaults
 * are written. The resolved string is stored on the element.
 */
export function materializeVoice(document, layers = {}) {
  const next = clone(document);
  const version = layers.version || 'creation';
  walk(next, (node) => {
    if (node.kind !== 'text' || !node.voice?.key) return;
    if (node.presence === 'custom' || node.presence === 'blank' || node.presence === 'removed') return;
    const key = node.voice.key;
    const issue = layers.issue || {};
    const account = layers.account || {};
    const city = layers.city || {};
    const shipped = layers.shipped || {};
    let source = 'shipped';
    let text = String(shipped[key] ?? '');
    if (issue[key]) { source = 'issue'; text = String(issue[key]); }
    else if (account[key]) { source = 'account'; text = String(account[key]); }
    else if (city[key]) { source = 'city'; text = String(city[key]); }
    node.text = text;
    node.presence = 'default';
    node.voice = { key, source, version, resolved: text };
  });
  return next;
}

/** Copies the creation-time string. Live voice is not consulted. */
export function resetText(document, id) {
  return replaced(document, id, (element) => {
    if (element.kind !== 'text') throw new Error(`${id} is not text`);
    if (element.voice?.resolved == null) throw new Error(`${id} has no captured voice default`);
    element.text = element.voice.resolved;
    element.presence = 'default';
  });
}
