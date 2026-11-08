const { formatWhen } = require('./date');
const { reflowCard } = require('./document');
const randomUUID = () => `studio-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const CQW = 10.8;
const px = (value) => Math.round(value * CQW);

const COVER_FAMILIES = Object.freeze(['loose-letters', 'open-invitation', 'kept-somewhere']);
const EVENT_PRESETS = Object.freeze(['photo-note', 'on-the-bill', 'in-the-room']);
const BACK_PRESETS = Object.freeze(['paper-close', 'orange-close']);

const COVER_GEOMETRY = Object.freeze({
  'loose-letters': {
    css: 'j',
    round: '05',
    stickerFinish: 'light',
    background: '#1a1714',
    variations: [
      { crop: { focalX: 0.6, focalY: 0.5 }, headline: 18, second: 13.5 },
      { crop: { focalX: 0.54, focalY: 0.5 }, headline: 23, second: 17 },
      { crop: { focalX: 0.25, focalY: 0.5 }, headline: 27, second: 25 },
    ],
  },
  'open-invitation': {
    css: 'k',
    round: '05',
    stickerFinish: 'light',
    background: '#ff4f1f',
    variations: [
      { crop: { focalX: 0.57, focalY: 0.5 }, window: { x: 6, y: 18, width: 88, height: 88 }, headline: 24, second: 20 },
      { crop: { focalX: 0.52, focalY: 0.5 }, window: { x: 15, y: 19, width: 70, height: 82 }, headline: 23, second: 17 },
      { crop: { focalX: 0.38, focalY: 0.5 }, window: { x: -3, y: 25, width: 106, height: 73, rotation: -19 }, headline: 32, second: 23 },
    ],
  },
  'kept-somewhere': {
    css: 'l',
    round: '05',
    stickerFinish: 'dark',
    background: '#faf6ef',
    variations: [
      { crop: { focalX: 0.5, focalY: 0.5 }, prints: [{ x: 10, y: 30, width: 68, height: 70, rotation: -8 }, { x: 55, y: 20, width: 39, height: 43, rotation: 8, focalX: 0.73 }] },
      { crop: { focalX: 0.5, focalY: 0.5 }, prints: [{ x: 9, y: 22, width: 70, height: 74, rotation: -5 }, { x: 59, y: 54, width: 36, height: 44, rotation: 7, focalX: 0.78 }] },
      { crop: { focalX: 0.4, focalY: 0.5 }, prints: [{ x: 13, y: 23, width: 74, height: 77, rotation: 4 }] },
    ],
  },
});

const EVENT_GEOMETRY = Object.freeze({
  'photo-note': {
    round: '06',
    background: '#faf6ef',
    cropAspect: '1 / 1',
    stickerFinish: 'light',
    photo: { x: 19, y: 6, width: 62, height: 62, rotation: 2 },
    card: { x: 8, y: 73, width: 84, height: 46, sizing: 'fixed' },
    sticker: { x: 65, y: 56, width: 21, height: 21, rotation: 8 },
  },
  'on-the-bill': {
    round: '06',
    background: '#ff4f1f',
    cropAspect: '3 / 4',
    stickerFinish: 'light',
    photo: { x: 9, y: 36, width: 44, height: 59, rotation: -3 },
    card: { x: 0, y: 103, width: 100, height: 22, sizing: 'fixed' },
    sticker: { x: 39, y: 80, width: 21, height: 21, rotation: 9 },
  },
  'in-the-room': {
    round: '06',
    background: '#1a1714',
    cropAspect: 'full-bleed',
    stickerFinish: null,
    photo: { x: 0, y: 0, width: 100, height: 125, rotation: 0 },
    card: { x: 12, y: 78, width: 76, height: 36, sizing: 'content' },
    sticker: null,
  },
});


const PAPER = '#faf6ef';
const INK = '#1a1714';
const ORANGE = '#ff4f1f';
// The compose agent names colours; these are the only ones it can use.
const PALETTE = Object.freeze({ paper: PAPER, ink: INK, orange: ORANGE, blush: '#f3d2c4', stone: '#9a938a' });
const SLIDE_FONTS = Object.freeze(['Les Flos Chaos', 'Les Flos Sans', 'Les Flos Sage', 'Instrument Sans', 'Space Mono']);
// Rough average glyph width as a share of the font size, for sizing before the
// browser measures. The renderer's fit corrects what this misses.
const GLYPH_WIDTH = Object.freeze({ 'Les Flos Chaos': 0.56, 'Les Flos Sans': 0.5, 'Les Flos Sage': 0.42, 'Instrument Sans': 0.5, 'Space Mono': 0.6 });
/** The largest size, at most `base`, at which `text` wraps to `maxLines` in `width` (slide units). */
function sizeForLines(text, width, base, maxLines, { font = 'Les Flos Sans', min = base * 0.45 } = {}) {
  const value = String(text || '').trim();
  if (!value) return base;
  const glyph = GLYPH_WIDTH[font] || 0.5;
  const lines = (size) => {
    const perLine = Math.max(1, Math.floor(width / (size * glyph)));
    return value.split(/\n/).reduce((sum, part) => {
      let count = 1; let used = 0;
      for (const word of part.split(/\s+/).filter(Boolean)) {
        const length = word.length + (used ? 1 : 0);
        if (used && used + length > perLine) { count += Math.ceil(word.length / perLine); used = word.length % perLine; } else used += length;
      }
      return sum + count;
    }, 0);
  };
  let size = base;
  while (size > min && lines(size) > maxLines) size = Math.max(min, size * 0.92);
  return Math.round(size * 100) / 100;
}
const clone = (value) => JSON.parse(JSON.stringify(value));
const frameOf = (box) => ({ x: px(box.x), y: px(box.y), width: px(box.width), height: px(box.height) });
function base(kind, role, box) {
  return { id: randomUUID(), kind, role, presetOwned: true, layout: 'free', rotation: box.rotation || 0, frame: frameOf(box) };
}
function textNode(role, text, box, style = {}) {
  const value = String(text ?? '');
  return { ...base('text', role, box), text: value, presence: value ? 'custom' : 'blank', style: {
    fontFamily: 'Instrument Sans', fontSizePx: px(2.8), lineHeight: 1.35, color: INK, ...style,
  } };
}
function imageNode(role, asset, box, crop = {}, style = {}) {
  return { ...base('image', role, box), asset: typeof asset === 'string' ? { src: asset } : { ...asset },
    crop: { focalX: 0.5, focalY: 0.5, scale: 1, ...crop }, style };
}
function stickerNode(finish, box) {
  return { ...base('sticker', 'sticker', box), lockAspect: true, asset: { id: `sticker-${finish}`, finish, alt: 'Just Go' }, style: { finish } };
}
function cardNode(role, box, children, { padding = 0, gap = 2, sizing = 'content', style = {} } = {}) {
  const node = { ...base('card', role, box), sizing, gap: px(gap), padding: { top: px(padding), right: px(padding), bottom: px(padding), left: px(padding) }, children, style };
  reflowCard(node);
  return node;
}
function linesForTitle(title) {
  const explicit = String(title || '').split('\n');
  if (explicit.length > 1) return explicit;
  const words = explicit[0].split(/\s+/).filter(Boolean);
  if (words.length < 2) return [explicit[0]];
  let total = 0; const half = explicit[0].length / 2;
  const at = words.findIndex((word) => { total += word.length + 1; return total >= half; });
  const split = Math.max(1, Math.min(words.length - 1, at + 1));
  return [words.slice(0, split).join(' '), words.slice(split).join(' ')];
}
const APERTURES = ['round-cut', 'arch', 'oval'];
function generateCoverSlide({ theme = '', coverPreset = 'loose-letters', variation = 1, coverImage = null, copy = {} } = {}) {
  const familyId = COVER_FAMILIES.includes(coverPreset) ? coverPreset : COVER_FAMILIES[0];
  const family = COVER_GEOMETRY[familyId];
  const index = Math.max(0, Math.min(2, (Number(variation) || 1) - 1));
  const variant = family.variations[index];
  const asset = typeof coverImage === 'string' ? { src: coverImage } : (coverImage || {});
  const elements = [];
  if (familyId === 'loose-letters') {
    elements.push(imageNode('cover-photo', asset, { x: 0, y: 0, width: 100, height: 125 }, variant.crop, { treatment: 'full-bleed', brightness: 0.68 }));
  } else if (familyId === 'open-invitation') {
    elements.push(imageNode('cover-photo', asset, variant.window, { ...variant.crop, scale: index === 2 ? 1.35 : 1 }, { treatment: 'aperture', mask: APERTURES[index], brightness: 0.73, imageRotation: index === 2 ? 19 : 0 }));
  } else {
    variant.prints.forEach((box, i) => {
      const printBox = { ...box, width: box.width + (i ? 2.3 : 2.9), height: box.height + (i ? 2.3 : 7.6) };
      elements.push(imageNode(i ? 'cover-detail' : 'cover-photo', asset, printBox,
        { ...variant.crop, focalX: box.focalX ?? variant.crop.focalX, scale: i ? 1.7 : 1 }, { treatment: i ? 'print-detail' : 'print' }));
      if (!i) {
        const angle = box.rotation * Math.PI / 180; const dy = printBox.height / 2 - 2.5;
        elements.push(textNode('cover-print-caption', copy.printCaption || '', { x: box.x + printBox.width / 2 - Math.sin(angle) * dy - (printBox.width - 4) / 2, y: box.y + printBox.height / 2 + Math.cos(angle) * dy - .9, width: printBox.width - 4, height: 1.8, rotation: box.rotation }, { fontFamily: 'Les Flos Sage', fontSizePx: px(1.8), lineHeight: 1 }));
      }
    });
  }
  let lines = linesForTitle(theme);
  if (!copy.titleRuns && !String(theme).includes('\n') && familyId !== 'kept-somewhere') {
    const words = String(theme || '').trim().split(/\s+/);
    if (words.length >= 3) {
      if (familyId === 'open-invitation' && index === 0) lines = [words[0], words[1], words.slice(2).join(' ')];
      else { const middle = Math.floor(words.length / 2); lines = [words.slice(0, middle).join(' '), words[middle], words.slice(middle + 1).join(' ')].filter(Boolean); }
    }
  }
  const sizes = familyId === 'kept-somewhere' ? [[22, 17], [11, 18], [12, 19]][index] : [variant.headline, variant.second];
  let y = 0;
  const runs = copy.titleRuns || lines.map((line, i) => {
    const sage = familyId !== 'kept-somewhere' && lines.length >= 3 && (lines.length === 4 ? i % 2 === 0 : familyId === 'open-invitation' && index === 0 ? i === 0 : i === 1);
    const sans = familyId === 'kept-somewhere' && ((index === 0 && i > 0) || (index > 0 && i === 0));
    return { text: line, size: sage ? 9 : sizes[Math.min(i, sizes.length - 1)] || sizes[0], font: sage ? 'Les Flos Sage' : sans ? 'Les Flos Sans' : 'Les Flos Chaos' };
  });
  const children = runs.map((run, i) => {
    const font = run.font || 'Les Flos Chaos';
    const size = Math.max(4, Math.min(run.size, 86 / Math.max(1, String(run.text || '').length * (GLYPH_WIDTH[font] || 0.5))));
    const node = textNode(`cover-line-${i + 1}`, run.text, { x: 0, y, width: 88, height: size + (familyId === 'kept-somewhere' ? 1.6 : 0) }, {
      fontFamily: run.font || 'Les Flos Chaos', fontSizePx: px(size), lineHeight: 1,
      letterSpacingPx: px(run.font === 'Les Flos Sage' ? -0.25 : -0.65), textAlign: 'center',
      color: familyId === 'kept-somewhere' ? ORANGE : PAPER,
      lettering: run.font !== 'Les Flos Sage' && run.font !== 'Les Flos Sans', textBackground: familyId === 'kept-somewhere' ? PAPER : null,
      fit: 'shrink', minFontSizePx: px(3.5),
    });
    y += size + (familyId === 'loose-letters' ? .5 : familyId === 'kept-somewhere' ? 1.6 : 0);
    return node;
  });
  elements.push({ ...base('card', 'cover-title', { x: 6, y: 61 - y / 2, width: 88, height: Math.max(8, y), rotation: -3 }), sizing: 'fixed', children });
  const light = familyId !== 'kept-somewhere';
  elements.push(textNode('cover-caption', copy.caption || '', { x: 15, y: familyId === 'loose-letters' ? 99 : familyId === 'open-invitation' ? 108 : 105, width: familyId === 'loose-letters' ? 45 : 70, height: 6 }, {
    fontFamily: 'Space Mono', fontSizePx: px(1.9), color: familyId === 'loose-letters' ? PAPER : INK,
    textAlign: familyId === 'loose-letters' ? 'left' : 'center', fit: 'shrink', minFontSizePx: px(1.3),
  }));
  elements.push(textNode('cover-location', copy.location || '', { x: 15, y: familyId === 'open-invitation' ? 113 : familyId === 'kept-somewhere' ? 110 : 108, width: 70, height: 4 }, {
    fontFamily: 'Space Mono', fontSizePx: px(1.8), color: familyId === 'loose-letters' ? PAPER : INK, textAlign: 'center',
    fit: 'shrink', minFontSizePx: px(1.3),
  }));
  elements.push(stickerNode(light ? 'light' : 'dark', { x: familyId === 'open-invitation' ? 63 : 62, y: light ? (familyId === 'open-invitation' ? 86 : 88) : 85, width: 27, height: 27 * 362 / 629, rotation: familyId === 'open-invitation' ? -9 : light ? 9 : 8 }));
  return finishSlide('cover', familyId, index + 1, family.background, elements, { photoPosition: clone(variant.crop), cropAspect: familyId === 'loose-letters' ? 'full-bleed' : 'aperture', stickerFinish: light ? 'light' : 'dark' });
}
/**
 * A cover laid out element by element by the compose agent. Boxes are in slide
 * units (100 wide, 125 tall); colours are palette names. `resolveImage` turns an
 * asset reference into `{ src, alt }`. Every text fits its box when rendered.
 */
function generateFreeCoverSlide(layout = {}, { resolveImage = () => null } = {}) {
  const elements = [];
  let photos = 0;
  for (const item of layout.elements || []) {
    const box = item.box || { x: 0, y: 0, width: 10, height: 10 };
    if (item.kind === 'text') {
      const font = SLIDE_FONTS.includes(item.font) ? item.font : 'Instrument Sans';
      const lettering = Boolean(item.lettering) && (font === 'Les Flos Chaos' || font === 'Les Flos Sans');
      const node = textNode(`cover-${item.role || 'text'}`, item.text, box, {
        fontFamily: font, fontSizePx: px(item.size || 4), color: PALETTE[item.color] || INK,
        textAlign: item.align || 'left', lineHeight: item.lineHeight || (lettering ? 1 : 1.15),
        ...(item.weight ? { fontWeight: item.weight } : {}),
        ...(lettering ? { lettering: true, letterSpacingPx: px(font === 'Les Flos Chaos' ? -0.65 : -0.25) } : {}),
        ...(item.paperStrip ? { textBackground: PALETTE[item.paperStrip] } : {}),
        fit: 'shrink', minFontSizePx: px(Math.min(item.size || 4, 1.4)),
      });
      elements.push({ ...node, presetOwned: false });
    } else if (item.kind === 'image') {
      const asset = resolveImage(item.assetRef);
      const treatment = item.treatment && item.treatment !== 'plain' ? item.treatment : null;
      const style = {
        ...(treatment ? { treatment } : {}), ...(item.mask ? { mask: item.mask } : {}),
        brightness: item.brightness ?? 1, ...(item.fit === 'whole' ? { objectFit: 'contain' } : {}),
      };
      photos += 1;
      elements.push({ ...imageNode(photos === 1 ? 'cover-photo' : 'cover-image', asset || {}, box, item.fit === 'whole' ? {} : item.crop || {}, style), presetOwned: false });
    } else if (item.kind === 'sticker') {
      const finish = item.finish === 'dark' ? 'dark' : 'light';
      elements.push({ ...stickerNode(finish, { ...box, height: box.width * 362 / 629 }), presetOwned: false });
    } else if (item.kind === 'shape') {
      elements.push({ ...base('shape', 'cover-shape', box), presetOwned: false, style: { fill: PALETTE[item.color] || INK } });
    }
  }
  const color = PALETTE[layout.background] || INK;
  return finishSlide('cover', 'free-layout', 1, color, elements, { cropAspect: 'free', stickerFinish: null });
}
function finishSlide(role, preset, variation, color, elements, properties = {}) {
  return { id: randomUUID(), role, width: 1080, height: 1350, background: { kind: 'fill', color },
    preset: { id: preset, family: preset, version: 2, round: role === 'cover' ? '05' : '06', variation }, properties,
    elements: elements.map((element, stack) => ({ ...element, stack })) };
}
function flowText(role, value, width, size, style = {}) {
  const estimatedLines = Math.max(1, String(value || '').split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / Math.max(1, width / (size * 0.5)))), 0));
  return { ...textNode(role, value, { x: 0, y: 0, width, height: Math.max(size * 1.35, estimatedLines * size * (style.lineHeight || 1.35)) }, { fontSizePx: px(size), ...style }), layout: 'flow', autoHeight: true };
}
function logistics(snapshot, format, width, size = 2.7) {
  const when = flowText('event-date', formatWhen(snapshot), width * 0.42, size, { fontWeight: 700 });
  when.label = format === 'sorry-you-missed-it' ? 'When it happened' : 'When';
  when.frame.height += px(3.5); if (!when.text) when.presence = 'removed';
  const where = flowText('event-location', [snapshot.location, snapshot.city?.name].filter(Boolean).join('\n'), width * 0.54, size, { fontWeight: 600 });
  where.label = 'Where'; where.frame.height += px(3.5); if (!where.text) where.presence = 'removed';
  const row = cardNode('event-logistics', { x: 0, y: 0, width, height: 12 }, [when, where], { gap: 4, style: { borderTop: true } });
  when.flowWeight = 1; where.flowWeight = 1.2; row.flowDirection = 'row'; row.layout = 'flow'; reflowCard(row);
  return row;
}
// Text colours that read on each event-slide background, for text that sits on it directly.
const EVENT_INKS = Object.freeze({
  paper: { text: INK, title: ORANGE, sticker: 'light' },
  ink: { text: PAPER, title: ORANGE, sticker: 'light' },
  orange: { text: INK, title: PAPER, sticker: 'light' },
});
/**
 * One event slide. `title` replaces the event name on the slide, `imageFit` is
 * 'fill' (crop to the frame), 'whole' (the entire poster, letterboxed; for
 * fliers) or 'none' (type only), `background` is a palette name and
 * `titleScale` multiplies the length-fitted title size.
 */
function generateEventSlide(item = {}, eventPreset = 'photo-note', { format, title: titleText, imageFit = 'fill', background, titleScale = 1 } = {}) {
  const preset = EVENT_PRESETS.includes(eventPreset) ? eventPreset : EVENT_PRESETS[0];
  const spec = EVENT_GEOMETRY[preset]; const snap = item.snapshot || {};
  const scene = preset === 'in-the-room';
  const noImage = imageFit === 'none';
  const backgroundName = EVENT_INKS[background] ? background : null;
  const backgroundColor = backgroundName ? PALETTE[backgroundName] : spec.background;
  const inks = EVENT_INKS[backgroundName || (spec.background === ORANGE ? 'orange' : spec.background === INK ? 'ink' : 'paper')];
  const asset = { src: snap.image || null, key: snap.imageKey || null, credit: snap.credit || snap.imageCredit || null, alt: snap.name || '' };
  const photoStyle = { treatment: scene ? 'full-bleed' : 'sticker-photo', brightness: scene && imageFit !== 'whole' ? 0.9 : 1, ...(imageFit === 'whole' ? { objectFit: 'contain' } : {}) };
  const photo = noImage ? null : imageNode('event-photo', asset, spec.photo, imageFit === 'whole' ? {} : snap.crop || {}, photoStyle);
  const name = String(titleText || snap.name || '');
  const scale = Math.min(1.3, Math.max(0.6, Number(titleScale) || 1));
  const titleWidth = scene ? 68 : 84;
  const base = (preset === 'photo-note' ? 8 : preset === 'on-the-bill' ? 10.5 : 7.4) * (noImage ? 1.35 : 1);
  const size = sizeForLines(name, titleWidth, base, noImage ? 4 : preset === 'photo-note' ? 2 : 3) * scale;
  // Inside in-the-room's paper card the title stays ink; on a bare background it takes the background's title colour.
  const titleColor = scene ? INK : preset === 'photo-note' ? inks.title : inks.text;
  const title = flowText('event-name', name, titleWidth, size, { fontFamily: 'Les Flos Sans', lineHeight: 0.97, letterSpacingPx: px(-0.32), color: titleColor });
  const about = flowText('event-description', item.blurb ?? item.recapNote ?? '', titleWidth, 2.8, { color: scene ? INK : inks.text });
  if (preset === 'photo-note') about.style.maxWidthPx = px(76);
  about.placeholder = 'Write your blurb';
  let elements;
  if (preset === 'on-the-bill') {
    // The title owns the band above the photo and shrinks to stay in it.
    title.layout = 'free'; title.autoHeight = false; title.frame = frameOf({ x: 8, y: 9, width: 84, height: noImage ? 32 : 25 });
    title.style = { ...title.style, fit: 'shrink', minFontSizePx: px(4) };
    about.layout = 'free'; about.autoHeight = false;
    about.frame = frameOf(noImage ? { x: 8, y: 44, width: 84, height: 50 } : { x: 59, y: 43, width: 33, height: 47 });
    about.style = { ...about.style, fontSizePx: px(3.4), fit: 'shrink', minFontSizePx: px(2.2) };
    const facts = logistics(snap, format, 84); facts.style.borderTop = false;
    const access = flowText('event-access', snap.access || '', 84, 2.1, { fontFamily: 'Space Mono' }); if (!access.text) access.presence = 'removed';
    const footer = cardNode('event-card', { x: 0, y: 103, width: 100, height: 22 }, [facts, access], { padding: 8, sizing: 'content', gap: 2, style: { fill: PAPER } });
    footer.padding.top = px(3); footer.padding.bottom = px(6); reflowCard(footer); footer.anchor = 'bottom'; footer.bottom = 0; footer.frame.y = px(125) - footer.frame.height;
    footer.fit = 'shrink'; footer.maxHeight = px(30);
    elements = [photo, title, about, footer].filter(Boolean);
  } else {
    const facts = logistics(snap, format, titleWidth, scene ? 2.4 : 2.7);
    const access = flowText('event-access', snap.access || '', titleWidth, 2.1, { fontFamily: 'Space Mono', color: scene ? '#b12d0b' : inks.text }); if (!access.text) access.presence = 'removed';
    if (!scene) {
      facts.pin = 'end'; access.pin = 'end';
      walkElements(facts.children, child => { if (child.kind === 'text') child.style = { ...child.style, color: inks.text }; });
    }
    if (scene) facts.style.ruleColor = ORANGE;
    const cardBox = noImage && !scene ? { ...spec.card, y: 12, height: 107 } : spec.card;
    const card = cardNode('event-card', { ...cardBox, rotation: scene ? -1.5 : 0 }, [title, about, facts, access], { padding: scene ? 4 : 0, gap: scene ? 2.5 : 2, sizing: scene ? 'content' : 'fixed', style: scene ? { fill: PAPER, shadow: 'card' } : {} });
    card.fit = 'shrink';
    if (scene) { card.anchor = 'bottom'; card.bottom = px(9); card.maxHeight = px(noImage ? 100 : 70); card.frame.y = px(125) - card.bottom - card.frame.height; }
    elements = [photo, card].filter(Boolean);
  }
  if (spec.sticker) elements.push(stickerNode(inks.sticker === 'dark' ? 'dark' : spec.stickerFinish, { ...spec.sticker, height: 21 * 362 / 629 }));
  const slide = finishSlide('event', preset, 1, scene && noImage && !backgroundName ? INK : backgroundColor, elements, { cropAspect: spec.cropAspect, stickerFinish: spec.stickerFinish, card: clone(spec.card), photoPosition: clone(spec.photo) });
  slide.sourceTimezone = snap.timezone || snap.timeZone || snap.city?.timezone || snap.city?.timeZone || 'UTC';
  slide.source = item.ref ? { ...item.ref } : null;
  return slide;
}
function generateBackSlide(presetId = 'paper-close', copy = {}) {
  const orange = presetId === 'orange-close';
  const ink = orange ? PAPER : INK;
  const quiet = orange ? '#f3d2c4' : '#9a938a';
  const kicker = copy.kicker ?? "1 events here, 143 more you're going to miss";
  const line = copy.line ?? 'find the rest in the app';
  const sub = copy.sub ?? 'link in bio';
  const url = copy.url ?? 'justgo.lol';
  const end = copy.end ?? 'end';
  const mark = { ...stickerNode(orange ? 'light' : 'dark', { x: 22, y: 8, width: 56, height: 56 * 362 / 629 }), role: 'back-mark' };
  const badge = { ...base('image', 'back-badge', { x: 31, y: 78, width: 38, height: 38 * 40 / 119.664 }), lockAspect: true, asset: { id: 'app-store-badge', alt: 'Download on the App Store' } };
  return finishSlide('back', orange ? 'orange-close' : 'paper-close', orange ? 2 : 1, orange ? ORANGE : PAPER, [
    mark,
    textNode('back-kicker', kicker, { x: 8, y: 46, width: 84, height: 5 }, { fontFamily: 'Space Mono', fontSizePx: px(2.2), textAlign: 'center', color: quiet, fit: 'shrink', minFontSizePx: px(1.4) }),
    textNode('back-line', line, { x: 6, y: 54, width: 88, height: 12 }, { fontFamily: 'Les Flos Sans', fontSizePx: px(6.6), fontWeight: 700, lineHeight: 1.02, letterSpacingPx: px(-0.08), textAlign: 'center', color: ink, fit: 'shrink', minFontSizePx: px(3) }),
    textNode('back-sub', sub, { x: 20, y: 68, width: 60, height: 5 }, { fontFamily: 'Space Mono', fontSizePx: px(2.4), textAlign: 'center', color: quiet, fit: 'shrink', minFontSizePx: px(1.4) }),
    badge,
    textNode('back-url', url, { x: 8, y: 114, width: 22, height: 4 }, { fontFamily: 'Space Mono', fontSizePx: px(2), textAlign: 'left', color: ink, fit: 'shrink', minFontSizePx: px(1.2) }),
    { ...base('shape', 'back-rule', { x: 32, y: 115.4, width: 36, height: 0.8 }), style: { fill: quiet } },
    textNode('back-end', end, { x: 72, y: 114, width: 20, height: 4 }, { fontFamily: 'Space Mono', fontSizePx: px(2), textAlign: 'right', color: ink, fit: 'shrink', minFontSizePx: px(1.2) }),
  ]);
}
function walkElements(elements, callback) {
  for (const element of elements || []) { callback(element); walkElements(element.children, callback); }
}
function titleOf(slide) {
  const parts = []; walkElements(slide.elements, element => {
    if (element.kind === 'text' && (element.role === 'cover-title' || /^cover-line-/.test(element.role || ''))) parts.push(element.presence === 'removed' || element.presence === 'blank' ? '' : element.text || '');
  }); return parts.join('\n');
}
function applyPreset(slide, presetId, variation = 1) {
  // A free cover has no template to regenerate from.
  if (presetId === 'free-layout') return slide;
  const old = new Map(); walkElements(slide.elements, element => old.set(element.role, element));
  const isCover = COVER_FAMILIES.includes(presetId);
  const isBack = BACK_PRESETS.includes(presetId);
  const photo = old.get(isCover ? 'cover-photo' : 'event-photo') || old.get('photo');
  const fresh = isCover
    ? generateCoverSlide({ theme: titleOf(slide), coverPreset: presetId, variation, coverImage: photo?.asset })
    : isBack
      ? generateBackSlide(presetId, { kicker: old.get('back-kicker')?.text, line: old.get('back-line')?.text, sub: old.get('back-sub')?.text, url: old.get('back-url')?.text, end: old.get('back-end')?.text })
      : generateEventSlide({ ref: slide.source, snapshot: { name: old.get('event-name')?.text || old.get('title')?.text || '' }, recapNote: old.get('event-description')?.text || old.get('description')?.text || '' }, presetId);
  const legacyLogistics = old.get('event-logistics') || old.get('logistics');
  walkElements(fresh.elements, element => {
    const previous = old.get(element.role);
    if (!previous || previous.kind !== element.kind) return;
    element.id = previous.id;
    if (previous.presence === 'removed') element.presence = 'removed';
    if (element.kind === 'text') {
      element.text = previous.text; element.presence = previous.presence; element.voice = previous.voice;
      if (previous.label != null) element.label = previous.label;
    }
    if (element.kind === 'image') {
      element.asset = clone(previous.asset || {});
      if (previous.crop || element.crop) element.crop = clone(previous.crop || element.crop);
    }
  });
  if (legacyLogistics?.kind === 'text') {
    // Preserve old combined authored logistics exactly; never reinterpret editorial copy.
    walkElements(fresh.elements, element => {
      if (element.role === 'event-logistics' && element.kind === 'card') {
        element.children = [{ ...clone(legacyLogistics), role: 'event-logistics-copy', layout: 'flow', frame: { ...legacyLogistics.frame, x: 0, y: 0, width: element.frame.width } }];
      }
    });
  }
  const knownRoles = new Set(['cover-title', 'cover-photo', 'cover-detail', 'cover-caption', 'cover-location', 'cover-print-caption', 'event-photo', 'event-card', 'event-name', 'event-description', 'event-logistics', 'title', 'description', 'logistics', 'photo', 'sticker', 'back-kicker', 'back-mark', 'back-line', 'back-sub', 'back-url', 'back-end', 'back-rule', 'back-badge', 'back-card']);
  const extras = [];
  const collect = (elements, ancestors = []) => (elements || []).forEach(element => {
    const generated = element.presetOwned === true || (element.presetOwned !== false && knownRoles.has(element.role));
    if (!generated) {
      let x = element.frame.x + element.frame.width / 2; let y = element.frame.y + element.frame.height / 2; let rotation = element.rotation || 0;
      [...ancestors].reverse().forEach(parent => {
        const angle = (parent.rotation || 0) * Math.PI / 180;
        const dx = x - parent.frame.width / 2; const dy = y - parent.frame.height / 2;
        x = parent.frame.x + parent.frame.width / 2 + dx * Math.cos(angle) - dy * Math.sin(angle);
        y = parent.frame.y + parent.frame.height / 2 + dx * Math.sin(angle) + dy * Math.cos(angle); rotation += parent.rotation || 0;
      });
      extras.push({ ...clone(element), layout: 'free', rotation, frame: { ...element.frame, x: x - element.frame.width / 2, y: y - element.frame.height / 2 } });
    } else collect(element.children, [...ancestors, element]);
  }); collect(slide.elements);
  const preservedIds = new Set(); walkElements(extras, element => preservedIds.add(element.id));
  const removePreserved = elements => elements.filter(element => !preservedIds.has(element.id)).map(element => ({ ...element, ...(element.children ? { children: removePreserved(element.children) } : {}) }));
  fresh.elements = removePreserved(fresh.elements);
  const freshRoles = new Set(); walkElements(fresh.elements, element => freshRoles.add(element.role));
  for (const role of ['cover-caption', 'cover-location', 'cover-print-caption', 'cover-detail']) {
    const previous = old.get(role);
    if (previous && !preservedIds.has(previous.id) && !freshRoles.has(role) && previous.presence !== 'removed' && (previous.text || (previous.asset?.src && previous.asset.src !== photo?.asset?.src))) extras.push({ ...clone(previous), presetOwned: false });
  }
  fresh.elements.push(...extras);
  walkElements(fresh.elements, element => { if (element.kind === 'card') reflowCard(element); });
  return { ...slide, ...fresh, id: slide.id, source: slide.source, detached: slide.detached, elements: fresh.elements.map((e, stack) => ({ ...e, stack })) };
}
function shuffleCoverVariation(document, { variation } = {}) {
  const cover = document.slides?.find(slide => slide.role === 'cover');
  if (!cover || !COVER_FAMILIES.includes(cover.preset?.family)) return document;
  return { ...document, slides: document.slides.map(slide => slide.id === cover.id ? applyPreset(slide, slide.preset?.family || 'loose-letters', variation || (slide.preset?.variation || 1) % 3 + 1) : slide) };
}
module.exports = { COVER_FAMILIES, EVENT_PRESETS, BACK_PRESETS, COVER_GEOMETRY, EVENT_GEOMETRY, PALETTE, SLIDE_FONTS, sizeForLines, generateCoverSlide, generateFreeCoverSlide, generateEventSlide, generateBackSlide, shuffleCoverVariation, applyPreset, titleOf, walkElements, formatWhen };
