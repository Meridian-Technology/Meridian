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
const RUN_KEY_MAX = 256;

function isDuplicateKeyError(error) {
  return error?.code === 11000 || error?.codeName === 'DuplicateKey';
}

function duplicateRunKey(runKey, id) {
  const suffix = `:dup:${id}`;
  const base = String(runKey || 'run');
  return `${base.slice(0, Math.max(0, RUN_KEY_MAX - suffix.length))}${suffix}`;
}

function byCreatedAt(left, right) {
  const leftAt = left.createdAt ? new Date(left.createdAt).getTime() : 0;
  const rightAt = right.createdAt ? new Date(right.createdAt).getTime() : 0;
  if (leftAt !== rightAt) return leftAt - rightAt;
  return String(left.id).localeCompare(String(right.id));
}

async function quarantineDuplicateRunKeys(MeridianJobRun) {
  const groups = await MeridianJobRun.aggregate([
    {
      $group: {
        _id: '$runKey',
        count: { $sum: 1 },
        docs: {
          $push: {
            id: '$_id',
            createdAt: '$createdAt',
            status: '$status',
          },
        },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]);

  let quarantined = 0;
  for (const group of groups) {
    const extras = [...group.docs].sort(byCreatedAt).slice(1);
    for (const extra of extras) {
      const set = { runKey: duplicateRunKey(group._id, extra.id) };
      if (extra.status === 'pending' || extra.status === 'retry_wait' || extra.status === 'running') {
        set.status = 'preview';
        set.finishedAt = new Date();
        set.summary = {
          attempted: 0,
          accepted: 0,
          failed: 0,
          skipped: 0,
          recipientOverflowCount: 0,
          message: 'quarantined duplicate runKey',
        };
      }
      await MeridianJobRun.updateOne({ _id: extra.id }, { $set: set });
      quarantined += 1;
    }
  }
  return quarantined;
}

async function collapseDuplicateAttempts(MeridianJobAttempt) {
  const groups = await MeridianJobAttempt.aggregate([
    {
      $group: {
        _id: { runId: '$runId', attemptNumber: '$attemptNumber' },
        count: { $sum: 1 },
        docs: { $push: { id: '$_id', createdAt: '$createdAt' } },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]);

  const removeIds = [];
  groups.forEach((group) => {
    const extras = [...group.docs].sort(byCreatedAt).slice(1);
    extras.forEach((extra) => removeIds.push(extra.id));
  });
  if (!removeIds.length) return 0;
  const removed = await MeridianJobAttempt.deleteMany({ _id: { $in: removeIds } });
  return removed.deletedCount || 0;
}

async function collapseDuplicateDefinitions(MeridianNotificationDefinition) {
  const groups = await MeridianNotificationDefinition.aggregate([
    {
      $group: {
        _id: { definitionKey: '$definitionKey', tenantKey: '$tenantKey' },
        count: { $sum: 1 },
        docs: { $push: { id: '$_id', createdAt: '$createdAt' } },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]);

  const removeIds = [];
  groups.forEach((group) => {
    const extras = [...group.docs].sort(byCreatedAt).slice(1);
    extras.forEach((extra) => removeIds.push(extra.id));
  });
  if (!removeIds.length) return 0;
  const removed = await MeridianNotificationDefinition.deleteMany({ _id: { $in: removeIds } });
  return removed.deletedCount || 0;
}

async function syncMeridianJobIndexes(models) {
  await models.MeridianJobRun.syncIndexes();
  await models.MeridianJobAttempt.syncIndexes();
  await models.MeridianJobDelivery.syncIndexes();
  await models.MeridianNotificationDefinition.syncIndexes();
}

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

  const models = {
    MeridianJobRun,
    MeridianJobAttempt,
    MeridianJobDelivery,
    MeridianNotificationDefinition,
  };
  let quarantinedRunKeys = 0;
  let quarantinedAttempts = 0;
  let quarantinedDefinitions = 0;
  try {
    await syncMeridianJobIndexes(models);
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    quarantinedRunKeys = await quarantineDuplicateRunKeys(MeridianJobRun);
    quarantinedAttempts = await collapseDuplicateAttempts(MeridianJobAttempt);
    quarantinedDefinitions = await collapseDuplicateDefinitions(MeridianNotificationDefinition);
    console.warn(
      `[meridianJobIndexes] removed duplicate keys before index build runs=${quarantinedRunKeys} attempts=${quarantinedAttempts} definitions=${quarantinedDefinitions}`,
    );
    await syncMeridianJobIndexes(models);
  }
  syncedGlobalDbs.add(req.globalDb);

  return {
    synced: true,
    quarantinedRunKeys,
    quarantinedAttempts,
    quarantinedDefinitions,
  };
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
