#!/usr/bin/env node
/**
 * Run before creating multiple sources on one provider host.
 * Backfills sourceKey, then replaces the legacy unique (tenantKey, host) index.
 * Dry run: node migrations/migratePivotSourceKeys.js --dry-run
 */
require('./ensureBackendNodeModules');
require('dotenv').config();

async function run() {
  const { connectToGlobalDatabase } = require('../connectionsManager');
  const getGlobalModels = require('../services/getGlobalModelService');
  const globalDb = await connectToGlobalDatabase();
  const { PivotCitySource, PivotCurationJob } = getGlobalModels({ globalDb }, 'PivotCitySource', 'PivotCurationJob');
  const sources = await PivotCitySource.find().select('_id tenantKey host sourceKey curationJobId').lean();
  const dryRun = process.argv.includes('--dry-run');
  const keys = new Set();
  for (const source of sources) {
    const sourceKey = source.sourceKey || source.host;
    const key = `${source.tenantKey}:${sourceKey}`;
    if (keys.has(key)) throw new Error(`Duplicate source key: ${key}`);
    keys.add(key);
    if (!dryRun && !source.sourceKey) {
      await PivotCitySource.updateOne({ _id: source._id }, { $set: { sourceKey } });
    }
    if (!dryRun && source.curationJobId) {
      await PivotCurationJob.updateOne({ _id: source.curationJobId, tenantKey: source.tenantKey,
        sourceId: null }, { $set: { sourceId: source._id } });
    }
  }
  if (dryRun) {
    console.log(`Would backfill ${sources.filter((source) => !source.sourceKey).length} source keys and replace host index`);
    return;
  }
  const indexes = await PivotCitySource.collection.indexes();
  await PivotCitySource.collection.createIndex({ tenantKey: 1, sourceKey: 1 }, { unique: true, name: 'tenantKey_1_sourceKey_1' });
  const old = indexes.find((index) => index.unique && index.key?.tenantKey === 1 && index.key?.host === 1);
  if (old) await PivotCitySource.collection.dropIndex(old.name);
  await PivotCitySource.collection.createIndex({ tenantKey: 1, host: 1 }, { name: 'tenantKey_1_host_1' });
  // A job's last run carries exact event IDs. Backfill only those proven links;
  // shared provider hosts cannot safely identify a calendar from event URLs.
  const { connectToDatabase } = require('../connectionsManager');
  const getModels = require('../services/getModelService');
  const { recomputeTenantSourceScores } = require('../services/pivotSourceScoreService');
  for (const tenantKey of [...new Set(sources.map((source) => source.tenantKey))]) {
    const tenantReq = { db: await connectToDatabase(tenantKey), school: tenantKey };
    const { Event } = getModels(tenantReq, 'Event');
    const jobs = await PivotCurationJob.find({ tenantKey, sourceId: { $ne: null } })
      .select('_id sourceId lastRunEvents').lean();
    for (const job of jobs) {
      const ids = (job.lastRunEvents || []).map((row) => row.eventId)
        .filter((id) => require('mongoose').Types.ObjectId.isValid(id));
      if (!ids.length) continue;
      await Event.updateMany({ _id: { $in: ids }, 'customFields.pivot.sourceId': { $exists: false } },
        { $set: { 'customFields.pivot.sourceId': String(job.sourceId),
          'customFields.pivot.entrypointId': String(job._id),
          'customFields.pivot.observedSourceIds': [String(job.sourceId)],
          'customFields.pivot.observedEntrypointIds': [String(job._id)] } });
    }
    await recomputeTenantSourceScores({ globalDb }, tenantReq, tenantKey);
  }
  console.log(`Migrated ${sources.length} sources`);
}

run().catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await require('mongoose').disconnect(); });
