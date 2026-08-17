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
