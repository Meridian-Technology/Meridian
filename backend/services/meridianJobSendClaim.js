/**
 * One Expo send per meridian job run.
 * A retry that finds this stamp does not call Expo again.
 * A crash after the stamp and before any delivery row skips the resend;
 * the city panel can still force a new direct run.
 */
const { connectToGlobalDatabase } = require('../connectionsManager');
const getGlobalModels = require('./getGlobalModelService');

const SENT_DELIVERY_STATUSES = Object.freeze(['accepted', 'failed', 'blocked_dev_gate']);

async function resolveJobReq(req) {
  if (req?.globalDb) return req;
  const globalDb = await connectToGlobalDatabase();
  return { ...(req || {}), globalDb };
}

async function claimMeridianJobExpoSend(req, runId, { now = new Date() } = {}) {
  if (!runId) return { proceed: true, reason: 'no_run', deliveryCount: 0 };
  const jobReq = await resolveJobReq(req);
  const { MeridianJobRun, MeridianJobDelivery } = getGlobalModels(
    jobReq,
    'MeridianJobRun',
    'MeridianJobDelivery',
  );

  const claimed = await MeridianJobRun.findOneAndUpdate(
    {
      _id: runId,
      $or: [
        { 'payload.expoSendStartedAt': { $exists: false } },
        { 'payload.expoSendStartedAt': null },
      ],
    },
    { $set: { 'payload.expoSendStartedAt': now } },
  );
  if (claimed) return { proceed: true, reason: 'claimed', deliveryCount: 0 };

  const deliveryCount = await MeridianJobDelivery.countDocuments({
    runId,
    deliveryStatus: { $in: SENT_DELIVERY_STATUSES },
  });
  return {
    proceed: false,
    reason: deliveryCount > 0 ? 'already_audited' : 'send_started',
    deliveryCount,
  };
}

async function releaseMeridianJobExpoSend(req, runId) {
  if (!runId) return;
  const jobReq = await resolveJobReq(req);
  const { MeridianJobRun, MeridianJobDelivery } = getGlobalModels(
    jobReq,
    'MeridianJobRun',
    'MeridianJobDelivery',
  );
  const deliveryCount = await MeridianJobDelivery.countDocuments({
    runId,
    deliveryStatus: { $in: SENT_DELIVERY_STATUSES },
  });
  if (deliveryCount > 0) return;
  await MeridianJobRun.updateOne(
    { _id: runId },
    { $unset: { 'payload.expoSendStartedAt': '' } },
  );
}

function duplicateExpoSendResult(claim = {}) {
  return {
    terminalStatus: 'succeeded',
    summary: {
      attempted: claim.deliveryCount || 0,
      accepted: 0,
      failed: 0,
      skipped: 0,
      recipientOverflowCount: 0,
      message: 'skipped duplicate expo send',
    },
  };
}

module.exports = {
  claimMeridianJobExpoSend,
  releaseMeridianJobExpoSend,
  duplicateExpoSendResult,
};
