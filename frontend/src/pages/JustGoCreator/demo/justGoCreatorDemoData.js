/**
 * Generated fixtures for local-dev demo mode.
 *
 * Shapes mirror `GET /pivot/creator/events` and `GET /pivot/creator/events/:eventId` exactly
 * (`serializeCreatorListing` + `stats.intents` / `stats.analytics` / `stats.daily`), so the console
 * renders demo data through the same code paths as real data.
 *
 * Everything is derived from the clock rather than hardcoded, for two reasons: the fixtures never go
 * stale, and the phase rail, countdown, and 14-day window all stay in agreement no matter when you
 * open the console. Aggregates are summed from the generated daily series instead of being written
 * by hand, because the Insights funnel and trend chart read both and would contradict each other if
 * the two drifted apart.
 */

import { isDemoCapable } from './justGoCreatorDemoMode';

const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_WINDOW_DAYS = 14;

export const DEMO_TENANT_KEY = 'nyc';

/** Stable per-event pseudo-randomness, so a reload doesn't reshuffle the charts. */
function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFrom(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function toUtcDateKey(date) {
  return date.toISOString().slice(0, 10);
}

/** Mirrors the backend's `buildDailyWindow`: 14 UTC days, oldest first, ending today. */
function buildWindowKeys(now) {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (DAILY_WINDOW_DAYS - 1));
  return Array.from({ length: DAILY_WINDOW_DAYS }, (_, offset) =>
    toUtcDateKey(new Date(start + offset * DAY_MS)),
  );
}

/** Local wall-clock time so the rendered date/time strings look like a real listing. */
function atLocalTime(now, dayOffset, hour, minute = 0) {
  const date = new Date(now);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function isoWeekOf(date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // ISO weeks run Mon–Sun and belong to the year containing their Thursday.
  const dayNumber = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);
  const week = 1 + Math.round((target - firstThursday) / (7 * DAY_MS));
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Cheap inline cover art — offline-safe and avoids committing binary fixtures. */
function coverImage(from, to) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="240" height="160" fill="url(#g)"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Daily buckets shaped like real demand: nothing before the listing goes live, a build toward the
 * event date, and a short tail afterwards.
 */
function buildDailySeries({ keys, rng, startTime, publishedAt, scale, interestRate, registerRate }) {
  return keys.map((date) => {
    const dayMidpoint = new Date(`${date}T12:00:00.000Z`);
    if (!publishedAt || dayMidpoint < publishedAt) {
      return { date, views: 0, interested: 0, registered: 0 };
    }

    const daysToEvent = (startTime.getTime() - dayMidpoint.getTime()) / DAY_MS;
    const anticipation = Math.exp(-((daysToEvent / 6) ** 2));
    const weight = daysToEvent < -1 ? 0.06 : anticipation * 0.9 + 0.12;

    const views = Math.round(scale * weight * (0.75 + rng() * 0.5));
    const interested = Math.round(views * interestRate * (0.7 + rng() * 0.6));
    const registered = Math.round(interested * registerRate * (0.6 + rng() * 0.8));

    return { date, views, interested: Math.max(0, interested - registered), registered };
  });
}

function sumBy(rows, key) {
  return rows.reduce((total, row) => total + (row[key] || 0), 0);
}

/**
 * Aggregates are all-time while the series is only 14 days, so listings published before the window
 * carry a share of their totals from before it — the same relationship real data has.
 */
function buildStats({ daily, publishedAt, windowStartKey, rng }) {
  const publishedBeforeWindow =
    publishedAt && toUtcDateKey(publishedAt) < windowStartKey;
  const priorShare = publishedBeforeWindow ? 0.3 + rng() * 0.2 : 0;
  const withPrior = (windowTotal) => Math.round(windowTotal * (1 + priorShare));

  const views = withPrior(sumBy(daily, 'views'));
  const interested = withPrior(sumBy(daily, 'interested'));
  const registered = withPrior(sumBy(daily, 'registered'));
  const interestedTotal = interested + registered;

  // Keep the funnel monotonic: everyone who registered necessarily opened the ticket link.
  const externalOpenUsers = Math.max(registered, Math.round(interestedTotal * 0.55));

  return {
    intents: {
      interested,
      registered,
      passed: Math.round(interestedTotal * (0.4 + rng() * 0.3)),
      externalOpens: Math.round(externalOpenUsers * 1.6),
      externalOpenUsers,
    },
    analytics: {
      views,
      uniqueViews: Math.round(views * 0.72),
      anonymousViews: Math.round(views * 1.35),
      uniqueAnonymousViews: Math.round(views * 1.35 * 0.78),
      registrations: registered,
      uniqueRegistrations: registered,
    },
    daily,
  };
}

/**
 * One listing per lifecycle phase, so the phase rail, the tab gating, and the zero states can all be
 * reviewed. `publishOffsetDays` is when the listing went live relative to now — `null` for a draft,
 * which correctly produces no audience data at all.
 */
const DEMO_LISTINGS = [
  {
    id: 'demo-planning',
    name: 'Sunset Rooftop Cinema: Paris, Texas',
    description:
      "A 35mm print of Wim Wenders' desert masterpiece, projected on the brick wall of a Bushwick rooftop as the sun goes down. Doors at 7, film at sundown. Blankets provided, bring something to drink. Wenders' Palme d'Or winner has never looked better than it does outdoors.",
    location: 'The Ellery Rooftop, 232 Ellery St, Brooklyn',
    hostName: 'Deep Focus Collective',
    ingestStatus: 'published',
    startOffsetDays: 5,
    startHour: 19,
    durationHours: 3,
    publishOffsetDays: -9,
    tags: ['film', 'outdoors', 'nightlife'],
    scale: 260,
    interestRate: 0.11,
    registerRate: 0.24,
    palette: ['#ff7a3d', '#ffd166'],
  },
  {
    id: 'demo-live',
    name: 'Warehouse Vinyl Night: All 45s',
    description:
      'Four selectors, two turntables, seven-inch records only. Soul, funk, and disco from the crates, no laptops in sight. The room is concrete and the sound system is far too large for it, which is exactly the point.',
    location: 'Bell Yard, 44 Meadow St, Brooklyn',
    hostName: 'Bell Yard Sound',
    ingestStatus: 'published',
    // Anchored to the clock rather than a wall time so this listing is always mid-run.
    startOffsetHours: -1,
    durationHours: 4,
    publishOffsetDays: -11,
    tags: ['live-music', 'nightlife', 'free'],
    scale: 340,
    interestRate: 0.13,
    registerRate: 0.28,
    palette: ['#6c5ce7', '#00cec9'],
  },
  {
    id: 'demo-staged',
    name: 'Night Market Crawl: Sunset Park',
    description:
      'A guided eight-stop crawl through the best of 8th Avenue after dark, ending with hand-pulled noodles. Small group, cash only, come hungry.',
    location: 'Meet at 8th Ave & 50th St, Brooklyn',
    hostName: 'Slow Lunch Club',
    ingestStatus: 'staged',
    startOffsetDays: 9,
    startHour: 18,
    durationHours: 3,
    publishOffsetDays: -3,
    tags: ['food-drink', 'walking-tour'],
    scale: 90,
    interestRate: 0.14,
    registerRate: 0.2,
    palette: ['#0984e3', '#74b9ff'],
  },
  {
    id: 'demo-postmortem',
    name: 'Backyard Supper Club, Vol. 4',
    description:
      'One long table, one seasonal menu, thirty strangers. Vol. 4 was built around late-summer tomatoes and ran until the candles gave out.',
    location: 'A backyard in Ridgewood (address on RSVP)',
    hostName: 'Table for Thirty',
    ingestStatus: 'published',
    startOffsetDays: -6,
    startHour: 18,
    durationHours: 4,
    publishOffsetDays: -20,
    tags: ['food-drink', 'community'],
    scale: 150,
    interestRate: 0.16,
    registerRate: 0.35,
    palette: ['#e17055', '#fab1a0'],
  },
  {
    id: 'demo-draft',
    name: 'Sunrise Swim + Coffee, Rockaway',
    description:
      'Meet at the 67th St beach entrance before the sun is properly up, swim if you dare, then coffee from the truck. Every Saturday until it gets too cold to pretend this is fun.',
    location: 'Beach 67th St, Rockaway Beach, Queens',
    hostName: 'Cold Water Society',
    ingestStatus: 'draft',
    startOffsetDays: 12,
    startHour: 6,
    durationHours: 2,
    publishOffsetDays: null,
    tags: ['outdoors', 'free', 'wellness'],
    scale: 0,
    interestRate: 0,
    registerRate: 0,
    palette: ['#00b894', '#55efc4'],
  },
];

/** The listing the "open demo" entry point jumps to — Planning shows every tab, fully populated. */
export const DEMO_PRIMARY_EVENT_ID = 'demo-planning';

export function isDemoEventId(eventId) {
  return typeof eventId === 'string' && eventId.startsWith('demo-');
}

function buildDemoEvent(spec, now) {
  const rng = mulberry32(seedFrom(spec.id));
  const keys = buildWindowKeys(now);

  const startTime =
    spec.startOffsetHours == null
      ? atLocalTime(now, spec.startOffsetDays, spec.startHour)
      : new Date(now.getTime() + spec.startOffsetHours * 60 * 60 * 1000);
  const endTime = new Date(startTime.getTime() + spec.durationHours * 60 * 60 * 1000);
  const publishedAt =
    spec.publishOffsetDays == null ? null : atLocalTime(now, spec.publishOffsetDays, 10);

  const daily = buildDailySeries({
    keys,
    rng,
    startTime,
    publishedAt,
    scale: spec.scale,
    interestRate: spec.interestRate,
    registerRate: spec.registerRate,
  });

  const stats = buildStats({ daily, publishedAt, windowStartKey: keys[0], rng });

  const event = {
    _id: spec.id,
    name: spec.name,
    description: spec.description,
    image: coverImage(spec.palette[0], spec.palette[1]),
    start_time: startTime.toISOString(),
    end_time: endTime.toISOString(),
    location: spec.location,
    externalLink: `https://example.com/tickets/${spec.id}`,
    sourceUrl: null,
    ingestStatus: spec.ingestStatus,
    source: 'justgo',
    batchWeek: isoWeekOf(startTime),
    outOfReviewRange: false,
    tags: spec.tags,
    timeSlots: [],
    organizerName: spec.hostName,
    organizerImageUrl: null,
    platformManaged: false,
    createdByUserId: 'demo-creator',
    creatorSubmittedAt: (publishedAt || atLocalTime(now, -1, 10)).toISOString(),
    intentStats: stats.intents,
    host: { name: spec.hostName },
  };

  return { event, stats };
}

/** `GET /pivot/creator/events` */
export function buildDemoListingsResponse(now = new Date()) {
  if (!isDemoCapable()) return null;
  return {
    success: true,
    data: {
      tenantKey: DEMO_TENANT_KEY,
      events: DEMO_LISTINGS.map((spec) => buildDemoEvent(spec, now).event),
    },
  };
}

/** `GET /pivot/creator/events/:eventId` */
export function buildDemoListingResponse(eventId, now = new Date()) {
  if (!isDemoCapable()) return null;
  const spec = DEMO_LISTINGS.find((entry) => entry.id === eventId);
  if (!spec) return null;

  const { event, stats } = buildDemoEvent(spec, now);
  return {
    success: true,
    data: { tenantKey: DEMO_TENANT_KEY, event, stats },
  };
}
