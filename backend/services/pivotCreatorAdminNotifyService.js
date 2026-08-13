/**
 * Best-effort platform-admin notify when a Just Go creator submits a listing.
 * Never throws to callers — create must succeed even if notify fails.
 *
 * Channels: Resend email (when configured) + structured log / in-memory ops inbox stub.
 */

const getModels = require('./getModelService');
const getGlobalModels = require('./getGlobalModelService');
const { connectToDatabase } = require('../connectionsManager');
const { getResend } = require('./resendClient');
const { listPlatformAdmins } = require('./platformAdminInviteService');
const { getPivotBatch } = require('./pivotBatchService');
const { curationHref } = require('../utilities/pivotAdminHrefs');
const { PIVOT_FEED_INGEST_STATUS } = require('../utilities/pivotIngestStatus');
const { logPivot } = require('../utilities/pivotLogger');

const MAX_OPS_INBOX_STUB = 100;
/** In-memory durable stub until a real ops inbox exists (Task 2.3). */
const opsInboxStub = [];

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function resolveFrontendBaseUrl() {
  const fromEnv = typeof process.env.FRONTEND_URL === 'string'
    ? process.env.FRONTEND_URL.trim()
    : '';
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (process.env.NODE_ENV === 'production') {
    return 'https://www.meridian.study';
  }
  return 'http://localhost:3000';
}

/**
 * Deep link into Tenant Curation for the event's week.
 * Deep-link shape: filter=draft&source=justgo&eventId=… (Curation Host-created chip + drawer).
 */
function buildCreatorListingCurationHref({
  tenantKey,
  batchWeek,
  eventId,
  emphasizeLive = false,
} = {}) {
  const base = curationHref(tenantKey, batchWeek, 'draft');
  const params = new URLSearchParams();
  if (eventId) params.set('eventId', String(eventId));
  params.set('source', 'justgo');
  if (emphasizeLive) params.set('alert', 'live-week-host');
  const extra = params.toString();
  return extra ? `${base}&${extra}` : base;
}

function buildAbsoluteCurationUrl(relativeHref) {
  return `${resolveFrontendBaseUrl()}${relativeHref.startsWith('/') ? '' : '/'}${relativeHref}`;
}

async function resolveTenantDb(req, tenantKey) {
  if (req?.db && String(req.school || '').trim().toLowerCase() === tenantKey) {
    return { db: req.db, school: tenantKey };
  }
  const db = await connectToDatabase(tenantKey);
  return { db, school: tenantKey };
}

/**
 * Live week = target batchWeek already has published events OR PivotBatch status released.
 */
async function isLiveCreatorBatchWeek(req, { tenantKey, batchWeek } = {}) {
  const week = String(batchWeek || '').trim();
  const key = String(tenantKey || '')
    .trim()
    .toLowerCase();
  if (!week || !key) {
    return {
      isLive: false,
      publishedCount: 0,
      batchStatus: null,
      reasons: [],
    };
  }

  const tenantReq = await resolveTenantDb(req, key);
  const { Event } = getModels(tenantReq, 'Event');

  const [publishedCount, batchResult] = await Promise.all([
    Event.countDocuments({
      isDeleted: { $ne: true },
      'customFields.pivot.batchWeek': week,
      'customFields.pivot.ingestStatus': PIVOT_FEED_INGEST_STATUS,
    }),
    getPivotBatch(tenantReq, week).catch(() => ({ data: null })),
  ]);

  const batchStatus = batchResult?.data?.status || null;
  const reasons = [];
  if (publishedCount > 0) reasons.push('published_events');
  if (batchStatus === 'released') reasons.push('batch_released');

  return {
    isLive: reasons.length > 0,
    publishedCount: publishedCount || 0,
    batchStatus,
    reasons,
  };
}

async function resolveCreatorIdentity(req, creatorUserId) {
  const id = String(creatorUserId || '').trim();
  if (!id) {
    return { creatorUserId: null, email: null, name: null };
  }

  try {
    const { GlobalUser } = getGlobalModels(req, 'GlobalUser');
    const user = await GlobalUser.findById(id).select('email name').lean();
    return {
      creatorUserId: id,
      email: user?.email || null,
      name: user?.name || null,
    };
  } catch {
    return { creatorUserId: id, email: null, name: null };
  }
}

function buildNotifySubject({ cityDisplayName, eventName, emphasizeLive }) {
  const city = cityDisplayName || 'Just Go';
  if (emphasizeLive) {
    return `Live week: new host listing in ${city} — ${eventName}`;
  }
  return `New host listing for curation — ${city}: ${eventName}`;
}

function buildNotifyEmailHtml(payload) {
  const liveBanner = payload.emphasizeLive
    ? `<p style="padding:12px 16px;background:#FFF1EB;border:1px solid #FF4F1F;color:#1A1714;"><strong>Live week submit.</strong> This listing targets ${escapeHtml(payload.batchWeek)}, which already has published events or is released. It landed as a draft — review before the next drop.</p>`
    : '';

  return `
    <div style="font-family: sans-serif; max-width: 640px; margin: 0 auto; color: #1A1714;">
      <h2 style="margin-bottom: 8px;">New Just Go host listing</h2>
      <p style="color: #5c564e;">A creator submitted a listing for this week's curation. It won't appear in the app until you stage and release it.</p>
      ${liveBanner}
      <table style="width:100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding:6px 0;color:#5c564e;">City</td><td style="padding:6px 0;"><strong>${escapeHtml(payload.cityDisplayName)}</strong> (${escapeHtml(payload.tenantKey)})</td></tr>
        <tr><td style="padding:6px 0;color:#5c564e;">Listing</td><td style="padding:6px 0;"><strong>${escapeHtml(payload.eventName)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#5c564e;">Starts</td><td style="padding:6px 0;">${escapeHtml(payload.startTime || '—')}</td></tr>
        <tr><td style="padding:6px 0;color:#5c564e;">Week</td><td style="padding:6px 0;">${escapeHtml(payload.batchWeek)}</td></tr>
        <tr><td style="padding:6px 0;color:#5c564e;">Status</td><td style="padding:6px 0;">${escapeHtml(payload.ingestStatus)}</td></tr>
        <tr><td style="padding:6px 0;color:#5c564e;">Creator</td><td style="padding:6px 0;">${escapeHtml(payload.creatorLabel)}</td></tr>
      </table>
      <p><a href="${escapeHtml(payload.curationUrl)}" style="display:inline-block;padding:12px 20px;background:#FF4F1F;color:#fff;text-decoration:none;font-weight:600;">Open in Tenant Curation</a></p>
      <p style="color:#5c564e;font-size:13px;">Just Go Creator · automated ops notice</p>
    </div>
  `;
}

function pushOpsInboxStub(entry) {
  opsInboxStub.unshift(entry);
  if (opsInboxStub.length > MAX_OPS_INBOX_STUB) {
    opsInboxStub.length = MAX_OPS_INBOX_STUB;
  }
}

function getOpsInboxStub({ limit = 20 } = {}) {
  return opsInboxStub.slice(0, Math.max(0, limit));
}

function clearOpsInboxStub() {
  opsInboxStub.length = 0;
}

/**
 * Build notify payload (pure enough for tests). Does not send.
 */
function buildCreatorListingNotifyPayload({
  tenant,
  event,
  batchWeek,
  creatorIdentity,
  liveWeek,
  config,
} = {}) {
  const tenantKey = tenant?.tenantKey || '';
  const cityDisplayName = tenant?.location || tenant?.name || tenantKey;
  const eventName = event?.name || 'Untitled listing';
  const eventId = event?._id ? String(event._id) : null;
  const startTime = event?.start_time
    ? new Date(event.start_time).toISOString()
    : null;
  const ingestStatus = event?.customFields?.pivot?.ingestStatus || 'draft';
  const isLiveWeek = Boolean(liveWeek?.isLive);
  const emphasizeLive =
    isLiveWeek && config?.notifyAdminsOnLiveWeekSubmit === true;
  const relativeHref = buildCreatorListingCurationHref({
    tenantKey,
    batchWeek,
    eventId,
    emphasizeLive,
  });
  const creatorLabel =
    creatorIdentity?.email ||
    creatorIdentity?.name ||
    creatorIdentity?.creatorUserId ||
    'unknown creator';

  return {
    tenantKey,
    cityDisplayName,
    eventId,
    eventName,
    startTime,
    batchWeek,
    ingestStatus,
    creatorUserId: creatorIdentity?.creatorUserId || null,
    creatorEmail: creatorIdentity?.email || null,
    creatorName: creatorIdentity?.name || null,
    creatorLabel,
    isLiveWeek,
    emphasizeLive,
    liveWeekReasons: liveWeek?.reasons || [],
    publishedCount: liveWeek?.publishedCount ?? 0,
    batchStatus: liveWeek?.batchStatus || null,
    priority: emphasizeLive ? 'high' : 'normal',
    curationHref: relativeHref,
    curationUrl: buildAbsoluteCurationUrl(relativeHref),
    subject: buildNotifySubject({ cityDisplayName, eventName, emphasizeLive }),
  };
}

async function resolveAdminEmails(req) {
  const { admins } = await listPlatformAdmins(req);
  const emails = (admins || [])
    .map((admin) => (typeof admin.email === 'string' ? admin.email.trim() : ''))
    .filter((email) => email.includes('@'));
  return [...new Set(emails)];
}

/**
 * Notify platform admins about a new host listing. Best-effort; never throws.
 *
 * @returns {Promise<{ skipped?: boolean, reason?: string, payload?: object, emailed?: boolean }>}
 */
async function notifyAdminsOnCreatorListingCreate(req, options = {}) {
  try {
    const { tenant, config, event, batchWeek, creatorUserId } = options;
    if (!config || config.notifyAdminsOnCreate !== true) {
      logPivot('info', 'creator listing admin notify suppressed', {
        tenantKey: tenant?.tenantKey,
        reason: 'notifyAdminsOnCreate_false',
      });
      return { skipped: true, reason: 'notifyAdminsOnCreate_false' };
    }

    if (!tenant?.tenantKey || !batchWeek || !event) {
      return { skipped: true, reason: 'missing_context' };
    }

    let liveWeek;
    try {
      liveWeek = await isLiveCreatorBatchWeek(req, {
        tenantKey: tenant.tenantKey,
        batchWeek,
      });
    } catch (err) {
      logPivot('warn', 'creator listing live-week detect failed', {
        tenantKey: tenant.tenantKey,
        batchWeek,
        message: err?.message,
      });
      liveWeek = {
        isLive: false,
        publishedCount: 0,
        batchStatus: null,
        reasons: [],
      };
    }

    const creatorIdentity = await resolveCreatorIdentity(req, creatorUserId);
    const payload = buildCreatorListingNotifyPayload({
      tenant,
      event,
      batchWeek,
      creatorIdentity,
      liveWeek,
      config,
    });

    const inboxEntry = {
      id: `creator-listing-${payload.eventId || Date.now()}`,
      at: new Date().toISOString(),
      type: 'creator_listing_submitted',
      priority: payload.priority,
      payload,
    };
    pushOpsInboxStub(inboxEntry);

    logPivot('info', 'creator listing admin notify', {
      tenantKey: payload.tenantKey,
      eventId: payload.eventId,
      batchWeek: payload.batchWeek,
      isLiveWeek: payload.isLiveWeek,
      emphasizeLive: payload.emphasizeLive,
      priority: payload.priority,
      liveWeekReasons: payload.liveWeekReasons,
      curationHref: payload.curationHref,
      creatorUserId: payload.creatorUserId,
    });

    let emailed = false;
    try {
      const resend = getResend();
      if (resend) {
        const emails = await resolveAdminEmails(req);
        if (emails.length) {
          const { error } = await resend.emails.send({
            from: 'Just Go <support@meridian.study>',
            to: emails,
            subject: payload.subject,
            html: buildNotifyEmailHtml(payload),
          });
          if (error) {
            logPivot('warn', 'creator listing admin notify email failed', {
              tenantKey: payload.tenantKey,
              eventId: payload.eventId,
              message: error.message || String(error),
            });
          } else {
            emailed = true;
            logPivot('info', 'creator listing admin notify email sent', {
              tenantKey: payload.tenantKey,
              eventId: payload.eventId,
              recipientCount: emails.length,
              emphasizeLive: payload.emphasizeLive,
            });
          }
        } else {
          logPivot('info', 'creator listing admin notify no admin emails', {
            tenantKey: payload.tenantKey,
            eventId: payload.eventId,
          });
        }
      } else {
        logPivot('info', 'creator listing admin notify email skipped (no Resend)', {
          tenantKey: payload.tenantKey,
          eventId: payload.eventId,
        });
      }
    } catch (emailErr) {
      logPivot('warn', 'creator listing admin notify email failed', {
        tenantKey: payload.tenantKey,
        eventId: payload.eventId,
        message: emailErr?.message,
      });
    }

    return { skipped: false, payload, emailed, inboxEntry };
  } catch (err) {
    logPivot('warn', 'creator listing admin notify failed', {
      message: err?.message,
    });
    return { skipped: true, reason: 'notify_error', error: err?.message };
  }
}

module.exports = {
  notifyAdminsOnCreatorListingCreate,
  isLiveCreatorBatchWeek,
  buildCreatorListingCurationHref,
  buildCreatorListingNotifyPayload,
  buildNotifySubject,
  getOpsInboxStub,
  clearOpsInboxStub,
  resolveFrontendBaseUrl,
};
