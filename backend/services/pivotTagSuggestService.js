const axios = require('axios');
const {
  listPivotTags,
  validatePivotEventTags,
} = require('./pivotTagCatalogService');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 256;
const REQUEST_TIMEOUT_MS = 20_000;
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

  const catalogResult = await listPivotTags(req);
  if (catalogResult.error) {
    logSuggest('warn', 'catalog lookup failed', {
      message: catalogResult.error,
      code: catalogResult.code,
      hasGlobalDb: Boolean(req.globalDb),
    });
    return catalogResult;
  }

  const catalogTags = catalogResult.data?.tags || [];
  logSuggest('info', 'catalog loaded', { activeTagCount: catalogTags.length });
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

    const validated = await validatePivotEventTags(req, rawTags, { required: true });
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
        data: { rawTags, model: resolveClaudeModel(), responsePreview: truncateForLog(responseText, 240) },
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
      logSuggest('warn', 'claude model not found', { model: resolveClaudeModel(), modelMessage });
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
        error: 'Claude API rejected the API key.',
        status: 502,
        code: 'LLM_AUTH_FAILED',
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

async function suggestPivotEventTagsBatch(req, rawEvents = []) {
  const events = Array.isArray(rawEvents) ? rawEvents : [];
  logSuggest('info', 'batch suggest start', { eventCount: events.length });
  if (!events.length) {
    return {
      error: 'At least one event is required.',
      status: 400,
      code: 'EVENTS_REQUIRED',
    };
  }

  const suggestions = [];
  const failures = [];

  for (let index = 0; index < events.length; index += 1) {
    const rawEvent = events[index];
    const result = await suggestPivotEventTags(req, rawEvent, { batchIndex: index });
    if (result.error) {
      failures.push({
        index,
        name: trimString(rawEvent?.name) || null,
        message: result.error,
        code: result.code,
      });
      suggestions.push({ tags: [] });
      continue;
    }

    suggestions.push({ tags: result.data.tags, model: result.data.model });
  }

  const suggestedCount = suggestions.filter((entry) => entry.tags?.length).length;
  logSuggest('info', 'batch suggest complete', {
    eventCount: events.length,
    suggestedCount,
    failedCount: failures.length,
    failures: failures.map((entry) => ({ index: entry.index, code: entry.code, name: entry.name })),
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
    },
  };
}

module.exports = {
  suggestPivotEventTags,
  suggestPivotEventTagsBatch,
  buildTagSuggestionPrompt,
  parseTagsFromClaudeText,
  resolveAnthropicApiKey,
};
