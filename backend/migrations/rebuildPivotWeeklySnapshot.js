/**
 * Rebuild PivotWeeklySnapshot for a batch week (global DB).
 *
 * Usage:
 *   npm run rebuild:pivot-weekly-snapshot
 *   npm run rebuild:pivot-weekly-snapshot -- --batchWeek=2026-W21
 */
const { connectToGlobalDatabase } = require('../connectionsManager');
const pivotWeeklySnapshotSchema = require('../schemas/pivotWeeklySnapshot');
const { rebuildWeeklySnapshot } = require('../services/pivotWeeklySnapshotService');
const { toIsoWeek } = require('../utilities/pivotIsoWeek');

const COLLECTION = 'pivot_weekly_snapshots';

function readBatchWeekArg() {
  const flag = process.argv.find((arg) => arg.startsWith('--batchWeek='));
  if (flag) {
    return flag.split('=')[1];
  }
  return process.env.PIVOT_BATCH_WEEK || null;
}

async function run() {
  const batchWeek = readBatchWeekArg() || toIsoWeek();
  const globalDb = await connectToGlobalDatabase();
  globalDb.model('PivotWeeklySnapshot', pivotWeeklySnapshotSchema, COLLECTION);

  const req = { globalDb };
  const result = await rebuildWeeklySnapshot(req, { batchWeek });

  if (result.error) {
    throw new Error(result.error);
  }

  console.log(
    `[rebuild:pivot-weekly-snapshot] batchWeek=${result.data.batchWeek} generatedAt=${result.data.generatedAt} tenants=${result.data.tenants.length}`,
  );
  for (const row of result.data.tenants) {
    console.log(
      `  ${row.tenantKey}: events=${row.eventCount} interested=${row.interestedCount} registered=${row.registeredCount} swipes=${row.swipeCount} activeUsers=${row.activeUsers}`,
    );
  }
}

run()
  .catch((error) => {
    console.error('[rebuild:pivot-weekly-snapshot] failed', error);
    process.exitCode = 1;
  })
  .finally(() => {
    setTimeout(() => process.exit(process.exitCode || 0), 100);
  });
