const { registerWeeklyDropHandler } = require('./weeklyDrop');
const { registerRitualCrewScanHandler } = require('./ritualCrewScan');
const { registerSoloSwipeReminderHandler } = require('./soloSwipeReminder');
const { registerEventDiscoveryEnqueueHandler } = require('./eventDiscoveryEnqueue');

function ensureMeridianJobHandlersLoaded() {
  registerWeeklyDropHandler();
  registerRitualCrewScanHandler();
  registerSoloSwipeReminderHandler();
  registerEventDiscoveryEnqueueHandler();
}

module.exports = {
  ensureMeridianJobHandlersLoaded,
};
