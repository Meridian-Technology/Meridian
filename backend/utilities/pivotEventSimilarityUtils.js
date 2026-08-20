/**
 * Conservative event-similarity scoring for Pivot ingest rollup.
 *
 * Exact sourceUrl / title+minute+location fingerprints stay in
 * `pivotIngestDuplicateService`. This module only scores near-misses:
 * same-night showtimes and cross-platform copies with slightly different
 * titles or venue strings.
 *
 * No geocoding. Venue match is normalized name similarity; if both sides
 * have a parsed city they must agree. Thresholds are tenant-overridable
 * via `pivotDiscovery.duplicate`.
 */

const { parseEventDateTime } = require('./pivotFieldParsingUtils');

const PIVOT_DUPLICATE_THRESHOLD_DEFAULTS = Object.freeze({
  titleMin: 0.86,
  venueMin: 0.8,
  combinedMin: 0.84,
  timeWindowHours: 3,
  sameDayRequired: true,
  showtimeTitleMin: 0.92,
  showtimeVenueMin: 0.88,
  showtimeMinMinutes: 20,
});

const VENUE_STOP = new Set([
  'the',
  'a',
  'an',
  'at',
  'in',
  'on',
  'of',
  'and',
  'venue',
  'bar',
  'club',
  'hall',
  'theater',
  'theatre',
  'cafe',
  'café',
  'restaurant',
  'lounge',
  'room',
  'space',
]);

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clampUnit(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(1, Math.max(0, num));
}

function mergeDuplicateThresholds(raw) {
  const merged = { ...PIVOT_DUPLICATE_THRESHOLD_DEFAULTS };
  if (!isPlainObject(raw)) return merged;

  if (raw.titleMin != null) merged.titleMin = clampUnit(raw.titleMin, merged.titleMin);
  if (raw.venueMin != null) merged.venueMin = clampUnit(raw.venueMin, merged.venueMin);
  if (raw.combinedMin != null) merged.combinedMin = clampUnit(raw.combinedMin, merged.combinedMin);
  if (raw.showtimeTitleMin != null) {
    merged.showtimeTitleMin = clampUnit(raw.showtimeTitleMin, merged.showtimeTitleMin);
  }
  if (raw.showtimeVenueMin != null) {
    merged.showtimeVenueMin = clampUnit(raw.showtimeVenueMin, merged.showtimeVenueMin);
  }
  if (raw.timeWindowHours != null) {
    const hours = Number(raw.timeWindowHours);
    if (Number.isFinite(hours)) merged.timeWindowHours = Math.min(24, Math.max(0, hours));
  }
  if (raw.showtimeMinMinutes != null) {
    const minutes = Number(raw.showtimeMinMinutes);
    if (Number.isFinite(minutes)) merged.showtimeMinMinutes = Math.min(12 * 60, Math.max(1, minutes));
  }
  if (typeof raw.sameDayRequired === 'boolean') merged.sameDayRequired = raw.sameDayRequired;
  return merged;
}

function parseStart(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  return parseEventDateTime(value).timestamp;
}

function normalizeComparableText(value) {
  return trimString(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeVenueName(value) {
  const tokens = normalizeComparableText(value)
    .split(' ')
    .filter((token) => token && !VENUE_STOP.has(token));
  return tokens.join(' ');
}

function stripVenueFromTitle(title, venue) {
  const normalizedTitle = normalizeComparableText(title);
  const venueText = normalizeVenueName(venue) || normalizeComparableText(venue);
  if (!normalizedTitle) return '';
  if (!venueText) return normalizedTitle;

  const suffixes = [` at ${venueText}`, ` at ${normalizeComparableText(venue)}`, ` ${venueText}`];
  let next = normalizedTitle;
  for (const suffix of suffixes) {
    if (suffix.trim() && next.endsWith(suffix)) {
      next = next.slice(0, -suffix.length).trim();
    }
  }
  return next;
}

function bigrams(text) {
  const compact = String(text || '').replace(/\s+/g, '');
  if (compact.length < 2) return compact ? [compact] : [];
  const grams = [];
  for (let i = 0; i < compact.length - 1; i += 1) {
    grams.push(compact.slice(i, i + 2));
  }
  return grams;
}

function diceCoefficient(left, right) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const a = bigrams(left);
  const b = bigrams(right);
  if (!a.length || !b.length) return 0;
  const counts = new Map();
  for (const gram of a) counts.set(gram, (counts.get(gram) || 0) + 1);
  let overlap = 0;
  for (const gram of b) {
    const n = counts.get(gram) || 0;
    if (n > 0) {
      overlap += 1;
      counts.set(gram, n - 1);
    }
  }
  return (2 * overlap) / (a.length + b.length);
}

function tokenJaccard(left, right) {
  const a = new Set(String(left || '').split(' ').filter(Boolean));
  const b = new Set(String(right || '').split(' ').filter(Boolean));
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) overlap += 1;
  }
  return overlap / (a.size + b.size - overlap);
}

function stringSimilarity(left, right) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) {
    const shorter = Math.min(left.length, right.length);
    const longer = Math.max(left.length, right.length);
    return Math.max(0.9, shorter / longer);
  }
  return Math.max(diceCoefficient(left, right), tokenJaccard(left, right));
}

function titleSimilarity(leftTitle, rightTitle, leftVenue, rightVenue) {
  const left = stripVenueFromTitle(leftTitle, leftVenue);
  const right = stripVenueFromTitle(rightTitle, rightVenue);
  return stringSimilarity(left, right);
}

function venueSimilarity(leftVenue, rightVenue) {
  return stringSimilarity(normalizeVenueName(leftVenue), normalizeVenueName(rightVenue));
}

function utcDayKey(date) {
  if (!date) return null;
  return date.toISOString().slice(0, 10);
}

function descriptionOverlap(left, right) {
  const a = normalizeComparableText(left);
  const b = normalizeComparableText(right);
  if (!a || !b) return 0;
  return stringSimilarity(a.slice(0, 280), b.slice(0, 280));
}

function citiesAgree(leftCity, rightCity) {
  const a = normalizeComparableText(leftCity);
  const b = normalizeComparableText(rightCity);
  if (!a || !b) return true;
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * @returns {{
 *   match: boolean,
 *   showtime: boolean,
 *   score: number,
 *   title: number,
 *   venue: number,
 *   time: number,
 *   hoursApart: number,
 *   sameDay: boolean,
 *   reasons: string[],
 * }}
 */
function scoreEventSimilarity(left, right, rawThresholds) {
  const thresholds = mergeDuplicateThresholds(rawThresholds);
  const leftVenue = trimString(left?.location);
  const rightVenue = trimString(right?.location);
  const title = titleSimilarity(left?.name, right?.name, leftVenue, rightVenue);
  const venue = venueSimilarity(leftVenue, rightVenue);
  const leftStart = parseStart(left?.start_time || left?.startTimestamp);
  const rightStart = parseStart(right?.start_time || right?.startTimestamp);
  const sameDay = Boolean(leftStart && rightStart && utcDayKey(leftStart) === utcDayKey(rightStart));
  const hoursApart =
    leftStart && rightStart ? Math.abs(leftStart.getTime() - rightStart.getTime()) / 3_600_000 : Infinity;
  const minutesApart = Number.isFinite(hoursApart) ? hoursApart * 60 : Infinity;

  let time = 0;
  if (sameDay) {
    time = minutesApart < 1 ? 1 : Math.max(0.45, 1 - hoursApart / 12);
  } else if (!thresholds.sameDayRequired && hoursApart <= thresholds.timeWindowHours) {
    time = 0.35;
  }

  const desc = descriptionOverlap(left?.description, right?.description);
  const combined = 0.5 * title + 0.3 * venue + 0.15 * time + 0.05 * desc;

  const reasons = [];
  const missingVenue = !normalizeVenueName(leftVenue) || !normalizeVenueName(rightVenue);
  if (missingVenue) {
    return {
      match: false,
      showtime: false,
      score: combined,
      title,
      venue,
      time,
      hoursApart,
      sameDay,
      reasons: ['missing-venue'],
    };
  }

  if (!citiesAgree(left?.city, right?.city)) {
    return {
      match: false,
      showtime: false,
      score: combined,
      title,
      venue,
      time,
      hoursApart,
      sameDay,
      reasons: ['city-mismatch'],
    };
  }

  const timeOk = thresholds.sameDayRequired
    ? sameDay
    : sameDay || hoursApart <= thresholds.timeWindowHours;
  if (!timeOk) {
    return {
      match: false,
      showtime: false,
      score: combined,
      title,
      venue,
      time,
      hoursApart,
      sameDay,
      reasons: ['time-mismatch'],
    };
  }

  const showtime =
    sameDay &&
    minutesApart >= thresholds.showtimeMinMinutes &&
    title >= thresholds.showtimeTitleMin &&
    venue >= thresholds.showtimeVenueMin;

  const similar =
    title >= thresholds.titleMin &&
    venue >= thresholds.venueMin &&
    combined >= thresholds.combinedMin;

  if (showtime) reasons.push('same-day-showtimes');
  if (similar) reasons.push('title-venue-time');
  if (desc >= 0.6) reasons.push('description-overlap');

  return {
    match: showtime || similar,
    showtime,
    score: Math.round(combined * 1000) / 1000,
    title: Math.round(title * 1000) / 1000,
    venue: Math.round(venue * 1000) / 1000,
    time: Math.round(time * 1000) / 1000,
    hoursApart: Number.isFinite(hoursApart) ? Math.round(hoursApart * 100) / 100 : null,
    sameDay,
    reasons,
  };
}

function showtimeGroupKey(candidate) {
  const title = stripVenueFromTitle(candidate?.name, candidate?.location);
  const venue = normalizeVenueName(candidate?.location);
  const start = parseStart(candidate?.start_time);
  const day = utcDayKey(start);
  if (!title || !venue || !day) return null;
  return `${title}|${venue}|${day}`;
}

module.exports = {
  PIVOT_DUPLICATE_THRESHOLD_DEFAULTS,
  mergeDuplicateThresholds,
  normalizeComparableText,
  normalizeVenueName,
  stripVenueFromTitle,
  diceCoefficient,
  tokenJaccard,
  stringSimilarity,
  titleSimilarity,
  venueSimilarity,
  scoreEventSimilarity,
  showtimeGroupKey,
  parseStart,
  utcDayKey,
};
