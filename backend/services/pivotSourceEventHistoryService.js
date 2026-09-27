const mongoose = require('mongoose');
const { connectToDatabase } = require('../connectionsManager');
const getGlobalModels = require('./getGlobalModelService');
const getModels = require('./getModelService');
const { resolvePivotTenant } = require('./pivotIngestPublishService');
const { serializeLabEvent } = require('./pivotLabEventsService');
const { isRichLocationCapabilityEnabled } = require('../utilities/justGoRichLocationControls');

const PAGE_SIZE = 24;

async function listSourceEventHistory(req, options = {}) {
  const tenantResult = await resolvePivotTenant(req, options.tenantKey);
  if (tenantResult.error) return tenantResult;
  const tenantKey = tenantResult.tenant.tenantKey;
  if (!mongoose.Types.ObjectId.isValid(options.sourceId)) {
    return { error: 'Invalid source id.', status: 400, code: 'INVALID_SOURCE_ID' };
  }
  const page = Number(options.page ?? 1);
  if (!Number.isInteger(page) || page < 1 || page > 10000) {
    return { error: 'page must be a positive integer.', status: 400, code: 'INVALID_PAGE' };
  }
  const status = options.status || 'all';
  if (!['all', 'staged', 'published'].includes(status)) {
    return { error: 'Invalid event status.', status: 400, code: 'INVALID_STATUS' };
  }

  const { PivotCitySource, PivotCurationJob } = getGlobalModels(req, 'PivotCitySource', 'PivotCurationJob');
  const source = await PivotCitySource.findOne({ _id: options.sourceId, tenantKey })
    .select('_id label sourceKey').lean();
  if (!source) return { error: 'Source not found.', status: 404, code: 'SOURCE_NOT_FOUND' };
  const jobs = await PivotCurationJob.find({ tenantKey, sourceId: source._id }).select('_id').lean();
  const jobIds = jobs.map((job) => String(job._id));
  const entrypointId = options.entrypointId || null;
  if (entrypointId && !jobIds.includes(entrypointId)) {
    return { error: 'Entrypoint does not belong to this source.', status: 400, code: 'INVALID_ENTRYPOINT' };
  }
  const sourceId = String(source._id);
  const db = await connectToDatabase(tenantKey);
  const { Event } = getModels({ db }, 'Event');
  const query = {
    isDeleted: { $ne: true },
    'customFields.pivot': { $exists: true },
    ...(status === 'all' ? {} : { 'customFields.pivot.ingestStatus': status }),
    $or: entrypointId ? [
      { 'customFields.pivot.entrypointId': entrypointId },
      { 'customFields.pivot.observedEntrypointIds': entrypointId },
    ] : [
      { 'customFields.pivot.sourceId': sourceId },
      { 'customFields.pivot.observedSourceIds': sourceId },
      ...(jobIds.length ? [
        { 'customFields.pivot.entrypointId': { $in: jobIds } },
        { 'customFields.pivot.observedEntrypointIds': { $in: jobIds } },
      ] : []),
    ],
  };
  const [total, rows] = await Promise.all([
    Event.countDocuments(query),
    Event.find(query)
      .select('name description image start_time end_time location richLocation externalLink customFields.pivot')
      .sort({ start_time: -1, _id: -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
  ]);

  return { data: {
    source: { id: sourceId, label: source.label || source.sourceKey },
    page, pageSize: PAGE_SIZE, total,
    events: rows.map((row) => ({
      ...serializeLabEvent(row, null, {
        richLocationReadsEnabled: isRichLocationCapabilityEnabled(tenantResult.tenant, 'reads'),
      }),
      attribution: String(row.customFields?.pivot?.sourceId || '') === sourceId ? 'primary' : 'observed',
    })),
  } };
}

module.exports = { listSourceEventHistory, PAGE_SIZE };
