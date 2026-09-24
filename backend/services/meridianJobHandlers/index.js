const { registerWeeklyDropHandler } = require('./weeklyDrop');
const {
  registerRitualCrewScanHandler,
  registerRitualCrewConsensusHandler,
} = require('./ritualCrewScan');
const { registerSoloSwipeReminderHandler } = require('./soloSwipeReminder');
const { registerEventDiscoveryEnqueueHandler } = require('./eventDiscoveryEnqueue');

function ensureMeridianJobHandlersLoaded() {
  registerWeeklyDropHandler();
  registerRitualCrewScanHandler();
  registerRitualCrewConsensusHandler();
  registerSoloSwipeReminderHandler();
  registerEventDiscoveryEnqueueHandler();
}

module.exports = {
  ensureMeridianJobHandlersLoaded,
};
