import { PIVOT_TENANT_CAROUSEL_PAGE, PIVOT_TENANT_COMPUTE_JOBS_PAGE } from '../pivotComputeJobsFormat';

export const CAROUSEL_EXPORT_KIND = 'carousel-export';

export function isCarouselExportUiEnabled(tenantKey, env = process.env) {
  const raw = String(env.REACT_APP_ENABLE_CAROUSEL_EXPORT ?? 'true').trim().toLowerCase();
  if (raw === 'false' || raw === '0' || raw === 'off' || raw === 'no') return false;
  const allow = String(env.REACT_APP_CAROUSEL_EXPORT_TENANTS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (!allow.length) return true;
  return allow.includes(String(tenantKey || '').trim().toLowerCase());
}

export const ARTIFACTS_EXPIRED_COPY = [
  'Export record available. Files expired after the retention period.',
  'Run another export to regenerate them.',
].join(' ');

export const ACTIVE_EXPORT_STATUSES = Object.freeze([
  'pending',
  'leased',
  'running',
  'retryable',
]);

export const EXPORT_STATE_LABELS = Object.freeze({
  creating: 'Creating job',
  'relay-notified': 'Relay notified',
  'waiting-for-worker': 'Waiting for worker',
  rendering: 'Rendering',
  uploading: 'Uploading',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
});

const UPLOAD_PHASES = new Set(['uploading', 'packaging', 'finalization']);

export function deckRevisionIso(deck) {
  if (!deck?.updatedAt) return null;
  const date = deck.updatedAt instanceof Date ? deck.updatedAt : new Date(deck.updatedAt);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function normalizeCarouselSlideNumbers(slideNumbers, slideCount) {
  if (!Array.isArray(slideNumbers) || !slideNumbers.length) return null;
  const numbers = [...new Set(slideNumbers.map((entry) => Number(entry)))].sort((left, right) => left - right);
  if (numbers.some((slide) => !Number.isInteger(slide) || slide < 1 || (slideCount != null && slide > slideCount))) {
    return null;
  }
  return numbers;
}

const IDEMPOTENCY_KEY_PATTERN = /^[a-zA-Z0-9:_-]{8,128}$/;
const IDEMPOTENCY_KEY_MAX = 128;

function sanitizeIdempotencyToken(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9:_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function carouselExportIdempotencyKey({
  tenantKey,
  deckId,
  slideNumbers,
  now = Date.now(),
  reuseKey,
} = {}) {
  if (typeof reuseKey === 'string' && IDEMPOTENCY_KEY_PATTERN.test(reuseKey)) {
    return reuseKey;
  }

  const city = sanitizeIdempotencyToken(String(tenantKey || '').trim().toLowerCase()) || 'city';
  const deck = sanitizeIdempotencyToken(deckId) || 'deck';
  const selected = Array.isArray(slideNumbers) && slideNumbers.length
    ? [...new Set(slideNumbers.map((entry) => Number(entry)))]
      .filter((slide) => Number.isInteger(slide) && slide >= 1)
      .sort((left, right) => left - right)
    : [];
  const selection = selected.length ? selected.join('-') : 'all';
  const stamp = String(Number(now));
  const prefix = `idem:carousel-${city}-${deck}-`;
  const suffix = `-${stamp}`;
  const budget = IDEMPOTENCY_KEY_MAX - prefix.length - suffix.length;
  let middle = sanitizeIdempotencyToken(selection) || 'all';
  if (budget < 1) {
    return `idem:carousel-${city}-${stamp}`.slice(0, IDEMPOTENCY_KEY_MAX);
  }
  if (middle.length > budget) middle = 'sel';
  return `${prefix}${middle}${suffix}`;
}

export function buildCarouselExportJobRequest({
  tenantKey,
  deckId,
  deckRevision,
  idempotencyKey,
  slideNumbers,
  slideCount,
  now = Date.now(),
}) {
  const cityKey = String(tenantKey || '').trim().toLowerCase();
  const stamp = Number(now);
  const selected = normalizeCarouselSlideNumbers(slideNumbers, slideCount);
  const fullDeck = Boolean(
    selected
    && Number.isInteger(slideCount)
    && selected.length === slideCount
    && selected.every((slide, index) => slide === index + 1),
  );
  return {
    contractVersion: '1',
    jobId: `job:carousel-${cityKey}-${stamp}`,
    scheduleOccurrenceId: null,
    kind: CAROUSEL_EXPORT_KIND,
    cityKey,
    implementationRevision: 'platform-admin-ui',
    contextVersion: 'ctx:carousel.pending',
    requestedAt: new Date(stamp).toISOString(),
    idempotencyKey,
    options: {
      deckId: String(deckId),
      deckRevision: String(deckRevision),
      ...(selected && !fullDeck ? { slideNumbers: selected } : {}),
    },
  };
}

export function exportSessionKey(tenantKey, deckId) {
  return `pivot-carousel-export:${tenantKey}:${deckId}`;
}

export function readExportSession(tenantKey, deckId) {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(exportSessionKey(tenantKey, deckId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      jobId: parsed.jobId || null,
      panelOpen: Boolean(parsed.panelOpen),
      createKey: parsed.createKey || null,
    };
  } catch {
    return null;
  }
}

export function writeExportSession(tenantKey, deckId, value) {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(exportSessionKey(tenantKey, deckId), JSON.stringify({
    jobId: value?.jobId || null,
    panelOpen: Boolean(value?.panelOpen),
    createKey: value?.createKey || null,
  }));
}

export function pickDeckExportJob(jobs, deckId, preferredJobId = null) {
  const rows = (Array.isArray(jobs) ? jobs : []).filter(
    (job) => job?.kind === CAROUSEL_EXPORT_KIND && job?.options?.deckId === deckId,
  );
  if (preferredJobId) {
    const preferred = rows.find((job) => job.externalJobId === preferredJobId);
    if (preferred) return preferred;
  }
  return rows[0] || null;
}

export function isExportActive(job) {
  return Boolean(job?.status && ACTIVE_EXPORT_STATUSES.includes(job.status));
}

export function artifactsExpired(job) {
  return Boolean(job?.exportArtifacts?.expired);
}

export function deriveExportUiState({ creating = false, job = null, wake = null } = {}) {
  if (creating && !job) return 'creating';
  const status = job?.status;
  if (status === 'completed') return 'completed';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'failed' || status === 'expired' || status === 'retryable') return 'failed';
  if (status === 'running') {
    return UPLOAD_PHASES.has(job.progress?.phase) ? 'uploading' : 'rendering';
  }
  if (status === 'leased') return 'waiting-for-worker';
  if (status === 'pending') {
    if (wake?.status === 'accepted') return 'relay-notified';
    return wake ? 'waiting-for-worker' : 'relay-notified';
  }
  return creating ? 'creating' : null;
}

export function formatExportProgress(job, uiState) {
  const message = job?.progress?.message || '';
  const slide = message.match(/slide (\d+) of (\d+)/i);
  if (uiState === 'rendering' && slide) {
    return `Rendering slide ${slide[1]} of ${slide[2]}`;
  }
  const pngs = message.match(/(\d+) PNGs uploaded/i);
  if (pngs) return `${pngs[1]} PNGs uploaded`;
  const files = message.match(/(\d+) files uploaded/i);
  if (files) {
    const uploaded = Number(files[1]);
    const pngCount = Math.max(0, uploaded - 1);
    return pngCount > 0 ? `${pngCount} PNGs uploaded` : `${uploaded} files uploaded`;
  }
  const counters = job?.progress?.counters && typeof job.progress.counters === 'object'
    ? job.progress.counters
    : {};
  if (uiState === 'rendering' && Number.isFinite(counters.rendered) && Number.isFinite(counters.slideCount)) {
    const current = Math.min(Math.max(counters.rendered, 1), counters.slideCount);
    return `Rendering slide ${current} of ${counters.slideCount}`;
  }
  if (uiState === 'uploading' && Number.isFinite(counters.uploaded)) {
    const zipSlot = Number.isFinite(counters.artifactCount) && counters.artifactCount > 1 ? 1 : 0;
    const pngCount = Number.isFinite(counters.artifactCount)
      ? Math.min(counters.uploaded, Math.max(counters.artifactCount - zipSlot, 0))
      : counters.uploaded;
    return `${pngCount} PNGs uploaded`;
  }
  return EXPORT_STATE_LABELS[uiState] || '';
}

export function exportFailureLabel(job) {
  const phase = job?.progress?.phase || '';
  const message = job?.failure?.message || '';
  const code = job?.failure?.code || '';
  const haystack = `${phase} ${message} ${code}`;
  const status = job?.status || '';
  if (/finaliz|ARTIFACT/i.test(haystack)) return 'Finalization failed';
  if (/upload|presign/i.test(haystack)) return 'Uploading failed';
  if (/render|playwright|revision|screenshot|loading/i.test(haystack)) return 'Rendering failed';
  if (
    /queue|wake|lease|claim/i.test(haystack)
    || status === 'pending'
    || status === 'leased'
    || status === 'expired'
  ) {
    return 'Queue failed';
  }
  return message || 'Export failed';
}

export function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDurationMs(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value < 0) return null;
  const seconds = Math.round(value / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

export function zipArtifact(job) {
  return (job?.exportArtifacts?.artifacts || []).find((entry) => entry.mimeType === 'application/zip') || null;
}

export function slideArtifacts(job) {
  return (job?.exportArtifacts?.artifacts || [])
    .filter((entry) => entry.mimeType === 'image/png')
    .slice()
    .sort((left, right) => (left.slideNumber || 0) - (right.slideNumber || 0));
}

export function renderedRevision(job) {
  return job?.result?.renderedDeckRevision || job?.options?.deckRevision || null;
}

export function exportDurationLabel(job) {
  if (Number.isFinite(job?.result?.renderDurationMs)) {
    return formatDurationMs(job.result.renderDurationMs);
  }
  const started = Date.parse(job?.startedAt);
  const ended = Date.parse(job?.completedAt);
  if (Number.isFinite(started) && Number.isFinite(ended) && ended >= started) {
    return formatDurationMs(ended - started);
  }
  return null;
}

export function isRevisionStale(job, currentRevision) {
  const exported = job?.options?.deckRevision;
  return Boolean(exported && currentRevision && exported !== currentRevision);
}

export function exportArtifactTotals(job) {
  const artifacts = job?.exportArtifacts?.artifacts || [];
  const pngCount = artifacts.filter((entry) => entry.mimeType === 'image/png').length;
  const totalBytes = artifacts.reduce((sum, entry) => sum + (Number(entry.byteCount) || 0), 0);
  return {
    artifactCount: artifacts.length,
    pngCount,
    totalBytes,
  };
}

export function carouselEditorHref(job) {
  const tenantKey = job?.tenantKey || job?.cityKey;
  if (!tenantKey) return null;
  const params = new URLSearchParams({ page: String(PIVOT_TENANT_CAROUSEL_PAGE) });
  if (job?.options?.deckId) params.set('deckId', job.options.deckId);
  return `/platform-admin/pivot/${encodeURIComponent(tenantKey)}?${params}`;
}

export function carouselComputeJobsHref(job) {
  const tenantKey = job?.tenantKey || job?.cityKey;
  const jobId = job?.externalJobId;
  if (!tenantKey || !jobId) return null;
  const params = new URLSearchParams({
    page: String(PIVOT_TENANT_COMPUTE_JOBS_PAGE),
    computeJobId: jobId,
  });
  return `/platform-admin/pivot/${encodeURIComponent(tenantKey)}?${params}`;
}

export function startBrowserDownload(url, filename) {
  if (!url || typeof document === 'undefined') return;
  const link = document.createElement('a');
  link.href = url;
  if (filename) link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
