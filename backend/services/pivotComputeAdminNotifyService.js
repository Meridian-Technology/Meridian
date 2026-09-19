/**
 * Best-effort platform-admin notifications for persisted Pivot compute jobs.
 *
 * Notification delivery deliberately never participates in a compute-job state
 * transition.  The notification entry is reserved on the job before Resend is
 * called, making independently scheduled hooks safe to retry without sending
 * duplicate messages.
 */
const getGlobalModels = require('./getGlobalModelService');
const { getResend } = require('./resendClient');
const { listPlatformAdmins } = require('./platformAdminInviteService');
const { computeJobInspectorHref } = require('../utilities/pivotAdminHrefs');
const { logPivot } = require('../utilities/pivotLogger');

const NOTIFICATION_TYPES = Object.freeze([
  'review-required',
  'apply-complete',
  'failed',
  'carousel-complete',
]);
const MAX_MANIFEST_EMAIL_ROWS = 15;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function resolveFrontendBaseUrl() {
  const configured = typeof process.env.FRONTEND_URL === 'string' ? process.env.FRONTEND_URL.trim() : '';
  if (configured) return configured.replace(/\/$/, '');
  return process.env.NODE_ENV === 'production' ? 'https://www.meridian.study' : 'http://localhost:3000';
}

function buildAbsoluteUrl(href) {
  return `${resolveFrontendBaseUrl()}${href.startsWith('/') ? '' : '/'}${href}`;
}

async function resolveAdminEmails(req) {
  const { admins = [] } = await listPlatformAdmins(req);
  return [...new Set(admins
    .map((admin) => typeof admin?.email === 'string' ? admin.email.trim().toLowerCase() : '')
    .filter((email) => email.includes('@')),
  )];
}

function summaryFromJob(job) {
  const summary = job?.applicationAudit?.summary || {};
  return Object.fromEntries(['creates', 'updates', 'unchanged', 'conflicts', 'stale', 'rejected', 'skipped']
    .map((key) => [key, Number(summary[key] || 0)]));
}

function buildNotifyPayload({ job, tenant, type } = {}) {
  const tenantKey = String(job?.tenantKey || tenant?.tenantKey || '').trim().toLowerCase();
  const cityDisplayName = tenant?.location || tenant?.name || tenant?.displayName || tenantKey || 'Just Go';
  const inspectorHref = computeJobInspectorHref(tenantKey, job?.externalJobId || '');
  const result = job?.result?.embedded || job?.result || null;
  const audit = job?.applicationAudit || {};
  const rows = Array.isArray(audit.rows) ? audit.rows.slice(0, MAX_MANIFEST_EMAIL_ROWS) : [];
  const buckets = Array.isArray(audit.buckets) ? audit.buckets : [];
  const labels = {
    'review-required': 'Compute job needs review',
    'apply-complete': 'Compute job applied',
    failed: 'Compute job failed',
    'carousel-complete': 'Carousel export complete',
  };
  const label = labels[type] || 'Compute job update';
  return {
    type,
    tenantKey,
    cityDisplayName,
    externalJobId: job?.externalJobId || null,
    kind: job?.kind || null,
    status: job?.status || null,
    failure: job?.failure || null,
    result,
    applicationAudit: audit,
    summary: summaryFromJob(job),
    buckets,
    rows,
    rowOverflowCount: Number(audit.rowOverflowCount || 0),
    inspectorHref,
    inspectorUrl: buildAbsoluteUrl(inspectorHref),
    subject: `${label} — ${cityDisplayName}`,
  };
}

function buildBucketTable(buckets) {
  if (!buckets.length) return '<p>No apply buckets were recorded.</p>';
  const lines = buckets.map((bucket) => `<tr><td>${escapeHtml(bucket.entityType)}</td><td>${escapeHtml(bucket.disposition)}</td><td>${escapeHtml(bucket.ingestStatus || '—')}</td><td>${escapeHtml(bucket.batchWeek || '—')}</td><td>${escapeHtml(bucket.count)}</td></tr>`).join('');
  return `<table style="width:100%;border-collapse:collapse"><thead><tr><th>Type</th><th>Disposition</th><th>Status</th><th>Week</th><th>Count</th></tr></thead><tbody>${lines}</tbody></table>`;
}

function buildManifestRows(rows, overflow) {
  if (!rows.length) return '';
  const lines = rows.map((row) => `<tr><td>${escapeHtml(row.name || '—')}</td><td>${escapeHtml(row.disposition)}</td><td>${escapeHtml(row.ingestStatus || '—')}</td><td>${escapeHtml(row.message || '')}</td></tr>`).join('');
  const more = overflow ? `<p>${escapeHtml(overflow)} additional rows are available in the inspector.</p>` : '';
  return `<h3>Event results</h3><table style="width:100%;border-collapse:collapse"><thead><tr><th>Event</th><th>Outcome</th><th>Status</th><th>Note</th></tr></thead><tbody>${lines}</tbody></table>${more}`;
}

function buildNotifyEmailHtml(payload) {
  let detail;
  if (payload.type === 'apply-complete') {
    detail = `<h3>Apply summary</h3>${buildBucketTable(payload.buckets)}${buildManifestRows(payload.rows, payload.rowOverflowCount)}`;
  } else if (payload.type === 'failed') {
    detail = `<p><strong>${escapeHtml(payload.failure?.code || 'Compute failure')}</strong>: ${escapeHtml(payload.failure?.message || 'No failure message was recorded.')}</p>`;
  } else if (payload.type === 'review-required') {
    const resultSummary = payload.result?.summary || payload.result?.message || payload.result?.status || 'A stored result is ready for administrator review.';
    detail = `<p>${escapeHtml(typeof resultSummary === 'string' ? resultSummary : JSON.stringify(resultSummary))}</p>`;
  } else {
    detail = '<p>The carousel export completed successfully and is ready to inspect.</p>';
  }
  return `<div style="font-family:sans-serif;max-width:680px;margin:0 auto;color:#1A1714"><h2>${escapeHtml(payload.subject)}</h2><p>City: <strong>${escapeHtml(payload.cityDisplayName)}</strong> · Job: ${escapeHtml(payload.externalJobId || '—')}</p>${detail}<p><a href="${escapeHtml(payload.inspectorUrl)}" style="display:inline-block;padding:12px 20px;background:#FF4F1F;color:#fff;text-decoration:none;font-weight:600">Open compute job</a></p></div>`;
}

function notifyEnabled(policy) {
  return policy?.notifyAdminsEmail !== false && process.env.DISABLE_PIVOT_COMPUTE_ADMIN_EMAILS !== 'true';
}

async function reserveNotification(req, externalJobId, type, recipientCount) {
  const { PivotComputeJob } = getGlobalModels(req, 'PivotComputeJob');
  return PivotComputeJob.findOneAndUpdate(
    { externalJobId, 'notifications.email.type': { $ne: type } },
    { $push: { 'notifications.email': { type, sentAt: new Date(), recipientCount } } },
    { new: true },
  );
}

/** Send one deduplicated compute-job email. Never throws to the caller. */
async function notifyAdminsOnComputeJob(req, { job: suppliedJob, tenant, policy, type } = {}) {
  try {
    if (!NOTIFICATION_TYPES.includes(type)) return { skipped: true, reason: 'invalid_type' };
    if (!notifyEnabled(policy || tenant?.pivotComputeApply)) return { skipped: true, reason: 'notifications_disabled' };
    let job = suppliedJob;
    if (!job?.externalJobId) return { skipped: true, reason: 'missing_job' };

    // Reserve before resolving recipients/sending. A zero-recipient reservation is
    // intentional: it prevents a later duplicate hook from emailing stale events.
    const reserved = await reserveNotification(req, job.externalJobId, type, 0);
    if (!reserved) return { skipped: true, reason: 'already_notified' };
    job = typeof reserved.toObject === 'function' ? reserved.toObject() : reserved;
    const payload = buildNotifyPayload({ job, tenant, type });
    const resend = getResend();
    if (!resend) return { skipped: true, reason: 'resend_unavailable', payload };
    const recipients = await resolveAdminEmails(req);
    if (!recipients.length) return { skipped: true, reason: 'no_recipients', payload };
    const response = await resend.emails.send({ from: 'Just Go <support@meridian.study>', to: recipients, subject: payload.subject, html: buildNotifyEmailHtml(payload) });
    if (response?.error) return { skipped: true, reason: 'send_failed', payload };
    // Keep the original reservation's sentAt; only enrich recipient count.
    const { PivotComputeJob } = getGlobalModels(req, 'PivotComputeJob');
    await PivotComputeJob.updateOne({ externalJobId: job.externalJobId, 'notifications.email.type': type }, { $set: { 'notifications.email.$.recipientCount': recipients.length } });
    return { skipped: false, emailed: true, payload, recipientCount: recipients.length };
  } catch (error) {
    logPivot('warn', 'compute job admin notify failed', { externalJobId: suppliedJob?.externalJobId, type, message: error?.message });
    return { skipped: true, reason: 'notify_error', error: error?.message };
  }
}

module.exports = {
  MAX_MANIFEST_EMAIL_ROWS,
  NOTIFICATION_TYPES,
  resolveAdminEmails,
  buildNotifyPayload,
  buildNotifyEmailHtml,
  notifyAdminsOnComputeJob,
  notifyAdminsOnComputeJobApplied: (req, options = {}) => notifyAdminsOnComputeJob(req, { ...options, type: 'apply-complete' }),
};
