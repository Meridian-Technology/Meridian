const axios = require('axios');
const {
  listPivotTags,
  validatePivotEventTags,
} = require('./pivotTagCatalogService');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 256;
const REQUEST_TIMEOUT_MS = 20_000;
/** Cap in-flight Claude calls — memory is tiny; rate limits are the constraint. */
const DEFAULT_BATCH_CONCURRENCY = 4;
const MAX_BATCH_CONCURRENCY = 8;
const LOG_PREFIX = '[pivotTagSuggest]';

function logSuggest(level, message, meta) {
  const suffix = meta ? ` ${JSON.stringify(meta)}` : '';
  const line = `${LOG_PREFIX} ${message}${suffix}`;
  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.log(line);
}

function truncateForLog(value, max = 500) {
  if (typeof value !== 'string') return value;
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

function resolveAnthropicApiKey() {
  return process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || null;
}

function resolveClaudeModel() {
  return process.env.CLAUDE_MODEL || process.env.ANTHROPIC_MODEL || DEFAULT_CLAUDE_MODEL;
}

function resolveBatchConcurrency(override) {
  if (Number.isFinite(override) && override > 0) {
    return Math.min(MAX_BATCH_CONCURRENCY, Math.max(1, Math.floor(override)));
  }
  const fromEnv = Number.parseInt(
    process.env.PIVOT_TAG_SUGGEST_CONCURRENCY || '',
    10,
  );
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return Math.min(MAX_BATCH_CONCURRENCY, Math.max(1, fromEnv));
  }
  return DEFAULT_BATCH_CONCURRENCY;
}

/**
 * Run async work over items with a fixed worker pool (order-preserving results).
 * Prefer this over unbounded Promise.all for external APIs with rate limits.
 */
async function mapWithConcurrency(items, concurrency, mapper) {
  const list = Array.isArray(items) ? items : [];
  const results = new Array(list.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < list.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(list[index], index);
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), Math.max(list.length, 1));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEventInput(raw = {}) {
  return {
    name: trimString(raw.name),
    description: trimString(raw.description),
    location: trimString(raw.location),
    hostName: trimString(raw.hostName || raw.organizerName),
    sourceTags: Array.isArray(raw.sourceTags)
      ? raw.sourceTags.map((entry) => trimString(entry)).filter(Boolean)
      : [],
  };
}

function buildTagSuggestionPrompt(event, catalogTags) {
  const catalogLines = catalogTags
    .map((tag) => `- ${tag.slug} (${tag.label})`)
    .join('\n');

  const sourceTagLine = event.sourceTags.length
    ? `\nSource listing tags (hints only, may not match catalog): ${event.sourceTags.join(', ')}`
    : '';

  return [
    'You assign taxonomy tags to local events for a weekly events pilot app.',
    'Pick 1 to 3 tags from ONLY the catalog below. Use exact slug strings.',
    'Prefer specific tags over generic "social" when a better match exists.',
    '',
    'Catalog:',
    catalogLines,
    '',
    'Event:',
    `Title: ${event.name || '(unknown)'}`,
    `Description: ${event.description || '(none)'}`,
    `Location: ${event.location || '(unknown)'}`,
    `Organizer: ${event.hostName || '(unknown)'}`,
    sourceTagLine,
    '',
    'Respond with JSON only, no markdown:',
    '{"tags":["slug-one","slug-two"]}',
  ].join('\n');
}

function parseTagsFromClaudeText(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return [];
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || text.trim();

  try {
    const parsed = JSON.parse(candidate);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (Array.isArray(parsed?.tags)) {
      return parsed.tags;
    }
  } catch {
    const objectMatch = candidate.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        const parsed = JSON.parse(objectMatch[0]);
        if (Array.isArray(parsed?.tags)) {
          return parsed.tags;
        }
      } catch {
        // Fall through to slug extraction.
      }
    }
  }

  const slugMatches = candidate.match(/[a-z0-9]+(?:-[a-z0-9]+)+/g);
  return slugMatches || [];
}

async function callClaudeForTags(prompt, apiKey) {
  const model = resolveClaudeModel();
  const startedAt = Date.now();
  logSuggest('info', 'claude request start', { model, promptChars: prompt.length });

  const response = await axios.post(
    ANTHROPIC_API_URL,
    {
      model,
      max_tokens: DEFAULT_MAX_TOKENS,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    },
    {
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
    },
  );

  const textBlock = (response.data?.content || []).find((block) => block.type === 'text');
  const text = textBlock?.text || '';
  logSuggest('info', 'claude request complete', {
    model,
    elapsedMs: Date.now() - startedAt,
    responseChars: text.length,
    preview: truncateForLog(text, 240),
  });
  return text;
}

async function suggestPivotEventTags(req, rawEvent = {}, options = {}) {
  const event = normalizeEventInput(rawEvent);
  logSuggest('info', 'single suggest start', {
    eventName: event.name || null,
    hasDescription: Boolean(event.description),
    hasLocation: Boolean(event.location),
    hostName: event.hostName || null,
    sourceTagCount: event.sourceTags.length,
    batchIndex: options.batchIndex,
  });

  const apiKey = resolveAnthropicApiKey();
  if (!apiKey) {
    logSuggest('warn', 'missing anthropic api key');
    return {
      error: 'Tag suggestion requires ANTHROPIC_API_KEY (or CLAUDE_API_KEY) in the environment.',
      status: 503,
      code: 'LLM_NOT_CONFIGURED',
    };
  }

  if (!event.name && !event.description && !event.location) {
    logSuggest('warn', 'event context missing', { rawKeys: Object.keys(rawEvent || {}) });
    return {
      error: 'Event title, description, or location is required for tag suggestion.',
      status: 400,
      code: 'EVENT_CONTEXT_REQUIRED',
    };
  }

  let catalogTags = Array.isArray(options.catalogTags) ? options.catalogTags : null;
  let catalogSlugSet =
    options.catalogSlugSet instanceof Set ? options.catalogSlugSet : null;

  if (!catalogTags) {
    const catalogResult = await listPivotTags(req);
    if (catalogResult.error) {
      logSuggest('warn', 'catalog lookup failed', {
        message: catalogResult.error,
        code: catalogResult.code,
        hasGlobalDb: Boolean(req.globalDb),
      });
      return catalogResult;
    }
    catalogTags = catalogResult.data?.tags || [];
  }

  if (!catalogSlugSet && catalogTags.length) {
    catalogSlugSet = new Set(catalogTags.map((tag) => tag.slug).filter(Boolean));
  }

  logSuggest('info', 'catalog loaded', {
    activeTagCount: catalogTags.length,
    sharedCatalog: Boolean(options.catalogTags),
  });
  if (!catalogTags.length) {
    logSuggest('warn', 'catalog empty');
    return {
      error: 'Pivot tag catalog is empty. Run seed:pivot-tag-catalog first.',
      status: 503,
      code: 'TAG_CATALOG_EMPTY',
    };
  }

  try {
    const prompt = buildTagSuggestionPrompt(event, catalogTags);
    const responseText = await callClaudeForTags(prompt, apiKey);
    const rawTags = parseTagsFromClaudeText(responseText);
    logSuggest('info', 'parsed claude tags', { rawTags });

    const validated = await validatePivotEventTags(req, rawTags, {
      required: true,
      ...(catalogSlugSet ? { catalogSlugSet } : {}),
    });
    if (validated.error) {
      logSuggest('warn', 'tag validation failed', {
        code: validated.code,
        message: validated.error,
        rawTags,
      });
      return {
        error: validated.error,
        status: validated.status,
        code: validated.code,
        data: {
          rawTags,
          model: resolveClaudeModel(),
          responsePreview: truncateForLog(responseText, 240),
        },
      };
    }

    logSuggest('info', 'single suggest success', {
      eventName: event.name || null,
      tags: validated.tags,
      model: resolveClaudeModel(),
    });

    return {
      data: {
        tags: validated.tags,
        model: resolveClaudeModel(),
      },
    };
  } catch (err) {
    if (err.code === 'ECONNABORTED') {
      logSuggest('warn', 'claude request timed out');
      return {
        error: 'Claude tag suggestion timed out.',
        status: 504,
        code: 'LLM_TIMEOUT',
      };
    }

    const status = err.response?.status;
    if (status === 404) {
      const modelMessage = err.response?.data?.error?.message || '';
      logSuggest('warn', 'claude model not found', {
        model: resolveClaudeModel(),
        modelMessage,
      });
      return {
        error: modelMessage.includes('model:')
          ? `Claude model not found (${resolveClaudeModel()}). Set CLAUDE_MODEL to a current ID such as claude-sonnet-4-6 or claude-haiku-4-5-20251001.`
          : 'Claude model not found. Check CLAUDE_MODEL or ANTHROPIC_MODEL.',
        status: 502,
        code: 'LLM_MODEL_NOT_FOUND',
      };
    }
    if (status === 401 || status === 403) {
      logSuggest('warn', 'claude auth failed', { status });
      return {
        error: 'Claude API authentication failed. Check ANTHROPIC_API_KEY.',
        status: 502,
        code: 'LLM_AUTH_FAILED',
      };
    }
    if (status === 429) {
      logSuggest('warn', 'claude rate limited', { status });
      return {
        error:
          'Claude rate limit hit. Retry shortly or lower PIVOT_TAG_SUGGEST_CONCURRENCY.',
        status: 429,
        code: 'LLM_RATE_LIMITED',
      };
    }

    logSuggest('error', 'claude request failed', {
      status,
      message: err.message,
      response: err.response?.data,
    });
    return {
      error: 'Unable to suggest tags from Claude.',
      status: 502,
      code: 'LLM_REQUEST_FAILED',
    };
  }
}

async function suggestPivotEventTagsBatch(req, rawEvents = [], options = {}) {
  const events = Array.isArray(rawEvents) ? rawEvents : [];
  const concurrency = resolveBatchConcurrency(options.concurrency);
  logSuggest('info', 'batch suggest start', {
    eventCount: events.length,
    concurrency,
  });
  if (!events.length) {
    return {
      error: 'At least one event is required.',
      status: 400,
      code: 'EVENTS_REQUIRED',
    };
  }

  const apiKey = resolveAnthropicApiKey();
  if (!apiKey) {
    logSuggest('warn', 'missing anthropic api key');
    return {
      error:
        'Tag suggestion requires ANTHROPIC_API_KEY (or CLAUDE_API_KEY) in the environment.',
      status: 503,
      code: 'LLM_NOT_CONFIGURED',
      data: {
        suggestions: events.map(() => ({ tags: [] })),
        failures: events.map((rawEvent, index) => ({
          index,
          name: trimString(rawEvent?.name) || null,
          message:
            'Tag suggestion requires ANTHROPIC_API_KEY (or CLAUDE_API_KEY) in the environment.',
          code: 'LLM_NOT_CONFIGURED',
        })),
        suggestedCount: 0,
        failedCount: events.length,
      },
    };
  }

  const catalogResult = await listPivotTags(req);
  if (catalogResult.error) {
    return catalogResult;
  }
  const catalogTags = catalogResult.data?.tags || [];
  if (!catalogTags.length) {
    return {
      error: 'Pivot tag catalog is empty. Run seed:pivot-tag-catalog first.',
      status: 503,
      code: 'TAG_CATALOG_EMPTY',
    };
  }
  const catalogSlugSet = new Set(
    catalogTags.map((tag) => tag.slug).filter(Boolean),
  );

  const perEvent = await mapWithConcurrency(
    events,
    concurrency,
    async (rawEvent, index) => {
      const result = await suggestPivotEventTags(req, rawEvent, {
        batchIndex: index,
        catalogTags,
        catalogSlugSet,
      });
      if (result.error) {
        return {
          suggestion: { tags: [] },
          failure: {
            index,
            name: trimString(rawEvent?.name) || null,
            message: result.error,
            code: result.code,
          },
        };
      }
      return {
        suggestion: { tags: result.data.tags, model: result.data.model },
        failure: null,
      };
    },
  );

  const suggestions = perEvent.map((entry) => entry.suggestion);
  const failures = perEvent.map((entry) => entry.failure).filter(Boolean);

  const suggestedCount = suggestions.filter((entry) => entry.tags?.length).length;
  logSuggest('info', 'batch suggest complete', {
    eventCount: events.length,
    concurrency,
    suggestedCount,
    failedCount: failures.length,
    failures: failures.map((entry) => ({
      index: entry.index,
      code: entry.code,
      name: entry.name,
    })),
  });

  if (suggestedCount === 0 && failures.length > 0) {
    return {
      error: failures[0].message,
      status: failures[0].code === 'LLM_NOT_CONFIGURED' ? 503 : 400,
      code: failures[0].code || 'BATCH_SUGGEST_FAILED',
      data: {
        suggestions,
        failures,
        suggestedCount: 0,
        failedCount: failures.length,
      },
    };
  }

  return {
    data: {
      suggestions,
      failures,
      suggestedCount,
      failedCount: failures.length,
      concurrency,
    },
  };
}

function eventHasTags(pivotTags) {
  if (!Array.isArray(pivotTags)) {
    return false;
  }
  return pivotTags.some((tag) => typeof tag === 'string' && tag.trim());
}

/**
 * Server-side suggest + apply: Claude suggestions are written to catalog events
 * in the same request so a dropped client connection cannot leave tags unapplied
 * after Claude already ran.
 */
async function suggestAndApplyPivotEventTags(req, options = {}) {
  const {
    resolvePivotTenant,
    updateIngestEvent,
  } = require('./pivotIngestPublishService');
  const { connectToDatabase } = require('../connectionsManager');
  const getModels = require('./getModelService');
  const mongoose = require('mongoose');

  const tenantKey = trimString(options.tenantKey);
  if (!tenantKey) {
    return {
      error: 'tenantKey is required.',
      status: 400,
      code: 'TENANT_KEY_REQUIRED',
    };
  }

  const rawIds = Array.isArray(options.eventIds) ? options.eventIds : [];
  const eventIds = [
    ...new Set(
      rawIds
        .map((id) => trimString(id))
        .filter((id) => id && mongoose.Types.ObjectId.isValid(id)),
    ),
  ];
  if (!eventIds.length) {
    return {
      error: 'At least one valid eventId is required.',
      status: 400,
      code: 'EVENT_IDS_REQUIRED',
    };
  }

  const onlyTagless = options.onlyTagless !== false;
  const applyConcurrency = resolveBatchConcurrency(options.applyConcurrency);

  const tenantResult = await resolvePivotTenant(req, tenantKey);
  if (tenantResult.error) {
    return tenantResult;
  }

  const db = await connectToDatabase(tenantResult.tenant.tenantKey);
  const { Event } = getModels({ db }, 'Event');
  const rows = await Event.find({
    _id: { $in: eventIds },
    isDeleted: { $ne: true },
    'customFields.pivot': { $exists: true },
  })
    .select('name description location customFields.pivot')
    .lean();

  const byId = new Map(rows.map((row) => [String(row._id), row]));
  const ordered = eventIds.map((id) => byId.get(id)).filter(Boolean);

  const targets = onlyTagless
    ? ordered.filter((row) => !eventHasTags(row.customFields?.pivot?.tags))
    : ordered;

  logSuggest('info', 'suggest-and-apply start', {
    tenantKey,
    requestedCount: eventIds.length,
    foundCount: ordered.length,
    targetCount: targets.length,
    onlyTagless,
  });

  if (!targets.length) {
    return {
      data: {
        attempted: 0,
        updated: 0,
        failed: 0,
        skipped: eventIds.length,
        results: [],
      },
    };
  }

  const suggestPayloads = targets.map((row) => {
    const pivot = row.customFields?.pivot || {};
    return {
      name: row.name,
      description: row.description,
      location: row.location,
      hostName: pivot.host?.name,
      sourceTags: Array.isArray(pivot.sourceTags) ? pivot.sourceTags : undefined,
    };
  });

  const suggestResult = await suggestPivotEventTagsBatch(req, suggestPayloads, {
    concurrency: options.concurrency,
  });
  if (
    suggestResult.error &&
    !(Number(suggestResult.data?.suggestedCount) > 0)
  ) {
    return suggestResult;
  }

  const suggestions = suggestResult.data?.suggestions || [];
  const applyJobs = [];
  const results = [];

  for (let index = 0; index < targets.length; index += 1) {
    const row = targets[index];
    const eventId = String(row._id);
    const tags = (suggestions[index]?.tags || []).filter(
      (tag) => typeof tag === 'string' && tag.trim(),
    );
    if (!tags.length) {
      results.push({
        eventId,
        name: row.name || null,
        status: 'failed',
        code: 'NO_TAGS_SUGGESTED',
        tags: [],
      });
      continue;
    }
    applyJobs.push({ eventId, name: row.name || null, tags, resultIndex: results.length });
    results.push({
      eventId,
      name: row.name || null,
      status: 'pending',
      tags,
    });
  }

  await mapWithConcurrency(applyJobs, applyConcurrency, async (job) => {
    const patch = await updateIngestEvent(req, {
      tenantKey,
      eventId: job.eventId,
      overrides: { tags: job.tags },
    });
    if (patch.error) {
      results[job.resultIndex] = {
        eventId: job.eventId,
        name: job.name,
        status: 'failed',
        code: patch.code || 'APPLY_FAILED',
        message: patch.error,
        tags: job.tags,
      };
      return;
    }
    results[job.resultIndex] = {
      eventId: job.eventId,
      name: job.name,
      status: 'updated',
      tags: job.tags,
    };
  });

  const updated = results.filter((entry) => entry.status === 'updated').length;
  const failed = results.filter((entry) => entry.status === 'failed').length;

  logSuggest('info', 'suggest-and-apply complete', {
    tenantKey,
    attempted: targets.length,
    updated,
    failed,
  });

  if (updated === 0 && failed > 0) {
    return {
      error: results.find((entry) => entry.message)?.message || 'Unable to suggest and apply tags.',
      status: suggestResult.status || 400,
      code: results.find((entry) => entry.code)?.code || 'SUGGEST_AND_APPLY_FAILED',
      data: {
        attempted: targets.length,
        updated: 0,
        failed,
        skipped: eventIds.length - targets.length,
        results,
        suggestFailures: suggestResult.data?.failures || [],
      },
    };
  }

  return {
    data: {
      attempted: targets.length,
      updated,
      failed,
      skipped: eventIds.length - targets.length,
      results,
      suggestFailures: suggestResult.data?.failures || [],
      concurrency: suggestResult.data?.concurrency,
    },
  };
}

module.exports = {
  suggestPivotEventTags,
  suggestPivotEventTagsBatch,
  suggestAndApplyPivotEventTags,
  buildTagSuggestionPrompt,
  parseTagsFromClaudeText,
  resolveAnthropicApiKey,
  resolveBatchConcurrency,
  mapWithConcurrency,
};
