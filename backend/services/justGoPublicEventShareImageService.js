const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');

const SHARE_WIDTH = 1200;
const SHARE_HEIGHT = 630;
const SHARE_BACKGROUND = '#1E1A16';
const SHARE_INK = '#FAF6EF';
const SHARE_INK_MUTED = 'rgba(250,246,239,0.72)';
const SHARE_ACCENT = '#FF4F1F';

const WORDMARK_PATH = path.join(
  __dirname,
  '../../frontend/public/justgo/wordmark-1624.png',
);
const WORDMARK_DISPLAY_WIDTH = 220;
const WORDMARK_DISPLAY_WIDTH_SPLIT = 190;

const FIELD_LIMITS = Object.freeze({
  title: 200,
  'venue.text': 500,
  'organizer.name': 200,
  timezone: 100,
});

const TITLE_MAX_LINES = 2;
const TITLE_CHARS_PER_LINE = 38;
const TITLE_MAX_LINES_SPLIT = 3;
const TITLE_CHARS_PER_LINE_SPLIT = 22;

const VENUE_MAX_CHARS = 72;
const VENUE_MAX_CHARS_SPLIT = 36;
const ORGANIZER_MAX_CHARS = 48;
const ORGANIZER_MAX_CHARS_SPLIT = 32;

const VENUE_LABEL = 'where';
const ORGANIZER_LABEL = 'hosted by';
const DATE_SEPARATOR = 'to';

const PHOTO_PAD = 48;
const PHOTO_WIDTH = 520;
const PHOTO_HEIGHT = SHARE_HEIGHT - PHOTO_PAD * 2;
const PHOTO_LEFT = SHARE_WIDTH - PHOTO_PAD - PHOTO_WIDTH;
const PHOTO_TOP = PHOTO_PAD;
const PHOTO_RADIUS = 36;
const TEXT_LEFT = 64;
const PHOTO_FETCH_TIMEOUT_MS = 3500;
const PHOTO_FETCH_MAX_BYTES = 5 * 1024 * 1024;

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

function truncateText(text, maxChars) {
  const value = sanitizeText(text);
  if (value.length <= maxChars) return value;
  if (maxChars <= 1) return '…';
  return `${value.slice(0, maxChars - 1).trimEnd()}…`;
}

function wrapTitleLines(title, options = {}) {
  const maxLines = options.maxLines || TITLE_MAX_LINES;
  const charsPerLine = options.charsPerLine || TITLE_CHARS_PER_LINE;
  const text = sanitizeText(title);
  const maxChars = charsPerLine * maxLines;
  if (text.length <= charsPerLine) return [text];

  const needsEllipsis = text.length > maxChars - 1;
  const words = text.split(/\s+/).filter(Boolean);
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
    if (lines.length >= maxLines) {
      return lines.slice(0, maxLines);
    }

    if (lines.length === maxLines - 1) {
      const remainder = [word, ...words.slice(index + 1)].join(' ');
      const lastLine = current ? `${current} ${remainder}` : remainder;
      lines.push(truncateText(lastLine, charsPerLine));
      return lines.slice(0, maxLines);
    }

    current = word.length > charsPerLine
      ? truncateText(word, charsPerLine)
      : word;
  }

  if (current) lines.push(current);
  if (needsEllipsis && lines.length > 0 && !lines[lines.length - 1].endsWith('…')) {
    lines[lines.length - 1] = truncateText(lines[lines.length - 1], charsPerLine);
  }
  return lines.slice(0, maxLines);
}

function buildShareOverlaySvg({
  titleLines,
  dateLine,
  timeLine,
  venueLine,
  organizerLine,
  layout = 'full',
}) {
  const split = layout === 'split';
  const x = split ? TEXT_LEFT : 72;
  const titleY = split ? 176 : 228;
  const titleSize = split ? 42 : 54;
  const titleLineHeight = split ? 50 : 62;
  const titleTspans = titleLines.map((line, index) => (
    `<tspan x="${x}" dy="${index === 0 ? 0 : titleLineHeight}">${escapeSvgText(line)}</tspan>`
  )).join('');

  const factsY = titleY + titleLines.length * titleLineHeight + (split ? 28 : 36);
  const ruleEnd = split ? PHOTO_LEFT - 36 : SHARE_WIDTH - 72;
  const divider = split
    ? `<line x1="${PHOTO_LEFT - 24}" y1="${PHOTO_PAD}" x2="${PHOTO_LEFT - 24}" ` +
      `y2="${SHARE_HEIGHT - PHOTO_PAD}" stroke="${SHARE_ACCENT}" stroke-width="3"/>`
    : '';

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SHARE_WIDTH}" height="${SHARE_HEIGHT}">` +
      `<rect width="${SHARE_WIDTH}" height="${SHARE_HEIGHT}" fill="none"/>` +
      divider +
      `<text x="${x}" y="${titleY}" fill="${SHARE_INK}" font-family="Helvetica, Arial, sans-serif" ` +
        `font-size="${titleSize}" font-weight="700" letter-spacing="-0.03em">${titleTspans}</text>` +
      `<line x1="${x}" y1="${factsY - 18}" x2="${ruleEnd}" y2="${factsY - 18}" ` +
        `stroke="${SHARE_INK_MUTED}" stroke-width="1"/>` +
      `<text x="${x}" y="${factsY + 4}" fill="${SHARE_INK}" font-family="Helvetica, Arial, sans-serif" ` +
        `font-size="${split ? 24 : 28}" font-weight="600">${escapeSvgText(dateLine)}</text>` +
      `<text x="${x}" y="${factsY + 38}" fill="${SHARE_INK_MUTED}" font-family="monospace" ` +
        `font-size="${split ? 18 : 22}">${escapeSvgText(timeLine)}</text>` +
      `<text x="${x}" y="${factsY + 88}" fill="${SHARE_INK_MUTED}" font-family="monospace" ` +
        `font-size="16" letter-spacing="0.04em">${escapeSvgText(VENUE_LABEL)}</text>` +
      `<text x="${x}" y="${factsY + 118}" fill="${SHARE_INK}" font-family="Helvetica, Arial, sans-serif" ` +
        `font-size="${split ? 22 : 26}" font-weight="600">${escapeSvgText(venueLine)}</text>` +
      `<text x="${x}" y="${factsY + 168}" fill="${SHARE_INK_MUTED}" font-family="monospace" ` +
        `font-size="16" letter-spacing="0.04em">${escapeSvgText(ORGANIZER_LABEL)}</text>` +
      `<text x="${x}" y="${factsY + 198}" fill="${SHARE_INK}" font-family="Helvetica, Arial, sans-serif" ` +
        `font-size="${split ? 22 : 26}" font-weight="600">${escapeSvgText(organizerLine)}</text>` +
      `<rect x="${x}" y="${SHARE_HEIGHT - 56}" width="96" height="6" fill="${SHARE_ACCENT}"/>` +
    `</svg>`,
  );
}

async function loadWordmarkComposite(layout = 'full') {
  if (!fs.existsSync(WORDMARK_PATH)) {
    throw new Error(`Just Go wordmark not found at ${WORDMARK_PATH}`);
  }
  const width = layout === 'split' ? WORDMARK_DISPLAY_WIDTH_SPLIT : WORDMARK_DISPLAY_WIDTH;
  const resized = await sharp(WORDMARK_PATH)
    .resize({ width })
    .png()
    .toBuffer();
  return { input: resized, left: layout === 'split' ? TEXT_LEFT : 72, top: 48 };
}

function roundedRectMask() {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PHOTO_WIDTH}" height="${PHOTO_HEIGHT}">` +
      `<rect x="0" y="0" width="${PHOTO_WIDTH}" height="${PHOTO_HEIGHT}" ` +
      `rx="${PHOTO_RADIUS}" ry="${PHOTO_RADIUS}" fill="#fff"/>` +
    `</svg>`,
  );
}

async function preparePhotoComposite(photoBuffer) {
  const fitted = await sharp(photoBuffer)
    .rotate()
    .resize(PHOTO_WIDTH, PHOTO_HEIGHT, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();
  const masked = await sharp(fitted)
    .composite([{ input: roundedRectMask(), blend: 'dest-in' }])
    .png()
    .toBuffer();
  return { input: masked, left: PHOTO_LEFT, top: PHOTO_TOP };
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
 * Always branded Just Go. When a photo is available it is cropped into the
 * right column; otherwise the card is full-bleed text.
 *
 * @returns {{ buffer?: Buffer, error?: string, status?: number }}
 */
async function renderJustGoPublicEventShareImage(event, options = {}) {
  const validated = validatePublicEventShareInput(event);
  if (validated.error) return validated;

  const when = formatPublicEventDate(
    {
      startsAt: validated.startsAt,
      endsAt: validated.endsAt,
      timezone: validated.timezone,
    },
    options.locale || 'en-US',
  );
  if (!when) {
    return { error: 'Could not format event date/time.', status: 400 };
  }

  const photoBuffer = await loadEventPhotoBuffer(event, options);
  const layout = photoBuffer ? 'split' : 'full';
  const titleLines = wrapTitleLines(validated.title, layout === 'split'
    ? { maxLines: TITLE_MAX_LINES_SPLIT, charsPerLine: TITLE_CHARS_PER_LINE_SPLIT }
    : undefined);
  const dateLine = when.date;
  const timeLine = `${when.startTime} ${DATE_SEPARATOR} ${when.endTime}`;
  const venueLine = truncateText(
    validated.venueText,
    layout === 'split' ? VENUE_MAX_CHARS_SPLIT : VENUE_MAX_CHARS,
  );
  const organizerLine = truncateText(
    validated.organizerName,
    layout === 'split' ? ORGANIZER_MAX_CHARS_SPLIT : ORGANIZER_MAX_CHARS,
  );

  const overlaySvg = buildShareOverlaySvg({
    titleLines,
    dateLine,
    timeLine,
    venueLine,
    organizerLine,
    layout,
  });

  const layers = [await loadWordmarkComposite(layout)];
  if (photoBuffer) {
    try {
      layers.push(await preparePhotoComposite(photoBuffer));
    } catch (_) {
      // Unreadable photo → branded text card without the image.
    }
  }
  layers.push({ input: overlaySvg, left: 0, top: 0 });

  const buffer = await sharp({
    create: {
      width: SHARE_WIDTH,
      height: SHARE_HEIGHT,
      channels: 4,
      background: SHARE_BACKGROUND,
    },
  })
    .composite(layers)
    .png({ compressionLevel: 6 })
    .toBuffer();

  return { buffer };
}

module.exports = {
  SHARE_WIDTH,
  SHARE_HEIGHT,
  SHARE_BACKGROUND,
  FIELD_LIMITS,
  PHOTO_WIDTH,
  PHOTO_HEIGHT,
  PHOTO_LEFT,
  PHOTO_TOP,
  TITLE_MAX_LINES_SPLIT,
  TITLE_CHARS_PER_LINE_SPLIT,
  escapeSvgText,
  formatPublicEventDate,
  validatePublicEventShareInput,
  wrapTitleLines,
  buildShareOverlaySvg,
  isSafePublicImageUrl,
  resolvePublicEventPhotoUrl,
  renderJustGoPublicEventShareImage,
};
