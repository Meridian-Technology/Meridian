const { resolveQuietHours } = require('./meridianQuietHours');

const DISCOVERY_MODES = new Set(['catalog_publish', 'schedule', 'both']);

/**
 * Qualification rules stored on a schedule as triggerConfig.
 * Omitted keys keep the current defaults.
 */
function resolveNotificationCheckConfig(triggerConfig = {}) {
  const config = triggerConfig && typeof triggerConfig === 'object' && !Array.isArray(triggerConfig)
    ? triggerConfig
    : {};
  const on = DISCOVERY_MODES.has(config.on) ? config.on : 'catalog_publish';
  return {
    quietHours: resolveQuietHours(config),
    solo: {
      requireNoCrew: config.requireNoCrew !== false,
      requireIncompleteDeck: config.requireIncompleteDeck !== false,
      oncePerBatchWeek: config.oncePerBatchWeek !== false,
    },
    crew: {
      nudgeUnfinishedSwipes: config.nudgeUnfinishedSwipes !== false,
      nudgeConsensus: config.nudgeConsensus !== false,
      oncePerCrewPerWeek: config.oncePerCrewPerWeek !== false,
    },
    discovery: { on },
  };
}

module.exports = {
  resolveNotificationCheckConfig,
};
