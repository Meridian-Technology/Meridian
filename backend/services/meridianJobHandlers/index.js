const { registerWeeklyDropHandler } = require('./weeklyDrop');
const {
  registerRitualCrewScanHandler,
  registerRitualCrewConsensusHandler,
} = require('./ritualCrewScan');
const { registerSoloSwipeReminderHandler } = require('./soloSwipeReminder');
const { registerEventDiscoveryEnqueueHandler } = require('./eventDiscoveryEnqueue');
const { registerAdminWeeklyReportHandler } = require('./adminWeeklyReport');
const { registerScheduledPushHandler } = require('./scheduledPush');

function ensureMeridianJobHandlersLoaded() {
  registerWeeklyDropHandler();
  registerRitualCrewScanHandler();
  registerRitualCrewConsensusHandler();
  registerSoloSwipeReminderHandler();
  registerEventDiscoveryEnqueueHandler();
  registerAdminWeeklyReportHandler();
  registerScheduledPushHandler();
}

module.exports = {
  ensureMeridianJobHandlersLoaded,
};
