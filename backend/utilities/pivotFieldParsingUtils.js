/**
 * Shared field parsing for Pivot ingest drafts.
 *
 * Native (Luma/Partiful) and generic-site scrapes both produce a draft with
 * stringly times and locations. This module turns those strings into structured
 * values without replacing the originals — `start_time` stays the ingest key,
 * and `parsed` rides alongside for Lab, timezone display, and later dedupe.
 *
 * Failures return nulls. Nothing here throws on bad input.
 */

const { getPivotTagCatalogSeedRows } = require('../constants/pivotTagCatalogSeed');

const WEEKDAY_INDEX = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

const MONTH_INDEX = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const US_STATE_TIMEZONES = {
  AL: 'America/Chicago',
  AR: 'America/Chicago',
  AZ: 'America/Phoenix',
  CA: 'America/Los_Angeles',
  CO: 'America/Denver',
  CT: 'America/New_York',
  DC: 'America/New_York',
  DE: 'America/New_York',
  FL: 'America/New_York',
  GA: 'America/New_York',
  IA: 'America/Chicago',
  ID: 'America/Boise',
  IL: 'America/Chicago',
  IN: 'America/Indiana/Indianapolis',
  KS: 'America/Chicago',
  KY: 'America/New_York',
  LA: 'America/Chicago',
  MA: 'America/New_York',
  MD: 'America/New_York',
  ME: 'America/New_York',
  MI: 'America/Detroit',
  MN: 'America/Chicago',
  MO: 'America/Chicago',
  MS: 'America/Chicago',
  MT: 'America/Denver',
  NC: 'America/New_York',
  ND: 'America/Chicago',
  NE: 'America/Chicago',
  NH: 'America/New_York',
  NJ: 'America/New_York',
  NM: 'America/Denver',
  NV: 'America/Los_Angeles',
  NY: 'America/New_York',
  OH: 'America/New_York',
  OK: 'America/Chicago',
  OR: 'America/Los_Angeles',
  PA: 'America/New_York',
  RI: 'America/New_York',
  SC: 'America/New_York',
  SD: 'America/Chicago',
  TN: 'America/Chicago',
  TX: 'America/Chicago',
  UT: 'America/Denver',
  VA: 'America/New_York',
  VT: 'America/New_York',
  WA: 'America/Los_Angeles',
  WI: 'America/Chicago',
  WV: 'America/New_York',
  WY: 'America/Denver',
};

const US_STATE_NAMES = {
  alabama: 'AL',
  arizona: 'AZ',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  florida: 'FL',
  georgia: 'GA',
  illinois: 'IL',
  iowa: 'IA',
  massachusetts: 'MA',
  newyork: 'NY',
  'new york': 'NY',
  oregon: 'OR',
  pennsylvania: 'PA',
  texas: 'TX',
  washington: 'WA',
};

const CATEGORY_HINT_PATTERNS = [
  { slug: 'comedy', patterns: [/\bcomedy\b/i, /\bstand[-\s]?up\b/i, /\bopen mic\b/i] },
  { slug: 'live-music', patterns: [/\blive music\b/i, /\bconcert\b/i, /\bdj set\b/i, /\bopen mic\b/i] },
  { slug: 'nightlife', patterns: [/\bnightlife\b/i, /\bclub night\b/i, /\bafterparty\b/i] },
  { slug: 'film-and-tv', patterns: [/\bfilm screening\b/i, /\bmovie night\b/i, /\bscreening\b/i] },
  { slug: 'dance', patterns: [/\bdance party\b/i, /\bsalsa\b/i, /\bballet\b/i] },
  { slug: 'food-and-drink', patterns: [/\btasting\b/i, /\bwine\b/i, /\bhappy hour\b/i, /\bbrunch\b/i] },
  { slug: 'outdoors', patterns: [/\bhike\b/i, /\bpicnic\b/i, /\boutdoor\b/i] },
  { slug: 'fitness', patterns: [/\byoga\b/i, /\brun club\b/i, /\bworkout\b/i] },
  { slug: 'wellness', patterns: [/\bmeditation\b/i, /\bsound bath\b/i, /\bwellness\b/i] },
  { slug: 'tech', patterns: [/\bhackathon\b/i, /\bmeetup\b/i, /\bdemo day\b/i] },
  { slug: 'workshops', patterns: [/\bworkshop\b/i, /\bclass\b/i, /\bmasterclass\b/i] },
  { slug: 'markets-and-fairs', patterns: [/\bflea market\b/i, /\bfarmers market\b/i, /\bstreet fair\b/i] },
  { slug: 'board-games', patterns: [/\bboard game\b/i, /\bgame night\b/i] },
  { slug: 'gaming', patterns: [/\besports\b/i, /\blan party\b/i, /\bvideo game\b/i] },
  { slug: 'art-and-culture', patterns: [/\bgallery\b/i, /\bart show\b/i, /\bexhibition\b/i] },
  { slug: 'family-friendly', patterns: [/\bfamily friendly\b/i, /\bkids\b/i, /\ball ages\b/i] },
  { slug: 'volunteering', patterns: [/\bvolunteer\b/i, /\bcommunity service\b/i] },
  { slug: 'social', patterns: [/\bmixer\b/i, /\bsocial\b/i, /\bhangout\b/i] },
];

const CATALOG_SLUGS = new Set(getPivotTagCatalogSeedRows().map((row) => row.slug));

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isValidTimeZone(timeZone) {
  if (!timeZone || typeof timeZone !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function resolveTimeZone(timeZone) {
  return isValidTimeZone(timeZone) ? timeZone : 'UTC';
}

function zonedParts(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: resolveTimeZone(timeZone),
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  });
  const map = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    weekday: String(map.weekday || '').toLowerCase().slice(0, 3),
  };
}

function zonedCivilToUtc(civil, timeZone) {
  const zone = resolveTimeZone(timeZone);
  const utcGuess = Date.UTC(
    civil.year,
    civil.month - 1,
    civil.day,
    civil.hour || 0,
    civil.minute || 0,
    0,
  );

  const applyOffset = (instant) => {
    const parts = zonedParts(new Date(instant), zone);
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
    return asUtc - instant;
  };

  const first = new Date(utcGuess - applyOffset(utcGuess));
  return new Date(utcGuess - applyOffset(first.getTime()));
}

function addLocalDays(civil, days) {
  const utc = Date.UTC(civil.year, civil.month - 1, civil.day + days);
  const shifted = new Date(utc);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: civil.hour || 0,
    minute: civil.minute || 0,
  };
}

function parseClock(raw) {
  const text = trimString(raw).toLowerCase();
  if (!text) return null;

  // Require am/pm, "at N", or HH:MM so month-days like "Aug 15-16" are not clocks.
  const match =
    text.match(/(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/i) ||
    text.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\b/i) ||
    text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = match[2] != null ? Number(match[2]) : 0;
  const meridiem = match[3] ? match[3].replace(/\./g, '').toLowerCase() : null;
  if (!Number.isFinite(hour) || hour > 23 || minute > 59) return null;

  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  if (!meridiem && hour <= 7) hour += 12;
  return { hour, minute };
}

function defaultEveningClock() {
  return { hour: 19, minute: 0 };
}

function hasExplicitOffset(text) {
  return /[zZ]|[+-]\d{2}:?\d{2}$/.test(text);
}

function parseIsoDateTime(raw, timeZone) {
  const text = trimString(raw);
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}/.test(text) && !/^\d{4}\/\d{2}\/\d{2}/.test(text)) {
    return null;
  }

  if (hasExplicitOffset(text)) {
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const naive = text.match(
    /^(\d{4})[-/](\d{2})[-/](\d{2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (naive) {
    const instant = zonedCivilToUtc(
      {
        year: Number(naive[1]),
        month: Number(naive[2]),
        day: Number(naive[3]),
        hour: naive[4] != null ? Number(naive[4]) : 0,
        minute: naive[5] != null ? Number(naive[5]) : 0,
      },
      timeZone,
    );
    return Number.isNaN(instant.getTime()) ? null : instant;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function inferYear(month, day, nowParts) {
  let year = nowParts.year;
  const candidate = Date.UTC(year, month - 1, day);
  const today = Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day);
  if (candidate < today - 2 * 24 * 60 * 60 * 1000) {
    year += 1;
  }
  return year;
}

function nextWeekdayCivil(nowParts, weekday, clock, { inclusive = true } = {}) {
  const current = WEEKDAY_INDEX[nowParts.weekday] ?? 0;
  let delta = (weekday - current + 7) % 7;
  if (delta === 0 && !inclusive) delta = 7;
  if (
    delta === 0 &&
    inclusive &&
    (clock.hour < nowParts.hour || (clock.hour === nowParts.hour && clock.minute <= nowParts.minute))
  ) {
    delta = 7;
  }
  return addLocalDays({ ...nowParts, ...clock }, delta);
}

function parseMonthDay(text) {
  const named = text.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*[–-]\s*(\d{1,2})(?:st|nd|rd|th)?)?\b/i,
  );
  if (named) {
    const month = MONTH_INDEX[named[1].toLowerCase()];
    return {
      month,
      day: Number(named[2]),
      endDay: named[3] ? Number(named[3]) : null,
    };
  }

  const numeric = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?:\s*[–-]\s*(\d{1,2})(?:\/(\d{1,2}))?)?\b/);
  if (numeric) {
    return {
      month: Number(numeric[1]),
      day: Number(numeric[2]),
      year: numeric[3] ? Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3]) : null,
      endDay: numeric[4] ? Number(numeric[4]) : null,
      endMonth: numeric[5] ? Number(numeric[5]) : null,
    };
  }
  return null;
}

function emptyDateTime(raw, error) {
  return {
    raw: raw || null,
    timestamp: null,
    iso: null,
    timezone: null,
    rangeEnd: null,
    error,
  };
}

/**
 * Parse a listing time into a UTC Date.
 * Accepts ISO, "Friday at 8pm", "Sat 7:00 PM", "Tonight", "Tomorrow 6:30pm",
 * "This weekend", "Next Friday", and ranges like "Aug 15-16".
 */
function parseEventDateTime(raw, options = {}) {
  try {
    return parseEventDateTimeInner(raw, options);
  } catch {
    return emptyDateTime(trimString(raw), 'UNPARSEABLE');
  }
}

function parseEventDateTimeInner(raw, options = {}) {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return {
      raw: raw.toISOString(),
      timestamp: raw,
      iso: raw.toISOString(),
      timezone: null,
      rangeEnd: null,
      error: null,
    };
  }

  const text = trimString(raw);
  const empty = emptyDateTime(text, text ? null : 'EMPTY');
  if (!text) return empty;

  const timeZone = resolveTimeZone(options.timezone);
  const now = options.now instanceof Date && !Number.isNaN(options.now.getTime())
    ? options.now
    : new Date();

  const iso = parseIsoDateTime(text, timeZone);
  if (iso) {
    return {
      raw: text,
      timestamp: iso,
      iso: iso.toISOString(),
      timezone: hasExplicitOffset(text) ? null : timeZone,
      rangeEnd: null,
      error: null,
    };
  }

  const nowParts = zonedParts(now, timeZone);
  const lower = text.toLowerCase().replace(/\s+/g, ' ');
  const clock = parseClock(lower);
  const usedClock =
    clock ||
    (/\b(tonight|evening)\b/.test(lower) ? defaultEveningClock() : { hour: 0, minute: 0 });

  let startCivil = null;
  let endCivil = null;

  if (/\btonight\b/.test(lower)) {
    startCivil = { ...nowParts, ...usedClock };
  } else if (/\btomorrow\b/.test(lower)) {
    startCivil = addLocalDays({ ...nowParts, ...usedClock }, 1);
  } else if (/\bthis weekend\b/.test(lower)) {
    const saturday = WEEKDAY_INDEX[nowParts.weekday] === 6 ? 0 : (6 - WEEKDAY_INDEX[nowParts.weekday] + 7) % 7;
    startCivil = addLocalDays({ ...nowParts, ...usedClock }, saturday);
    endCivil = addLocalDays(startCivil, 1);
  } else if (/\bnext\s+(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/.test(lower)) {
    const dayName = lower.match(/\bnext\s+([a-z]+)/)[1];
    startCivil = nextWeekdayCivil(nowParts, WEEKDAY_INDEX[dayName], usedClock, { inclusive: false });
  } else {
    const weekdayMatch = lower.match(
      /\b(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?:\s*[–-]\s*(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sunday|monday|tuesday|wednesday|thursday|friday|saturday))?\b/,
    );
    const monthDay = parseMonthDay(lower);

    if (monthDay?.month && monthDay.day) {
      const year = monthDay.year || inferYear(monthDay.month, monthDay.day, nowParts);
      startCivil = {
        year,
        month: monthDay.month,
        day: monthDay.day,
        ...usedClock,
      };
      if (monthDay.endDay) {
        endCivil = {
          year,
          month: monthDay.endMonth || monthDay.month,
          day: monthDay.endDay,
          ...usedClock,
        };
      }
    } else if (weekdayMatch) {
      startCivil = nextWeekdayCivil(nowParts, WEEKDAY_INDEX[weekdayMatch[1]], usedClock);
      if (weekdayMatch[2]) {
        endCivil = nextWeekdayCivil(nowParts, WEEKDAY_INDEX[weekdayMatch[2]], usedClock, {
          inclusive: true,
        });
        if (
          Date.UTC(endCivil.year, endCivil.month - 1, endCivil.day) <
          Date.UTC(startCivil.year, startCivil.month - 1, startCivil.day)
        ) {
          endCivil = addLocalDays(endCivil, 7);
        }
      }
    }
  }

  if (!startCivil && clock) {
    startCivil = nextWeekdayCivil(nowParts, WEEKDAY_INDEX[nowParts.weekday], clock);
  }

  if (!startCivil) {
    return { ...empty, raw: text, timezone: timeZone, error: 'UNPARSEABLE' };
  }

  const timestamp = zonedCivilToUtc(startCivil, timeZone);
  if (Number.isNaN(timestamp.getTime())) {
    return { ...empty, raw: text, timezone: timeZone, error: 'INVALID' };
  }

  const rangeEnd = endCivil ? zonedCivilToUtc(endCivil, timeZone) : null;
  return {
    raw: text,
    timestamp,
    iso: timestamp.toISOString(),
    timezone: timeZone,
    rangeEnd: rangeEnd && !Number.isNaN(rangeEnd.getTime()) ? rangeEnd.toISOString() : null,
    error: null,
  };
}

function parseAddress(raw) {
  const text = trimString(raw);
  if (!text) return null;

  const parts = text.split(',').map((part) => part.trim()).filter(Boolean);
  const zipMatch = text.match(/\b(\d{5})(?:-\d{4})?\b/);
  const zip = zipMatch ? zipMatch[1] : null;

  let state = null;
  const stateMatch = text.match(/\b([A-Z]{2})\b(?:\s+\d{5})?/);
  if (stateMatch && US_STATE_TIMEZONES[stateMatch[1]]) {
    state = stateMatch[1];
  } else {
    for (const [name, code] of Object.entries(US_STATE_NAMES)) {
      if (new RegExp(`\\b${name}\\b`, 'i').test(text)) {
        state = code;
        break;
      }
    }
  }

  let city = null;
  let street = null;
  if (parts.length >= 3 && state) {
    city = parts[parts.length - 2].replace(/\b[A-Z]{2}\b.*/, '').trim() || parts[parts.length - 2];
    const streetParts = parts.slice(0, -2);
    street = streetParts.length > 1 ? streetParts.slice(1).join(', ') : streetParts[0];
    if (parts.length >= 3 && /^\d/.test(parts[1])) {
      street = parts.slice(1, -2).join(', ') || parts[1];
    }
  } else if (parts.length === 2 && state) {
    city = parts[0];
  } else if (parts.length >= 2) {
    const maybeStreet = parts.find((part) => /^\d+\s/.test(part));
    street = maybeStreet || null;
    city = parts.find((part) => part !== maybeStreet && !US_STATE_TIMEZONES[part]) || parts[0];
  }

  if (city && /\d/.test(city) && !street) {
    street = city;
    city = null;
  }

  if (!street && !city && !state && !zip) {
    return { raw: text, street: null, city: null, state: null, zip: null };
  }

  return {
    raw: text,
    street: street || null,
    city: city || null,
    state: state || null,
    zip,
    timezone: state ? US_STATE_TIMEZONES[state] || null : null,
  };
}

function parsePrice(raw) {
  const text = trimString(raw);
  if (!text) return null;

  if (/\b(free|no cover|complimentary)\b/i.test(text) && !/\$\s*\d/.test(text)) {
    return { raw: text, min: 0, max: 0, currency: 'USD', isFree: true, suggested: false, band: 'free' };
  }

  const range = text.match(/\$\s*(\d+(?:\.\d{1,2})?)\s*(?:-|–|to)\s*\$?\s*(\d+(?:\.\d{1,2})?)/i);
  const single = text.match(/\$\s*(\d+(?:\.\d{1,2})?)/);
  if (!range && !single) return null;

  const min = Number(range ? range[1] : single[1]);
  const max = Number(range ? range[2] : single[1]);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;

  const suggested = /\bsuggested\b/i.test(text);
  let band = 'high';
  if (min === 0 && max === 0) band = 'free';
  else if (max <= 15) band = 'low';
  else if (max <= 40) band = 'mid';

  return {
    raw: text,
    min,
    max: max < min ? min : max,
    currency: 'USD',
    isFree: min === 0 && max === 0,
    suggested,
    band,
  };
}

function parseAgeRestriction(raw) {
  const text = trimString(raw);
  if (!text) return null;

  if (/\ball ages\b/i.test(text) || /\bfamily friendly\b/i.test(text)) {
    return { raw: text, minAge: 0, allAges: true, note: null };
  }

  const after = text.match(/(\d{1,2})\s*\+\s*after\s+(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)/i);
  if (after) {
    return {
      raw: text,
      minAge: Number(after[1]),
      allAges: false,
      note: `after ${after[2].trim()}`,
    };
  }

  const plus = text.match(/\b(\d{1,2})\s*\+/);
  if (plus) {
    return { raw: text, minAge: Number(plus[1]), allAges: false, note: null };
  }

  return null;
}

function extractCategoryHints(...texts) {
  const blob = texts.filter(Boolean).join(' \n ');
  if (!blob) return [];
  const hints = [];
  for (const row of CATEGORY_HINT_PATTERNS) {
    if (!CATALOG_SLUGS.has(row.slug)) continue;
    if (row.patterns.some((pattern) => pattern.test(blob))) {
      hints.push(row.slug);
    }
  }
  return hints;
}

function timezoneFromLocation(location, fallback) {
  if (isValidTimeZone(fallback)) return fallback;
  const address = typeof location === 'object' ? location : parseAddress(location);
  if (address?.timezone && isValidTimeZone(address.timezone)) {
    return address.timezone;
  }
  return 'UTC';
}

function preserveRawTime(previousRaw, parsed) {
  if (!parsed?.raw) return previousRaw || null;
  if (!parsed.iso) return parsed.raw || previousRaw || null;
  const looksIso = /^\d{4}-\d{2}-\d{2}/.test(parsed.raw);
  if (looksIso && previousRaw && previousRaw !== parsed.raw) return previousRaw;
  return parsed.raw;
}

function normalizeParsedFields(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const startTimestamp = parsed.startTimestamp || null;
  const endTimestamp = parsed.endTimestamp || null;
  const hasStructure =
    startTimestamp ||
    endTimestamp ||
    parsed.address ||
    parsed.price ||
    parsed.age ||
    (Array.isArray(parsed.categoryHints) && parsed.categoryHints.length);
  if (!hasStructure && !parsed.startTimeRaw && !parsed.endTimeRaw) return null;
  return {
    startTimeRaw: parsed.startTimeRaw || null,
    endTimeRaw: parsed.endTimeRaw || null,
    startTimestamp,
    endTimestamp,
    timezone: parsed.timezone || null,
    rangeEnd: parsed.rangeEnd || null,
    address: parsed.address || null,
    price: parsed.price || null,
    age: parsed.age || null,
    categoryHints: Array.isArray(parsed.categoryHints) ? parsed.categoryHints : [],
  };
}

/**
 * Attach structured fields to an ingest draft. `start_time` becomes ISO when
 * parsing succeeds; the original string is kept on `parsed.startTimeRaw`.
 */
function enrichIngestDraft(draft, options = {}) {
  if (!draft || typeof draft !== 'object') return draft;

  try {
    const address = parseAddress(draft.location);
    const timezone = timezoneFromLocation(address, options.timezone);
    const now = options.now;
    const start = parseEventDateTime(draft.start_time, { timezone, now });
    const end = parseEventDateTime(draft.end_time, { timezone, now });
    const blob = [draft.name, draft.description, draft.location, draft.price, draft.ageRestriction]
      .filter(Boolean)
      .join('\n');
    const price = parsePrice(draft.price) || parsePrice(blob);
    const age = parseAgeRestriction(draft.ageRestriction) || parseAgeRestriction(blob);
    const categoryHints = extractCategoryHints(
      draft.name,
      draft.description,
      ...(draft.sourceTags || []),
    );

    const parsed = normalizeParsedFields({
      startTimeRaw: preserveRawTime(draft.parsed?.startTimeRaw, start),
      endTimeRaw: preserveRawTime(draft.parsed?.endTimeRaw, end),
      startTimestamp: start.iso,
      endTimestamp: end.iso,
      timezone: start.timezone || timezone,
      rangeEnd: start.rangeEnd,
      address,
      price,
      age,
      categoryHints,
    });

    return {
      ...draft,
      start_time: start.iso || draft.start_time || null,
      end_time: end.iso || draft.end_time || null,
      ...(parsed ? { parsed } : {}),
    };
  } catch {
    return draft;
  }
}

module.exports = {
  parseEventDateTime,
  parseAddress,
  parsePrice,
  parseAgeRestriction,
  extractCategoryHints,
  enrichIngestDraft,
  normalizeParsedFields,
  timezoneFromLocation,
  isValidTimeZone,
  zonedCivilToUtc,
  zonedParts,
};
