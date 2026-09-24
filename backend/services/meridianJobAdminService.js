const mongoose = require('mongoose');
const { connectToGlobalDatabase } = require('../connectionsManager');
const getGlobalModels = require('./getGlobalModelService');
const {
  MERIDIAN_JOB_RUN_STATUSES,
} = require('../schemas/meridianJobRun');
const {
  MERIDIAN_JOB_DELIVERY_STATUSES,
} = require('../schemas/meridianJobDelivery');
const { getMeridianJobHandler, listMeridianJobHandlers } = require('./meridianJobRegistry');
const { ensureMeridianJobHandlersLoaded } = require('./meridianJobHandlers');
const { enqueueMeridianJob } = require('./meridianJobEnqueueService');

const MAX_LIST_LIMIT = 100;
const DEFAULT_LIST_LIMIT = 50;

function meridianJobAdminError(message, code, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

async function resolveJobReq(req) {
  if (req?.globalDb) return req;
  const globalDb = await connectToGlobalDatabase();
  return { ...(req || {}), globalDb };
}

function leanDoc(doc) {
  if (!doc) return null;
  if (typeof doc.toObject === 'function') return doc.toObject();
  return doc;
}

function parseLimit(value, fallback = DEFAULT_LIST_LIMIT, max = MAX_LIST_LIMIT) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw meridianJobAdminError('limit must be a number', 'INVALID_LIMIT');
  }
  return Math.min(Math.max(Math.trunc(parsed), 1), max);
}

function parseDate(value, field) {
  if (value == null || value === '') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw meridianJobAdminError(`Invalid ${field} timestamp`, 'INVALID_TIME_FILTER');
  }
  return parsed;
}

function sanitizePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  const { pushToken, to, ...rest } = payload;
  return rest;
}

function serializeMeridianJobRun(doc) {
  const row = leanDoc(doc);
  if (!row) return null;
  return {
    id: String(row._id),
    runKey: row.runKey,
    category: row.category,
    type: row.type,
    tenantKey: row.tenantKey,
    status: row.status,
    scheduledFor: row.scheduledFor || null,
    nextAttemptAt: row.nextAttemptAt || null,
    attemptCount: row.attemptCount || 0,
    maxAttempts: row.maxAttempts || 3,
    payload: sanitizePayload(row.payload),
    summary: row.summary || null,
    lastError: row.lastError || null,
    failureAlertSentAt: row.failureAlertSentAt || null,
    pivotDropPushRunId: row.pivotDropPushRunId ? String(row.pivotDropPushRunId) : null,
    claimedAt: row.claimedAt || null,
    startedAt: row.startedAt || null,
    finishedAt: row.finishedAt || null,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
  };
}

function serializeMeridianJobAttempt(doc) {
  const row = leanDoc(doc);
  if (!row) return null;
  return {
    id: String(row._id),
    runId: String(row.runId),
    attemptNumber: row.attemptNumber,
    status: row.status,
    error: row.error || null,
    startedAt: row.startedAt || null,
    finishedAt: row.finishedAt || null,
    createdAt: row.createdAt || null,
  };
}

function serializeMeridianJobDelivery(doc) {
  const row = leanDoc(doc);
  if (!row) return null;
  return {
    id: String(row._id),
    runId: String(row.runId),
    tenantKey: row.tenantKey,
    userId: row.userId,
    username: row.username || null,
    name: row.name || null,
    product: row.product,
    copyKey: row.copyKey || null,
    title: row.title || '',
    body: row.body || '',
    deliveryStatus: row.deliveryStatus,
    sentAt: row.sentAt || null,
    error: row.error || null,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
  };
}

function assertNoPushToken(serialized) {
  if (!serialized || typeof serialized !== 'object') return serialized;
  if ('pushToken' in serialized || 'to' in serialized) {
    const { pushToken, to, ...rest } = serialized;
    return rest;
  }
  return serialized;
}

async function listMeridianJobRuns(req, {
  tenantKey = null,
  type = null,
  status = null,
  from = null,
  to = null,
  limit = DEFAULT_LIST_LIMIT,
  cursor = null,
} = {}) {
  const jobReq = await resolveJobReq(req);
  const { MeridianJobRun } = getGlobalModels(jobReq, 'MeridianJobRun');
  const query = {};

  const normalizedTenant = typeof tenantKey === 'string' ? tenantKey.trim().toLowerCase() : '';
  if (normalizedTenant) query.tenantKey = normalizedTenant;

  const normalizedType = typeof type === 'string' ? type.trim() : '';
  if (normalizedType) query.type = normalizedType;

  const normalizedStatus = typeof status === 'string' ? status.trim() : '';
  if (normalizedStatus) {
    if (!MERIDIAN_JOB_RUN_STATUSES.includes(normalizedStatus)) {
      throw meridianJobAdminError(
        `Unsupported job status filter: ${normalizedStatus}`,
        'INVALID_STATUS_FILTER',
      );
    }
    query.status = normalizedStatus;
  }

  const fromDate = parseDate(from, 'from');
  const toDate = parseDate(to, 'to');
  const cursorDate = parseDate(cursor, 'cursor');
  if (fromDate || toDate || cursorDate) {
    query.createdAt = {};
    if (fromDate) query.createdAt.$gte = fromDate;
    if (toDate) query.createdAt.$lte = toDate;
    if (cursorDate) query.createdAt.$lt = cursorDate;
  }

  const pageSize = parseLimit(limit);
  const rows = await MeridianJobRun.find(query)
    .sort({ createdAt: -1 })
    .limit(pageSize + 1)
    .lean();
  const hasMore = rows.length > pageSize;
  const runs = rows.slice(0, pageSize).map((row) => assertNoPushToken(serializeMeridianJobRun(row)));
  return {
    runs,
    nextCursor: hasMore ? runs[runs.length - 1].createdAt : null,
  };
}

async function getMeridianJobRun(req, runId, {
  tenantKey = null,
  deliveriesLimit = DEFAULT_LIST_LIMIT,
  deliveriesCursor = null,
  deliveryStatus = null,
} = {}) {
  if (!mongoose.Types.ObjectId.isValid(runId)) {
    throw meridianJobAdminError('Job run not found', 'MERIDIAN_JOB_RUN_NOT_FOUND', 404);
  }

  const jobReq = await resolveJobReq(req);
  const { MeridianJobRun, MeridianJobAttempt, MeridianJobDelivery } = getGlobalModels(
    jobReq,
    'MeridianJobRun',
    'MeridianJobAttempt',
    'MeridianJobDelivery',
  );

  const run = await MeridianJobRun.findById(runId).lean();
  if (!run) {
    throw meridianJobAdminError('Job run not found', 'MERIDIAN_JOB_RUN_NOT_FOUND', 404);
  }

  const normalizedTenant = typeof tenantKey === 'string' ? tenantKey.trim().toLowerCase() : '';
  if (normalizedTenant && run.tenantKey !== normalizedTenant) {
    throw meridianJobAdminError('Job run not found', 'MERIDIAN_JOB_RUN_NOT_FOUND', 404);
  }

  const attempts = await MeridianJobAttempt.find({ runId: run._id })
    .sort({ attemptNumber: 1 })
    .lean();

  const deliveryQuery = { runId: run._id };
  const normalizedDeliveryStatus = typeof deliveryStatus === 'string' ? deliveryStatus.trim() : '';
  if (normalizedDeliveryStatus) {
    if (!MERIDIAN_JOB_DELIVERY_STATUSES.includes(normalizedDeliveryStatus)) {
      throw meridianJobAdminError(
        `Unsupported delivery status filter: ${normalizedDeliveryStatus}`,
        'INVALID_DELIVERY_STATUS_FILTER',
      );
    }
    deliveryQuery.deliveryStatus = normalizedDeliveryStatus;
  }
  const deliveryCursorDate = parseDate(deliveriesCursor, 'deliveriesCursor');
  if (deliveryCursorDate) {
    deliveryQuery.createdAt = { $lt: deliveryCursorDate };
  }

  const pageSize = parseLimit(deliveriesLimit);
  const deliveryRows = await MeridianJobDelivery.find(deliveryQuery)
    .sort({ createdAt: -1 })
    .limit(pageSize + 1)
    .lean();
  const hasMore = deliveryRows.length > pageSize;
  const deliveries = deliveryRows
    .slice(0, pageSize)
    .map((row) => assertNoPushToken(serializeMeridianJobDelivery(row)));

  return {
    run: assertNoPushToken(serializeMeridianJobRun(run)),
    attempts: attempts.map(serializeMeridianJobAttempt),
    deliveries,
    deliveriesNextCursor: hasMore ? deliveries[deliveries.length - 1].createdAt : null,
  };
}

async function enqueueMeridianJobAdmin(req, {
  handlerKey,
  tenantKey,
  payload = {},
  scheduledFor = null,
  triggeredBy = null,
} = {}) {
  ensureMeridianJobHandlersLoaded();
  const normalizedHandler = typeof handlerKey === 'string' ? handlerKey.trim() : '';
  const normalizedTenant = typeof tenantKey === 'string' ? tenantKey.trim().toLowerCase() : '';
  if (!normalizedHandler) {
    throw meridianJobAdminError('handlerKey is required', 'HANDLER_KEY_REQUIRED');
  }
  if (!normalizedTenant) {
    throw meridianJobAdminError('tenantKey is required', 'TENANT_KEY_REQUIRED');
  }
  if (!getMeridianJobHandler(normalizedHandler)) {
    throw meridianJobAdminError(
      `Unknown meridian job handler: ${normalizedHandler}`,
      'UNKNOWN_HANDLER',
    );
  }
  if (payload != null && (typeof payload !== 'object' || Array.isArray(payload))) {
    throw meridianJobAdminError('payload must be an object', 'INVALID_PAYLOAD');
  }

  const safePayload = { ...(payload || {}) };
  if (triggeredBy) {
    safePayload.triggeredBy = triggeredBy;
  }

  const result = await enqueueMeridianJob(req, {
    handlerKey: normalizedHandler,
    tenantKey: normalizedTenant,
    payload: safePayload,
    scheduledFor,
  });
  return {
    run: serializeMeridianJobRun(result.run),
    created: result.created,
  };
}

function listEnqueueableMeridianJobHandlers() {
  ensureMeridianJobHandlersLoaded();
  return listMeridianJobHandlers();
}

module.exports = {
  MAX_LIST_LIMIT,
  DEFAULT_LIST_LIMIT,
  meridianJobAdminError,
  serializeMeridianJobRun,
  serializeMeridianJobAttempt,
  serializeMeridianJobDelivery,
  listMeridianJobRuns,
  getMeridianJobRun,
  enqueueMeridianJobAdmin,
  listEnqueueableMeridianJobHandlers,
};
