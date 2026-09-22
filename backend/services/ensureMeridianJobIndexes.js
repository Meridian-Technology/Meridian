const getGlobalModels = require('./getGlobalModelService');
const meridianJobRunSchema = require('../schemas/meridianJobRun');
const meridianJobAttemptSchema = require('../schemas/meridianJobAttempt');
const meridianJobDeliverySchema = require('../schemas/meridianJobDelivery');
const meridianNotificationDefinitionSchema = require('../schemas/meridianNotificationDefinition');

const { MERIDIAN_JOB_RUN_INDEX_NAMES } = meridianJobRunSchema;
const { MERIDIAN_JOB_ATTEMPT_INDEX_NAMES } = meridianJobAttemptSchema;
const { MERIDIAN_JOB_DELIVERY_INDEX_NAMES } = meridianJobDeliverySchema;
const { MERIDIAN_NOTIFICATION_DEFINITION_INDEX_NAMES } = meridianNotificationDefinitionSchema;

const syncedGlobalDbs = new WeakSet();

async function ensureMeridianJobIndexes(req, { force = false } = {}) {
  if (!req?.globalDb) return { synced: false };
  if (!force && syncedGlobalDbs.has(req.globalDb)) {
    return { synced: false };
  }

  const {
    MeridianJobRun,
    MeridianJobAttempt,
    MeridianJobDelivery,
    MeridianNotificationDefinition,
  } = getGlobalModels(
    req,
    'MeridianJobRun',
    'MeridianJobAttempt',
    'MeridianJobDelivery',
    'MeridianNotificationDefinition',
  );

  await MeridianJobRun.syncIndexes();
  await MeridianJobAttempt.syncIndexes();
  await MeridianJobDelivery.syncIndexes();
  await MeridianNotificationDefinition.syncIndexes();
  syncedGlobalDbs.add(req.globalDb);

  return { synced: true };
}

async function dropIndexByName(model, name) {
  await model.collection.dropIndex(name).catch((error) => {
    if (error?.code !== 27 && error?.codeName !== 'IndexNotFound') throw error;
  });
}

async function dropMeridianJobIndexes(req) {
  if (!req?.globalDb) {
    throw new Error('req.globalDb is not set');
  }

  const {
    MeridianJobRun,
    MeridianJobAttempt,
    MeridianJobDelivery,
    MeridianNotificationDefinition,
  } = getGlobalModels(
    req,
    'MeridianJobRun',
    'MeridianJobAttempt',
    'MeridianJobDelivery',
    'MeridianNotificationDefinition',
  );

  for (const name of MERIDIAN_JOB_RUN_INDEX_NAMES) {
    await dropIndexByName(MeridianJobRun, name);
  }
  for (const name of MERIDIAN_JOB_ATTEMPT_INDEX_NAMES) {
    await dropIndexByName(MeridianJobAttempt, name);
  }
  for (const name of MERIDIAN_JOB_DELIVERY_INDEX_NAMES) {
    await dropIndexByName(MeridianJobDelivery, name);
  }
  for (const name of MERIDIAN_NOTIFICATION_DEFINITION_INDEX_NAMES) {
    await dropIndexByName(MeridianNotificationDefinition, name);
  }

  syncedGlobalDbs.delete(req.globalDb);
  return { dropped: true };
}

module.exports = {
  ensureMeridianJobIndexes,
  dropMeridianJobIndexes,
};
