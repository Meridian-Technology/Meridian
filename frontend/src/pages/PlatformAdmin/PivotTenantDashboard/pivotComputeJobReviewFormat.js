export const COMPUTE_CONTRACT_VERSION = '1';
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_PREVIEW_ROWS_SHOWN = 200;

export const PREVIEW_ACTIONS = Object.freeze([
  'create',
  'update',
  'unchanged',
  'conflict',
  'rejected',
  'stale',
]);

export const FORBIDDEN_RESULT_KEYS = Object.freeze([
  'command',
  'module',
  'filesystemPath',
  'callbackUrl',
  'callback',
  'credential',
  'credentials',
  'password',
  'apiKey',
  'secret',
  'token',
  'query',
  'sql',
  'logs',
  'memory',
  'mutex',
  'internalRunId',
  'vendorRunId',
  'relayJobId',
  'mongoConnectionString',
  'diagnostics',
  'steps',
]);

const PREVIEW_ACTION_LABELS = Object.freeze({
  create: 'Create',
  update: 'Update',
  unchanged: 'Unchanged',
  conflict: 'Conflict',
  rejected: 'Rejected',
  stale: 'Stale',
});

const PREVIEW_ACTION_PILL_CLASS = Object.freeze({
  create: 'pivot-lab__pill--ok',
  update: 'pivot-lab__pill--info',
  unchanged: 'pivot-lab__pill--muted',
  conflict: 'pivot-lab__pill--warn',
  rejected: 'pivot-lab__pill--warn',
  stale: 'pivot-lab__pill--warn',
});

const ENTITY_TYPE_LABELS = Object.freeze({
  source: 'Source',
  curationJob: 'Curation job',
  event: 'Event',
});

function normalizeCityKey(value) {
  return String(value || '').trim().toLowerCase();
}

function collectForbiddenKeys(value, path = '', found = []) {
  if (!value || typeof value !== 'object') return found;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectForbiddenKeys(item, `${path}[${index}]`, found));
    return found;
  }
  for (const [key, child] of Object.entries(value)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (FORBIDDEN_RESULT_KEYS.includes(key)) {
      found.push(nextPath);
    }
    collectForbiddenKeys(child, nextPath, found);
  }
  return found;
}

function hasRequiredEnvelopeFields(result) {
  return Boolean(
    result
    && typeof result === 'object'
    && result.contractVersion
    && result.jobId
    && result.kind
    && result.cityKey
    && result.outcome
    && result.idempotencyKey
    && result.basedOnContextVersion,
  );
}

function byteLength(text) {
  return new Blob([String(text || '')]).size;
}

export function parseUploadedResultText(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return { result: null, errors: ['Paste or upload a completed compute result JSON object.'] };
  }
  if (byteLength(trimmed) > MAX_UPLOAD_BYTES) {
    return {
      result: null,
      errors: [`JSON exceeds the ${MAX_UPLOAD_BYTES} byte upload limit.`],
    };
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { result: null, errors: ['Upload must be a single JSON object.'] };
    }
    return { result: parsed, errors: [] };
  } catch (error) {
    return { result: null, errors: ['JSON is not valid. Check brackets, quotes, and trailing commas.'] };
  }
}

export function validateParsedResult(result, { tenantKey } = {}) {
  const errors = [];
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return ['Upload must be a single JSON object.'];
  }

  if (String(result.contractVersion || '') !== COMPUTE_CONTRACT_VERSION) {
    errors.push(`Unsupported contract version "${result.contractVersion || 'missing'}". Only version 1 is accepted.`);
  }

  const forbiddenKeys = collectForbiddenKeys(result);
  if (forbiddenKeys.length) {
    errors.push(`Importable results cannot include diagnostic fields such as ${forbiddenKeys[0]}.`);
  }

  if (!hasRequiredEnvelopeFields(result)) {
    errors.push('Missing required compute result fields (jobId, kind, cityKey, outcome, idempotencyKey, basedOnContextVersion).');
  }

  if (tenantKey && result.cityKey && normalizeCityKey(result.cityKey) !== normalizeCityKey(tenantKey)) {
    errors.push(`City mismatch: result targets "${result.cityKey}" but this dashboard is scoped to "${tenantKey}".`);
  }

  if (result.outcome && result.outcome !== 'completed') {
    errors.push(`Only completed results can be previewed or submitted. This result outcome is "${result.outcome}".`);
  }

  if (result.failure && result.outcome === 'failed') {
    const code = result.failure.code || 'FAILED';
    const message = result.failure.message || 'Worker reported a failure.';
    errors.push(`${code}: ${message}`);
  }

  return errors;
}

export function validateUploadedResultText(text, options = {}) {
  const parsed = parseUploadedResultText(text);
  if (parsed.errors.length) return parsed;
  return {
    result: parsed.result,
    errors: validateParsedResult(parsed.result, options),
  };
}

export function formatPreviewAction(action) {
  return {
    label: PREVIEW_ACTION_LABELS[action] || action || '—',
    pillClass: PREVIEW_ACTION_PILL_CLASS[action] || '',
  };
}

export function formatPreviewEntityType(entityType) {
  return ENTITY_TYPE_LABELS[entityType] || entityType || '—';
}

export function formatExecutionSummary(result) {
  if (!result?.summary || typeof result.summary !== 'object') return [];
  if (result.kind === 'city-curation-refresh') {
    return [
      ['Jobs run', result.summary.jobsRun],
      ['Jobs failed', result.summary.jobsFailed],
      ['Events proposed', result.summary.eventsProposed],
      ['Events refreshed', result.summary.eventsRefreshed],
    ].filter(([, value]) => value != null);
  }
  return [
    ['Searched', result.summary.searched],
    ['Qualified', result.summary.qualified],
    ['Rejected', result.summary.rejected],
    ['Events proposed', result.summary.eventsProposed],
  ].filter(([, value]) => value != null);
}

export function formatPreviewSummary(summary) {
  if (!summary || typeof summary !== 'object') return [];
  return [
    ['Creates', summary.creates],
    ['Updates', summary.updates],
    ['Unchanged', summary.unchanged],
    ['Conflicts', summary.conflicts],
    ['Rejected', summary.rejected],
    ['Stale', summary.stale],
    ['Skipped (missing fields)', summary.skipped],
  ].filter(([, value]) => value != null);
}

export function formatEvidence(evidence) {
  if (!evidence || typeof evidence !== 'object') return '—';
  const parts = [];
  if (evidence.sourceUrl) parts.push(evidence.sourceUrl);
  if (evidence.host) parts.push(`host: ${evidence.host}`);
  if (evidence.jobId) parts.push(`job: ${evidence.jobId}`);
  return parts.length ? parts.join(' · ') : '—';
}

export function previewAllowsApply(preview) {
  return Boolean(preview?.applyAllowed);
}

export function previewBlockingMessage(preview) {
  if (!preview || preview.applyAllowed) return null;
  const reasons = Array.isArray(preview.blockingReasons) ? preview.blockingReasons : [];
  if (reasons.length) {
    return reasons.map((reason) => `${reason.code}: ${reason.message}`).join(' ');
  }
  return 'Preview does not allow apply.';
}

export function previewApplyWarnings(preview) {
  return Array.isArray(preview?.applyWarnings) ? preview.applyWarnings : [];
}

export function visiblePreviewRows(preview, limit = MAX_PREVIEW_ROWS_SHOWN) {
  const rows = Array.isArray(preview?.rows) ? preview.rows : [];
  return {
    rows: rows.slice(0, limit),
    total: rows.length,
    truncated: rows.length > limit,
  };
}
