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
const WORDMARK_DISPLAY_WIDTH = 260;

const FIELD_LIMITS = Object.freeze({
  title: 200,
  'venue.text': 500,
  'organizer.name': 200,
  timezone: 100,
});

const HEADLINE_MAX_LINES = 2;
const HEADLINE_CHARS_PER_LINE = 22;
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
  const fontSize = 22;
  const padX = 16;
  const height = 40;
  const glyphs = lesFlosText(text, x + padX, y + 28, fontSize, textFill);
  const width = glyphs.width + padX * 2;
  return {
    width,
    height,
    svg:
      `<g>` +
        `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="10" ` +
          `fill="${fill}" stroke="${TOKEN.ink}" stroke-width="2"/>` +
        glyphs.svg +
      `</g>`,
  };
}

function buildShareOverlaySvg({
  titleLines,
  whenChip,
  placeChip,
  hasPhoto,
}) {
  const fontSize = titleLines.length === 1 ? 72 : 58;
  const measured = titleLines.map((line, index) => scrapbookStrip({
    text: line,
    x: 56 + (index === 1 ? 18 : 0),
    y: 0,
    rotateDeg: index === 0 ? -1.4 : 1.1,
    fill: index === 0 ? TOKEN.cream : TOKEN.accent,
    textFill: index === 0 ? TOKEN.ink : TOKEN.cream,
    fontSize,
  }));
  const stripStackHeight = measured.reduce((sum, strip, index) => (
    sum + strip.height + (index === 0 ? 0 : -6)
  ), 0);
  const chipY = SHARE_HEIGHT - 86;
  let stripY = chipY - 28 - stripStackHeight;
  const stripMarkup = titleLines.map((line, index) => {
    const placed = scrapbookStrip({
      text: line,
      x: 56 + (index === 1 ? 18 : 0),
      y: stripY,
      rotateDeg: index === 0 ? -1.4 : 1.1,
      fill: index === 0 ? TOKEN.cream : TOKEN.accent,
      textFill: index === 0 ? TOKEN.ink : TOKEN.cream,
      fontSize,
    });
    stripY += placed.height - 6;
    return placed.svg;
  }).join('');

  const when = whenChip
    ? metaChip({ text: whenChip, x: 56, y: chipY, fill: TOKEN.ticker, textFill: TOKEN.ink })
    : null;
  const place = placeChip
    ? metaChip({
      text: placeChip,
      x: 56 + (when ? when.width + 12 : 0),
      y: chipY,
      fill: TOKEN.pop,
      textFill: TOKEN.ink,
    })
    : null;

  const wash = hasPhoto
    ? `<rect width="${SHARE_WIDTH}" height="${SHARE_HEIGHT}" fill="${TOKEN.warmCast}"/>` +
      `<defs>` +
        `<linearGradient id="topFade" x1="0" y1="0" x2="0" y2="1">` +
          `<stop offset="0%" stop-color="${TOKEN.vignetteTop}"/>` +
          `<stop offset="42%" stop-color="${TOKEN.vignetteMid}" stop-opacity="0.35"/>` +
          `<stop offset="70%" stop-color="rgb(14,11,9)" stop-opacity="0"/>` +
        `</linearGradient>` +
        `<linearGradient id="bottomFade" x1="0" y1="0" x2="0" y2="1">` +
          `<stop offset="45%" stop-color="rgb(14,11,9)" stop-opacity="0"/>` +
          `<stop offset="78%" stop-color="${TOKEN.vignetteMid}"/>` +
          `<stop offset="100%" stop-color="${TOKEN.vignetteBottom}"/>` +
        `</linearGradient>` +
      `</defs>` +
      `<rect width="${SHARE_WIDTH}" height="${SHARE_HEIGHT}" fill="url(#topFade)"/>` +
      `<rect width="${SHARE_WIDTH}" height="${SHARE_HEIGHT}" fill="url(#bottomFade)"/>`
    : '';

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SHARE_WIDTH}" height="${SHARE_HEIGHT}">` +
      wash +
      stripMarkup +
      (when ? when.svg : '') +
      (place ? place.svg : '') +
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
  return { input: resized, left: 52, top: 40 };
}

async function prepareFullBleedPhoto(photoBuffer) {
  return sharp(photoBuffer)
    .rotate()
    .resize(SHARE_WIDTH, SHARE_HEIGHT, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();
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
 * Photo-first Just Go flyer: wordmark, scrapbook headline, when/where chips.
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
    hasPhoto: Boolean(photoBuffer),
  });

  const layers = [];
  if (photoBuffer) {
    try {
      layers.push({ input: await prepareFullBleedPhoto(photoBuffer), left: 0, top: 0 });
    } catch (_) {
      // Unreadable photo → immersive canvas.
    }
  }
  layers.push({ input: overlaySvg, left: 0, top: 0 });
  layers.push(await loadWordmarkComposite());

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
