const fs = require('fs');
const path = require('path');
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

const FIELD_LIMITS = Object.freeze({
  title: 200,
  'venue.text': 500,
  'organizer.name': 200,
  timezone: 100,
});

const TITLE_MAX_LINES = 2;
const TITLE_CHARS_PER_LINE = 38;
const VENUE_MAX_CHARS = 72;
const ORGANIZER_MAX_CHARS = 48;

const VENUE_LABEL = 'where';
const ORGANIZER_LABEL = 'hosted by';
const DATE_SEPARATOR = 'to';

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

function fieldLengthError(field, maxLength) {
  return { error: `${field} exceeds ${maxLength} characters.`, status: 400 };
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

function wrapTitleLines(title) {
  const text = sanitizeText(title);
  const maxChars = TITLE_CHARS_PER_LINE * TITLE_MAX_LINES;
  if (text.length <= TITLE_CHARS_PER_LINE) return [text];

  const needsEllipsis = text.length > maxChars - 1;
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= TITLE_CHARS_PER_LINE) {
      current = candidate;
      continue;
    }

    if (current) lines.push(current);
    if (lines.length >= TITLE_MAX_LINES) {
      return lines.slice(0, TITLE_MAX_LINES);
    }

    if (lines.length === TITLE_MAX_LINES - 1) {
      const remainder = [word, ...words.slice(index + 1)].join(' ');
      const lastLine = current ? `${current} ${remainder}` : remainder;
      lines.push(truncateText(lastLine, TITLE_CHARS_PER_LINE));
      return lines.slice(0, TITLE_MAX_LINES);
    }

    current = word.length > TITLE_CHARS_PER_LINE
      ? truncateText(word, TITLE_CHARS_PER_LINE)
      : word;
  }

  if (current) lines.push(current);
  if (needsEllipsis && lines.length > 0 && !lines[lines.length - 1].endsWith('…')) {
    lines[lines.length - 1] = truncateText(lines[lines.length - 1], TITLE_CHARS_PER_LINE);
  }
  return lines.slice(0, TITLE_MAX_LINES);
}

function buildShareOverlaySvg({
  titleLines,
  dateLine,
  timeLine,
  venueLine,
  organizerLine,
}) {
  const titleY = 228;
  const titleLineHeight = 62;
  const titleTspans = titleLines.map((line, index) => (
    `<tspan x="72" dy="${index === 0 ? 0 : titleLineHeight}">${escapeSvgText(line)}</tspan>`
  )).join('');

  const factsY = titleY + titleLines.length * titleLineHeight + 36;

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SHARE_WIDTH}" height="${SHARE_HEIGHT}">` +
      `<rect width="${SHARE_WIDTH}" height="${SHARE_HEIGHT}" fill="none"/>` +
      `<text x="72" y="${titleY}" fill="${SHARE_INK}" font-family="Helvetica, Arial, sans-serif" ` +
        `font-size="54" font-weight="700" letter-spacing="-0.03em">${titleTspans}</text>` +
      `<line x1="72" y1="${factsY - 18}" x2="${SHARE_WIDTH - 72}" y2="${factsY - 18}" ` +
        `stroke="${SHARE_INK_MUTED}" stroke-width="1"/>` +
      `<text x="72" y="${factsY + 4}" fill="${SHARE_INK}" font-family="Helvetica, Arial, sans-serif" ` +
        `font-size="28" font-weight="600">${escapeSvgText(dateLine)}</text>` +
      `<text x="72" y="${factsY + 40}" fill="${SHARE_INK_MUTED}" font-family="monospace" ` +
        `font-size="22">${escapeSvgText(timeLine)}</text>` +
      `<text x="72" y="${factsY + 96}" fill="${SHARE_INK_MUTED}" font-family="monospace" ` +
        `font-size="18" letter-spacing="0.04em">${escapeSvgText(VENUE_LABEL)}</text>` +
      `<text x="72" y="${factsY + 128}" fill="${SHARE_INK}" font-family="Helvetica, Arial, sans-serif" ` +
        `font-size="26" font-weight="600">${escapeSvgText(venueLine)}</text>` +
      `<text x="72" y="${factsY + 182}" fill="${SHARE_INK_MUTED}" font-family="monospace" ` +
        `font-size="18" letter-spacing="0.04em">${escapeSvgText(ORGANIZER_LABEL)}</text>` +
      `<text x="72" y="${factsY + 214}" fill="${SHARE_INK}" font-family="Helvetica, Arial, sans-serif" ` +
        `font-size="26" font-weight="600">${escapeSvgText(organizerLine)}</text>` +
      `<rect x="72" y="${SHARE_HEIGHT - 56}" width="96" height="6" fill="${SHARE_ACCENT}"/>` +
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
  return { input: resized, left: 72, top: 52 };
}

/**
 * Render a 1200×630 PNG share card for a public event v1 payload.
 * Strategy B: no event photo fetch or composite.
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

  const titleLines = wrapTitleLines(validated.title);
  const dateLine = when.date;
  const timeLine = `${when.startTime} ${DATE_SEPARATOR} ${when.endTime}`;
  const venueLine = truncateText(validated.venueText, VENUE_MAX_CHARS);
  const organizerLine = truncateText(validated.organizerName, ORGANIZER_MAX_CHARS);

  const overlaySvg = buildShareOverlaySvg({
    titleLines,
    dateLine,
    timeLine,
    venueLine,
    organizerLine,
  });

  const wordmark = await loadWordmarkComposite();
  const buffer = await sharp({
    create: {
      width: SHARE_WIDTH,
      height: SHARE_HEIGHT,
      channels: 4,
      background: SHARE_BACKGROUND,
    },
  })
    .composite([wordmark, { input: overlaySvg, left: 0, top: 0 }])
    .png({ compressionLevel: 9 })
    .toBuffer();

  return { buffer };
}

module.exports = {
  SHARE_WIDTH,
  SHARE_HEIGHT,
  SHARE_BACKGROUND,
  FIELD_LIMITS,
  escapeSvgText,
  formatPublicEventDate,
  validatePublicEventShareInput,
  wrapTitleLines,
  buildShareOverlaySvg,
  renderJustGoPublicEventShareImage,
};
