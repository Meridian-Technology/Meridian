/**
 * Rebuild PivotCrewWeekState for all pivot tenants (tenant DB).
 *
 * Usage:
 *   npm run rebuild:pivot-crew-week-state
 *   npm run rebuild:pivot-crew-week-state -- --batchWeek=2026-W30
 */
require('./ensureBackendNodeModules');
require('dotenv').config();

const { connectToGlobalDatabase } = require('../connectionsManager');
const { rebuildAllPivotCrewWeekStates } = require('../services/pivotCrewWeekStateService');
const { toIsoWeek } = require('../utilities/pivotIsoWeek');

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
  const result = await rebuildAllPivotCrewWeekStates({ globalDb }, { batchWeek });

  if (!result.data) {
    throw new Error('Rebuild returned no data.');
  }

  console.log(`[rebuild:pivot-crew-week-state] batchWeek=${batchWeek}`);
  for (const row of result.data.tenants) {
    if (row.error) {
      console.log(`  ${row.tenantKey}: error=${row.error}`);
      continue;
    }
    console.log(
      `  ${row.tenantKey}: crews=${row.crewCount} recomputed=${row.recomputed} failed=${row.failed}`,
    );
  }
}

run()
  .catch((error) => {
    console.error('[rebuild:pivot-crew-week-state] failed', error);
    process.exitCode = 1;
  })
  .finally(() => {
    setTimeout(() => process.exit(process.exitCode || 0), 100);
  });
