import { screenDeltaToLocal, rotateVector } from '../../../../../shared/carouselStudio/layout';
import { cardOverflow } from '../../../../../shared/carouselStudio/document';
import { applyPreset } from '../../../../../shared/carouselStudio/presets';
/**
 * Canvas commands for the direct-manipulation editor.
 * Frames stay in logical pixels. Zoom and parent rotation are applied here,
 * not inside the renderer.
 */

import {
  LIMITS,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  findElement,
  findParent,
  moveElement,
  reflowCard,
  rotateElement,
} from './studioDocument';

export { screenDeltaToLocal };

export const SNAP_THRESHOLD = 8;
export const NUDGE_STEP = 1;
export const NUDGE_STEP_LARGE = 10;
export const FRAME_RATIOS = Object.freeze([
  { id: '1:1', width: 1, height: 1 },
  { id: '4:5', width: 4, height: 5 },
  { id: '3:4', width: 3, height: 4 },
  { id: '16:9', width: 16, height: 9 },
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createEditorId(prefix = 'el') {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

export function slidesOf(doc) {
  if (Array.isArray(doc?.slides)) return doc.slides;
  return doc ? [doc] : [];
}

export function slideById(doc, slideId) {
  const slides = slidesOf(doc);
  return slides.find((slide) => slide.id === slideId) || slides[0] || null;
}

function isVisible(element) {
  return element && element.visibility !== 'hidden' && element.presence !== 'removed';
}

export function isRenderableSlide(slide) {
  if (!slide) return false;
  const elements = [];
  const walk = (node) => {
    if (!node || node === slide) {
      for (const child of node?.elements || node?.children || []) walk(child);
      return;
    }
    elements.push(node);
    for (const child of node.children || []) walk(child);
  };
  for (const element of slide.elements || []) walk(element);
  return elements.some(isVisible);
}

/** Export stays closed until at least one slide has a visible element. */
export function canExportDocument(doc) {
  return slidesOf(doc).some(isRenderableSlide);
}

function withDocument(doc, recipe) {
  const next = clone(doc);
  recipe(next);
  return next;
}

function slideNode(doc, slideId) {
  if (Array.isArray(doc.slides)) return slideById(doc, slideId);
  return doc;
}

function parentOf(doc, slideId, id) {
  return findParent(slideNode(doc, slideId), id);
}

export function ancestorRotation(doc, slideId, id) {
  const slide = slideNode(doc, slideId);
  let rotation = 0;
  let parent = parentOf(doc, slideId, id);
  while (parent && parent !== slide) {
    rotation += parent.rotation || 0;
    parent = findParent(slide, parent.id);
  }
  return rotation;
}

/**
 * Screen pixels to the parent's local axes.
 * CSS rotation is clockwise in y-down space, so the inverse is
 * lx = sx cos + sy sin, ly = -sx sin + sy cos.
 */
/** Center of an element in slide space, including ancestor rotation. */
export function visualCenter(slide, id) {
  const chain = [];
  let node = findElement(slide, id);
  while (node && node !== slide) {
    chain.unshift(node);
    node = findParent(slide, node.id);
  }
  let center = null;
  let rotation = 0;
  let size = null;
  for (const item of chain) {
    const localX = item.frame.x + item.frame.width / 2;
    const localY = item.frame.y + item.frame.height / 2;
    if (!center) {
      center = { x: localX, y: localY };
    } else {
      const offset = rotateVector(localX - size.width / 2, localY - size.height / 2, rotation);
      center = { x: center.x + offset.x, y: center.y + offset.y };
    }
    rotation += item.rotation || 0;
    size = item.frame;
  }
  return center ? { ...center, rotation, frame: chain[chain.length - 1]?.frame } : null;
}

/**
 * Resize in the element's local axes and keep the opposite edge fixed
 * in parent space. Rotation is around the frame center.
 */
export function resizeRotatedFrame(frame, rotation, edge, localDx, localDy, options = {}) {
  const min = options.min ?? LIMITS.minSize;
  const lockAspect = Boolean(options.lockAspect);
  let dw = 0;
  let dh = 0;
  if (edge.includes('e')) dw += localDx;
  if (edge.includes('w')) dw -= localDx;
  if (edge.includes('s')) dh += localDy;
  if (edge.includes('n')) dh -= localDy;
  let width = Math.max(min, frame.width + dw);
  let height = Math.max(min, frame.height + dh);
  if (lockAspect && frame.width > 0 && frame.height > 0) {
    const ratio = frame.width / frame.height;
    const horizontal = edge === 'e' || edge === 'w' || (edge.length === 2 && Math.abs(dw) >= Math.abs(dh));
    if (horizontal) height = Math.max(min, width / ratio);
    else width = Math.max(min, height * ratio);
  }
  width = Math.min(LIMITS.maxSize, width);
  height = Math.min(LIMITS.maxSize, height);

  const cx = frame.x + frame.width / 2;
  const cy = frame.y + frame.height / 2;
  const anchorLocal = {
    x: edge.includes('e') ? -frame.width / 2 : edge.includes('w') ? frame.width / 2 : 0,
    y: edge.includes('s') ? -frame.height / 2 : edge.includes('n') ? frame.height / 2 : 0,
  };
  const anchor = rotateVector(anchorLocal.x, anchorLocal.y, rotation);
  const anchorParent = { x: cx + anchor.x, y: cy + anchor.y };
  const nextAnchorLocal = {
    x: edge.includes('e') ? -width / 2 : edge.includes('w') ? width / 2 : 0,
    y: edge.includes('s') ? -height / 2 : edge.includes('n') ? height / 2 : 0,
  };
  const nextAnchor = rotateVector(nextAnchorLocal.x, nextAnchorLocal.y, rotation);
  const nextCenter = {
    x: anchorParent.x - nextAnchor.x,
    y: anchorParent.y - nextAnchor.y,
  };
  return {
    x: nextCenter.x - width / 2,
    y: nextCenter.y - height / 2,
    width,
    height,
  };
}

function applyMoveInPlace(slide, id, dx, dy) {
  const element = findElement(slide, id);
  if (!element || isElementLocked(slide, id)) return;
  delete element.anchor; delete element.bottom;
  const parent = findParent(slide, id);
  const insideCard = parent?.kind === 'card' && parent.role !== 'group' && element.layout === 'flow';
  if (insideCard) {
    element.layout = 'free';
    element.frame = { ...element.frame, x: element.frame.x + dx, y: element.frame.y + dy };
    reflowCard(parent);
    return;
  }
  element.frame = { ...element.frame, x: element.frame.x + dx, y: element.frame.y + dy };
  if (element.kind === 'card' && element.role !== 'group') reflowCard(element);
}

export function moveElements(doc, slideId, ids, dx, dy) {
  if (!Array.isArray(doc?.slides)) {
    let next = doc;
    for (const id of ids) {
      const element = findElement(next, id);
      if (!element || element.locked) continue;
      next = moveElement(next, id, dx, dy);
    }
    return next;
  }
  return withDocument(doc, (next) => {
    for (const id of ids) applyMoveInPlace(slideNode(next, slideId), id, dx, dy);
  });
}

export function resizeElement(doc, slideId, id, edge, localDx, localDy, options = {}) {
  return withDocument(doc, (next) => {
    const slide = slideNode(next, slideId);
    const element = findElement(slide, id);
    if (!element || isElementLocked(slide, id)) return;
    const rotation = element.rotation || 0;
    const before = { ...element.frame };
    element.frame = resizeRotatedFrame(element.frame, rotation, edge, localDx, localDy, {
      lockAspect: options.lockAspect || element.lockAspect,
    });
    if (element.role === 'group') scaleGroup(element, element.frame.width / before.width, element.frame.height / before.height);
    if (element.kind === 'card') reflowCard(element);
    reflowParent(slide, id);
  });
}

export function setNumericFrame(doc, slideId, id, patch) {
  return withDocument(doc, (next) => {
    const element = findElement(slideNode(next, slideId), id);
    if (!element) return;
    if (isElementLocked(slideNode(next, slideId), id)) return;
    const { rotation, lockAspect, ...geometry } = patch;
    const before = { ...element.frame };
    const frame = { ...element.frame, ...geometry };
    frame.width = Math.min(LIMITS.maxSize, Math.max(LIMITS.minSize, Number(frame.width)));
    frame.height = Math.min(LIMITS.maxSize, Math.max(LIMITS.minSize, Number(frame.height)));
    element.frame = frame;
    if (element.role === 'group') scaleGroup(element, frame.width / before.width, frame.height / before.height);
    if (patch.y != null) { delete element.anchor; delete element.bottom; }
    if (patch.rotation != null) {
      const turns = ((Number(patch.rotation) % 360) + 360) % 360;
      element.rotation = turns > 180 ? turns - 360 : turns;
    }
    if (patch.lockAspect != null) element.lockAspect = Boolean(patch.lockAspect);
    if (element.kind === 'card') reflowCard(element);
    reflowParent(slideNode(next, slideId), id);
  });
}

export function applyRatio(doc, slideId, id, ratio) {
  return withDocument(doc, (next) => {
    const element = findElement(slideNode(next, slideId), id);
    if (!element || element.locked) return;
    const height = Math.min(LIMITS.maxSize, Math.max(LIMITS.minSize, element.frame.width * (ratio.height / ratio.width)));
    const delta = height - element.frame.height;
    element.frame = { ...element.frame, height, y: element.frame.y - delta / 2 };
    element.lockAspect = true;
  });
}

export function rotateBy(doc, slideId, id, rotation) {
  if (!Array.isArray(doc?.slides)) return rotateElement(doc, id, rotation);
  return withDocument(doc, (next) => {
    const element = findElement(slideNode(next, slideId), id);
    if (!element || element.locked) return;
    const turns = ((rotation % 360) + 360) % 360;
    element.rotation = turns > 180 ? turns - 360 : turns;
  });
}

function siblingList(slide, id) {
  const parent = findParent(slide, id);
  if (!parent) return null;
  if (parent === slide || parent.elements) {
    if (parent.elements && parent.elements.some((child) => child.id === id)) return parent.elements;
  }
  if (parent.children && parent.children.some((child) => child.id === id)) return parent.children;
  return parent.elements || null;
}

export function bringForward(doc, slideId, ids) {
  return shiftStack(doc, slideId, ids, 1);
}

export function sendBackward(doc, slideId, ids) {
  return shiftStack(doc, slideId, ids, -1);
}

function shiftStack(doc, slideId, ids, direction) {
  return withDocument(doc, (next) => {
    const slide = slideNode(next, slideId);
    for (const id of ids) {
      const list = siblingList(slide, id);
      const element = findElement(slide, id);
      if (!list || !element || isElementLocked(slide, id)) continue;
      const ordered = [...list].sort((a, b) => (a.stack || 0) - (b.stack || 0));
      const index = ordered.findIndex((item) => item.id === id);
      const swap = ordered[index + direction];
      if (!swap) {
        element.stack = (element.stack || index) + direction;
        continue;
      }
      const stack = element.stack ?? index;
      element.stack = swap.stack ?? index + direction;
      swap.stack = stack;
    }
  });
}

export function setLocked(doc, slideId, ids, locked) {
  return withDocument(doc, (next) => {
    for (const id of ids) {
      const element = findElement(slideNode(next, slideId), id);
      if (element) element.locked = locked;
    }
  });
}

function reassignIds(node, prefix) {
  const copy = clone(node);
  copy.id = createEditorId(prefix);
  if (copy.children) copy.children = copy.children.map((child) => reassignIds(child, 'el'));
  return copy;
}

export function duplicateElements(doc, slideId, ids) {
  return withDocument(doc, (next) => {
    const slide = slideNode(next, slideId);
    for (const id of ids) {
      const list = siblingList(slide, id);
      const element = findElement(slide, id);
      if (!list || !element || isElementLocked(slide, id)) continue;
      const copy = reassignIds(element, 'el');
      copy.presetOwned = false;
      copy.frame = { ...copy.frame, x: copy.frame.x + 24, y: copy.frame.y + 24 };
      copy.locked = false;
      copy.stack = Math.max(0, ...list.map(item => item.stack || 0)) + 1;
      list.push(copy);
    }
  });
}

export function deleteElements(doc, slideId, ids) {
  const dropping = new Set(ids);
  return withDocument(doc, (next) => {
    const slide = slideNode(next, slideId);
    const strip = (list) => (list || []).flatMap((element) => {
      if (isElementLocked(slide, element.id)) return [element];
      if (dropping.has(element.id)) {
        if (element.presetOwned || element.kind === 'text') { const remove = node => { node.presence = 'removed'; (node.children || []).forEach(remove); }; remove(element); return [element]; }
        return [];
      }
      if (element.children) { element.children = strip(element.children); reflowCard(element); }
      return [element];
    });
    slide.elements = strip(slide.elements);
  });
}

export function groupElements(doc, slideId, ids) {
  if (!ids || ids.length < 2) return doc;
  return withDocument(doc, (next) => {
    const slide = slideNode(next, slideId);
    const list = slide.elements || [];
    const picked = topSelection(slide, ids).map((id) => findElement(slide, id)).filter(Boolean);
    if (picked.length < 2) return;
    if (picked.some((element) => isElementLocked(slide, element.id))) return;
    const world = picked.map(element => { const center = visualCenter(slide, element.id); return { ...clone(element), layout: 'free', rotation: center.rotation, frame: { ...element.frame, x: center.x - element.frame.width / 2, y: center.y - element.frame.height / 2 } }; });
    const minX = Math.min(...world.map((element) => element.frame.x));
    const minY = Math.min(...world.map((element) => element.frame.y));
    const maxX = Math.max(...world.map((element) => element.frame.x + element.frame.width));
    const maxY = Math.max(...world.map((element) => element.frame.y + element.frame.height));
    const children = world.map((element) => ({
      ...clone(element),
      frame: { ...element.frame, x: element.frame.x - minX, y: element.frame.y - minY },
    }));
    const group = {
      id: createEditorId('group'),
      kind: 'card',
      role: 'group',
      name: 'Group',
      lockAspect: true,
      layout: 'free',
      sizing: 'fixed',
      gap: 0,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      rotation: 0,
      locked: false,
      frame: { x: minX, y: minY, width: Math.max(LIMITS.minSize, maxX - minX), height: Math.max(LIMITS.minSize, maxY - minY) },
      children,
    };
    const idSet = new Set(picked.map((element) => element.id));
    const strip = nodes => nodes.filter(element => !idSet.has(element.id)).map(element => { if (element.children) { element.children = strip(element.children); reflowCard(element); } return element; });
    slide.elements = strip(list);
    slide.elements.push(group);
  });
}

export function ungroupElements(doc, slideId, ids) {
  return withDocument(doc, (next) => {
    const slide = slideNode(next, slideId);
    const additions = [];
    slide.elements = (slide.elements || []).flatMap((element) => {
      if (!ids.includes(element.id) || element.role !== 'group' || element.locked) return [element];
      for (const child of element.children || []) {
        const localX = child.frame.x + child.frame.width / 2;
        const localY = child.frame.y + child.frame.height / 2;
        const offset = rotateVector(localX - element.frame.width / 2, localY - element.frame.height / 2, element.rotation || 0);
        const center = {
          x: element.frame.x + element.frame.width / 2 + offset.x,
          y: element.frame.y + element.frame.height / 2 + offset.y,
        };
        additions.push({
          ...clone(child),
          frame: {
            ...child.frame,
            x: center.x - child.frame.width / 2,
            y: center.y - child.frame.height / 2,
          },
          rotation: (child.rotation || 0) + (element.rotation || 0),
        });
      }
      return [];
    });
    slide.elements.push(...additions);
  });
}

let clipboard = [];

export function copyElements(doc, slideId, ids) {
  const slide = slideNode(doc, slideId);
  clipboard = topSelection(slide, ids).map(id => { const element = findElement(slide, id); const center = visualCenter(slide, id); return element && center ? { ...clone(element), layout: 'free', rotation: center.rotation, frame: { ...element.frame, x: center.x - element.frame.width / 2, y: center.y - element.frame.height / 2 } } : null; }).filter(Boolean);
  return clipboard.length;
}

export function pasteElements(doc, slideId) {
  if (!clipboard.length) return doc;
  return withDocument(doc, (next) => {
    const slide = slideNode(next, slideId);
    slide.elements = slide.elements || [];
    for (const element of clipboard) {
      const copy = reassignIds(element, 'el');
      copy.presetOwned = false;
      copy.frame = { ...copy.frame, x: copy.frame.x + 24, y: copy.frame.y + 24 };
      copy.locked = false;
      copy.stack = Math.max(0, ...slide.elements.map(item => item.stack || 0)) + 1;
      slide.elements.push(copy);
    }
  });
}

export function setSlideText(doc, slideId, id, text) {
  return withDocument(doc, (next) => {
    const element = findElement(slideNode(next, slideId), id);
    if (!element || element.kind !== 'text' || isElementLocked(slideNode(next, slideId), id)) return;
    const value = String(text);
    if (value.length > LIMITS.maxTextLength) return;
    element.text = value;
    element.presence = value.trim() ? 'custom' : 'blank';
    reflowParent(slideNode(next, slideId), id);
  });
}

export function replaceImageAsset(doc, slideId, id, asset) {
  return withDocument(doc, (next) => {
    const element = findElement(slideNode(next, slideId), id);
    if (!element || (element.kind !== 'image' && element.kind !== 'sticker') || isElementLocked(slideNode(next, slideId), id)) return;
    const previous = element.asset || {};
    const replacingSource = asset.src != null && asset.src !== previous.src;
    element.asset = {
      ...(replacingSource ? {} : previous),
      ...asset,
      credit: asset.credit != null ? asset.credit : previous.provider === 'unsplash' && replacingSource ? null : previous.credit,
    };
  });
}

export function setCropOn(doc, slideId, id, crop) {
  return withDocument(doc, (next) => {
    const element = findElement(slideNode(next, slideId), id);
    if (!element || (element.kind !== 'image' && element.kind !== 'sticker') || isElementLocked(slideNode(next, slideId), id)) return;
    const current = element.crop || { focalX: 0.5, focalY: 0.5, scale: 1 };
    element.crop = {
      focalX: Math.min(1, Math.max(0, crop.focalX ?? current.focalX)),
      focalY: Math.min(1, Math.max(0, crop.focalY ?? current.focalY)),
      scale: Math.min(LIMITS.maxCropScale, Math.max(LIMITS.minCropScale, crop.scale ?? current.scale)),
      ...((crop.panX ?? current.panX) != null ? { panX: Math.max(-1, Math.min(1, crop.panX ?? current.panX)) } : {}),
      ...((crop.panY ?? current.panY) != null ? { panY: Math.max(-1, Math.min(1, crop.panY ?? current.panY)) } : {}),
    };
  });
}

export function blankSlide(role = 'event') {
  return {
    id: createEditorId('slide'),
    role,
    width: SLIDE_WIDTH,
    height: SLIDE_HEIGHT,
    background: { kind: 'fill', color: role === 'cover' ? '#1a1714' : '#faf6ef' },
    elements: [],
  };
}

function ensureSlides(doc) {
  if (!Array.isArray(doc.slides)) {
    doc.slides = [{ ...doc, id: doc.id || createEditorId('slide'), elements: doc.elements || [] }];
    delete doc.elements;
  }
  return doc;
}

export function insertSlide(doc, index, role = 'event') {
  return withDocument(doc, (next) => {
    ensureSlides(next);
    if (next.slides.length >= LIMITS.maxSlides) return;
    const at = Math.max(0, Math.min(index, next.slides.length));
    next.slides.splice(at, 0, blankSlide(role));
  });
}

export function duplicateSlide(doc, slideId) {
  return withDocument(doc, (next) => {
    ensureSlides(next);
    if (next.slides.length >= LIMITS.maxSlides) return;
    const index = next.slides.findIndex((slide) => slide.id === slideId);
    if (index < 0) return;
    const copy = clone(next.slides[index]);
    copy.id = createEditorId('slide');
    copy.elements = (copy.elements || []).map((element) => reassignIds(element, 'el'));
    next.slides.splice(index + 1, 0, copy);
  });
}

export function deleteSlide(doc, slideId) {
  return withDocument(doc, (next) => {
    ensureSlides(next);
    next.slides = next.slides.filter((slide) => slide.id !== slideId);
  });
}

export function reorderSlides(doc, slideId, toIndex) {
  return withDocument(doc, (next) => {
    ensureSlides(next);
    const index = next.slides.findIndex((slide) => slide.id === slideId);
    if (index < 0) return;
    const [slide] = next.slides.splice(index, 1);
    const at = Math.max(0, Math.min(toIndex, next.slides.length));
    next.slides.splice(at, 0, slide);
  });
}

export function snapTranslation(frame, peers, bounds = { width: SLIDE_WIDTH, height: SLIDE_HEIGHT }) {
  const guides = [];
  let dx = 0;
  let dy = 0;
  const xs = [0, bounds.width];
  const ys = [0, bounds.height];
  for (const peer of peers) {
    xs.push(peer.x, peer.x + peer.width / 2, peer.x + peer.width);
    ys.push(peer.y, peer.y + peer.height / 2, peer.y + peer.height);
  }
  const left = frame.x;
  const cx = frame.x + frame.width / 2;
  const right = frame.x + frame.width;
  const top = frame.y;
  const cy = frame.y + frame.height / 2;
  const bottom = frame.y + frame.height;
  let bestX = SNAP_THRESHOLD + 1;
  let bestY = SNAP_THRESHOLD + 1;
  let guideX = 0;
  let guideY = 0;
  for (const guide of xs) {
    for (const edge of [left, cx, right]) {
      const delta = guide - edge;
      if (Math.abs(delta) < Math.abs(bestX)) {
        bestX = delta;
        guideX = guide;
      }
    }
  }
  for (const guide of ys) {
    for (const edge of [top, cy, bottom]) {
      const delta = guide - edge;
      if (Math.abs(delta) < Math.abs(bestY)) {
        bestY = delta;
        guideY = guide;
      }
    }
  }
  if (Math.abs(bestX) <= SNAP_THRESHOLD) {
    dx = bestX;
    guides.push({ axis: 'x', at: guideX });
  }
  if (Math.abs(bestY) <= SNAP_THRESHOLD) {
    dy = bestY;
    guides.push({ axis: 'y', at: guideY });
  }
  return { dx, dy, guides };
}

const TEXT_FONTS = Object.freeze(['Les Flos Sans', 'Les Flos Chaos', 'Les Flos Sage', 'Instrument Sans', 'Space Mono']);
export const EDITOR_FONTS = TEXT_FONTS;
export const UPLOAD_MAX_BYTES = 8 * 1024 * 1024;
const UPLOAD_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export function validateUpload(file) {
  if (!file) return { ok: false, error: 'Choose an image.' };
  if (file.type && !UPLOAD_TYPES.has(file.type)) {
    return { ok: false, error: 'Use a PNG, JPEG, WebP, or GIF.' };
  }
  if (file.size > UPLOAD_MAX_BYTES) {
    return { ok: false, error: 'Images need to be 8MB or smaller.' };
  }
  return { ok: true };
}

function reflowParent(slide, id) {
  let parent = findParent(slide, id);
  while (parent?.kind === 'card') { if (parent.role !== 'group') reflowCard(parent); parent = findParent(slide, parent.id); }
}

export function removeTextField(doc, slideId, id) {
  return withDocument(doc, (next) => {
    const slide = slideNode(next, slideId);
    const element = findElement(slide, id);
    if (!element || element.kind !== 'text' || isElementLocked(slide, id)) return;
    element.presence = 'removed';
    reflowParent(slide, id);
  });
}

export function restoreField(doc, slideId, id) {
  return withDocument(doc, (next) => {
    const slide = slideNode(next, slideId);
    const element = findElement(slide, id);
    if (!element || element.kind !== 'text' || isElementLocked(slideNode(next, slideId), id)) return;
    const value = String(element.text || '');
    element.presence = value.trim() ? 'custom' : 'blank';
    if (element.layout !== 'free') element.layout = 'flow';
    reflowParent(slide, id);
  });
}

export function resetField(doc, slideId, id) {
  return withDocument(doc, (next) => {
    const slide = slideNode(next, slideId);
    const element = findElement(slide, id);
    if (!element || element.kind !== 'text' || isElementLocked(slideNode(next, slideId), id)) return;
    if (element.voice?.resolved == null) return;
    element.text = element.voice.resolved;
    element.presence = 'default';
    reflowParent(slide, id);
  });
}

export function setTextStyle(doc, slideId, id, style) {
  return withDocument(doc, (next) => {
    const element = findElement(slideNode(next, slideId), id);
    if (!element || element.kind !== 'text' || isElementLocked(slideNode(next, slideId), id)) return;
    element.style = { ...(element.style || {}), ...style };
    reflowParent(slideNode(next, slideId), id);
  });
}

export function growTextFrame(doc, slideId, id, extraHeight) {
  const extra = Number(extraHeight);
  if (!Number.isFinite(extra) || extra <= 0) return doc;
  return withDocument(doc, (next) => {
    const slide = slideNode(next, slideId);
    const element = findElement(slide, id);
    if (!element) return;
    element.frame = {
      ...element.frame,
      height: Math.min(LIMITS.maxSize, element.frame.height + extra),
    };
    if (element.kind === 'card') reflowCard(element);
    reflowParent(slide, id);
  });
}

export function fieldsByPresence(slide) {
  const found = [];
  const walk = (node) => {
    if (!node || node === slide) {
      for (const child of node?.elements || []) walk(child);
      return;
    }
    if (node.kind === 'text') found.push(node);
    for (const child of node.children || []) walk(child);
  };
  for (const element of slide?.elements || []) walk(element);
  return found;
}

export function insertSticker(doc, slideId, finish = 'light') {
  return withDocument(doc, (next) => {
    const slide = slideNode(next, slideId);
    slide.elements = slide.elements || [];
    const offset = slide.elements.filter((element) => element.kind === 'sticker').length * 28;
    slide.elements.push({
      id: createEditorId('sticker'),
      kind: 'sticker',
      role: 'sticker',
      name: finish === 'dark' ? 'Just Go sticker, dark' : 'Just Go sticker, light',
      layout: 'free',
      presetOwned: false,
      rotation: 8,
      locked: false,
      frame: { x: 640 + offset, y: 620 + offset, width: 220, height: 220 * 362 / 629 },
      crop: { focalX: 0.5, focalY: 0.5, scale: 1 },
      asset: { id: `sticker-${finish}`, key: null, src: null, finish, credit: null, alt: 'Just Go' },
      style: { finish },
    });
  });
}

export function insertUploadedImage(doc, slideId, asset) {
  return withDocument(doc, (next) => {
    const slide = slideNode(next, slideId);
    slide.elements = slide.elements || [];
    slide.elements.push({
      id: createEditorId('photo'),
      kind: 'image',
      role: 'photo',
      name: asset.alt || 'Photo',
      presetOwned: false,
      layout: 'free',
      rotation: 0,
      locked: false,
      frame: { x: 180, y: 160, width: 480, height: 480 },
      crop: { focalX: 0.5, focalY: 0.5, scale: 1 },
      asset: {
        ...asset,
        id: asset.id || createEditorId('asset'),
        key: asset.key || null,
        src: asset.src,
        credit: asset.credit || null,
        alt: asset.alt || '',
      },
      style: {},
    });
  });
}

export function setBackgroundFill(doc, slideId, color) {
  return withDocument(doc, (next) => {
    const slide = slideNode(next, slideId);
    slide.background = { kind: 'fill', color: color || '#faf6ef' };
  });
}

export function setBackgroundImage(doc, slideId, asset) {
  return withDocument(doc, (next) => {
    const slide = slideNode(next, slideId);
    const previous = slide.background?.kind === 'image' ? slide.background : null;
    const previousAsset = previous?.asset || {};
    const replacingSource = asset.src != null && asset.src !== previousAsset.src;
    slide.background = {
      kind: 'image',
      color: previous?.color || slide.background?.color || '#1a1714',
      crop: previous?.crop || { focalX: 0.5, focalY: 0.5, scale: 1 },
      asset: {
        ...(replacingSource ? {} : previousAsset),
        ...asset,
        credit: asset.credit != null ? asset.credit : previousAsset.provider === 'unsplash' && replacingSource ? null : previousAsset.credit,
      },
    };
  });
}

export function setBackgroundCrop(doc, slideId, crop) {
  return withDocument(doc, (next) => {
    const slide = slideNode(next, slideId);
    if (slide.background?.kind !== 'image') return;
    const current = slide.background.crop || { focalX: 0.5, focalY: 0.5, scale: 1 };
    slide.background.crop = {
      focalX: Math.min(1, Math.max(0, crop.focalX ?? current.focalX)),
      focalY: Math.min(1, Math.max(0, crop.focalY ?? current.focalY)),
      scale: Math.min(LIMITS.maxCropScale, Math.max(LIMITS.minCropScale, crop.scale ?? current.scale)),
      ...((crop.panX ?? current.panX) != null ? { panX: Math.max(-1, Math.min(1, crop.panX ?? current.panX)) } : {}),
      ...((crop.panY ?? current.panY) != null ? { panY: Math.max(-1, Math.min(1, crop.panY ?? current.panY)) } : {}),
    };
  });
}

export function detachBackground(doc, slideId) {
  return withDocument(doc, (next) => {
    const slide = slideNode(next, slideId);
    if (slide.background?.kind !== 'image') return;
    slide.elements = slide.elements || [];
    slide.elements.unshift({
      id: createEditorId('photo'),
      kind: 'image',
      role: 'background',
      name: 'Background photo',
      layout: 'free',
      rotation: 0,
      frame: { x: 0, y: 0, width: slide.width || SLIDE_WIDTH, height: slide.height || SLIDE_HEIGHT },
      crop: { ...(slide.background.crop || { focalX: 0.5, focalY: 0.5, scale: 1 }) },
      asset: { ...(slide.background.asset || {}) },
      style: {},
    });
    slide.background = { kind: 'fill', color: slide.background.color || '#faf6ef' };
  });
}

function rememberAsset(set, asset) {
  if (!asset) return;
  const key = asset.key || asset.id || asset.src;
  if (key) set.add(key);
}

function rememberNode(set, node) {
  if (!node || typeof node !== 'object') return;
  rememberAsset(set, node.asset);
  rememberAsset(set, node.background?.asset);
  for (const child of node.elements || node.children || node.slides || []) rememberNode(set, child);
}

/** Keys still needed by the open document, undo history, or a saved snapshot. */
export function retainedAssetKeys(...documents) {
  const keys = new Set();
  for (const document of documents) {
    if (!document) continue;
    if (document.present || document.past || document.future) {
      rememberNode(keys, document.present);
      for (const entry of document.past || []) rememberNode(keys, entry.doc);
      for (const entry of document.future || []) rememberNode(keys, entry.doc);
    } else {
      rememberNode(keys, document);
    }
  }
  return keys;
}

export function assetsInDocument(doc) {
  const seen = new Set();
  const list = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    const found = [];
    if (node.kind === 'image' && node.asset?.src) found.push(node.asset);
    if (node.background?.asset?.src) found.push(node.background.asset);
    found.forEach(asset => {
      const key = asset.key || asset.id || asset.src;
      if (key && !seen.has(key)) { seen.add(key); list.push(asset); }
    });
    for (const child of node.elements || node.children || node.slides || []) visit(child);
  };
  visit(doc);
  return list;
}

export function elementLabel(element) {
  if (!element) return 'Nothing selected';
  return element.name || element.role || element.kind;
}

export function isElementLocked(slide, id) {
  let node = findElement(slide, id);
  while (node && node !== slide) { if (node.locked) return true; node = findParent(slide, node.id); }
  return false;
}
export function topSelection(slide, ids) {
  return ids.filter(id => {
    let parent = findParent(slide, id);
    while (parent && parent !== slide) { if (ids.includes(parent.id)) return false; parent = findParent(slide, parent.id); }
    return true;
  });
}
export function moveInSlideSpace(doc, slideId, ids, dx, dy) {
  const slide = slideNode(doc, slideId);
  let next = doc;
  for (const id of topSelection(slide, ids)) {
    if (isElementLocked(slide, id)) continue;
    const local = screenDeltaToLocal(dx, dy, 1, ancestorRotation(doc, slideId, id));
    next = moveElements(next, slideId, [id], local.dx, local.dy);
  }
  return next;
}
export function selectionBounds(slide, ids) {
  const points = [];
  for (const id of topSelection(slide, ids)) {
    const center = visualCenter(slide, id); if (!center) continue;
    for (const x of [-center.frame.width / 2, center.frame.width / 2]) for (const y of [-center.frame.height / 2, center.frame.height / 2]) {
      const p = rotateVector(x, y, center.rotation); points.push({ x: center.x + p.x, y: center.y + p.y });
    }
  }
  if (!points.length) return null;
  const x = Math.min(...points.map(p => p.x)); const y = Math.min(...points.map(p => p.y));
  return { x, y, width: Math.max(...points.map(p => p.x)) - x, height: Math.max(...points.map(p => p.y)) - y };
}
export function insertText(doc, slideId) {
  return withDocument(doc, next => {
    const slide = slideNode(next, slideId); if (!slide) return;
    slide.elements.push({ id: createEditorId('text'), kind: 'text', role: 'text', presetOwned: false, layout: 'free', text: 'Your text', presence: 'custom', rotation: 0,
      frame: { x: 160, y: 180, width: 760, height: 120 }, style: { fontFamily: 'Les Flos Sans', fontSizePx: 80, color: '#1a1714', lineHeight: 1.1 }, stack: slide.elements.length });
  });
}
export function applySlidePreset(doc, slideId, presetId, variation = 1) {
  return withDocument(doc, next => {
    const index = next.slides.findIndex(slide => slide.id === slideId);
    if (index >= 0) next.slides[index] = applyPreset(next.slides[index], presetId, variation);
  });
}
export function measureTextFrames(doc, slideId, measurements) {
  return withDocument(doc, next => {
    const slide = slideNode(next, slideId);
    for (const [id, height] of Object.entries(measurements)) {
      const element = findElement(slide, id);
      if (element?.autoHeight && element.layout === 'flow' && Number.isFinite(height) && height > 0) element.frame.height = Math.max(8, Math.ceil(height));
    }
    for (const element of slide?.elements || []) if (element.kind === 'card') reflowCard(element);
  });
}

export function setFieldLabel(doc, slideId, id, label) {
  return withDocument(doc, next => { const slide = slideNode(next, slideId); const element = findElement(slide, id); if (element?.kind === 'text' && !isElementLocked(slide, id)) { element.label = String(label).slice(0, 100); reflowParent(slide, id); } });
}

export function fitCardText(doc, slideId, id) {
  return withDocument(doc, next => {
    const slide = slideNode(next, slideId); const card = findElement(slide, id);
    if (!card || isElementLocked(slide, id)) return;
    const overflow = cardOverflow(card); if (!overflow) return;
    const fields = (card.children || []).filter(child => child.kind === 'text' && child.layout === 'flow' && child.pin !== 'end' && child.presence !== 'removed');
    const height = fields.reduce((sum, field) => sum + field.frame.height, 0);
    const scale = Math.max(.25, Math.min(.95, (height - overflow - 24) / Math.max(1, height)));
    fields.forEach(field => { field.style = { ...field.style, fontSizePx: Math.max(8, (field.style?.fontSizePx || (field.style?.fontSize || 2.8) * 10.8) * scale) }; });
  });
}

function scaleGroup(group, sx, sy) {
  for (const child of group.children || []) {
    child.frame = { x: child.frame.x * sx, y: child.frame.y * sy, width: child.frame.width * sx, height: child.frame.height * sy };
    if (child.kind === 'text') child.style = { ...child.style, fontSizePx: (child.style?.fontSizePx || (child.style?.fontSize || 2.8) * 10.8) * sy, letterSpacingPx: (child.style?.letterSpacingPx || 0) * sx };
    if (child.children) scaleGroup(child, sx, sy);
  }
}
