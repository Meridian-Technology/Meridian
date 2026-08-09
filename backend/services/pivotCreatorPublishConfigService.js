/**
 * Service-facing helpers for Just Go Creator Console publish config.
 * Implementation lives in utilities/pivotCreatorPublishConfig.js.
 */

const {
  CREATOR_PUBLISH_CONFIG_DEFAULTS,
  resolveCreatorPublishConfig,
  computeCreatorBatchWeek,
  resolveCreatorDefaultIngestStatus,
  mergeCreatorPublishConfig,
  validateCreatorPublishConfigPatch,
} = require('../utilities/pivotCreatorPublishConfig');

module.exports = {
  CREATOR_PUBLISH_CONFIG_DEFAULTS,
  resolveCreatorPublishConfig,
  computeCreatorBatchWeek,
  resolveCreatorDefaultIngestStatus,
  mergeCreatorPublishConfig,
  validateCreatorPublishConfigPatch,
};
