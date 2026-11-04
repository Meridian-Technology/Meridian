const mongoose = require('mongoose');
const { createMongoMemoryConnection } = require('../helpers/mongoMemory');
jest.mock('../../connectionsManager', () => ({ connectToDatabase: jest.fn() }));
const { connectToDatabase } = require('../../connectionsManager');
const getModels = require('../../services/getModelService');
const getGlobalModels = require('../../services/getGlobalModelService');
const { ensurePivotComputeJobIndexes } = require('../../services/ensurePivotComputeJobIndexes');
const { createCarouselAccount, getCarouselIssue } = require('../../services/pivotCarouselIssueService');
const { seedCarouselComposeDraft, readArgs } = require('../../migrations/seedCarouselComposeDraft');

const PUBLICATION = '2026-10-12T23:00:00.000Z';
const eventDoc = (name, { image = 'https://example.test/poster.jpg', start = '2026-10-13T23:00:00Z' } = {}) => ({
  name, description: 'Catalog description', type: 'social', location: 'Catalog venue',
  start_time: new Date(start), end_time: new Date(Date.parse(start) + 3600000),
  hostingType: 'Org', hostingId: new mongoose.Types.ObjectId(), expectedAttendance: 30,
  status: 'not-applicable', visibility: 'public', image,
  customFields: { pivot: { ingestStatus: 'published', batchWeek: '2026-W42', tags: ['music'] } },
});

describe('seedCarouselComposeDraft script', () => {
  let mongo; let req; let account; let dbs;
  const args = (overrides = {}) => ({ account: 'just.go.ic', events: 3, decision: 'compose', publication: PUBLICATION,
    write: true, allowProduction: false, ...overrides });

  beforeAll(async () => {
    mongo = await createMongoMemoryConnection({ withGlobalDb: true, connectionOptions: { autoCreate: false, autoIndex: false } });
    req = { globalDb: mongo.globalConnection, user: { globalUserId: 'compose-seed-script' } };
  });
  beforeEach(async () => {
    await mongo.reset();
    dbs = new Map();
    connectToDatabase.mockReset();
    connectToDatabase.mockImplementation(async (key) => {
      if (!dbs.has(key)) dbs.set(key, mongo.connection.useDb(key, { useCache: true }));
      return dbs.get(key);
    });
    const { TenantConfig } = getGlobalModels(req, 'TenantConfig');
    await TenantConfig.create({ configKey: 'default', tenants: [
      { tenantKey: 'ic', subdomain: 'ic', name: 'Iowa City', tenantType: 'pivot', pivotDropTimezone: 'America/Chicago' },
    ] });
    await ensurePivotComputeJobIndexes(req, { force: true });
    account = (await createCarouselAccount(req, { displayName: 'Just Go Curation Iowa City', handle: '@just.go.ic',
      ownerTenantKey: 'ic', sourceTenantKeys: ['ic'], defaultFormat: 'city-picks' })).data.account;
  });
  afterEach(async () => { jest.restoreAllMocks(); if (dbs) for (const db of dbs.values()) await db.dropDatabase(); });
  afterAll(async () => { if (mongo) await mongo.cleanup(); });

  async function seedEvents(docs) {
    const db = await connectToDatabase('ic');
    await getModels({ db }, 'Event').Event.create(docs);
  }

  test('a dry run builds the real context and writes nothing', async () => {
    await seedEvents(['One', 'Two', 'Three'].map((name) => eventDoc(name)));
    const lines = [];
    const outcome = await seedCarouselComposeDraft(req, args({ write: false }), { log: (line) => lines.push(line) });
    expect(outcome).toEqual({ written: false, externalJobId: null, issueId: null });
    expect(lines.join('\n')).toContain('3 candidates');
    const { PivotComputeJob, PivotCarouselDeck } = getGlobalModels(req, 'PivotComputeJob', 'PivotCarouselDeck');
    expect(await PivotComputeJob.countDocuments({})).toBe(0);
    expect(await PivotCarouselDeck.countDocuments({})).toBe(0);
  });

  test('--write creates one unapproved generated draft through the worker path, labelled as a test', async () => {
    await seedEvents(['One', 'Two', 'Three', 'Four'].map((name) => eventDoc(name)));
    const outcome = await seedCarouselComposeDraft(req, args());
    expect(outcome).toMatchObject({ written: true, decision: 'compose', issueId: expect.any(String) });
    const issue = (await getCarouselIssue(req, account.id, outcome.issueId)).data.issue;
    expect(issue).toMatchObject({ origin: 'agent-generated', reviewState: 'unapproved', approval: null, posting: null });
    expect(issue.socialCaption).toMatch(/^\[Seeded test draft\. Not for posting\.\]/);
    expect(issue.document.slides.map((slide) => slide.role)).toEqual(['cover', 'event', 'event', 'event']);
    const { PivotComputeJob } = getGlobalModels(req, 'PivotComputeJob');
    const job = await PivotComputeJob.findOne({ externalJobId: outcome.externalJobId }).lean();
    expect(job).toMatchObject({ status: 'completed', origin: { type: 'admin' }, composeOutcome: { decision: 'compose' } });
  });

  test('a needs-editor decision records the outcome and creates no draft', async () => {
    await seedEvents(['One', 'Two', 'Three'].map((name) => eventDoc(name)));
    const outcome = await seedCarouselComposeDraft(req, args({ decision: 'needs-editor' }));
    expect(outcome).toMatchObject({ written: true, decision: 'needs-editor', issueId: null });
    const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
    expect(await PivotCarouselDeck.countDocuments({})).toBe(0);
  });

  test('--relay queues a real compose job for Relay instead of submitting a scripted result', async () => {
    const { createAdminComputeJob } = require('../../services/pivotComputeAdminService');
    const createAdminJob = (scopedReq, input) => createAdminComputeJob(scopedReq, {
      ...input, notifyWake: async () => ({ status: 'accepted' }), scheduleLocal: () => false,
    });
    const outcome = await seedCarouselComposeDraft(req, args({ relay: true }), { createAdminJob });
    expect(outcome).toMatchObject({ written: true, issueId: null, wake: 'accepted' });
    const { PivotComputeJob, PivotCarouselDeck } = getGlobalModels(req, 'PivotComputeJob', 'PivotCarouselDeck');
    const job = await PivotComputeJob.findOne({ externalJobId: outcome.externalJobId }).lean();
    expect(job).toMatchObject({ kind: 'carousel-compose', status: 'pending', cityKey: 'ic',
      options: { editorialAccountKey: 'just.go.ic', proposedPublicationAt: PUBLICATION } });
    expect(await PivotCarouselDeck.countDocuments({})).toBe(0);
  });

  test('explains when too few candidates have posters', async () => {
    await seedEvents([eventDoc('One'), eventDoc('Two', { image: '' }), eventDoc('Three', { image: '' })]);
    await expect(seedCarouselComposeDraft(req, args({ write: false }))).rejects.toThrow(/Only 1 of 3 candidate events have a poster/);
  });

  test('validates its arguments', () => {
    expect(readArgs(['--account=just.go.sf', '--events=5', '--write'])).toMatchObject({ account: 'just.go.sf', events: 5, write: true });
    expect(readArgs([]).write).toBe(false);
    expect(() => readArgs(['--account=elsewhere'])).toThrow(/--account must be one of/);
    expect(() => readArgs(['--events=6'])).toThrow(/--events must be 3, 4 or 5/);
    expect(() => readArgs(['--decision=post'])).toThrow(/--decision must be one of/);
    expect(readArgs(['--relay', '--write'])).toMatchObject({ relay: true, write: true });
    expect(() => readArgs(['--relay', '--decision=wait'])).toThrow(/--relay lets the agent decide/);
  });
});
