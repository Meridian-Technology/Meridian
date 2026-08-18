import {
  isoWeekToMondayUtc,
  shiftIsoWeek,
  toIsoWeekInTimeZone,
} from '../../utils/pivotIsoWeek';

/** Same weekly drop clock as the product (Thu 6pm America/New_York). */
export const JUSTGO_DROP_TIMEZONE = 'America/New_York';
export const JUSTGO_DROP_DAY_OF_WEEK = 4;
export const JUSTGO_DROP_HOUR = 18;
export const JUSTGO_DROP_MINUTE = 0;

function getTimeZoneOffsetMs(timeZone, date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  const hour = Number(parts.hour) === 24 ? 0 : Number(parts.hour);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

function zonedLocalToUtc({ year, month, day, hour, minute, timeZone }) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const firstPass = new Date(utcGuess - getTimeZoneOffsetMs(timeZone, new Date(utcGuess)));
  return new Date(utcGuess - getTimeZoneOffsetMs(timeZone, firstPass));
}

function daysFromIsoMonday(dayOfWeek) {
  return dayOfWeek === 0 ? 6 : dayOfWeek - 1;
}

export function resolveLandingDropAt(batchWeek) {
  const monday = isoWeekToMondayUtc(batchWeek);
  if (!monday) return null;
  const dropDate = new Date(monday);
  dropDate.setUTCDate(monday.getUTCDate() + daysFromIsoMonday(JUSTGO_DROP_DAY_OF_WEEK));
  return zonedLocalToUtc({
    year: dropDate.getUTCFullYear(),
    month: dropDate.getUTCMonth() + 1,
    day: dropDate.getUTCDate(),
    hour: JUSTGO_DROP_HOUR,
    minute: JUSTGO_DROP_MINUTE,
    timeZone: JUSTGO_DROP_TIMEZONE,
  });
}

/** Upcoming Thursday 6pm ET — this week if it hasn't fired, otherwise next week. */
export function resolveNextLandingDropAt(now = new Date()) {
  const calendarWeek = toIsoWeekInTimeZone(now, JUSTGO_DROP_TIMEZONE);
  const thisWeek = resolveLandingDropAt(calendarWeek);
  if (thisWeek && thisWeek.getTime() > now.getTime()) return thisWeek;
  return resolveLandingDropAt(shiftIsoWeek(calendarWeek, 1));
}

export function splitLandingDropCountdown(ms) {
  const clamped = Math.max(0, Number(ms) || 0);
  const totalSeconds = Math.floor(clamped / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    live: clamped <= 0,
    soon: clamped > 0 && clamped < 24 * 60 * 60 * 1000,
    imminent: clamped > 0 && clamped < 60 * 60 * 1000,
  };
}

export function padDropUnit(value) {
  return String(Math.max(0, Number(value) || 0)).padStart(2, '0');
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export function formatLandingDropSpoken(parts) {
  if (!parts || parts.live) return 'the drop is live';
  const bits = [];
  if (parts.days) bits.push(plural(parts.days, 'day'));
  if (parts.hours) bits.push(plural(parts.hours, 'hour'));
  if (!parts.days && parts.minutes) bits.push(plural(parts.minutes, 'minute'));
  if (!bits.length) bits.push('less than a minute');
  return `next drop in ${bits.join(' ')}`;
}

/** Horizontal smear for the court photo, driven by Lenis velocity. */
export function smearFromVelocity(velocity) {
  const x = Math.max(-36, Math.min(36, Number(velocity) * 0.12));
  const skew = Math.max(-1.6, Math.min(1.6, Number(velocity) * -0.018));
  return { x: x || 0, skew: skew || 0 };
}

export const DECK_SWIPE_AXIS_PX = 12;

/**
 * First intentional axis for the mobile deck. Undecided until the finger
 * travels far enough; ties and vertical motion yield `y` so the page can scroll.
 */
export function resolveDeckSwipeAxis(dx, dy, threshold = DECK_SWIPE_AXIS_PX) {
  const ax = Math.abs(Number(dx) || 0);
  const ay = Math.abs(Number(dy) || 0);
  if (ax < threshold && ay < threshold) return null;
  return ax > ay ? 'x' : 'y';
}

const POSTER_TILT_DEG = [2.6, 3.1, 2.2, 2.8, 3.0, 2.4];
const POSTER_SCALE = [0.992, 0.984, 0.976, 0.968];

/** Same peek tilt/scale the in-app poster stack uses. */
export function landingPosterStack(depth, cardIndex = 0) {
  if (depth <= 0) return { rotateDeg: 0, scale: 1 };
  const slot = (depth - 1) % POSTER_TILT_DEG.length;
  const scaleSlot = Math.min(depth - 1, POSTER_SCALE.length - 1);
  const direction = cardIndex % 2 === 0 ? 1 : -1;
  return {
    rotateDeg: POSTER_TILT_DEG[slot] * direction,
    scale: POSTER_SCALE[scaleSlot],
  };
}

/** rn-swiper-list default: ±9deg at a third of the screen. */
export function landingSwipeRotate(dx, width = 375) {
  const span = Math.max(120, Number(width) / 3);
  return Math.max(-9, Math.min(9, (Number(dx) / span) * 9));
}

export function landingSwipeTint(dx, width = 375) {
  const span = Math.max(48, Number(width) * 0.16);
  return Math.min(1, Math.abs(Number(dx) || 0) / span);
}

/** ISO week token, same shape the drop uses (`2026-W33`). */
export function formatIsoWeekToken(date = new Date()) {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc - yearStart) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function detectStorePlatform(userAgent = '') {
  return /android/i.test(userAgent) ? 'android' : 'ios';
}

export function decorateFlyers(flyers, cities = []) {
  if (!Array.isArray(flyers) || flyers.length === 0) return [];
  if (!cities.length) {
    return flyers.map((flyer) => ({ ...flyer, city: null }));
  }
  return flyers.map((flyer, index) => ({
    ...flyer,
    city: cities[index % cities.length]?.cityDisplayName || null,
  }));
}

export function cityChipLabel(city) {
  const name = String(city?.cityDisplayName || '').trim().toLowerCase();
  return name || null;
}

export const JUSTGO_LANDING_CITY_KEY = 'justgo.landing.city';

export function readStoredLandingCity() {
  try {
    return String(window.localStorage.getItem(JUSTGO_LANDING_CITY_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function writeStoredLandingCity(tenantKey) {
  try {
    const key = String(tenantKey || '').trim();
    if (key) window.localStorage.setItem(JUSTGO_LANDING_CITY_KEY, key);
  } catch {
    // ignore quota / private mode
  }
}

export function pickLandingCity(cities = [], storedKey = '') {
  if (!Array.isArray(cities) || cities.length === 0) return null;
  const stored = String(storedKey || '').trim();
  return cities.find((city) => city?.tenantKey === stored) || cities[0];
}

function formatLandingClock(date) {
  const hours24 = date.getHours();
  const minutes = date.getMinutes();
  const period = hours24 >= 12 ? 'pm' : 'am';
  const hours12 = hours24 % 12 || 12;
  if (minutes === 0) return `${hours12}${period}`;
  return `${hours12}:${String(minutes).padStart(2, '0')}${period}`;
}

/** Compact when label for landing cards, e.g. `fri · 7pm`. */
export function formatLandingWhen(startTime) {
  const start = new Date(startTime);
  if (Number.isNaN(start.getTime())) return '';
  const day = start.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
  return `${day} · ${formatLandingClock(start)}`;
}

export function formatLandingTag(tag) {
  return String(tag || '')
    .trim()
    .replace(/[-_]+/g, ' ')
    .toLowerCase();
}
