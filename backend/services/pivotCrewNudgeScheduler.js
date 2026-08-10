const cron = require('node-cron');
const { connectToGlobalDatabase } = require('../connectionsManager');
const { runAllCrewUnfinishedSwipeNudges } = require('./pivotCrewNudgeService');

let scheduledTask = null;
let nudgeInFlight = false;

async function runScheduledCrewNudges() {
  if (nudgeInFlight) {
    console.warn('[pivotCrewNudge] skipping scheduled send — previous run still in flight');
    return;
  }

  nudgeInFlight = true;
  try {
    const globalDb = await connectToGlobalDatabase();
    const result = await runAllCrewUnfinishedSwipeNudges({ globalDb });
    const tenants = result.data?.tenants || [];
    const sent = tenants.reduce((sum, row) => sum + (row.sent || 0), 0);
    const crewsNudged = tenants.reduce((sum, row) => sum + (row.crewsNudged || 0), 0);
    console.log(
      `[pivotCrewNudge] scheduled send complete tenants=${tenants.length} crewsNudged=${crewsNudged} sent=${sent}`,
    );
  } catch (error) {
    console.error('[pivotCrewNudge] scheduled send failed', error);
  } finally {
    nudgeInFlight = false;
  }
}

function startPivotCrewNudgeScheduler() {
  if (process.env.NODE_ENV === 'test') {
    return null;
  }
  if (process.env.DISABLE_PIVOT_CREW_NUDGE_CRON === 'true') {
    return null;
  }
  if (scheduledTask) {
    return scheduledTask;
  }

  scheduledTask = cron.schedule('*/30 * * * *', () => {
    runScheduledCrewNudges();
  });

  console.log('[pivotCrewNudge] scheduled send every 30 minutes');
  return scheduledTask;
}

module.exports = {
  startPivotCrewNudgeScheduler,
  runScheduledCrewNudges,
};
