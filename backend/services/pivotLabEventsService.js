const getModels = require('./getModelService');
const { getMergedTenants } = require('./tenantConfigService');
const { isPivotTenant } = require('./pivotReferralCodeService');
const { connectToDatabase } = require('../connectionsManager');
const {
  normalizeBatchWeek,
} = require('./pivotWeeklySnapshotService');

function labEventsQuery(batchWeek) {
  return {
    'customFields.pivot.batchWeek': batchWeek,
    'customFields.pivot': { $exists: true },
    isDeleted: { $ne: true },
  };
}

function serializeLabEvent(event) {
  const pivot = event.customFields?.pivot || {};
  const host = pivot.host || {};

  return {
    _id: String(event._id),
    name: event.name,
    start_time: event.start_time,
    end_time: event.end_time || null,
    location: event.location || '',
    externalLink: event.externalLink || null,
    ingestStatus: pivot.ingestStatus || null,
    source: pivot.source || null,
    batchWeek: pivot.batchWeek || null,
    tags: Array.isArray(pivot.tags) ? pivot.tags : [],
    organizerName: host.name || '',
    organizerImageUrl: host.imageUrl || null,
  };
}

async function listPivotLabEvents(req, options = {}) {
  const normalized = normalizeBatchWeek(options.batchWeek, options.now);
  if (normalized.error) {
    return normalized;
  }

  const tenantKey = options.tenantKey?.trim()?.toLowerCase();
  if (!tenantKey) {
    return {
      error: 'tenantKey is required.',
      status: 400,
      code: 'TENANT_KEY_REQUIRED',
    };
  }

  const pivotTenants = (await getMergedTenants(req)).filter(isPivotTenant);
  const tenant = pivotTenants.find((row) => row.tenantKey === tenantKey);
  if (!tenant) {
    return {
      error: 'Pivot tenant not found.',
      status: 404,
      code: 'TENANT_NOT_FOUND',
    };
  }

  const { batchWeek } = normalized;
  const db = await connectToDatabase(tenantKey);
  const tenantReq = { db };
  const { Event } = getModels(tenantReq, 'Event');

  const query = labEventsQuery(batchWeek);

  const events = await Event.find(query)
    .select('name start_time end_time location externalLink customFields.pivot')
    .sort({ start_time: 1 })
    .lean();

  return {
    data: {
      tenantKey,
      cityDisplayName: tenant.location || tenant.name || tenantKey,
      batchWeek,
      events: events.map(serializeLabEvent),
    },
  };
}

module.exports = {
  listPivotLabEvents,
  serializeLabEvent,
  labEventsQuery,
};
