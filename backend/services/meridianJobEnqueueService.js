const { connectToGlobalDatabase } = require('../connectionsManager');
const getGlobalModels = require('./getGlobalModelService');
const { MAX_ATTEMPTS } = require('../schemas/meridianJobRun');
const { getMeridianJobHandler } = require('./meridianJobRegistry');
const { ensureMeridianJobHandlersLoaded } = require('./meridianJobHandlers');
const { ensureMeridianJobIndexes } = require('./ensureMeridianJobIndexes');

async function resolveJobReq(req) {
  if (req?.globalDb) return req;
  const globalDb = await connectToGlobalDatabase();
  return { ...(req || {}), globalDb };
}

async function enqueueMeridianJob(req, {
  handlerKey,
  tenantKey,
  payload = {},
  scheduledFor = null,
} = {}) {
  ensureMeridianJobHandlersLoaded();
  const handler = getMeridianJobHandler(handlerKey);
  if (!handler) {
    throw new Error(`Unknown meridian job handler: ${handlerKey}`);
  }
  if (!tenantKey) {
    throw new Error('tenantKey is required to enqueue a meridian job');
  }

  const jobReq = await resolveJobReq(req);
  await ensureMeridianJobIndexes(jobReq);
  const { MeridianJobRun } = getGlobalModels(jobReq, 'MeridianJobRun');
  const scheduled = scheduledFor ? new Date(scheduledFor) : new Date();
  const runKey = handler.buildRunKey({ tenantKey, payload, scheduledFor: scheduled });

  try {
    const run = await MeridianJobRun.create({
      runKey,
      category: handler.category,
      type: handlerKey,
      tenantKey,
      status: 'pending',
      scheduledFor: scheduled,
      nextAttemptAt: scheduled,
      attemptCount: 0,
      maxAttempts: MAX_ATTEMPTS,
      payload,
    });
    return { run, created: true };
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const run = await MeridianJobRun.findOne({ runKey });
    if (!run) throw error;
    return { run, created: false };
  }
}

module.exports = {
  enqueueMeridianJob,
};
