const axios = require('axios');
const mongoose = require('mongoose');
const { connectToDatabase } = require('../connectionsManager');
const getModels = require('./getModelService');
const { resolvePivotTenant } = require('./pivotIngestPublishService');
const {
  buildDraft,
  sanitizeEventPosterImage,
} = require('./pivotIngestPreviewService');
const {
  normalizeSiteUrl,
  scrapeSiteEvents,
} = require('./pivotSiteScrapeService');

const MAX_ENRICH_EVENTS = 50;
const ENRICH_CONCURRENCY = 3;
const DETAIL_FETCH_TIMEOUT_MS = 10_000;

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function missingRichDataFields(event = {}) {
  const missing = [];
  if (!trimString(event.description)) missing.push('description');
  if (!trimString(event.image)) missing.push('image');
  return missing;
}

function resolveAbsoluteUrl(value, baseUrl) {
  const raw = trimString(value);
  if (!raw) return null;
  try {
    const resolved = new URL(raw, baseUrl);
    return ['http:', 'https:'].includes(resolved.protocol) ? resolved.toString() : null;
  } catch {
    return null;
  }
}

function normalizedWords(value) {
  return new Set(
    trimString(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((word) => word.length > 2),
  );
}

function titleLooksRelevant(eventName, candidateName) {
  const expected = normalizedWords(eventName);
  const candidate = normalizedWords(candidateName);
  if (!expected.size || !candidate.size) return true;
  let overlap = 0;
  for (const word of expected) {
    if (candidate.has(word)) overlap += 1;
  }
  return overlap >= Math.min(2, expected.size);
}

function pickMatchingDraft(drafts, event) {
  const rows = Array.isArray(drafts) ? drafts : [];
  return (
    rows.find((entry) => titleLooksRelevant(event.name, entry?.draft?.name)) ||
    (rows.length === 1 && !entryHasConflictingTitle(rows[0], event) ? rows[0] : null)
  );
}

function entryHasConflictingTitle(entry, event) {
  const candidateName = trimString(entry?.draft?.name);
  return candidateName && !titleLooksRelevant(event?.name, candidateName);
}

async function fetchDetailHtml(rawUrl) {
  let current = normalizeSiteUrl(rawUrl);
  if (current.error) return current;

  for (let redirects = 0; redirects <= 5; redirects += 1) {
    try {
      const response = await axios.get(current.url, {
        timeout: DETAIL_FETCH_TIMEOUT_MS,
        maxRedirects: 0,
        headers: {
          'User-Agent': 'MeridianPivotCuration/1.0 (+https://meridian.study)',
          Accept: 'text/html,application/xhtml+xml',
        },
        validateStatus: (status) => status >= 200 && status < 400,
      });
      if (response.status >= 300) {
        const nextUrl = resolveAbsoluteUrl(response.headers?.location, current.url);
        const next = normalizeSiteUrl(nextUrl);
        if (next.error) return next;
        current = next;
        continue;
      }
      if (typeof response.data !== 'string') {
        return { error: 'Detail page returned no HTML.', code: 'DETAIL_UNPARSEABLE' };
      }
      return { html: response.data, url: current.url };
    } catch (err) {
      return {
        error: err.code === 'ECONNABORTED' ? 'Detail page timed out.' : 'Unable to fetch detail page.',
        code: err.code === 'ECONNABORTED' ? 'DETAIL_TIMEOUT' : 'DETAIL_FETCH_FAILED',
      };
    }
  }
  return { error: 'Detail page redirected too many times.', code: 'DETAIL_REDIRECT_LIMIT' };
}

function richPatchFromDraft(event, draft, detailUrl) {
  if (!draft || !titleLooksRelevant(event.name, draft.name)) return {};
  const patch = {};
  if (!trimString(event.description) && trimString(draft.description)) {
    patch.description = trimString(draft.description);
  }
  if (!trimString(event.image)) {
    const image = sanitizeEventPosterImage(resolveAbsoluteUrl(draft.image, detailUrl));
    if (image) patch.image = image;
  }
  return patch;
}

async function enrichOneEvent(event, options = {}) {
  const before = missingRichDataFields(event);
  if (!before.length) {
    return { patch: {}, before, after: [], status: 'skipped', message: 'Rich data already complete.' };
  }

  const detailUrl = trimString(event.externalLink) || trimString(event.customFields?.pivot?.sourceUrl);
  const normalized = normalizeSiteUrl(detailUrl);
  if (normalized.error) {
    return {
      patch: { 'customFields.pivot.ingestStatus': 'draft' },
      before,
      after: before,
      status: 'incomplete',
      message: 'No usable public detail URL.',
    };
  }

  let patch = {};
  const fetched = await fetchDetailHtml(normalized.url);
  if (fetched.html) {
    const parsed = buildDraft({
      html: fetched.html,
      provider: 'generic-site',
      sourceUrl: fetched.url,
      timezone: options.timezone,
      now: options.now,
    }).draft;
    patch = richPatchFromDraft(event, parsed, fetched.url);
  }

  const afterHtml = missingRichDataFields({ ...event, ...patch });
  if (afterHtml.length) {
    const scraped = await scrapeSiteEvents({
      url: normalized.url,
      maxEvents: 10,
      timezone: options.timezone,
      now: options.now,
    });
    if (!scraped.error) {
      const match = pickMatchingDraft(scraped.drafts, event);
      patch = {
        ...patch,
        ...richPatchFromDraft({ ...event, ...patch }, match?.draft, normalized.url),
      };
    }
  }

  const after = missingRichDataFields({ ...event, ...patch });
  if (after.length) patch['customFields.pivot.ingestStatus'] = 'draft';
  return {
    patch,
    before,
    after,
    status: after.length ? 'incomplete' : 'enriched',
    message: after.length
      ? `Still missing ${after.join(' and ')}.`
      : `Added ${Object.keys(patch).filter((key) => key === 'description' || key === 'image').join(' and ')}.`,
  };
}

async function mapWithConcurrency(items, limit, iteratee) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await iteratee(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

async function enrichPivotEventRichData(req, options = {}) {
  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) return tenantResult;

  const rawIds = Array.isArray(options.eventIds) ? options.eventIds : [];
  const eventIds = [...new Set(rawIds.map((id) => trimString(id)).filter(Boolean))];
  if (!eventIds.length) {
    return { error: 'Select at least one event.', status: 400, code: 'EVENT_IDS_REQUIRED' };
  }
  if (eventIds.length > MAX_ENRICH_EVENTS) {
    return {
      error: `Select at most ${MAX_ENRICH_EVENTS} events per enrichment job.`,
      status: 400,
      code: 'TOO_MANY_EVENTS',
    };
  }
  if (eventIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    return { error: 'One or more event ids are invalid.', status: 400, code: 'INVALID_EVENT_ID' };
  }

  const db = await connectToDatabase(tenantResult.tenant.tenantKey);
  const { Event } = getModels({ db }, 'Event');
  const events = await Event.find({
    _id: { $in: eventIds },
    isDeleted: { $ne: true },
    'customFields.pivot': { $exists: true },
  }).lean();
  const byId = new Map(events.map((event) => [String(event._id), event]));

  const results = await mapWithConcurrency(eventIds, ENRICH_CONCURRENCY, async (eventId) => {
    const event = byId.get(eventId);
    if (!event) {
      return { eventId, name: null, status: 'failed', before: [], after: [], message: 'Event not found.' };
    }
    try {
      const outcome = await enrichOneEvent(event, {
        timezone: tenantResult.tenant.pivotDropTimezone,
        now: options.now,
      });
      if (Object.keys(outcome.patch).length) {
        await Event.findByIdAndUpdate(eventId, { $set: outcome.patch }, { runValidators: true });
      }
      return {
        eventId,
        name: event.name || 'Untitled',
        status: outcome.status,
        before: outcome.before,
        after: outcome.after,
        added: ['description', 'image'].filter((field) => outcome.patch[field]),
        message: outcome.message,
      };
    } catch {
      return {
        eventId,
        name: event.name || 'Untitled',
        status: 'failed',
        before: missingRichDataFields(event),
        after: missingRichDataFields(event),
        added: [],
        message: 'Enrichment failed for this event.',
      };
    }
  });

  return {
    data: {
      results,
      totals: {
        selected: eventIds.length,
        enriched: results.filter((row) => row.status === 'enriched').length,
        incomplete: results.filter((row) => row.status === 'incomplete').length,
        skipped: results.filter((row) => row.status === 'skipped').length,
        failed: results.filter((row) => row.status === 'failed').length,
      },
    },
  };
}

module.exports = {
  enrichPivotEventRichData,
  enrichOneEvent,
  missingRichDataFields,
  titleLooksRelevant,
  richPatchFromDraft,
  fetchDetailHtml,
  MAX_ENRICH_EVENTS,
};
