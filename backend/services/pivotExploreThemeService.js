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
/** Unsplash photos are hotlinked from its CDN, as its API terms ask. */
const UNSPLASH_IMAGE_HOST = 'images.unsplash.com';
const UNSPLASH_PAGE_HOST = 'unsplash.com';
const CREDIT_NAME_MAX = 120;

/** Carousel groups offered as starting points for a theme's featured events. */
const CAROUSEL_GROUP_LIMIT = 12;
const CAROUSEL_LOOKBACK_DAYS = 120;
/** A suggested group trimmed to one city needs at least this many to help. */
const SUGGESTED_MIN_EVENTS = 2;

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

function parseHttps(value) {
  try {
    const url = new URL(String(value).trim());
    return url.protocol === 'https:' ? url : null;
  } catch (_) {
    return null;
  }
}

function isUnsplashImage(value) {
  return parseHttps(value)?.hostname === UNSPLASH_IMAGE_HOST;
}

/** Our own uploads, or a photo on Unsplash's CDN. Nothing else. */
function cleanImageUrl(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') return null;
  const url = parseHttps(value);
  if (!url) return null;
  return url.hostname === UNSPLASH_IMAGE_HOST || url.pathname.includes(`/${IMAGE_FOLDER}/`)
    ? value.trim()
    : null;
}

/** An Unsplash photo's attribution: the photographer, linking back to Unsplash. */
function cleanUnsplashCredit(value) {
  if (!value || typeof value !== 'object') return null;
  const photographer = cleanText(value.photographer, CREDIT_NAME_MAX);
  const onUnsplash = (link) => {
    const url = parseHttps(link);
    return url && (url.hostname === UNSPLASH_PAGE_HOST || url.hostname.endsWith(`.${UNSPLASH_PAGE_HOST}`))
      ? url.toString()
      : null;
  };
  const photographerUrl = onUnsplash(value.photographerUrl);
  const sourceUrl = onUnsplash(value.sourceUrl);
  if (!photographer || !photographerUrl || !sourceUrl) return null;
  return { provider: 'unsplash', photographer, photographerUrl, sourceUrl };
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
    if (url === null) return invalid('Upload the background photo or pick one from Unsplash here rather than linking one.');
    fields.backgroundImageUrl = url;
    // Unsplash asks for its photographers to be credited wherever the photo shows.
    if (isUnsplashImage(url)) {
      const credit = cleanUnsplashCredit(body.backgroundCredit);
      if (!credit) return invalid('An Unsplash photo needs its photographer’s credit. Pick it again from the search.');
      fields.backgroundCredit = credit;
    } else {
      fields.backgroundCredit = null;
    }
  }
  for (const key of ['filmGrain', 'darkVignette']) {
    if (partial && !has(key)) continue;
    if (body[key] !== undefined && typeof body[key] !== 'boolean') {
      return invalid(`${key} must be true or false.`);
    }
    fields[key] = body[key] === true;
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
    backgroundCredit: row.backgroundCredit || null,
    filmGrain: row.filmGrain === true,
    darkVignette: row.darkVignette === true,
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

/** Unsplash's photos for a theme background, searched by keyword. */
function searchExploreThemeUnsplash(req, tenantKey, query = {}) {
  return withCity(req, tenantKey, () => {
    // Loaded here so the consumer explore path never pulls in the carousel.
    const { searchUnsplashPhotos } = require('./pivotCarouselUnsplashService');
    return searchUnsplashPhotos({ query: query.query, page: query.page });
  });
}

/**
 * Picks an Unsplash photo for a theme: records the download with Unsplash
 * and returns a phone-sized link on its CDN, with the credit to show.
 */
function selectExploreThemeUnsplash(req, tenantKey, photoId) {
  return withCity(req, tenantKey, async () => {
    const { selectUnsplashPhoto } = require('./pivotCarouselUnsplashService');
    const picked = await selectUnsplashPhoto(photoId);
    if (picked.error) return picked;
    const { asset, raw } = picked.data;
    let url = asset.src;
    const rawUrl = raw && parseHttps(raw);
    if (rawUrl?.hostname === UNSPLASH_IMAGE_HOST) {
      // Unsplash resizes on its CDN: ask for the same size an upload gets.
      rawUrl.searchParams.set('w', String(IMAGE_MAX_WIDTH));
      rawUrl.searchParams.set('fit', 'max');
      rawUrl.searchParams.set('fm', 'jpg');
      rawUrl.searchParams.set('q', '80');
      url = rawUrl.toString();
    }
    return {
      data: {
        url,
        credit: {
          provider: 'unsplash',
          photographer: asset.photographer,
          photographerUrl: asset.photographerUrl,
          sourceUrl: asset.sourceUrl,
        },
      },
    };
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

/** This city's event ids from carousel refs, in order, once each. */
function cityEventIds(refs, city) {
  const ids = [];
  for (const ref of refs || []) {
    const id = String(ref?.eventId || '');
    if (String(ref?.sourceTenantKey || '').toLowerCase() === city && ID_PATTERN.test(id) && !ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
}

/**
 * Carousels the team made recently that include this city: issues (not
 * archived) and curation drafts still open. A consumed draft is its issue,
 * so it isn't listed twice.
 */
async function recentCarouselGroups(req, city, now) {
  const { PivotCarouselDeck, PivotCarouselCurationDraft, PivotCarouselAccount } = getGlobalModels(
    req,
    'PivotCarouselDeck',
    'PivotCarouselCurationDraft',
    'PivotCarouselAccount',
  );
  const since = new Date(now.getTime() - CAROUSEL_LOOKBACK_DAYS * MS_PER_DAY);
  const [issues, drafts] = await Promise.all([
    PivotCarouselDeck.find({
      accountId: { $ne: null },
      status: { $ne: 'archived' },
      'sources.sourceTenantKey': city,
      updatedAt: { $gte: since },
    })
      .sort({ updatedAt: -1 })
      .limit(CAROUSEL_GROUP_LIMIT)
      .select('name title accountId sources curation.theme updatedAt')
      .lean(),
    PivotCarouselCurationDraft.find({
      status: 'open',
      'selected.ref.sourceTenantKey': city,
      updatedAt: { $gte: since },
    })
      .sort({ updatedAt: -1 })
      .limit(CAROUSEL_GROUP_LIMIT)
      .select('accountId selected.ref theme updatedAt')
      .lean(),
  ]);
  const accountIds = [...new Set([...issues, ...drafts].map((row) => String(row.accountId)))];
  const accounts = accountIds.length
    ? await PivotCarouselAccount.find({ _id: { $in: accountIds } }).select('displayName').lean()
    : [];
  const accountName = new Map(accounts.map((row) => [String(row._id), row.displayName]));

  const groups = [
    ...issues.map((row) => ({
      id: `issue:${row._id}`,
      kind: 'issue',
      label: row.name || row.title || row.curation?.theme || 'Untitled carousel',
      detail: [accountName.get(String(row.accountId)), 'Carousel'].filter(Boolean).join(' · '),
      updatedAt: row.updatedAt,
      eventIds: cityEventIds(row.sources, city),
    })),
    ...drafts.map((row) => ({
      id: `draft:${row._id}`,
      kind: 'draft',
      label: row.theme || 'Untitled draft',
      detail: [accountName.get(String(row.accountId)), 'Draft'].filter(Boolean).join(' · '),
      updatedAt: row.updatedAt,
      eventIds: cityEventIds((row.selected || []).map((item) => item?.ref), city),
    })),
  ];
  return {
    groups: groups
      .filter((group) => group.eventIds.length)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, CAROUSEL_GROUP_LIMIT),
  };
}

const SUGGESTION_NOTICES = Object.freeze({
  PROVIDER_UNAVAILABLE: 'Suggested groups are turned off on this server.',
  VECTOR_INDEX_UNAVAILABLE: 'The related-event index is unavailable right now. Try again later.',
});

/**
 * The carousel workspace's suggested groups, seeded from this city alone, so
 * every group is this city's events.
 */
async function suggestedCarouselGroups(req, city, now) {
  // Loaded here so the consumer explore path never pulls in the carousel.
  const { findSuggestedGroupsForSources } = require('./pivotCarouselRelatedService');
  const result = await findSuggestedGroupsForSources(req, [city], { now });
  if (result.error) {
    const notice = SUGGESTION_NOTICES[result.code];
    if (notice) return { groups: [], notice };
    return result;
  }
  const groups = [];
  for (const group of result.data.groups || []) {
    const eventIds = cityEventIds((group.candidates || []).map((candidate) => candidate.ref), city);
    if (eventIds.length < SUGGESTED_MIN_EVENTS) continue;
    groups.push({
      id: `suggested:${group.id}`,
      kind: 'suggested',
      label: group.label,
      detail: group.signal?.label ? `Starts from a ${group.signal.label.toLowerCase()} event` : '',
      updatedAt: null,
      eventIds,
    });
  }
  const failed = (result.data.sources || []).some((source) => source.status === 'failed');
  return { groups, notice: failed ? 'Suggestions could not load for this city. Try again.' : null };
}

/**
 * Starting points for a theme's featured events: recent carousels
 * (`source=recent`) or the carousel workspace's suggestions
 * (`source=suggested`), each with this city's events and their state.
 */
function listExploreThemeCarouselGroups(req, tenantKey, query = {}) {
  return withCity(req, tenantKey, async (city, tenant) => {
    const now = new Date();
    const source = query.source === 'suggested' ? 'suggested' : 'recent';
    const found = source === 'suggested'
      ? await suggestedCarouselGroups(req, city, now)
      : await recentCarouselGroups(req, city, now);
    if (found.error) return found;
    const ids = [...new Set(found.groups.flatMap((group) => group.eventIds))];
    const Event = ids.length ? await tenantEventModel(tenant) : null;
    const described = Event ? await describeCuratedEvents(Event, ids, now) : [];
    const byId = new Map(described.map((event) => [event.id, event]));
    return {
      data: {
        source,
        notice: found.notice || null,
        groups: found.groups.map(({ eventIds, ...group }) => ({
          ...group,
          events: eventIds.map((id) => byId.get(id)).filter(Boolean),
        })),
      },
    };
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
 * explore catalog doesn't carry (ended, unpublished, or past the horizon)
 * drop out; ones this user passed stay.
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
    backgroundCredit: theme.backgroundCredit || null,
    filmGrain: theme.filmGrain === true,
    darkVignette: theme.darkVignette === true,
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
  searchExploreThemeUnsplash,
  selectExploreThemeUnsplash,
  searchExploreThemeEvents,
  cityEventIds,
  listExploreThemeCarouselGroups,
  findLiveExploreTheme,
  serializeExploreTheme,
};
