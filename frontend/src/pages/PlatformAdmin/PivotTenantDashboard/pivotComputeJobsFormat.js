import { PIVOT_TENANT_PAGES } from './pivotTenantPageRoutes';

export const PIVOT_TENANT_COMPUTE_JOBS_PAGE = PIVOT_TENANT_PAGES.computeJobs;
export const PIVOT_FLEET_COMPUTE_JOBS_PAGE = 3;
export const PIVOT_TENANT_CAROUSEL_PAGE = PIVOT_TENANT_PAGES.carousel;

export const COMPUTE_JOB_KINDS = Object.freeze([
  'city-source-discovery',
  'city-curation-refresh',
]);

export const COMPUTE_JOB_FILTER_KINDS = Object.freeze([
  ...COMPUTE_JOB_KINDS,
  'carousel-export',
]);

export const COMPUTE_JOB_STATUSES = Object.freeze([
  'pending',
  'leased',
  'running',
  'review-required',
  'applying',
  'completed',
  'retryable',
  'failed',
  'cancelled',
  'expired',
]);

export const ACTIVE_COMPUTE_JOB_STATUSES = Object.freeze([
  'pending',
  'leased',
  'running',
  'applying',
]);

const KIND_LABELS = Object.freeze({
  'city-source-discovery': 'Source discovery',
  'city-curation-refresh': 'Curation refresh',
  'carousel-export': 'Carousel export',
});

const ORIGIN_LABELS = Object.freeze({
  admin: 'Admin request',
  schedule: 'Scheduled',
  'manual-upload': 'Manual upload',
});

const STATUS_PILL_CLASS = Object.freeze({
  pending: 'pivot-lab__pill--muted',
  leased: 'pivot-lab__pill--info',
  running: 'pivot-lab__pill--info',
  'review-required': 'pivot-lab__pill--warn',
  applying: 'pivot-lab__pill--info',
  completed: 'pivot-lab__pill--ok',
  retryable: 'pivot-lab__pill--warn',
  failed: 'pivot-lab__pill--warn',
  cancelled: 'pivot-lab__pill--muted',
  expired: 'pivot-lab__pill--muted',
});

const SENSITIVE_KEYS = new Set([
  'token',
  'leaseToken',
  'credential',
  'credentials',
  'password',
  'apiKey',
  'secret',
  'embedded',
  'diagnostics',
  'logs',
  'memory',
  'mutex',
]);

export function formatComputeJobKind(kind) {
  return KIND_LABELS[kind] || kind || '—';
}

export function formatComputeJobOrigin(origin) {
  if (!origin || typeof origin !== 'object') return '—';
  const label = ORIGIN_LABELS[origin.type] || origin.type || '—';
  if (origin.type === 'admin' && origin.requestedBy) {
    return `${label} · ${origin.requestedBy}`;
  }
  if (origin.type === 'manual-upload' && origin.requestedBy) {
    return `${label} · ${origin.requestedBy}`;
  }
  if (origin.type === 'schedule' && origin.scheduleId) {
    return `${label} · ${origin.scheduleId}`;
  }
  return label;
}

export function formatComputeJobStatus(status) {
  if (!status) return { label: '—', pillClass: '' };
  const label = String(status).replace(/-/g, ' ');
  return {
    label: label.charAt(0).toUpperCase() + label.slice(1),
    pillClass: STATUS_PILL_CLASS[status] || '',
  };
}

export function formatAge(iso, nowMs = Date.now()) {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return '—';
  const mins = Math.round((nowMs - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

export function formatTimestamp(iso) {
  if (!iso) return '—';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString();
}

export function formatProgress(progress) {
  if (!progress || typeof progress !== 'object') return '—';
  const parts = [];
  if (progress.phase) parts.push(progress.phase);
  if (progress.message) parts.push(progress.message);
  const counters = progress.counters && typeof progress.counters === 'object'
    ? Object.entries(progress.counters)
      .slice(0, 5)
      .map(([key, value]) => `${key}: ${value}`)
    : [];
  if (counters.length) parts.push(counters.join(', '));
  return parts.length ? parts.join(' · ') : '—';
}

export function formatFailure(failure, { maxLength = 240 } = {}) {
  if (!failure || typeof failure !== 'object') return '—';
  const code = failure.code ? String(failure.code) : '';
  const message = failure.message ? String(failure.message) : '';
  const combined = [code, message].filter(Boolean).join(': ');
  if (!combined) return '—';
  if (combined.length <= maxLength) return combined;
  return `${combined.slice(0, maxLength - 1)}…`;
}

export function resolveWorkerId(job) {
  if (!job || typeof job !== 'object') return '—';
  if (job.lease?.workerId) return job.lease.workerId;
  return '—';
}

export function resolveScheduleOccurrenceId(job) {
  if (!job || typeof job !== 'object') return '—';
  return job.scheduleOccurrenceId
    || job.origin?.scheduleOccurrenceId
    || '—';
}

export function isActiveComputeJob(job) {
  return Boolean(job?.status && ACTIVE_COMPUTE_JOB_STATUSES.includes(job.status));
}

export function hasActiveComputeJobs(jobs) {
  return Array.isArray(jobs) && jobs.some(isActiveComputeJob);
}

/** Strip fields that must never appear in admin UI surfaces. */
export function redactSensitiveFields(value, depth = 0) {
  if (depth > 4 || value == null) return value;
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveFields(item, depth + 1));
  }
  if (typeof value !== 'object') return value;
  const next = {};
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key)) continue;
    next[key] = redactSensitiveFields(child, depth + 1);
  }
  return next;
}

export function summarizeStoredResult(result) {
  if (!result || typeof result !== 'object') return null;
  return {
    mode: result.mode || null,
    contractVersion: result.contractVersion || null,
    submittedAt: result.submittedAt || null,
    resultIdempotencyKey: result.resultIdempotencyKey || null,
    hasEmbeddedResult: Boolean(result.hasEmbeddedResult || result.embedded),
    embeddedByteSize: result.embeddedByteSize
      ?? (result.embedded ? new Blob([JSON.stringify(result.embedded)]).size : null),
    embeddedSummary: result.embeddedSummary ?? result.embedded?.summary ?? null,
    artifactRef: result.artifactRef
      ? {
        storage: result.artifactRef.storage,
        byteSize: result.artifactRef.byteSize,
      }
      : null,
  };
}
