const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Authentication boundary only: the admin routes use the real platform-role
// guard and every write goes to a real database.
jest.mock('../../middlewares/verifyToken', () => ({
  verifyToken: (req, res, next) => {
    const id = req.headers['x-test-user'];
    if (!id) return res.status(401).json({ success: false });
    req.user = { globalUserId: id, platformRoles: req.headers['x-test-admin'] === 'yes' ? ['platform_admin'] : [] };
    next();
  },
}));

// Two Just Go cities, sf and ic. Tenant config is outside this slice.
jest.mock('../../services/pivotIngestPublishService', () => ({
  resolvePivotTenant: jest.fn(async (_req, key) => {
    const tenant = { sf: { tenantKey: 'sf', location: 'San Francisco' }, ic: { tenantKey: 'ic', location: 'Iowa City' } }[String(key || '').toLowerCase()];
    return tenant ? { tenant } : { error: 'Pivot tenant not found.', status: 404, code: 'TENANT_NOT_FOUND' };
  }),
}));
jest.mock('../../services/tenantConfigService', () => ({
  getTenantByKey: jest.fn(async (_req, key) => ({ sf: { tenantKey: 'sf', location: 'San Francisco' }, ic: { tenantKey: 'ic', location: 'Iowa City' } }[key] || null)),
}));

const getGlobalModels = require('../../services/getGlobalModelService');
const adminRoutes = require('../../routes/justGoTagAdminRoutes');
const publicRoutes = require('../../routes/justGoTagRoutes');

let server;
let db;
let models;
const adminId = String(new mongoose.Types.ObjectId());

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use((req, _res, next) => { req.globalDb = db; next(); });
  instance.use('/admin/pivot/tenants/:tenantKey/tags', adminRoutes);
  instance.use('/pivot/tags', publicRoutes);
  return instance;
}

const admin = (call) => call.set('x-test-user', adminId).set('x-test-admin', 'yes');
const tags = (city = 'sf') => `/admin/pivot/tenants/${city}/tags`;
const makeTag = (body = {}, city = 'sf') => admin(request(app()).post(tags(city))).send(body);
const lookup = (code) => request(app()).post('/pivot/tags/lookup').send({ code });

beforeAll(async () => {
  server = await MongoMemoryServer.create({ binary: { version: '8.2.1' } });
  db = await mongoose.createConnection(server.getUri('justgo_tag_test')).asPromise();
  models = getGlobalModels({ globalDb: db }, 'JustGoTag', 'PlatformRole');
  await Promise.all(Object.values(models).map(model => model.init()));
}, 60000);

beforeEach(async () => {
  await Promise.all(Object.values(models).map(model => model.deleteMany({})));
});

afterAll(async () => {
  if (db) await db.close();
  if (server) await server.stop();
});

test('only platform admins can list or make tags', async () => {
  expect((await request(app()).get(tags())).status).toBe(401);
  const guest = request(app()).post(tags()).set('x-test-user', adminId).send({});
  expect((await guest).status).toBe(403);
  expect(await models.JustGoTag.countDocuments()).toBe(0);
});

test('a new tag gets the next number and a one-time code; only its digest is stored', async () => {
  const first = await makeTag({ note: 'black, batch 1' });
  const second = await makeTag();
  expect([first.status, second.status]).toEqual([201, 201]);
  expect(first.headers['cache-control']).toBe('no-store');
  expect(first.body.data.tag).toMatchObject({ number: 1, status: 'active', note: 'black, batch 1', writtenAt: null });
  expect(second.body.data.tag.number).toBe(2);

  const { code, url } = first.body.data;
  expect(code).toMatch(/^[A-Za-z0-9_-]{22}$/);
  expect(url).toBe(`https://justgo.lol/pivot/tag/${code}`);
  expect(second.body.data.code).not.toBe(code);

  const raw = await models.JustGoTag.findById(first.body.data.tag.id).select('+tokenHash').lean();
  expect(raw.tokenHash).toBe(crypto.createHash('sha256').update(code).digest('hex'));
  expect(JSON.stringify(raw)).not.toContain(code);
});

test('tags made at the same time still get distinct numbers', async () => {
  const responses = await Promise.all(Array.from({ length: 8 }, () => makeTag()));
  expect(responses.every(response => response.status === 201)).toBe(true);
  const numbers = responses.map(response => response.body.data.tag.number).sort((a, b) => a - b);
  expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
});

test('the public lookup returns only the number, state and city', async () => {
  const made = await makeTag();
  const found = await lookup(made.body.data.code);
  expect(found.status).toBe(200);
  expect(found.headers['cache-control']).toBe('no-store');
  expect(found.body.data).toEqual({
    tag: { number: 1, status: 'active', tenantKey: 'sf', cityDisplayName: 'San Francisco' },
  });

  for (const code of ['', 'short', 'x'.repeat(22), 42]) {
    const response = await request(app()).post('/pivot/tags/lookup').send({ code });
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('TAG_NOT_FOUND');
  }
});

test('rewriting rotates the code, kills the old one, and clears the written mark', async () => {
  const made = await makeTag();
  const { id } = made.body.data.tag;
  const written = await admin(request(app()).post(`${tags()}/${id}/written`)).send();
  expect(written.status).toBe(200);
  expect(written.body.data.tag.writtenAt).toBeTruthy();

  const rotated = await admin(request(app()).post(`${tags()}/${id}/code`)).send();
  expect(rotated.status).toBe(200);
  expect(rotated.body.data.tag).toMatchObject({ number: 1, writtenAt: null });
  expect(rotated.body.data.code).not.toBe(made.body.data.code);
  expect((await lookup(made.body.data.code)).status).toBe(404);
  expect((await lookup(rotated.body.data.code)).body.data.tag.number).toBe(1);
});

test('erasing by code kills the code, clears the written mark, and keeps the number', async () => {
  const made = await makeTag();
  const { id } = made.body.data.tag;
  await admin(request(app()).post(`${tags()}/${id}/written`)).send();

  const erased = await admin(request(app()).post(`${tags()}/erase`)).send({ code: made.body.data.code });
  expect(erased.status).toBe(200);
  expect(erased.body.data.tag).toMatchObject({ id, number: 1, status: 'active', writtenAt: null });
  expect(erased.body.data.code).toBeUndefined();
  expect((await lookup(made.body.data.code)).status).toBe(404);

  // Holding the same wiped tag again finds nothing to erase.
  const again = await admin(request(app()).post(`${tags()}/erase`)).send({ code: made.body.data.code });
  expect(again.status).toBe(404);
  expect(again.body.code).toBe('TAG_NOT_FOUND');
});

test('only platform admins can erase, and junk codes are not found', async () => {
  const made = await makeTag();
  const guest = request(app()).post(`${tags()}/erase`).set('x-test-user', adminId).send({ code: made.body.data.code });
  expect((await guest).status).toBe(403);
  expect((await lookup(made.body.data.code)).status).toBe(200);
  const junk = await admin(request(app()).post(`${tags()}/erase`)).send({ code: 'nope' });
  expect(junk.status).toBe(404);
});

test('a revoked tag still looks up, as revoked, and can be restored', async () => {
  const made = await makeTag();
  const { id } = made.body.data.tag;
  const revoked = await admin(request(app()).post(`${tags()}/${id}/status`)).send({ status: 'revoked' });
  expect(revoked.body.data.tag.status).toBe('revoked');
  expect((await lookup(made.body.data.code)).body.data.tag.status).toBe('revoked');

  const bad = await admin(request(app()).post(`${tags()}/${id}/status`)).send({ status: 'gone' });
  expect(bad.status).toBe(400);
  const restored = await admin(request(app()).post(`${tags()}/${id}/status`)).send({ status: 'active' });
  expect(restored.body.data.tag.status).toBe('active');
});

test('the list is newest first and never includes codes', async () => {
  const made = [await makeTag(), await makeTag(), await makeTag()];
  const listed = await admin(request(app()).get(tags()));
  expect(listed.status).toBe(200);
  expect(listed.body.data.tags.map(tag => tag.number)).toEqual([3, 2, 1]);
  const body = JSON.stringify(listed.body);
  expect(body).not.toMatch(/tokenHash|"code"/);
  for (const response of made) expect(body).not.toContain(response.body.data.code);
});

test('unknown tag ids and long notes are refused', async () => {
  const unknown = String(new mongoose.Types.ObjectId());
  expect((await admin(request(app()).post(`${tags()}/${unknown}/code`)).send()).status).toBe(404);
  expect((await admin(request(app()).post(`${tags()}/not-an-id/written`)).send()).status).toBe(404);
  const long = await makeTag({ note: 'x'.repeat(121) });
  expect(long.status).toBe(400);
  expect(long.body.code).toBe('INVALID_TAG_INPUT');
});

test('each city numbers its own tags and only sees its own', async () => {
  const sf = [await makeTag({}, 'sf'), await makeTag({}, 'sf')];
  const ic = await makeTag({}, 'ic');
  expect(sf.map(response => response.body.data.tag.number)).toEqual([1, 2]);
  expect(ic.body.data.tag).toMatchObject({ number: 1, tenantKey: 'ic' });

  const listed = await admin(request(app()).get(tags('ic')));
  expect(listed.body.data).toMatchObject({ tenantKey: 'ic', cityDisplayName: 'Iowa City' });
  expect(listed.body.data.tags.map(tag => tag.id)).toEqual([ic.body.data.tag.id]);

  const icLookup = await lookup(ic.body.data.code);
  expect(icLookup.body.data.tag).toMatchObject({ number: 1, tenantKey: 'ic', cityDisplayName: 'Iowa City' });
});

test('a city cannot change another city\'s tag by id', async () => {
  const sf = await makeTag({}, 'sf');
  const { id } = sf.body.data.tag;
  const fromIc = (path) => admin(request(app()).post(`${tags('ic')}/${path}`));
  expect((await fromIc(`${id}/status`).send({ status: 'revoked' })).status).toBe(404);
  expect((await fromIc(`${id}/code`).send()).status).toBe(404);
  expect((await fromIc(`${id}/written`).send()).status).toBe(404);
  expect((await lookup(sf.body.data.code)).body.data.tag.status).toBe('active');
});

test('erasing a tag in hand updates its own city, whichever city ops is on', async () => {
  const sf = await makeTag({}, 'sf');
  const erased = await admin(request(app()).post(`${tags('ic')}/erase`)).send({ code: sf.body.data.code });
  expect(erased.status).toBe(200);
  expect(erased.body.data.tag).toMatchObject({ tenantKey: 'sf', number: 1, writtenAt: null });
  expect((await lookup(sf.body.data.code)).status).toBe(404);
});

test('unknown cities are refused before anything is written', async () => {
  const response = await makeTag({}, 'atlantis');
  expect(response.status).toBe(404);
  expect(response.body.code).toBe('TENANT_NOT_FOUND');
  expect(await models.JustGoTag.countDocuments()).toBe(0);
});
