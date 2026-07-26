const cron = require('node-cron');
const { connectToGlobalDatabase } = require('../connectionsManager');
const { rebuildAllPivotCrewWeekStates } = require('./pivotCrewWeekStateService');
const { resolveAllExpiredCrewConsensus } = require('./pivotCrewJudgementService');

let scheduledTask = null;
let rebuildInFlight = false;

async function runScheduledCrewWeekRebuild() {
  if (rebuildInFlight) {
    console.warn('[pivotCrewWeekState] skipping scheduled rebuild — previous run still in flight');
    return;
  }

  rebuildInFlight = true;
  try {
    const globalDb = await connectToGlobalDatabase();
    const expiry = await resolveAllExpiredCrewConsensus({ globalDb });
    const expiryTenants = expiry.data?.tenants || [];
    const expiryResolved = expiryTenants.reduce((sum, row) => sum + (row.resolved || 0), 0);
    if (expiryResolved > 0) {
      console.log(
        `[pivotCrewWeekState] consensus expiry resolved=${expiryResolved} tenants=${expiryTenants.length}`,
      );
    }

    const result = await rebuildAllPivotCrewWeekStates({ globalDb });
    const tenants = result.data?.tenants || [];
    const recomputed = tenants.reduce((sum, row) => sum + (row.recomputed || 0), 0);
    const failed = tenants.reduce((sum, row) => sum + (row.failed || 0), 0);
    console.log(
      `[pivotCrewWeekState] scheduled rebuild complete tenants=${tenants.length} recomputed=${recomputed} failed=${failed}`,
    );
  } catch (error) {
    console.error('[pivotCrewWeekState] scheduled rebuild failed', error);
  } finally {
    rebuildInFlight = false;
  }
}

function startPivotCrewWeekStateScheduler() {
  if (process.env.NODE_ENV === 'test') {
    return null;
  }
  if (process.env.DISABLE_PIVOT_CREW_WEEK_CRON === 'true') {
    return null;
  }
  if (scheduledTask) {
    return scheduledTask;
  }

  scheduledTask = cron.schedule('*/15 * * * *', () => {
    runScheduledCrewWeekRebuild();
  });

  console.log('[pivotCrewWeekState] scheduled rebuild every 15 minutes');
  return scheduledTask;
}

module.exports = {
  startPivotCrewWeekStateScheduler,
  runScheduledCrewWeekRebuild,
};
