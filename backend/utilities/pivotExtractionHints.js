/**
 * Durable, operator-authored learning for generic calendar extraction.
 *
 * Hints are deliberately plain strings: they are safe to append to an LLM
 * prompt and remain useful when a source changes its markup.  Keep the bounds
 * here (rather than at each caller) so a bad catalog edit cannot grow a job or
 * source document without limit.
 */
const MAX_PROMPT_HINTS = 30;
const MAX_PROMPT_HINT_LENGTH = 600;
const MAX_PROMPT_HINT_BYTES = 12 * 1024;

const INGEST_FIELD_LOCK_FIELDS = [
  'start_time',
  'end_time',
  'location',
  'description',
  'image',
  'sourceUrl',
  'hostName',
];

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function truncateUtf8(value, maxBytes) {
  let text = String(value || '');
  while (text && Buffer.byteLength(text, 'utf8') > maxBytes) {
    text = text.slice(0, -1);
  }
  return text;
}

function normalizePromptHint(value, options = {}) {
  const maxLength = options.maxHintLength ?? MAX_PROMPT_HINT_LENGTH;
  const maxBytes = options.maxHintBytes ?? MAX_PROMPT_HINT_BYTES;
  const collapsed = trimString(value).replace(/\s+/g, ' ');
  if (!collapsed) return null;
  return truncateUtf8(collapsed.slice(0, maxLength), Math.min(maxBytes, maxLength * 4)) || null;
}

/**
 * Merge, case-insensitively dedupe, and bound prompt hints. Existing hints
 * win, so an operator's earlier instruction is not silently displaced by a
 * later duplicate with different capitalization.
 */
function mergeExtractionHints(existingHints, additions, options = {}) {
  const maxHints = options.maxHints ?? MAX_PROMPT_HINTS;
  const maxBytes = options.maxBytes ?? MAX_PROMPT_HINT_BYTES;
  const values = [
    ...(Array.isArray(existingHints) ? existingHints : []),
    ...(Array.isArray(additions) ? additions : additions == null ? [] : [additions]),
  ];
  const merged = [];
  const seen = new Set();
  let usedBytes = 2; // JSON array brackets, for the persisted representation.

  for (const value of values) {
    const hint = normalizePromptHint(value, { ...options, maxHintBytes: maxBytes });
    if (!hint) continue;
    const key = hint.toLocaleLowerCase();
    if (seen.has(key) || merged.length >= maxHints) continue;
    const nextBytes = Buffer.byteLength(JSON.stringify(hint), 'utf8') + (merged.length ? 1 : 0);
    if (usedBytes + nextBytes > maxBytes) continue;
    seen.add(key);
    merged.push(hint);
    usedBytes += nextBytes;
  }
  return merged;
}

function valueForField(row, field) {
  const pivot = row?.customFields?.pivot || row?.pivot || {};
  switch (field) {
    case 'start_time': return row?.start_time ?? row?.startTime;
    case 'end_time': return row?.end_time ?? row?.endTime;
    case 'location': return row?.location;
    case 'description': return row?.description;
    case 'image': return row?.image;
    case 'sourceUrl': return pivot.sourceUrl ?? row?.sourceUrl ?? row?.externalLink;
    case 'hostName': return pivot.host?.name ?? row?.hostName;
    default: return undefined;
  }
}

function displayValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value.trim();
  if (value == null) return '';
  return String(value).trim();
}

/**
 * Convert an operator correction into a concise instruction for future
 * extracts from the same calendar. Only changed, learnable fields contribute.
 */
function deriveExtractionHintsFromCatalogEdit(before, after, options = {}) {
  const fields = Array.isArray(options.fields) ? options.fields : INGEST_FIELD_LOCK_FIELDS;
  const hints = [];
  for (const field of fields) {
    if (!INGEST_FIELD_LOCK_FIELDS.includes(field)) continue;
    const previous = displayValue(valueForField(before, field));
    const next = displayValue(valueForField(after, field));
    if (!next || previous === next) continue;
    const label = field === 'hostName' ? 'host name' : field.replace('_', ' ');
    const prior = previous ? ` instead of “${truncateUtf8(previous, 180)}”` : '';
    hints.push(
      `For this calendar, prefer ${label} “${truncateUtf8(next, 240)}”${prior} when the listing is ambiguous.`,
    );
  }
  return mergeExtractionHints([], hints, options);
}

function normalizeIngestFieldLocks(rawLocks, options = {}) {
  const now = options.now || new Date();
  const actor = trimString(options.actor) || null;
  const locks = {};
  const input = rawLocks && typeof rawLocks === 'object' ? rawLocks : {};
  for (const field of INGEST_FIELD_LOCK_FIELDS) {
    const raw = input[field];
    if (!raw) continue;
    const lockedAt = raw.lockedAt ? new Date(raw.lockedAt) : now;
    locks[field] = {
      lockedAt: Number.isNaN(lockedAt.getTime()) ? now : lockedAt,
      lockedBy: trimString(raw.lockedBy) || actor,
    };
  }
  return locks;
}

module.exports = {
  MAX_PROMPT_HINTS,
  MAX_PROMPT_HINT_LENGTH,
  MAX_PROMPT_HINT_BYTES,
  INGEST_FIELD_LOCK_FIELDS,
  truncateUtf8,
  normalizePromptHint,
  mergeExtractionHints,
  deriveExtractionHintsFromCatalogEdit,
  normalizeIngestFieldLocks,
};
