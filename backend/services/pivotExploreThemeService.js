/**
 * Themed Explores (Content → Explore themes): per-city takeovers of the
 * discover page for a holiday or festival. For its dates a published theme
 * replaces the hero's headline, its featured events, and its background.
 *
 * Admin CRUD lives here, along with the one read the consumer explore
 * endpoint makes: which theme, if any, is live for a city right now.
 */

const { randomUUID } = require('crypto');
const sharp = require('sharp');
const getGlobalModels = require('./getGlobalModelService');
const { resolvePivotTenant } = require('./pivotIngestPublishService');
const { uploadImageToS3 } = require('./imageUploadService');
const {
  describeCuratedEvents,
  searchClipCandidateEvents,
  tenantEventModel,
} = require('./pivotClipAdminService');
const {
  resolvePivotDropConfig,
  zonedLocalToUtc,
} = require('../utilities/pivotDropSchedule');

const NAME_MAX = 40;
const TAGLINE_MAX = 90;
/** A theme is a moment, not a season: Halloween week, a festival weekend. */
const SPAN_MAX_DAYS = 92;
/** The hero shelf shows a handful; more than this is a list, not a feature. */
const FEATURED_MAX = 12;
const LIST_LIMIT = 200;
const IMAGE_MAX_BYTES = 12 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
/** Tall enough for a Pro Max at 3x behind the header and hero, small enough
 * to load quickly on a phone. */
const IMAGE_MAX_WIDTH = 1290;
const IMAGE_MAX_HEIGHT = 2796;
const IMAGE_FOLDER = 'pivot-explore-themes';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ID_PATTERN = /^[a-f\d]{24}$/i;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const invalid = (error) => ({ error, status: 400, code: 'INVALID_THEME_INPUT' });
const missing = () => ({ error: 'Theme not found.', status: 404, code: 'THEME_NOT_FOUND' });

function parseCalendarDate(value) {
  const match = DATE_PATTERN.exec(String(value || '').trim());
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day, utcMidnight: date };
}

/** Midnight at the start of `startsOn` to midnight after `endsOn`, in `timeZone`. */
function resolveThemeWindow(startsOn, endsOn, timeZone) {
  const start = parseCalendarDate(startsOn);
  const end = parseCalendarDate(endsOn);
  if (!start || !end) return null;
  const dayAfterEnd = new Date(end.utcMidnight.getTime() + MS_PER_DAY);
  return {
    startsAt: zonedLocalToUtc({ ...start, hour: 0, minute: 0, timeZone }),
    endsAt: zonedLocalToUtc({
      year: dayAfterEnd.getUTCFullYear(),
      month: dayAfterEnd.getUTCMonth() + 1,
      day: dayAfterEnd.getUTCDate(),
      hour: 0,
      minute: 0,
      timeZone,
    }),
  };
}

/** draft (unpublished), scheduled, live, or ended. */
function themeStatus(theme, now = new Date()) {
  if (!theme.published) return 'draft';
  if (now < new Date(theme.startsAt)) return 'scheduled';
  if (now >= new Date(theme.endsAt)) return 'ended';
  return 'live';
}

function cleanText(value, max) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.length <= max ? trimmed : null;
}

function cleanImageUrl(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' && url.pathname.includes(`/${IMAGE_FOLDER}/`)
      ? trimmed
      : null;
  } catch (_) {
    return null;
  }
}

/**
 * Validates a create (`partial` false) or an edit (`partial` true, only the
 * fields sent). Returns `{ fields }` to write, or `{ error }`.
 */
function validateThemeInput(body = {}, { partial = false, existing = null } = {}) {
  const fields = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);

  if (!partial || has('name')) {
    const name = cleanText(body.name, NAME_MAX);
    if (!name) return invalid(`Give the theme a name of up to ${NAME_MAX} characters.`);
    fields.name = name;
  }
  if (!partial || has('tagline')) {
    const tagline = cleanText(body.tagline, TAGLINE_MAX);
    if (tagline === null) return invalid(`The tagline is at most ${TAGLINE_MAX} characters.`);
    fields.tagline = tagline;
  }
  if (!partial || has('startsOn') || has('endsOn')) {
    const startsOn = has('startsOn') ? body.startsOn : existing?.startsOn;
    const endsOn = has('endsOn') ? body.endsOn : existing?.endsOn;
    const start = parseCalendarDate(startsOn);
    const end = parseCalendarDate(endsOn);
    if (!start || !end) return invalid('Pick a start and end date.');
    if (end.utcMidnight < start.utcMidnight) return invalid('The theme has to end on or after its first day.');
    const days = (end.utcMidnight - start.utcMidnight) / MS_PER_DAY + 1;
    if (days > SPAN_MAX_DAYS) return invalid(`A theme runs at most ${SPAN_MAX_DAYS} days.`);
    fields.startsOn = String(startsOn).trim();
    fields.endsOn = String(endsOn).trim();
  }
  if (!partial || has('eventIds')) {
    const raw = body.eventIds ?? [];
    if (!Array.isArray(raw)) return invalid('Featured events must be a list.');
    const ids = [...new Set(raw.map((id) => String(id || '').trim()))];
    if (ids.some((id) => !ID_PATTERN.test(id))) return invalid('A featured event id is not valid.');
    if (ids.length > FEATURED_MAX) return invalid(`Feature at most ${FEATURED_MAX} events.`);
    fields.eventIds = ids;
  }
  if (!partial || has('backgroundImageUrl')) {
    const url = cleanImageUrl(body.backgroundImageUrl);
    if (url === null) return invalid('Upload the background photo here rather than linking one.');
    fields.backgroundImageUrl = url;
  }
  if (!partial || has('published')) {
    if (body.published !== undefined && typeof body.published !== 'boolean') {
      return invalid('Published must be true or false.');
    }
    fields.published = body.published === true;
  }
  return { fields };
}

const cityName = (tenant) => tenant?.location || tenant?.name || tenant?.tenantKey || '';

async function withCity(req, tenantKey, run) {
  const resolved = await resolvePivotTenant(req, tenantKey);
  if (resolved.error) return resolved;
  const { tenant } = resolved;
  return run(tenant.tenantKey, tenant, resolvePivotDropConfig(tenant).timezone || 'UTC');
}

function themeData(row, events, now) {
  return {
    id: String(row._id),
    tenantKey: row.tenantKey,
    name: row.name,
    tagline: row.tagline || '',
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    timezone: row.timezone,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    backgroundImageUrl: row.backgroundImageUrl || '',
    published: row.published === true,
    status: themeStatus(row, now),
    events,
    updatedAt: row.updatedAt,
  };
}

/** Each theme's featured events with their state (live, ended, unpublished, missing). */
async function describeThemes(tenant, rows, now) {
  const ids = [...new Set(rows.flatMap((row) => row.eventIds || []))];
  const Event = ids.length ? await tenantEventModel(tenant) : null;
  const described = Event ? await describeCuratedEvents(Event, ids, now) : [];
  const byId = new Map(described.map((event) => [event.id, event]));
  return rows.map((row) => themeData(
    row,
    (row.eventIds || []).map((id) => byId.get(id) || { id, name: '', state: 'missing' }),
    now,
  ));
}

function listExploreThemes(req, tenantKey, options = {}) {
  return withCity(req, tenantKey, async (city, tenant, timezone) => {
    const now = options.now || new Date();
    const { PivotExploreTheme } = getGlobalModels(req, 'PivotExploreTheme');
    const rows = await PivotExploreTheme.find({ tenantKey: city })
      .sort({ startsAt: -1, updatedAt: -1 })
      .limit(LIST_LIMIT)
      .lean();
    return {
      data: {
        tenantKey: city,
        cityDisplayName: cityName(tenant),
        timezone,
        limits: { nameMax: NAME_MAX, taglineMax: TAGLINE_MAX, featuredMax: FEATURED_MAX, spanMaxDays: SPAN_MAX_DAYS },
        themes: await describeThemes(tenant, rows, now),
      },
    };
  });
}

function createExploreTheme(req, tenantKey, body = {}) {
  return withCity(req, tenantKey, async (city, tenant, timezone) => {
    const checked = validateThemeInput(body);
    if (checked.error) return checked;
    const { fields } = checked;
    const window = resolveThemeWindow(fields.startsOn, fields.endsOn, timezone);
    const { PivotExploreTheme } = getGlobalModels(req, 'PivotExploreTheme');
    const row = await PivotExploreTheme.create({
      ...fields,
      ...window,
      tenantKey: city,
      timezone,
      createdBy: req.user?.globalUserId || null,
      updatedBy: req.user?.globalUserId || null,
    });
    const [theme] = await describeThemes(tenant, [row.toObject()], new Date());
    return { status: 201, data: { theme } };
  });
}

function updateExploreTheme(req, tenantKey, themeId, body = {}) {
  return withCity(req, tenantKey, async (city, tenant, timezone) => {
    if (!ID_PATTERN.test(String(themeId || ''))) return missing();
    const { PivotExploreTheme } = getGlobalModels(req, 'PivotExploreTheme');
    const existing = await PivotExploreTheme.findOne({ _id: themeId, tenantKey: city }).lean();
    if (!existing) return missing();
    const checked = validateThemeInput(body, { partial: true, existing });
    if (checked.error) return checked;
    const { fields } = checked;
    // Re-resolve the window whenever the dates change, in today's timezone.
    const update = fields.startsOn
      ? { ...fields, timezone, ...resolveThemeWindow(fields.startsOn, fields.endsOn, timezone) }
      : fields;
    const row = await PivotExploreTheme.findOneAndUpdate(
      { _id: themeId, tenantKey: city },
      { $set: { ...update, updatedBy: req.user?.globalUserId || null } },
      { new: true },
    ).lean();
    if (!row) return missing();
    const [theme] = await describeThemes(tenant, [row], new Date());
    return { data: { theme } };
  });
}

function deleteExploreTheme(req, tenantKey, themeId) {
  return withCity(req, tenantKey, async (city) => {
    if (!ID_PATTERN.test(String(themeId || ''))) return missing();
    const { PivotExploreTheme } = getGlobalModels(req, 'PivotExploreTheme');
    const result = await PivotExploreTheme.deleteOne({ _id: themeId, tenantKey: city });
    if (!result.deletedCount) return missing();
    return { data: { id: String(themeId) } };
  });
}

/**
 * Stores a background photo: upright, sized for a phone, as a JPEG. Returns
 * its URL for the theme form to save.
 */
function uploadExploreThemeImage(req, tenantKey, file) {
  return withCity(req, tenantKey, async (city) => {
    if (!file || !IMAGE_TYPES.has(file.mimetype)) {
      return invalid('Choose a JPEG, PNG or WebP photo.');
    }
    if (file.size > IMAGE_MAX_BYTES) {
      return invalid('Photos must be 12 MB or smaller.');
    }
    let buffer;
    try {
      buffer = await sharp(file.buffer, { limitInputPixels: 60_000_000, animated: false })
        .rotate()
        .resize({
          width: IMAGE_MAX_WIDTH,
          height: IMAGE_MAX_HEIGHT,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
    } catch (_) {
      return invalid('That photo could not be read.');
    }
    const url = await uploadImageToS3(
      { buffer, mimetype: 'image/jpeg', size: buffer.length, originalname: 'theme.jpg' },
      `${IMAGE_FOLDER}/${city}`,
      `${randomUUID()}.jpg`,
      { maxBytes: IMAGE_MAX_BYTES },
    );
    return { status: 201, data: { url } };
  });
}

/** Published events to feature, searched the same way the App Clip pins them. */
function searchExploreThemeEvents(req, tenantKey, query = {}) {
  return searchClipCandidateEvents(req, {
    tenantKey,
    q: query.q,
    limit: query.limit,
    includePast: query.includePast,
  });
}

/**
 * The theme live for a city at `now`: published, and `now` inside its dates.
 * Overlaps go to the one that started latest, so a festival weekend can sit
 * inside a month-long theme.
 */
async function findLiveExploreTheme(req, tenantKey, now = new Date()) {
  const { PivotExploreTheme } = getGlobalModels(req, 'PivotExploreTheme');
  return PivotExploreTheme.findOne({
    tenantKey: String(tenantKey || '').trim().toLowerCase(),
    published: true,
    startsAt: { $lte: now },
    endsAt: { $gt: now },
  })
    .sort({ startsAt: -1, updatedAt: -1 })
    .lean();
}

/**
 * The explore payload's `theme`: its copy and photo, and its featured events
 * in the admin's order, served in the same shape as explore rows. Events the
 * explore catalog doesn't carry (ended, unpublished, past the horizon, or
 * passed by this user) drop out.
 */
function serializeExploreTheme(theme, eventsById) {
  if (!theme) return null;
  const events = [];
  for (const id of theme.eventIds || []) {
    const event = eventsById.get(String(id));
    if (event) events.push(event);
  }
  return {
    id: String(theme._id),
    name: theme.name,
    tagline: theme.tagline || null,
    backgroundImageUrl: theme.backgroundImageUrl || null,
    startsAt: new Date(theme.startsAt).toISOString(),
    endsAt: new Date(theme.endsAt).toISOString(),
    events,
  };
}

module.exports = {
  FEATURED_MAX,
  parseCalendarDate,
  resolveThemeWindow,
  themeStatus,
  validateThemeInput,
  listExploreThemes,
  createExploreTheme,
  updateExploreTheme,
  deleteExploreTheme,
  uploadExploreThemeImage,
  searchExploreThemeEvents,
  findLiveExploreTheme,
  serializeExploreTheme,
};
