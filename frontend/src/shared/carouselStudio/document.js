// Browser-safe document primitives shared by the editor and server.
const SLIDE_WIDTH = 1080;
const SLIDE_HEIGHT = 1350;
const PRESENCE = new Set(['default', 'custom', 'blank', 'removed']);
const clone = (value) => JSON.parse(JSON.stringify(value));

function isFlowChild(element) {
  return element.layout === 'flow' && element.presence !== 'removed' && !(element.role === 'event-logistics' && element.kind === 'card' && (element.children || []).every(child => child.presence === 'removed' || child.visibility === 'hidden'));
}

/**
 * Flow children stack from the top. `pin: 'end'` stays on the bottom of a
 * fixed card. Content-sized cards shrink to that stack plus padding.
 * Free children keep the frames the author set.
 */
function reflowCard(card) {
  if (card.role === 'group' || card.role === 'cover-title') return card;
  for (const child of card.children || []) if (child.kind === 'card') reflowCard(child);
  const pad = { top: 0, right: 0, bottom: 0, left: 0, ...card.padding };
  const gap = card.gap || 0;
  const flow = (card.children || []).filter(isFlowChild);
  const available = Math.max(8, card.frame.width - pad.left - pad.right);
  if (card.flowDirection === 'row') {
    const unit = Math.max(8, (available - gap * Math.max(0, flow.length - 1)) / Math.max(1, flow.reduce((sum, child) => sum + (child.flowWeight || 1), 0)));
    let x = pad.left;
    flow.forEach(child => { const width = unit * (child.flowWeight || 1); child.frame = { ...child.frame, x, y: pad.top, width }; x += width + gap; });
    if (card.sizing === 'content') card.frame.height = Math.max(8, pad.top + pad.bottom + Math.max(0, ...flow.map(child => child.frame.height)));
  } else {
    const start = flow.filter(child => child.pin !== 'end');
    const end = flow.filter(child => child.pin === 'end');
    let y = pad.top;
    for (const child of start) {
      child.frame = { ...child.frame, x: pad.left, y, width: available };
      if (child.kind === 'card') reflowCard(child);
      y += child.frame.height + gap;
    }
    for (const child of end) { child.frame.width = available; if (child.kind === 'card') reflowCard(child); }
    const stacked = start.length ? y - gap : y;
    if (card.sizing === 'content') card.frame.height = Math.max(8, stacked + end.reduce((sum, child) => sum + child.frame.height, 0) + gap * Math.max(0, end.length - (start.length ? 0 : 1)) + pad.bottom);
    let endY = card.frame.height - pad.bottom;
    for (const child of [...end].reverse()) {
      endY -= child.frame.height;
      child.frame = { ...child.frame, x: pad.left, y: endY, width: available };
      endY -= gap;
    }
  }
  if (card.anchor === 'bottom') card.frame.y = 1350 - (card.bottom || 0) - card.frame.height;
  return card;
}

function normalizeElement(element, index) {
  const next = { ...element };
  next.kind = element.kind;
  next.frame = {
    x: Number(element.frame?.x || 0),
    y: Number(element.frame?.y || 0),
    width: Number(element.frame?.width),
    height: Number(element.frame?.height),
  };
  next.rotation = Number(element.rotation || 0);
  next.stack = Number.isFinite(element.stack) ? element.stack : index;
  next.visibility = element.visibility === 'hidden' ? 'hidden' : 'visible';
  next.locked = Boolean(element.locked);
  next.layout = element.layout === 'flow' ? 'flow' : 'free';
  if (element.kind === 'text') {
    next.text = String(element.text ?? '');
    next.presence = PRESENCE.has(element.presence)
      ? element.presence
      : (next.text.trim() ? 'custom' : 'blank');
    if (element.voice) next.voice = clone(element.voice);
  }
  if (element.kind === 'image' || element.kind === 'sticker') {
    const crop = element.crop || {};
    next.crop = {
      focalX: crop.focalX == null ? 0.5 : Number(crop.focalX),
      focalY: crop.focalY == null ? 0.5 : Number(crop.focalY),
      scale: crop.scale == null ? 1 : Number(crop.scale),
      ...(crop.panX != null ? { panX: Number(crop.panX) } : {}),
      ...(crop.panY != null ? { panY: Number(crop.panY) } : {}),
    };
  }
  if (element.asset) next.asset = clone(element.asset);
  if (element.style) next.style = clone(element.style);
  if (element.preset) next.preset = clone(element.preset);
  if (element.role) next.role = element.role;
  if (element.pin) next.pin = element.pin;
  if (element.name) next.name = element.name;
  if (element.kind === 'card') {
    next.sizing = element.sizing === 'content' ? 'content' : 'fixed';
    next.gap = Number(element.gap || 0);
    next.padding = {
      top: Number(element.padding?.top || 0),
      right: Number(element.padding?.right || 0),
      bottom: Number(element.padding?.bottom || 0),
      left: Number(element.padding?.left || 0),
    };
    next.children = (element.children || []).map(normalizeElement);
    // Loading a saved document must not rearrange its geometry.
  }
  return next;
}

function normalizeSlide(slide, index) {
  const next = {
    id: slide.id,
    role: slide.role || null,
    width: Number(slide.width || SLIDE_WIDTH),
    height: Number(slide.height || SLIDE_HEIGHT),
    background: clone(slide.background || { kind: 'fill', color: '#faf6ef' }),
    preset: clone(slide.preset || null),
    elements: (slide.elements || []).map(normalizeElement),
  };
  if (slide.sourceTimezone) next.sourceTimezone = slide.sourceTimezone;
  if (slide.source) next.source = clone(slide.source);
  if (slide.detached) next.detached = true;
  if (slide.legacyType) next.legacyType = slide.legacyType;
  if (slide.properties) next.properties = clone(slide.properties);
  next.stack = Number.isFinite(slide.stack) ? slide.stack : index;
  return next;
}


function cardOverflow(card) {
  if (card.kind !== 'card' || card.role === 'group' || card.role === 'cover-title' || card.sizing !== 'fixed') return 0;
  const flow = (card.children || []).filter(isFlowChild);
  const start = flow.filter(child => child.pin !== 'end'); const end = flow.filter(child => child.pin === 'end');
  const used = Math.max(card.padding?.top || 0, ...start.map(child => child.frame.y + child.frame.height));
  const available = end.length ? Math.min(...end.map(child => child.frame.y)) - (card.gap || 0) : card.frame.height - (card.padding?.bottom || 0);
  return Math.max(0, used - available);
}
module.exports = { reflowCard, normalizeElement, normalizeSlide, cardOverflow };
