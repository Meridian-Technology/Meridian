/**
 * Best-effort platform-admin alerts when a Meridian notification job fails
 * terminally. Email goes to listPlatformAdmins; Expo push uses pivot tokens on
 * the ops tenant (MERIDIAN_OPS_TENANT_KEY, default sf).
 *
 * Dedupes with failureAlertSentAt. Never throws to the worker.
 */
const { connectToDatabase, connectToGlobalDatabase } = require('../connectionsManager');
const getGlobalModels = require('./getGlobalModelService');
const getModels = require('./getModelService');
const { getResend } = require('./resendClient');
const { listPlatformAdmins } = require('./platformAdminInviteService');
const { sendExpoPushToRecipients } = require('./expoPushDeliveryService');
const { notificationJobRunHref } = require('../utilities/pivotAdminHrefs');
const { logPivot } = require('../utilities/pivotLogger');

const DEFAULT_MERIDIAN_OPS_TENANT_KEY = 'sf';
const PUSH_BODY_MAX = 240;

function getMeridianOpsTenantKey(env = process.env) {
  const raw = env.MERIDIAN_OPS_TENANT_KEY || DEFAULT_MERIDIAN_OPS_TENANT_KEY;
  return String(raw).trim().toLowerCase() || DEFAULT_MERIDIAN_OPS_TENANT_KEY;
}

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
    .map((admin) => (typeof admin?.email === 'string' ? admin.email.trim().toLowerCase() : ''))
    .filter((email) => email.includes('@')),
  )];
}

function leanDoc(doc) {
  if (!doc) return null;
  if (typeof doc.toObject === 'function') return doc.toObject();
  return doc;
}

function buildMeridianOpsNotifyPayload(run) {
  const row = leanDoc(run) || {};
  const tenantKey = String(row.tenantKey || '').trim().toLowerCase();
  const runId = row._id ? String(row._id) : (row.id ? String(row.id) : '');
  const batchWeek = row.payload?.batchWeek || null;
  const inspectorHref = notificationJobRunHref(tenantKey, runId, batchWeek);
  const type = row.type || 'notification_job';
  const lastError = row.lastError || 'No failure message was recorded.';
  return {
    runId,
    runKey: row.runKey || null,
    type,
    tenantKey,
    status: row.status || 'failed',
    lastError,
    attemptCount: row.attemptCount || 0,
    maxAttempts: row.maxAttempts || 3,
    batchWeek,
    inspectorHref,
    inspectorUrl: buildAbsoluteUrl(inspectorHref),
    subject: `Notification job failed — ${tenantKey || 'unknown'} · ${type}`,
  };
}

function buildMeridianOpsNotifyEmailHtml(payload) {
  return `<div style="font-family:sans-serif;max-width:680px;margin:0 auto;color:#1A1714"><h2>${escapeHtml(payload.subject)}</h2><p>City: <strong>${escapeHtml(payload.tenantKey || '—')}</strong> · Type: <code>${escapeHtml(payload.type)}</code></p><p>Attempts: ${escapeHtml(payload.attemptCount)} / ${escapeHtml(payload.maxAttempts)}</p><p><strong>Error:</strong> ${escapeHtml(payload.lastError)}</p><p>Run key: <code>${escapeHtml(payload.runKey || '—')}</code></p><p><a href="${escapeHtml(payload.inspectorUrl)}" style="display:inline-block;padding:12px 20px;background:#FF4F1F;color:#fff;text-decoration:none;font-weight:600">Open Notifications run</a></p></div>`;
}

function buildOpsFailurePushMessage(pushToken, payload) {
  const body = String(`${payload.type} · ${payload.tenantKey}: ${payload.lastError}`).slice(0, PUSH_BODY_MAX);
  return {
    to: pushToken,
    sound: 'default',
    title: 'Notification job failed',
    body,
    data: {
      pushType: 'meridian_job_failure',
      runId: payload.runId,
      tenantKey: payload.tenantKey,
      type: payload.type,
    },
    priority: 'high',
    channelId: 'default',
  };
}

async function resolveNotifyReq(req) {
  if (req?.globalDb) return req;
  const globalDb = await connectToGlobalDatabase();
  return { ...(req || {}), globalDb };
}

async function resolveOpsTenantReq(req, opsTenantKey) {
  const jobReq = await resolveNotifyReq(req);
  if (jobReq.db && String(jobReq.school || '').trim().toLowerCase() === opsTenantKey) {
    return jobReq;
  }
  const db = await connectToDatabase(opsTenantKey);
  return { ...jobReq, db, school: opsTenantKey };
}

async function reserveFailureAlert(req, runId, now = new Date()) {
  const { MeridianJobRun } = getGlobalModels(req, 'MeridianJobRun');
  return MeridianJobRun.findOneAndUpdate(
    { _id: runId, status: 'failed', failureAlertSentAt: null },
    { $set: { failureAlertSentAt: now } },
    { new: true },
  );
}

async function sendFailureEmail(req, payload) {
  const resend = getResend();
  if (!resend) return { emailed: false, reason: 'resend_unavailable' };
  const recipients = await resolveAdminEmails(req);
  if (!recipients.length) return { emailed: false, reason: 'no_recipients', recipientCount: 0 };
  const response = await resend.emails.send({
    from: 'Just Go <support@meridian.study>',
    to: recipients,
    subject: payload.subject,
    html: buildMeridianOpsNotifyEmailHtml(payload),
  });
  if (response?.error) return { emailed: false, reason: 'send_failed', recipientCount: recipients.length };
  return { emailed: true, recipientCount: recipients.length };
}

async function sendFailurePush(req, payload) {
  const opsTenantKey = getMeridianOpsTenantKey();
  const { admins = [] } = await listPlatformAdmins(req);
  const seen = new Set();
  const adminIds = [];
  admins.forEach((admin) => {
    const id = admin?.globalUserId;
    if (!id) return;
    const key = String(id);
    if (seen.has(key)) return;
    seen.add(key);
    adminIds.push(id);
  });
  if (!adminIds.length) {
    return { pushed: false, reason: 'no_admin_ids', sent: 0 };
  }

  const { TenantMembership } = getGlobalModels(req, 'TenantMembership');
  const memberships = await TenantMembership.find({
    tenantKey: opsTenantKey,
    status: 'active',
    globalUserId: { $in: adminIds },
  }).lean();
  const tenantUserIds = memberships.map((row) => row.tenantUserId).filter(Boolean);
  if (!tenantUserIds.length) {
    return { pushed: false, reason: 'no_ops_memberships', sent: 0, opsTenantKey };
  }

  const opsReq = await resolveOpsTenantReq(req, opsTenantKey);
  const { User } = getModels(opsReq, 'User');
  const users = await User.find({
    _id: { $in: tenantUserIds },
    pushToken: { $exists: true, $nin: [null, ''] },
  })
    .select('_id username name pushToken pushAppProduct roles')
    .lean();
  if (!users.length) {
    return { pushed: false, reason: 'no_tokens', sent: 0, opsTenantKey };
  }

  const messages = users.map((user) => buildOpsFailurePushMessage(user.pushToken, payload));
  const result = await sendExpoPushToRecipients(opsTenantKey, users, messages);
  return {
    pushed: (result?.sent || 0) > 0,
    sent: result?.sent || 0,
    failed: result?.failed || 0,
    developmentGateBlocked: result?.developmentGateBlocked || 0,
    opsTenantKey,
  };
}

async function notifyMeridianJobTerminalFailure(req, { run: suppliedRun, runId } = {}) {
  try {
    const id = runId || suppliedRun?._id || suppliedRun?.id;
    if (!id) return { skipped: true, reason: 'missing_run' };

    const jobReq = await resolveNotifyReq(req);
    const reserved = await reserveFailureAlert(jobReq, id);
    if (!reserved) {
      return { skipped: true, reason: 'already_notified' };
    }

    const payload = buildMeridianOpsNotifyPayload(reserved);
    let email = { emailed: false, reason: 'not_attempted' };
    try {
      email = await sendFailureEmail(jobReq, payload);
    } catch (error) {
      logPivot('warn', 'meridian job ops email failed', {
        runId: payload.runId,
        message: error?.message,
      });
      email = { emailed: false, reason: 'send_error', error: error?.message };
    }
    let push = { pushed: false, reason: 'not_attempted', sent: 0 };
    try {
      push = await sendFailurePush(jobReq, payload);
    } catch (error) {
      logPivot('warn', 'meridian job ops push failed', {
        runId: payload.runId,
        message: error?.message,
      });
      push = { pushed: false, reason: 'push_error', error: error?.message, sent: 0 };
    }

    return {
      skipped: false,
      payload,
      email,
      push,
    };
  } catch (error) {
    logPivot('warn', 'meridian job ops notify failed', {
      runId: suppliedRun?._id || runId || null,
      message: error?.message,
    });
    return { skipped: true, reason: 'notify_error', error: error?.message };
  }
}

module.exports = {
  DEFAULT_MERIDIAN_OPS_TENANT_KEY,
  getMeridianOpsTenantKey,
  buildMeridianOpsNotifyPayload,
  buildMeridianOpsNotifyEmailHtml,
  notifyMeridianJobTerminalFailure,
};
