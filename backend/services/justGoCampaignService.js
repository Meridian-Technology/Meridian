const crypto = require('crypto');
const getGlobalModels = require('./getGlobalModelService');
const getModels = require('./getModelService');
const { connectToDatabase } = require('../connectionsManager');
const { getTenantByKey } = require('./tenantConfigService');
const { isPivotTenant } = require('../utilities/pivotDropSchedule');

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const ID_PATTERN = /^[a-f\d]{24}$/i;
const MODEL_NAMES = ['JustGoCampaign', 'JustGoCampaignInvite', 'JustGoAdmission'];
const missing = () => ({ error: 'Invitation not found.', status: 404, code: 'INVITE_NOT_FOUND' });
const invalid = (error) => ({ error, status: 400, code: 'INVALID_CAMPAIGN_INPUT' });
const newToken = () => crypto.randomBytes(32).toString('base64url');
const tokenHash = (token) => crypto.createHash('sha256').update(token).digest('hex');
const validId = (id) => ID_PATTERN.test(String(id || ''));
const parseDate = (value) => (typeof value === 'string' && value.trim() ? new Date(value) : new Date(NaN));

function campaignData(row) {
  return {
    id: String(row._id),
    tenantKey: row.tenantKey,
    eventId: String(row.eventId),
    title: row.title,
    startsAt: row.startsAt,
    claimsOpenAt: row.claimsOpenAt,
    claimsCloseAt: row.claimsCloseAt,
    status: row.status,
  };
}

function admissionData(row, existing) {
  return {
    existing,
    admission: {
      id: String(row._id),
      campaignId: String(row.campaignId),
      status: row.status,
      passToken: row.passToken,
      checkedInAt: row.checkedInAt || null,
      createdAt: row.createdAt,
    },
  };
}

function availability(campaign, invite, now = new Date()) {
  if (!invite.active) return 'revoked';
  if (campaign.status !== 'active') return 'closed';
  if (now < campaign.claimsOpenAt) return 'not-open';
  if (now >= campaign.claimsCloseAt) return 'closed';
  if (campaign.admissionCount >= campaign.capacity) return 'full';
  if (invite.admissionCount >= invite.admissionLimit) return 'exhausted';
  return 'available';
}

/** Public preview. Never increments counters or returns attendee/pass data. */
async function previewCampaignInvite(req, token) {
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return missing();
  const { JustGoCampaign, JustGoCampaignInvite } = getGlobalModels(req, ...MODEL_NAMES);
  const invite = await JustGoCampaignInvite.findOne({ tokenHash: tokenHash(token) }).lean();
  if (!invite) return missing();
  const campaign = await JustGoCampaign.findById(invite.campaignId).lean();
  if (!campaign) return missing();
  return { data: { campaign: campaignData(campaign), availability: availability(campaign, invite) } };
}

class ClaimRejected extends Error {
  constructor(state) {
    super('This invitation cannot issue another admission.');
    this.status = 409;
    this.code = `CAMPAIGN_${state.replace(/-/g, '_').toUpperCase()}`;
  }
}

/** Identity comes exclusively from verified authentication, never the body. */
async function claimCampaignInvite(req, token) {
  const globalUserId = req.user?.globalUserId;
  if (!validId(globalUserId)) {
    return { error: 'Sign in with a global account to claim admission.', status: 401, code: 'GLOBAL_ACCOUNT_REQUIRED' };
  }
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return missing();
  const { JustGoCampaign, JustGoCampaignInvite, JustGoAdmission, GlobalUser } = getGlobalModels(
    req, ...MODEL_NAMES, 'GlobalUser',
  );
  if (!await GlobalUser.exists({ _id: globalUserId })) {
    return { error: 'Account not found.', status: 401, code: 'GLOBAL_ACCOUNT_REQUIRED' };
  }
  // Finish collection/index initialization before entering a transaction.
  await Promise.all([JustGoCampaign.init(), JustGoCampaignInvite.init(), JustGoAdmission.init()]);
  const session = await req.globalDb.startSession();
  let campaignId;
  try {
    return await session.withTransaction(async () => {
      const invite = await JustGoCampaignInvite.findOne({ tokenHash: tokenHash(token) }).session(session).lean();
      if (!invite) return missing();
      campaignId = invite.campaignId;
      const existing = await JustGoAdmission.findOne({ campaignId, globalUserId })
        .select('+passToken').session(session).lean();
      // Recovery still works after closure/exhaustion/revocation, including a
      // cancelled pass. A cancelled admission never silently becomes valid.
      if (existing) return { data: admissionData(existing, true) };

      const campaign = await JustGoCampaign.findById(campaignId).session(session).lean();
      if (!campaign) return missing();
      const now = new Date();
      const state = availability(campaign, invite, now);
      if (state !== 'available') throw new ClaimRejected(state);

      // Every claim writes the campaign before the tag, so concurrent claims
      // serialize on capacity. Any later failure rolls both counters back.
      const reserved = await JustGoCampaign.updateOne({
        _id: campaignId,
        status: 'active',
        claimsOpenAt: { $lte: now },
        claimsCloseAt: { $gt: now },
        $expr: { $lt: ['$admissionCount', '$capacity'] },
      }, { $inc: { admissionCount: 1 } }, { session });
      if (reserved.modifiedCount !== 1) throw new ClaimRejected('unavailable');
      const tagReserved = await JustGoCampaignInvite.updateOne({
        _id: invite._id,
        active: true,
        $expr: { $lt: ['$admissionCount', '$admissionLimit'] },
      }, { $inc: { admissionCount: 1 } }, { session });
      if (tagReserved.modifiedCount !== 1) throw new ClaimRejected('unavailable');

      const [admission] = await JustGoAdmission.create([{
        campaignId,
        inviteId: invite._id,
        globalUserId,
        passToken: newToken(),
      }], { session });
      return { data: admissionData(admission, false) };
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' });
  } catch (error) {
    // A simultaneous claim by this account through another tag may win the
    // unique (campaign, attendee) constraint. Return that committed pass.
    if (error.code === 11000 && campaignId) {
      const existing = await JustGoAdmission.findOne({ campaignId, globalUserId }).select('+passToken').lean();
      if (existing) return { data: admissionData(existing, true) };
    }
    if (error instanceof ClaimRejected) return { error: error.message, status: error.status, code: error.code };
    throw error;
  } finally {
    await session.endSession();
  }
}

/** Called only behind platform-admin middleware. */
async function createCampaign(req, body = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return invalid('Expected a campaign object.');
  const tenantKey = typeof body.tenantKey === 'string' ? body.tenantKey.trim().toLowerCase() : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const capacity = body.capacity === undefined ? 100 : body.capacity;
  const claimsOpenAt = body.claimsOpenAt === undefined ? new Date() : parseDate(body.claimsOpenAt);
  const claimsCloseAt = parseDate(body.claimsCloseAt);
  const startsAt = parseDate(body.startsAt);
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(tenantKey) || !validId(body.eventId)) return invalid('A city and eventId are required.');
  if (!title || title.length > 160) return invalid('title must contain 1 to 160 characters.');
  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 100000) return invalid('capacity must be an integer from 1 to 100000.');
  if (![claimsOpenAt, claimsCloseAt, startsAt].every(date => Number.isFinite(date.getTime()))
    || claimsCloseAt <= claimsOpenAt || claimsCloseAt > startsAt || claimsCloseAt <= new Date()) {
    return invalid('Provide valid dates with claimsOpenAt < claimsCloseAt <= startsAt and claimsCloseAt in the future.');
  }
  const tenant = await getTenantByKey(req, tenantKey);
  if (!tenant || !isPivotTenant(tenant) || tenant.status !== 'active') return invalid('An active Just Go city is required.');
  const db = await connectToDatabase(tenantKey);
  const { Event } = getModels({ db, school: tenantKey }, 'Event');
  if (!await Event.exists({ _id: body.eventId })) return invalid('Event not found in this city.');

  const { JustGoCampaign, JustGoCampaignInvite, JustGoAdmission } = getGlobalModels(req, ...MODEL_NAMES);
  await Promise.all([JustGoCampaign.init(), JustGoCampaignInvite.init(), JustGoAdmission.init()]);
  try {
    const campaign = await JustGoCampaign.create({ tenantKey, eventId: body.eventId, title, capacity, startsAt, claimsOpenAt, claimsCloseAt });
    return { data: { campaign: { ...campaignData(campaign), capacity, admissionCount: 0 } } };
  } catch (error) {
    if (error.code === 11000) return { error: 'This event already has an admission campaign.', status: 409, code: 'CAMPAIGN_EXISTS' };
    throw error;
  }
}

async function issueCampaignInvite(req, campaignId, body = {}) {
  if (!validId(campaignId)) return invalid('Invalid campaignId.');
  if (!body || typeof body !== 'object' || Array.isArray(body)) return invalid('Expected an invitation object.');
  const admissionLimit = body.admissionLimit === undefined ? 3 : body.admissionLimit;
  if (!Number.isSafeInteger(admissionLimit) || admissionLimit < 1 || admissionLimit > 100000) {
    return invalid('admissionLimit must be an integer from 1 to 100000.');
  }
  const { JustGoCampaign, JustGoCampaignInvite } = getGlobalModels(req, ...MODEL_NAMES);
  const campaign = await JustGoCampaign.findById(campaignId).lean();
  if (!campaign) return { error: 'Campaign not found.', status: 404, code: 'CAMPAIGN_NOT_FOUND' };
  if (campaign.status !== 'active' || campaign.claimsCloseAt <= new Date()) {
    return { error: 'Campaign is closed.', status: 409, code: 'CAMPAIGN_CLOSED' };
  }
  const token = newToken();
  const invite = await JustGoCampaignInvite.create({ campaignId, tokenHash: tokenHash(token), admissionLimit });
  return { data: { invite: { id: String(invite._id), campaignId: String(campaignId), admissionLimit, token } } };
}

module.exports = { previewCampaignInvite, claimCampaignInvite, createCampaign, issueCampaignInvite };
