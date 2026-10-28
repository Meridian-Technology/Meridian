const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

jest.mock('../../connectionsManager', () => ({ connectToDatabase: jest.fn() }));
jest.mock('../../services/tenantConfigService', () => ({ getTenantByKey: jest.fn() }));
jest.mock('../../services/getModelService', () => jest.fn());
// Authentication boundary only: claims still resolve a real GlobalUser and
// admin routes use the real platform-role guard. No database writes are mocked.
jest.mock('../../middlewares/verifyToken', () => ({
  verifyToken: (req, res, next) => {
    const id = req.headers['x-test-user'];
    if (!id) return res.status(401).json({ success: false });
    req.user = { globalUserId: id, platformRoles: req.headers['x-test-admin'] === 'yes' ? ['platform_admin'] : [] };
    next();
  },
}));

const getGlobalModels = require('../../services/getGlobalModelService');
const getModels = require('../../services/getModelService');
const { getTenantByKey } = require('../../services/tenantConfigService');
const { createCampaign, issueCampaignInvite, claimCampaignInvite } = require('../../services/justGoCampaignService');
const publicRoutes = require('../../routes/justGoCampaignInviteRoutes');
const adminRoutes = require('../../routes/justGoCampaignAdminRoutes');

let replicaSet;
let db;
let models;
let users;
const eventId = new mongoose.Types.ObjectId();

function app() {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => { req.globalDb = db; next(); });
  server.use('/pivot/campaign-invites', publicRoutes);
  server.use('/admin/pivot/campaigns', adminRoutes);
  return server;
}

function context(user = users[0]) {
  return { globalDb: db, user: { globalUserId: user._id } };
}

function campaignInput(overrides = {}) {
  return {
    tenantKey: 'sf', eventId: String(eventId), title: 'Just Go underground', capacity: 100,
    claimsOpenAt: new Date(Date.now() - 60000).toISOString(),
    claimsCloseAt: new Date(Date.now() + 3600000).toISOString(),
    startsAt: new Date(Date.now() + 7200000).toISOString(), ...overrides,
  };
}

async function fixture({ capacity = 100, admissionLimit = 3 } = {}) {
  const created = await createCampaign(context(), campaignInput({ capacity }));
  expect(created.error).toBeUndefined();
  const campaignId = created.data.campaign.id;
  const issued = await issueCampaignInvite(context(), campaignId, { admissionLimit });
  return { campaignId, ...issued.data.invite };
}

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({
    binary: { version: '8.2.1' }, replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  db = await mongoose.createConnection(replicaSet.getUri('justgo_campaign_test')).asPromise();
  models = getGlobalModels({ globalDb: db }, 'JustGoCampaign', 'JustGoCampaignInvite', 'JustGoAdmission', 'GlobalUser');
  await Promise.all(Object.values(models).map(model => model.init()));
}, 60000);

beforeEach(async () => {
  await Promise.all(Object.values(models).map(model => model.deleteMany({})));
  users = await models.GlobalUser.create(Array.from({ length: 105 }, (_, index) => ({ email: `guest${index}@example.com` })));
  getTenantByKey.mockResolvedValue({ tenantKey: 'sf', tenantType: 'pivot', status: 'active' });
  getModels.mockReturnValue({ Event: { exists: jest.fn().mockResolvedValue({ _id: eventId }) } });
});

afterAll(async () => {
  if (db) await db.close();
  if (replicaSet) await replicaSet.stop();
});

test('preview is public, uncached, exposes no tokens or attendee identities, and consumes nothing', async () => {
  const invite = await fixture();
  const raw = await models.JustGoCampaignInvite.findById(invite.id).select('+tokenHash').lean();
  expect(raw.tokenHash).toBe(crypto.createHash('sha256').update(invite.token).digest('hex'));
  expect(JSON.stringify(raw)).not.toContain(invite.token);
  for (let i = 0; i < 3; i += 1) {
    const response = await request(app()).get(`/pivot/campaign-invites/${invite.token}`);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data.availability).toBe('available');
    expect(response.body.data.campaign.title).toBe('Just Go underground');
    expect(JSON.stringify(response.body)).not.toMatch(/passToken|globalUserId|tokenHash/);
  }
  expect((await models.JustGoCampaign.findById(invite.campaignId)).admissionCount).toBe(0);
  expect((await models.JustGoCampaignInvite.findById(invite.id)).admissionCount).toBe(0);
  expect(await models.JustGoAdmission.countDocuments()).toBe(0);
});

test('three people get distinct passes; repeat claims recover a pass and a fourth is refused', async () => {
  const invite = await fixture();
  const responses = [];
  for (const user of users.slice(0, 3)) {
    responses.push(await request(app()).post(`/pivot/campaign-invites/${invite.token}/claim`)
      .set('x-test-user', String(user._id)).send({ globalUserId: String(users[4]._id), email: users[4].email }));
  }
  expect(responses.map(response => response.status)).toEqual([201, 201, 201]);
  const passes = responses.map(response => response.body.data.admission.passToken);
  expect(new Set(passes).size).toBe(3);
  expect(passes).not.toContain(invite.token);
  const repeat = await request(app()).post(`/pivot/campaign-invites/${invite.token}/claim`).set('x-test-user', String(users[0]._id));
  expect(repeat.status).toBe(200);
  expect(repeat.body.data.existing).toBe(true);
  expect(repeat.body.data.admission.passToken).toBe(passes[0]);
  const fourth = await request(app()).post(`/pivot/campaign-invites/${invite.token}/claim`).set('x-test-user', String(users[3]._id));
  expect(fourth.status).toBe(409);
  expect(fourth.body.code).toBe('CAMPAIGN_EXHAUSTED');
  expect((await models.JustGoCampaign.findById(invite.campaignId)).admissionCount).toBe(3);
  expect((await models.JustGoCampaignInvite.findById(invite.id)).admissionCount).toBe(3);
  expect(await models.JustGoAdmission.countDocuments({ globalUserId: users[4]._id })).toBe(0);
});

test('concurrent claims cannot spend the final place twice across different tags', async () => {
  const invite = await fixture({ capacity: 1 });
  const second = (await issueCampaignInvite(context(), invite.campaignId)).data.invite;
  const results = await Promise.all([
    claimCampaignInvite(context(users[0]), invite.token),
    claimCampaignInvite(context(users[1]), second.token),
  ]);
  expect(results.filter(result => result.data).length).toBe(1);
  expect(results.filter(result => result.code === 'CAMPAIGN_FULL').length).toBe(1);
  expect(await models.JustGoAdmission.countDocuments()).toBe(1);
  expect((await models.JustGoCampaign.findById(invite.campaignId)).admissionCount).toBe(1);
  const tags = await models.JustGoCampaignInvite.find({ campaignId: invite.campaignId }).lean();
  expect(tags.reduce((sum, tag) => sum + tag.admissionCount, 0)).toBe(1);
});

test('simultaneous retries by one account through different tags create exactly one admission', async () => {
  const invite = await fixture();
  const second = (await issueCampaignInvite(context(), invite.campaignId)).data.invite;
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => claimCampaignInvite(context(), i % 2 ? invite.token : second.token)));
  expect(results.every(result => result.data)).toBe(true);
  expect(new Set(results.map(result => result.data.admission.passToken)).size).toBe(1);
  expect(results.filter(result => !result.data.existing).length).toBe(1);
  expect(await models.JustGoAdmission.countDocuments()).toBe(1);
  expect((await models.JustGoCampaign.findById(invite.campaignId)).admissionCount).toBe(1);
});

test('concurrent claims on one tag never exceed its three-person allowance', async () => {
  const invite = await fixture();
  const results = await Promise.all(users.slice(0, 10).map(user => claimCampaignInvite(context(user), invite.token)));
  expect(results.filter(result => result.data).length).toBe(3);
  expect(results.filter(result => result.code === 'CAMPAIGN_EXHAUSTED').length).toBe(7);
  expect(await models.JustGoAdmission.countDocuments()).toBe(3);
  expect((await models.JustGoCampaign.findById(invite.campaignId)).admissionCount).toBe(3);
});

test('the 100-person campaign cap survives concurrent claims for the last five places', async () => {
  const invite = await fixture({ admissionLimit: 200 });
  // Seed a consistent history, then race ten real claims at the boundary.
  await models.JustGoAdmission.insertMany(users.slice(0, 95).map(user => ({
    campaignId: invite.campaignId, inviteId: invite.id, globalUserId: user._id,
    passToken: crypto.randomBytes(32).toString('base64url'),
  })));
  await models.JustGoCampaign.updateOne({ _id: invite.campaignId }, { $set: { admissionCount: 95 } });
  await models.JustGoCampaignInvite.updateOne({ _id: invite.id }, { $set: { admissionCount: 95 } });
  const results = await Promise.all(users.slice(95).map(user => claimCampaignInvite(context(user), invite.token)));
  expect(results.filter(result => result.data).length).toBe(5);
  expect(results.filter(result => result.code === 'CAMPAIGN_FULL').length).toBe(5);
  expect(await models.JustGoAdmission.countDocuments()).toBe(100);
  expect((await models.JustGoCampaign.findById(invite.campaignId)).admissionCount).toBe(100);
  expect((await models.JustGoCampaignInvite.findById(invite.id)).admissionCount).toBe(100);
});

test.each(['revoked', 'closed', 'not-open', 'expired'])('%s invitations cannot issue passes', async (state) => {
  const invite = await fixture();
  if (state === 'revoked') await models.JustGoCampaignInvite.updateOne({ _id: invite.id }, { $set: { active: false } });
  if (state === 'closed') await models.JustGoCampaign.updateOne({ _id: invite.campaignId }, { $set: { status: 'closed' } });
  if (state === 'not-open') await models.JustGoCampaign.updateOne({ _id: invite.campaignId }, { $set: { claimsOpenAt: new Date(Date.now() + 60000) } });
  if (state === 'expired') await models.JustGoCampaign.updateOne({ _id: invite.campaignId }, { $set: { claimsCloseAt: new Date(Date.now() - 60000) } });
  const response = await request(app()).post(`/pivot/campaign-invites/${invite.token}/claim`).set('x-test-user', String(users[0]._id));
  expect(response.status).toBe(409);
  expect(await models.JustGoAdmission.countDocuments()).toBe(0);
  expect((await models.JustGoCampaign.findById(invite.campaignId)).admissionCount).toBe(0);
});

test('an owner can recover a cancelled pass after the tag is revoked, without reactivating it', async () => {
  const invite = await fixture();
  const claimed = await claimCampaignInvite(context(), invite.token);
  await models.JustGoAdmission.updateOne({ _id: claimed.data.admission.id }, { $set: { status: 'cancelled' } });
  await models.JustGoCampaignInvite.updateOne({ _id: invite.id }, { $set: { active: false } });
  const repeat = await claimCampaignInvite(context(), invite.token);
  expect(repeat.data.admission.status).toBe('cancelled');
  expect(repeat.data.admission.passToken).toBe(claimed.data.admission.passToken);
  expect((await models.JustGoCampaign.findById(invite.campaignId)).admissionCount).toBe(1);
});

test('database uniqueness prevents a second admission for the same account/campaign', async () => {
  const invite = await fixture();
  await claimCampaignInvite(context(), invite.token);
  await expect(models.JustGoAdmission.create({
    campaignId: invite.campaignId, inviteId: invite.id, globalUserId: users[0]._id,
    passToken: crypto.randomBytes(32).toString('base64url'),
  })).rejects.toMatchObject({ code: 11000 });
});

test('a failed admission insert rolls back both reservations and the caller can retry', async () => {
  const invite = await fixture();
  // Reject the real insert on the server after both counter writes. This tests
  // MongoDB rollback rather than a mocked transaction or Mongoose constructor.
  await db.db.command({ collMod: 'justgo_admissions', validator: { status: 'force-write-failure' } });
  try {
    await expect(claimCampaignInvite(context(), invite.token)).rejects.toMatchObject({ code: 121 });
  } finally {
    await db.db.command({ collMod: 'justgo_admissions', validator: {} });
  }
  expect((await models.JustGoCampaign.findById(invite.campaignId)).admissionCount).toBe(0);
  expect((await models.JustGoCampaignInvite.findById(invite.id)).admissionCount).toBe(0);
  expect(await models.JustGoAdmission.countDocuments()).toBe(0);
  expect((await claimCampaignInvite(context(), invite.token)).data.existing).toBe(false);
});

test('one event cannot acquire a second, independent capacity pool', async () => {
  await fixture();
  const duplicate = await createCampaign(context(), campaignInput());
  expect(duplicate.code).toBe('CAMPAIGN_EXISTS');
  expect(await models.JustGoCampaign.countDocuments()).toBe(1);
});

test('a closed campaign cannot issue new tags', async () => {
  const invite = await fixture();
  await models.JustGoCampaign.updateOne({ _id: invite.campaignId }, { $set: { status: 'closed' } });
  expect((await issueCampaignInvite(context(), invite.campaignId)).code).toBe('CAMPAIGN_CLOSED');
  expect(await models.JustGoCampaignInvite.countDocuments()).toBe(1);
});

test('inactive cities and missing city events cannot be provisioned', async () => {
  getTenantByKey.mockResolvedValueOnce({ tenantType: 'pivot', status: 'inactive' });
  expect((await createCampaign(context(), campaignInput())).status).toBe(400);
  getModels.mockReturnValueOnce({ Event: { exists: jest.fn().mockResolvedValue(null) } });
  expect((await createCampaign(context(), campaignInput())).status).toBe(400);
  expect(await models.JustGoCampaign.countDocuments()).toBe(0);
});

test('unknown/malformed tokens reveal nothing and claims require an existing authenticated account', async () => {
  expect((await request(app()).get('/pivot/campaign-invites/invalid')).status).toBe(404);
  expect((await request(app()).get(`/pivot/campaign-invites/${crypto.randomBytes(32).toString('base64url')}`)).status).toBe(404);
  const invite = await fixture();
  expect((await request(app()).post(`/pivot/campaign-invites/${invite.token}/claim`).send({ email: users[0].email })).status).toBe(401);
  expect((await claimCampaignInvite({ globalDb: db, user: { userId: users[0]._id } }, invite.token)).code).toBe('GLOBAL_ACCOUNT_REQUIRED');
  expect((await claimCampaignInvite(context({ _id: new mongoose.Types.ObjectId() }), invite.token)).code).toBe('GLOBAL_ACCOUNT_REQUIRED');
});

test('provisioning endpoints require platform admin and issue a three-admission tag', async () => {
  const endpoint = '/admin/pivot/campaigns';
  expect((await request(app()).post(endpoint).send(campaignInput())).status).toBe(401);
  expect((await request(app()).post(endpoint).set('x-test-user', String(users[0]._id)).send(campaignInput())).status).toBe(403);
  const created = await request(app()).post(endpoint).set('x-test-user', String(users[0]._id)).set('x-test-admin', 'yes').send(campaignInput());
  expect(created.status).toBe(201);
  const id = created.body.data.campaign.id;
  const denied = await request(app()).post(`${endpoint}/${id}/invites`).set('x-test-user', String(users[0]._id)).send({});
  expect(denied.status).toBe(403);
  const issued = await request(app()).post(`${endpoint}/${id}/invites`).set('x-test-user', String(users[0]._id)).set('x-test-admin', 'yes').send({});
  expect(issued.status).toBe(201);
  expect(issued.body.data.invite.admissionLimit).toBe(3);
  expect(issued.body.data.invite.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(issued.headers['cache-control']).toBe('no-store');
});

test.each([
  { capacity: 0 }, { capacity: 1.5 }, { capacity: '100' }, { title: '' },
  { eventId: 'bad' }, { claimsCloseAt: 'invalid' }, { startsAt: 'invalid' },
  { claimsOpenAt: null }, { claimsCloseAt: [] }, { startsAt: 123 },
  { claimsCloseAt: new Date(Date.now() - 1000).toISOString() },
])('rejects invalid provisioning payload %j', async (patch) => {
  expect((await createCampaign(context(), campaignInput(patch))).status).toBe(400);
  expect(await models.JustGoCampaign.countDocuments()).toBe(0);
});
