const fs = require('fs');
const path = require('path');
const axios = require('axios');
const opentype = require('opentype.js');
const sharp = require('sharp');

const SHARE_WIDTH = 1200;
const SHARE_HEIGHT = 630;

// Just Go mobile tokens (pivotTheme light + photo/deck overlays).
const TOKEN = Object.freeze({
  cream: '#FAF6EF',
  ink: '#1A1714',
  immersive: '#1A1714',
  accent: '#FF4F1F',
  pop: '#FFD23F',
  ticker: '#4AB5FF',
  burst: '#FF2A2A',
  onPhoto: '#FAF6EF',
  warmCast: 'rgba(28, 20, 14, 0.12)',
  vignetteTop: 'rgba(16, 12, 10, 0.42)',
  vignetteMid: 'rgba(20, 16, 12, 0.18)',
  vignetteBottom: 'rgba(14, 11, 9, 0.78)',
});

const WORDMARK_PATH = path.join(
  __dirname,
  '../../frontend/public/justgo/wordmark-1624.png',
);
const LES_FLOS_PATH = path.join(__dirname, '../assets/justgo/LesFlosSans.otf');
const HERO_DIR = path.join(__dirname, '../assets/justgo');
const HERO_FILES = Object.freeze([
  'hero-canopy.jpg',
  'hero-coast.jpg',
  'hero-meadow.jpg',
]);
const WORDMARK_DISPLAY_WIDTH = 336;

const POSTER_WIDTH = 400;
const POSTER_HEIGHT = 533;
const POSTER_RADIUS = 16;
const POSTER_TILT_DEG = -5.4;

const FIELD_LIMITS = Object.freeze({
  title: 200,
  'venue.text': 500,
  'organizer.name': 200,
  timezone: 100,
});

const HEADLINE_MAX_LINES = 2;
const HEADLINE_CHARS_PER_LINE = 16;
const PLACE_MAX_CHARS = 22;
const PHOTO_FETCH_TIMEOUT_MS = 3500;
const PHOTO_FETCH_MAX_BYTES = 5 * 1024 * 1024;

let cachedFont = null;

function escapeSvgText(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sanitizeText(value) {
  return String(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim();
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function fieldLengthError(field, maxLength) {
  return { error: `${field} exceeds ${maxLength} characters.`, status: 400 };
}

function isPrivateHostname(host) {
  const value = String(host || '').toLowerCase();
  if (!value) return true;
  if (value === 'localhost' || value.endsWith('.localhost')) return true;
  if (value === '::1' || value === '0.0.0.0' || value === 'metadata.google.internal') return true;
  if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(value)) return true;
  const match = value.match(/^172\.(\d+)\./);
  if (match) {
    const octet = Number(match[1]);
    if (octet >= 16 && octet <= 31) return true;
  }
  return false;
}

function isSafePublicImageUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || ''));
  } catch (_) {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;
  if (isPrivateHostname(parsed.hostname)) return false;
  return true;
}

function resolvePublicEventPhotoUrl(event) {
  return nonEmptyString(event?.socialPreview?.imageUrl) || nonEmptyString(event?.image?.url);
}

function validatePublicEventShareInput(event) {
  if (!event || typeof event !== 'object') {
    return { error: 'A public event payload is required.', status: 400 };
  }

  const title = sanitizeText(event.title);
  if (!title) return { error: 'title is required.', status: 400 };
  if (title.length > FIELD_LIMITS.title) return fieldLengthError('title', FIELD_LIMITS.title);

  const startsAt = String(event.startsAt || '').trim();
  const endsAt = String(event.endsAt || '').trim();
  const timezone = sanitizeText(event.timezone);
  if (!startsAt || Number.isNaN(Date.parse(startsAt))) {
    return { error: 'startsAt must be a valid date-time.', status: 400 };
  }
  if (!endsAt || Number.isNaN(Date.parse(endsAt))) {
    return { error: 'endsAt must be a valid date-time.', status: 400 };
  }
  if (!timezone) return { error: 'timezone is required.', status: 400 };
  if (timezone.length > FIELD_LIMITS.timezone) {
    return fieldLengthError('timezone', FIELD_LIMITS.timezone);
  }

  const venueText = sanitizeText(event.venue?.text);
  if (!venueText) return { error: 'venue.text is required.', status: 400 };
  if (venueText.length > FIELD_LIMITS['venue.text']) {
    return fieldLengthError('venue.text', FIELD_LIMITS['venue.text']);
  }

  const organizerName = sanitizeText(event.organizer?.name);
  if (!organizerName) return { error: 'organizer.name is required.', status: 400 };
  if (organizerName.length > FIELD_LIMITS['organizer.name']) {
    return fieldLengthError('organizer.name', FIELD_LIMITS['organizer.name']);
  }

  return {
    title,
    startsAt,
    endsAt,
    timezone,
    venueText,
    organizerName,
    photoUrl: resolvePublicEventPhotoUrl(event),
  };
}

function formatPublicEventDate(event, locale = 'en-US') {
  if (!event?.startsAt || !event?.endsAt || !event?.timezone) return null;
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  const date = new Intl.DateTimeFormat(locale, {
    timeZone: event.timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: start.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  }).format(start);
  const time = new Intl.DateTimeFormat(locale, {
    timeZone: event.timezone,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
  return {
    date,
    startTime: time.format(start),
    endTime: time.format(end),
  };
}

function formatShareWhenChip(event, locale = 'en-US') {
  if (!event?.startsAt || !event?.timezone) return null;
  const start = new Date(event.startsAt);
  if (Number.isNaN(start.getTime())) return null;
  const weekday = new Intl.DateTimeFormat(locale, {
    timeZone: event.timezone,
    weekday: 'short',
  }).format(start);
  const monthDay = new Intl.DateTimeFormat(locale, {
    timeZone: event.timezone,
    month: 'short',
    day: 'numeric',
  }).format(start);
  return `${weekday} · ${monthDay}`.toLowerCase();
}

function truncateText(text, maxChars) {
  const value = sanitizeText(text);
  if (value.length <= maxChars) return value;
  if (maxChars <= 1) return '…';
  return `${value.slice(0, maxChars - 1).trimEnd()}…`;
}

function wrapHeadline(text, charsPerLine, maxLines) {
  const words = sanitizeText(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= charsPerLine) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = '';
    if (lines.length >= maxLines) return lines.slice(0, maxLines);
    if (lines.length === maxLines - 1) {
      const remainder = words.slice(index).join(' ');
      lines.push(truncateText(remainder, charsPerLine));
      return lines;
    }
    current = word.length > charsPerLine ? truncateText(word, charsPerLine) : word;
  }
  if (current) lines.push(current);
  return lines.slice(0, maxLines);
}

/** Short lowercase headline: drop subtitle after a colon, two lines max. */
function shareHeadlineLines(title) {
  let text = sanitizeText(title).toLowerCase();
  const colon = text.indexOf(':');
  if (colon >= 6) text = text.slice(0, colon).trim();
  return wrapHeadline(text, HEADLINE_CHARS_PER_LINE, HEADLINE_MAX_LINES);
}

/** City or named place — never a full street address. */
function shortPlaceLabel(venueText) {
  const parts = sanitizeText(venueText)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return '';
  const named = parts.length >= 2 && /^\d/.test(parts[0]) ? parts[1] : parts[0];
  return truncateText(named.toLowerCase(), PLACE_MAX_CHARS);
}

function loadLesFlos() {
  if (cachedFont) return cachedFont;
  if (!fs.existsSync(LES_FLOS_PATH)) {
    throw new Error(`Les Flos Sans not found at ${LES_FLOS_PATH}`);
  }
  const file = fs.readFileSync(LES_FLOS_PATH);
  cachedFont = opentype.parse(
    file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
  );
  return cachedFont;
}

function lesFlosWidth(text, fontSize) {
  return lesFlosText(text, 0, 0, fontSize, '#000').width;
}

function lesFlosText(text, x, y, fontSize, fill) {
  const font = loadLesFlos();
  const scale = fontSize / font.unitsPerEm;
  const paths = [];
  let cursor = x;
  const glyphs = font.stringToGlyphs(text);
  for (let index = 0; index < glyphs.length; index += 1) {
    const glyph = glyphs[index];
    const data = glyph.getPath(cursor, y, fontSize).toPathData(1);
    if (data) paths.push(`<path d="${data}" fill="${fill}"/>`);
    cursor += glyph.advanceWidth * scale;
    const next = glyphs[index + 1];
    if (next && typeof font.getKerningValue === 'function') {
      cursor += font.getKerningValue(glyph, next) * scale;
    }
  }
  return { svg: paths.join(''), width: Math.ceil(cursor - x) };
}

function cutPaperPath(width, height) {
  const w = width;
  const h = height;
  return `M 0 ${h * 0.06} L ${w} ${h * 0.04} L ${w * 0.985} ${h * 0.94} L ${w * 0.02} ${h} Z`;
}

function scrapbookStrip({
  text,
  x,
  y,
  rotateDeg,
  fill,
  textFill,
  fontSize,
}) {
  const padX = Math.round(fontSize * 0.28);
  const padTop = Math.round(fontSize * 0.22);
  const padBottom = Math.round(fontSize * 0.28);
  const textWidth = Math.ceil(lesFlosWidth(text, fontSize));
  const width = textWidth + padX * 2;
  const height = fontSize + padTop + padBottom;
  const baseline = padTop + fontSize * 0.78;
  const originX = x + width / 2;
  const originY = y + height / 2;
  const glyphs = lesFlosText(text, x + padX, y + baseline, fontSize, textFill);
  return {
    width,
    height,
    svg:
      `<g transform="rotate(${rotateDeg} ${originX} ${originY})">` +
        `<path d="${cutPaperPath(width, height)}" transform="translate(${x} ${y})" ` +
          `fill="${fill}" stroke="${TOKEN.ink}" stroke-width="3" stroke-linejoin="miter"/>` +
        glyphs.svg +
      `</g>`,
  };
}

function metaChip({ text, x, y, fill, textFill }) {
  const fontSize = 26;
  const padX = 20;
  const height = 52;
  const glyphs = lesFlosText(text, x + padX, y + 35, fontSize, textFill);
  const width = glyphs.width + padX * 2;
  return {
    width,
    height,
    svg:
      `<g>` +
        `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="14" ` +
          `fill="${fill}" stroke="${TOKEN.ink}" stroke-width="2.5"/>` +
        glyphs.svg +
      `</g>`,
  };
}

function hashSeed(value) {
  const text = String(value || '');
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function resolveHeroPath(seed) {
  const file = HERO_FILES[hashSeed(seed) % HERO_FILES.length];
  return path.join(HERO_DIR, file);
}

function buildShareOverlaySvg({
  titleLines,
  whenChip,
  placeChip,
}) {
  const fontSize = titleLines.length === 1 ? 86 : 76;
  const measured = titleLines.map((line, index) => scrapbookStrip({
    text: line,
    x: 44 + (index === 1 ? 22 : 0),
    y: 0,
    rotateDeg: index === 0 ? -1.6 : 1.2,
    fill: index === 0 ? TOKEN.cream : TOKEN.accent,
    textFill: index === 0 ? TOKEN.ink : TOKEN.cream,
    fontSize,
  }));
  const stripStackHeight = measured.reduce((sum, strip, index) => (
    sum + strip.height + (index === 0 ? 0 : -8)
  ), 0);
  let stripY = 220;
  const chipY = Math.min(SHARE_HEIGHT - 70, stripY + stripStackHeight + 22);
  const stripMarkup = titleLines.map((line, index) => {
    const placed = scrapbookStrip({
      text: line,
      x: 44 + (index === 1 ? 22 : 0),
      y: stripY,
      rotateDeg: index === 0 ? -1.6 : 1.2,
      fill: index === 0 ? TOKEN.cream : TOKEN.accent,
      textFill: index === 0 ? TOKEN.ink : TOKEN.cream,
      fontSize,
    });
    stripY += placed.height - 8;
    return placed.svg;
  }).join('');

  const when = whenChip
    ? metaChip({ text: whenChip, x: 44, y: chipY, fill: TOKEN.ticker, textFill: TOKEN.ink })
    : null;
  const place = placeChip
    ? metaChip({
      text: placeChip,
      x: 44 + (when ? when.width + 14 : 0),
      y: chipY,
      fill: TOKEN.pop,
      textFill: TOKEN.ink,
    })
    : null;

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SHARE_WIDTH}" height="${SHARE_HEIGHT}">` +
      `<defs>` +
        `<linearGradient id="typeWell" x1="0" y1="0" x2="1" y2="0">` +
          `<stop offset="0%" stop-color="rgb(16,12,10)" stop-opacity="0.22"/>` +
          `<stop offset="38%" stop-color="rgb(16,12,10)" stop-opacity="0.08"/>` +
          `<stop offset="62%" stop-color="rgb(16,12,10)" stop-opacity="0"/>` +
        `</linearGradient>` +
        `<linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">` +
          `<stop offset="0%" stop-color="rgb(26,23,20)" stop-opacity="0.14"/>` +
          `<stop offset="100%" stop-color="rgb(14,11,9)" stop-opacity="0.22"/>` +
        `</linearGradient>` +
      `</defs>` +
      `<rect width="${SHARE_WIDTH}" height="${SHARE_HEIGHT}" fill="url(#scrim)"/>` +
      `<rect width="${SHARE_WIDTH}" height="${SHARE_HEIGHT}" fill="${TOKEN.warmCast}"/>` +
      `<rect width="${SHARE_WIDTH}" height="${SHARE_HEIGHT}" fill="url(#typeWell)"/>` +
      stripMarkup +
      (when ? when.svg : '') +
      (place ? place.svg : '') +
    `</svg>`,
  );
}

/**
 * Rest pose of native `MotionGleamView` (Meridian-Mobile
 * `modules/motion-gleam/ios/MotionGleamModule.swift`).
 *
 * A radial white spotlight (layer oversized, then clipped) plus the same
 * gradient masked to a 1pt rounded rim. Not the Expo-Go edge-bar fallback.
 */
function posterGleamSvg() {
  const spotlightWidth = POSTER_WIDTH * 1.68;
  const spotlightHeight = POSTER_HEIGHT * 1.6;
  const spotlightOriginX = -POSTER_WIDTH * 0.34;
  const spotlightOriginY = -POSTER_HEIGHT * 0.3;
  const cx = spotlightOriginX + 0.42 * spotlightWidth;
  const cy = spotlightOriginY + 0.38 * spotlightHeight;
  const radius = Math.hypot(
    spotlightOriginX + 0.94 * spotlightWidth - cx,
    spotlightOriginY + 0.9 * spotlightHeight - cy,
  );
  const rimInset = 1.5;
  const rimWidth = 3;
  const rimRadius = POSTER_RADIUS;

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}">` +
      `<defs>` +
        `<clipPath id="posterClip">` +
          `<rect width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" rx="${POSTER_RADIUS}"/>` +
        `</clipPath>` +
        `<radialGradient id="spotlight" gradientUnits="userSpaceOnUse" ` +
          `cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${radius.toFixed(2)}">` +
          `<stop offset="0%" stop-color="#fff" stop-opacity="0.25"/>` +
          `<stop offset="22%" stop-color="#fff" stop-opacity="0.16"/>` +
          `<stop offset="48%" stop-color="#fff" stop-opacity="0.08"/>` +
          `<stop offset="76%" stop-color="#fff" stop-opacity="0.03"/>` +
          `<stop offset="100%" stop-color="#fff" stop-opacity="0"/>` +
        `</radialGradient>` +
        `<radialGradient id="edgeGleam" gradientUnits="userSpaceOnUse" ` +
          `cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${radius.toFixed(2)}">` +
          `<stop offset="0%" stop-color="#fff" stop-opacity="1"/>` +
          `<stop offset="18%" stop-color="#fff" stop-opacity="1"/>` +
          `<stop offset="40%" stop-color="#fff" stop-opacity="0.72"/>` +
          `<stop offset="72%" stop-color="#fff" stop-opacity="0.3"/>` +
          `<stop offset="100%" stop-color="#fff" stop-opacity="0"/>` +
        `</radialGradient>` +
      `</defs>` +
      `<g clip-path="url(#posterClip)">` +
        `<rect width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" fill="url(#spotlight)"/>` +
        `<rect x="${rimInset}" y="${rimInset}" ` +
          `width="${POSTER_WIDTH - rimInset * 2}" height="${POSTER_HEIGHT - rimInset * 2}" ` +
          `rx="${rimRadius}" fill="none" stroke="rgba(42,42,42,0.96)" stroke-width="${rimWidth}"/>` +
        `<rect x="${rimInset}" y="${rimInset}" ` +
          `width="${POSTER_WIDTH - rimInset * 2}" height="${POSTER_HEIGHT - rimInset * 2}" ` +
          `rx="${rimRadius}" fill="none" stroke="url(#edgeGleam)" stroke-width="${rimWidth}"/>` +
      `</g>` +
    `</svg>`,
  );
}

function posterMaskSvg() {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}">` +
      `<rect width="${POSTER_WIDTH}" height="${POSTER_HEIGHT}" rx="${POSTER_RADIUS}" fill="#fff"/>` +
    `</svg>`,
  );
}

async function loadWordmarkComposite() {
  if (!fs.existsSync(WORDMARK_PATH)) {
    throw new Error(`Just Go wordmark not found at ${WORDMARK_PATH}`);
  }
  const resized = await sharp(WORDMARK_PATH)
    .resize({ width: WORDMARK_DISPLAY_WIDTH })
    .png()
    .toBuffer();
  return { input: resized, left: 36, top: 14 };
}

async function renderHeroBackdrop(seed) {
  const heroPath = resolveHeroPath(seed);
  if (!fs.existsSync(heroPath)) return null;
  return sharp(heroPath)
    .resize(SHARE_WIDTH, SHARE_HEIGHT, {
      fit: 'cover',
      position: 'centre',
      kernel: 'lanczos3',
    })
    .blur(12)
    .modulate({ brightness: 0.84, saturation: 0.95 })
    .png()
    .toBuffer();
}

async function preparePosterCard(photoBuffer) {
  const artwork = await sharp(photoBuffer)
    .rotate()
    .resize(POSTER_WIDTH, POSTER_HEIGHT, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();

  const rounded = await sharp(artwork)
    .composite([
      { input: posterMaskSvg(), blend: 'dest-in' },
      { input: posterGleamSvg(), blend: 'over' },
    ])
    .png()
    .toBuffer();

  const shadowPad = 18;
  const shadowOffsetY = 10;
  const shadowCanvasWidth = POSTER_WIDTH + shadowPad * 2;
  const shadowCanvasHeight = POSTER_HEIGHT + shadowPad * 2 + shadowOffsetY;
  const shadowShape = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${shadowCanvasWidth}" height="${shadowCanvasHeight}">` +
      `<rect x="${shadowPad + 4}" y="${shadowPad + shadowOffsetY}" ` +
        `width="${POSTER_WIDTH - 8}" height="${POSTER_HEIGHT - 4}" rx="${POSTER_RADIUS + 2}" ` +
        `fill="rgba(8,6,4,0.48)"/>` +
    `</svg>`,
  );
  const shadow = await sharp(shadowShape).blur(14).png().toBuffer();
  const stacked = await sharp({
    create: {
      width: shadowCanvasWidth,
      height: shadowCanvasHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: shadow, left: 0, top: 0 },
      { input: rounded, left: shadowPad, top: shadowPad },
    ])
    .png()
    .toBuffer();

  let tilted = await sharp(stacked)
    .rotate(POSTER_TILT_DEG, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  let meta = await sharp(tilted).metadata();
  if (meta.width > SHARE_WIDTH || meta.height > SHARE_HEIGHT) {
    tilted = await sharp(tilted)
      .resize({
        width: Math.min(meta.width, SHARE_WIDTH),
        height: Math.min(meta.height, SHARE_HEIGHT),
        fit: 'inside',
      })
      .png()
      .toBuffer();
    meta = await sharp(tilted).metadata();
  }
  const left = SHARE_WIDTH - meta.width - 18;
  const top = Math.max(6, Math.round((SHARE_HEIGHT - meta.height) / 2));
  return { input: tilted, left, top, width: meta.width, height: meta.height };
}

async function fetchSharePhotoBuffer(photoUrl) {
  if (!isSafePublicImageUrl(photoUrl)) return null;
  try {
    const response = await axios.get(photoUrl, {
      responseType: 'arraybuffer',
      timeout: PHOTO_FETCH_TIMEOUT_MS,
      maxContentLength: PHOTO_FETCH_MAX_BYTES,
      maxBodyLength: PHOTO_FETCH_MAX_BYTES,
      maxRedirects: 3,
      validateStatus: (status) => status === 200,
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/jpeg,image/png,image/*;q=0.8',
        'User-Agent': 'JustGoShareCard/1.0 (+https://justgo.lol)',
      },
    });
    const contentType = String(response.headers['content-type'] || '').toLowerCase();
    if (!contentType.startsWith('image/') || contentType.includes('svg')) return null;
    const buffer = Buffer.from(response.data);
    if (buffer.length < 32) return null;
    return buffer;
  } catch (_) {
    return null;
  }
}

async function loadEventPhotoBuffer(event, options = {}) {
  if (Buffer.isBuffer(options.photoBuffer) && options.photoBuffer.length) {
    return options.photoBuffer;
  }
  const photoUrl = resolvePublicEventPhotoUrl(event);
  if (!photoUrl) return null;
  const fetchPhoto = options.fetchPhoto || fetchSharePhotoBuffer;
  try {
    const loaded = await fetchPhoto(photoUrl);
    return Buffer.isBuffer(loaded) && loaded.length ? loaded : null;
  } catch (_) {
    return null;
  }
}

/**
 * Render a 1200×630 PNG share card for a public event v1 payload.
 * Blurred nature hero, scrapbook type, and the event photo as a gleam poster card.
 *
 * @returns {{ buffer?: Buffer, error?: string, status?: number }}
 */
async function renderJustGoPublicEventShareImage(event, options = {}) {
  const validated = validatePublicEventShareInput(event);
  if (validated.error) return validated;

  const titleLines = shareHeadlineLines(validated.title);
  if (!titleLines.length) {
    return { error: 'title is required.', status: 400 };
  }

  const whenChip = formatShareWhenChip(
    {
      startsAt: validated.startsAt,
      timezone: validated.timezone,
    },
    options.locale || 'en-US',
  );
  const placeChip = shortPlaceLabel(validated.venueText);
  const photoBuffer = await loadEventPhotoBuffer(event, options);
  const overlaySvg = buildShareOverlaySvg({
    titleLines,
    whenChip,
    placeChip,
  });

  const layers = [];
  try {
    const hero = await renderHeroBackdrop(`${validated.title}|${validated.startsAt}`);
    if (hero) layers.push({ input: hero, left: 0, top: 0 });
  } catch (_) {
    // Missing or unreadable hero → immersive canvas.
  }
  layers.push({ input: overlaySvg, left: 0, top: 0 });
  layers.push(await loadWordmarkComposite());
  if (photoBuffer) {
    try {
      layers.push(await preparePosterCard(photoBuffer));
    } catch (_) {
      // Unreadable photo → type on nature, no empty frame.
    }
  }

  const canvas = sharp({
    create: {
      width: SHARE_WIDTH,
      height: SHARE_HEIGHT,
      channels: 4,
      background: TOKEN.immersive,
    },
  });

  const buffer = await canvas
    .composite(layers)
    .png({ compressionLevel: 6 })
    .toBuffer();

  return { buffer };
}

module.exports = {
  SHARE_WIDTH,
  SHARE_HEIGHT,
  SHARE_BACKGROUND: TOKEN.immersive,
  FIELD_LIMITS,
  TOKEN,
  HEADLINE_MAX_LINES,
  HEADLINE_CHARS_PER_LINE,
  POSTER_WIDTH,
  POSTER_HEIGHT,
  escapeSvgText,
  formatPublicEventDate,
  formatShareWhenChip,
  validatePublicEventShareInput,
  shareHeadlineLines,
  shortPlaceLabel,
  wrapHeadline,
  buildShareOverlaySvg,
  isSafePublicImageUrl,
  resolvePublicEventPhotoUrl,
  renderJustGoPublicEventShareImage,
};
