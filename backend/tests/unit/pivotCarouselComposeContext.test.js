const mongoose = require('mongoose');
const { createMongoMemoryConnection } = require('../helpers/mongoMemory');
jest.mock('../../connectionsManager', () => ({ connectToDatabase: jest.fn() }));
const { connectToDatabase } = require('../../connectionsManager');
const getModels = require('../../services/getModelService');
const getGlobalModels = require('../../services/getGlobalModelService');
const { getMergedTenants } = require('../../services/tenantConfigService');
const { EDITORIAL_ACCOUNTS, editorialAccountFor } = require('../../constants/pivotCarouselEditorialAccounts');
const { composeWindow, buildCarouselComposeContextSnapshot } = require('../../services/pivotCarouselComposeContextService');
const { createCarouselAccount, createCarouselIssue, createGeneratedCarouselIssue, updateCarouselIssue,
  approveCarouselIssue, markCarouselIssuePosted } = require('../../services/pivotCarouselIssueService');
const { addCarouselIssueFeedback, listEditorialFeedback } = require('../../services/pivotCarouselEditorialFeedbackService');
const { validateContextSnapshot } = require('../../utilities/pivotAdminComputeJobContract');
const { createComputeJob, claimNextPendingJob } = require('../../services/pivotComputeJobStore');
const { fetchJobContext } = require('../../services/pivotComputeWorkerService');

const PUBLICATION = '2026-11-02T21:00:00.000Z';
const HOSTING_ID = new mongoose.Types.ObjectId();
function eventDoc(name, start, pivot = {}) {
  return { name, type: 'social', location: 'The venue', start_time: new Date(start),
    end_time: new Date(Date.parse(start) + 2 * 3600000),
    status: 'not-applicable', visibility: 'public', expectedAttendance: 40,
    hostingType: 'Org', hostingId: HOSTING_ID, description: 'Catalog description',
    image: 'https://example.test/poster.jpg', externalLink: 'https://example.test/tickets',
    customFields: { pivot: { ingestStatus: 'published', batchWeek: '2026-W44',
      host: { name: 'The organizer', profileUrl: 'https://example.test/host' },
      source: 'partiful', sourceUrl: 'https://example.test/listing', tags: ['music'], ...pivot } } };
}
function studioDocument(ref, headline = 'Published headline') {
  return { schemaVersion: 2, width: 1080, height: 1350, slides: [
    { id: 'cover', role: 'cover', preset: { family: 'open-invitation', variation: 2 },
      elements: [{ id: 'title', kind: 'text', role: 'cover-title', text: headline,
        frame: { x: 0, y: 0, width: 400, height: 80 } }] },
    { id: 'event', role: 'event', source: ref, preset: { id: 'photo-note' },
      elements: [{ id: 'copy', kind: 'text', text: 'Event copy', frame: { x: 0, y: 0, width: 400, height: 80 } }] },
  ] };
}

describe('compose windows', () => {
  test('three fixed editorial identities use the existing city keys and all-tenant retrospective scope', () => {
    expect(EDITORIAL_ACCOUNTS.map(account => [account.key, account.sourceTenantKeys])).toEqual([
      ['just.go.ic', ['ic']], ['just.go.sf', ['sf']], ['sorry.u.missed.it', 'all'],
    ]);
  });
  test('fourteen days are inclusive and anchored to publication, preserving seconds and milliseconds', () => {
    expect(composeWindow(editorialAccountFor('just.go.ic'), '2026-10-10T23:00:03.123Z')).toMatchObject({
      from: '2026-10-10T23:00:03.123Z', to: '2026-10-24T23:00:03.123Z', toExclusive: false,
    });
  });
  test.each([
    ['2026-11-02T21:00:00.000Z', '2026-10-26T20:00:00.000Z', 169],
    ['2026-03-09T20:00:00.000Z', '2026-03-02T21:00:00.000Z', 167],
  ])('seven local days cross DST at %s', (publication, from, hours) => {
    const window = composeWindow(editorialAccountFor('sorry.u.missed.it'), publication, 'America/Los_Angeles');
    expect(window).toMatchObject({ from, to: publication, toExclusive: true, days: 7 });
    expect((Date.parse(window.to) - Date.parse(window.from)) / 3600000).toBe(hours);
  });
  test('fourteen-day curation windows preserve local publication time across fall DST', () => {
    expect(composeWindow(editorialAccountFor('just.go.sf'), '2026-10-24T20:00:00.000Z')).toMatchObject({
      from: '2026-10-24T20:00:00.000Z', to: '2026-11-07T21:00:00.000Z', toExclusive: false,
    });
  });
});

describe('carousel compose catalog context with real persistence', () => {
  let mongo; let req; let accounts; let dbs; let postingClock;
  beforeAll(async () => {
    // Set these at connection creation so useDb inherits Mongoose's config.
    // Connection.set() stores them in driver options and does not disable setup.
    mongo = await createMongoMemoryConnection({ withGlobalDb: true,
      connectionOptions: { autoCreate: false, autoIndex: false } });
    req = { globalDb: mongo.globalConnection, user: { globalUserId: 'editor' } };
  });
  beforeEach(async () => {
    await mongo.reset();
    // Posting fixtures must be historical regardless of the day this suite runs.
    postingClock = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-10T00:00:00Z'));
    dbs = new Map();
    connectToDatabase.mockReset();
    connectToDatabase.mockImplementation(async key => {
      if (!dbs.has(key)) {
        const db = mongo.connection.useDb(key, { useCache: true });
        dbs.set(key, db);
      }
      return dbs.get(key);
    });
    const { TenantConfig } = getGlobalModels(req, 'TenantConfig');
    await TenantConfig.create({ configKey: 'default', tenants: [
      { tenantKey: 'ic', subdomain: 'ic', name: 'Iowa City', tenantType: 'pivot', pivotDropTimezone: 'America/Chicago' },
      { tenantKey: 'sf', subdomain: 'sf', name: 'San Francisco', tenantType: 'pivot', pivotDropTimezone: 'America/Los_Angeles' },
    ] });
    accounts = {};
    for (const definition of EDITORIAL_ACCOUNTS) {
      const result = await createCarouselAccount(req, { displayName: definition.displayName, handle: definition.handle,
        ownerTenantKey: definition.ownerTenantKey || 'sf',
        sourceTenantKeys: definition.sourceTenantKeys === 'all' ? ['sf'] : [...definition.sourceTenantKeys],
        defaultFormat: definition.format });
      expect(result.error).toBeUndefined();
      accounts[definition.key] = result.data.account.id;
    }
  });
  afterEach(async () => {
    postingClock?.mockRestore();
    if (dbs) await Promise.all([...dbs.values()].map(db => db.dropDatabase()));
  });
  afterAll(async () => { if (mongo) await mongo.cleanup(); });

  it('resolves all three scheduling identities from the existing account owner without exposing account data', async () => {
    const { listCarouselComposeScheduleAccounts } = require('../../services/pivotCarouselComposeContextService');
    expect(await listCarouselComposeScheduleAccounts(req)).toEqual({ accounts: [
      { key: 'just.go.ic', cityKey: 'ic', timezone: 'America/Chicago' },
      { key: 'just.go.sf', cityKey: 'sf', timezone: 'America/Los_Angeles' },
      { key: 'sorry.u.missed.it', cityKey: 'sf', timezone: 'America/Los_Angeles' },
    ] });
    const { PivotCarouselAccount } = getGlobalModels(req, 'PivotCarouselAccount');
    await PivotCarouselAccount.updateOne({ _id: accounts['sorry.u.missed.it'] }, { $set: { ownerTenantKey: 'ic' } });
    const changed = await listCarouselComposeScheduleAccounts(req);
    expect(changed.accounts[2]).toEqual({ key: 'sorry.u.missed.it', cityKey: 'ic', timezone: 'America/Chicago' });
  });

  async function events(tenantKey, names, start = '2026-10-30T20:00:00.000Z', pivot) {
    const db = await connectToDatabase(tenantKey);
    return getModels({ db }, 'Event').Event.create(names.map(name => eventDoc(name, start, pivot)));
  }
  async function context(accountKey = 'sorry.u.missed.it', publication = PUBLICATION, extra = {}) {
    const job = { externalJobId: 'job:compose-test-001', cityKey: accountKey === 'just.go.ic' ? 'ic' : 'sf',
      implementationRevision: 'meridian-backend@test', options: { editorialAccountKey: accountKey, proposedPublicationAt: publication } };
    const result = await buildCarouselComposeContextSnapshot(req, { job, now: new Date('2026-10-30T06:00:00Z'), ...extra });
    expect(result.error).toBeUndefined();
    expect(validateContextSnapshot(result.data.snapshot)).toEqual({ valid: true });
    return result.data.snapshot;
  }
  async function issue(accountKey, ref, headline = 'Published headline') {
    const result = await createGeneratedCarouselIssue(req, accounts[accountKey], {
      name: headline, document: studioDocument(ref, headline), socialCaption: 'Published caption' });
    expect(result.error).toBeUndefined();
    return result.data.issue;
  }
  async function post(accountKey, issue, postedAt = '2026-10-20T20:00:00Z') {
    expect((await approveCarouselIssue(req, accounts[accountKey], issue.id, { revision: issue.revision })).error).toBeUndefined();
    expect((await markCarouselIssuePosted(req, accounts[accountKey], issue.id, { revision: issue.revision, postedAt })).error).toBeUndefined();
  }

  test('includes publication, same-day and exact fourteen-day boundaries, excluding earlier, later, draft and deleted rows', async () => {
    const times = ['2026-10-10T22:59:59.999Z', '2026-10-10T23:00:00.000Z', '2026-10-11T00:00:00.000Z',
      '2026-10-24T23:00:00.000Z', '2026-10-24T23:00:00.001Z'];
    for (const [index, time] of times.entries()) await events('ic', [`event-${index}`], time);
    await events('ic', ['Draft'], times[2], { ingestStatus: 'draft' });
    const [deleted] = await events('ic', ['Deleted'], times[2]);
    deleted.isDeleted = true; await deleted.save();
    await events('sf', ['Other city'], times[2]);
    const snapshot = await context('just.go.ic', times[1]);
    expect(snapshot.candidates.map(row => row.snapshot.name)).toEqual(['event-1', 'event-2', 'event-3']);
    expect(snapshot.coverage).toMatchObject({ tenantsRead: 1, pagesRead: 1, complete: true, cutOff: false });
  });

  test('past candidates respect the seven-day local DST boundary and exclude the publication instant', async () => {
    await events('sf', ['Too early'], '2026-10-26T19:59:59.999Z');
    await events('sf', ['At start'], '2026-10-26T20:00:00.000Z');
    await events('ic', ['Before publication'], '2026-11-02T20:59:59.999Z');
    await events('sf', ['At publication'], PUBLICATION);
    const snapshot = await context();
    expect(snapshot.account.timezone).toBe('America/Los_Angeles');
    expect(snapshot.window.from).toBe('2026-10-26T20:00:00.000Z');
    expect(snapshot.candidates.map(row => row.snapshot.name).sort()).toEqual(['At start', 'Before publication']);
  });

  test('pages beyond the first city page without duplicating events at identical timestamps, including pinned rows', async () => {
    await events('sf', Array.from({ length: 30 }, (_, index) => `sf-${index}`), undefined, { featured: true });
    await events('ic', ['IC one', 'IC two']);
    const snapshot = await context();
    expect(snapshot.candidates).toHaveLength(32);
    expect(new Set(snapshot.candidates.map(row => `${row.ref.sourceTenantKey}:${row.ref.eventId}`)).size).toBe(32);
    expect(snapshot.coverage).toMatchObject({ tenantsRead: 4, pagesRead: 5, cutOff: false, complete: true });
    expect(snapshot.coverage.tenants.find(row => row.tenantKey === 'sf').pagesRead).toBe(2);
  });

  test('upcoming ascending cursors retain all events sharing the same timestamp', async () => {
    await events('ic', Array.from({ length: 30 }, (_, index) => `event-${index}`), '2026-11-03T21:00:00Z');
    const snapshot = await context('just.go.ic');
    expect(snapshot.candidates).toHaveLength(30);
    expect(new Set(snapshot.candidates.map(row => row.ref.eventId)).size).toBe(30);
    expect(snapshot.coverage.pagesRead).toBe(2);
  });

  test('global coverage includes every configured tenant beyond the account editor source limit, including campus tenants', async () => {
    const { TenantConfig } = getGlobalModels(req, 'TenantConfig');
    const more = Array.from({ length: 35 }, (_, index) => ({ tenantKey: `city-${index}`, subdomain: `city-${index}`, name: `City ${index}`, tenantType: 'pivot' }));
    await TenantConfig.updateOne({ configKey: 'default' }, { $push: { tenants: { $each: more } } });
    await events('city-34', ['Last city']);
    const snapshot = await context();
    const keys = (await getMergedTenants(req)).map(row => row.tenantKey).sort();
    expect(snapshot.account.sourceTenantKeys).toEqual(keys);
    expect(snapshot.coverage.tenantsRead).toBe(39);
    expect(snapshot.coverage.pagesRead).toBe(39);
    expect(snapshot.candidates[0].ref.sourceTenantKey).toBe('city-34');
  });

  test('caps at sixty and reports truncation while reading every tenant and representing both populated cities', async () => {
    for (const key of ['sf', 'ic']) await events(key, Array.from({ length: 80 }, (_, index) => `${key}-${index}`));
    const snapshot = await context();
    expect(snapshot.candidates).toHaveLength(60);
    expect(new Set(snapshot.candidates.map(row => row.ref.sourceTenantKey))).toEqual(new Set(['sf', 'ic']));
    expect(snapshot.coverage).toMatchObject({ tenantsRead: 4, pagesRead: 6, cutOff: true, complete: false, candidateCount: 60 });
  });

  test('exactly sixty fully read candidates do not falsely report truncation', async () => {
    await events('sf', Array.from({ length: 60 }, (_, index) => `sf-${index}`));
    const snapshot = await context();
    expect(snapshot.candidates).toHaveLength(60);
    expect(snapshot.coverage).toMatchObject({ cutOff: false, complete: true });
  });

  test('includes panel-visible editorial, source, organizer, batch, tags and real aggregate-interest signals', async () => {
    const [event] = await events('sf', ['Signals'], undefined, { featured: true, clipDrop: true,
      tags: Array.from({ length: 8 }, (_, index) => `tag-${index}`),
      rankingOverride: { tier: 'strong_promote', audience: 'matching_interests', note: 'Great live set' },
      enrichment: { priceBand: 'free', neighborhood: 'Mission' } });
    const db = await connectToDatabase('sf');
    const { PivotEventIntent } = getModels({ db }, 'PivotEventIntent');
    await PivotEventIntent.create({ eventId: event._id, userId: new mongoose.Types.ObjectId(), batchWeek: '2026-W44', status: 'interested', externalOpenCount: 2 });
    const [candidate] = (await context()).candidates;
    expect(candidate.recordVersion).toMatch(/^rv:event-/);
    expect(candidate.snapshot.tags).toHaveLength(8);
    expect(candidate.panelSignals).toMatchObject({ source: 'partiful', sourceUrl: 'https://example.test/listing',
      batchWeek: '2026-W44', featured: true, clipDrop: true, organizerName: 'The organizer',
      organizerProfileUrl: 'https://example.test/host', rankingOverride: { note: 'Great live set' },
      enrichment: { priceBand: 'free', neighborhood: 'Mission' }, intentStats: { interested: 1, externalOpens: 2 } });
    expect(candidate.performance).toMatchObject({ interestedTotal: 1, reached: 1, interestRate: 1 });
    expect(JSON.stringify(candidate)).not.toContain('userId');
  });

  test('reads only the last ten posted issues from immutable snapshots while excluding all posted event refs on that account', async () => {
    const rows = await events('sf', Array.from({ length: 12 }, (_, index) => `posted-${index}`));
    let last;
    for (const [index, event] of rows.entries()) {
      last = await issue('sorry.u.missed.it', { sourceTenantKey: 'sf', eventId: String(event._id) }, `Headline ${index}`);
      await post('sorry.u.missed.it', last, `2026-10-${String(10 + index).padStart(2, '0')}T20:00:00Z`);
    }
    await updateCarouselIssue(req, accounts['sorry.u.missed.it'], last.id, { revision: 1,
      socialCaption: 'Unposted edit', document: studioDocument({ sourceTenantKey: 'sf', eventId: String(rows[0]._id) }, 'Changed head') });
    await events('sf', ['Unposted candidate']);
    const snapshot = await context();
    expect(snapshot.lastPostedIssues).toHaveLength(10);
    expect(snapshot.lastPostedIssues[0]).toMatchObject({ headline: 'Headline 11', socialCaption: 'Published caption',
      revision: 1, cover: { family: 'open-invitation', variation: 2 }, events: [{ sourceTenantKey: 'sf', eventId: String(rows[11]._id) }] });
    expect(snapshot.lastPostedIssues.at(-1).headline).toBe('Headline 2');
    expect(snapshot.candidates.map(row => row.snapshot.name)).toEqual(['Unposted candidate']);
  });

  test('draft references and posts by another magazine do not exclude an event; feedback and edits stay in one account', async () => {
    const [event] = await events('sf', ['Reusable']);
    const ref = { sourceTenantKey: 'sf', eventId: String(event._id) };
    const own = await issue('sorry.u.missed.it', ref);
    const other = await issue('just.go.sf', ref);
    await post('just.go.sf', other);
    await updateCarouselIssue(req, accounts['sorry.u.missed.it'], own.id, { revision: 1, socialCaption: 'Shorter caption' });
    await addCarouselIssueFeedback(req, accounts['sorry.u.missed.it'], own.id, { revision: 2, disposition: 'change', text: 'More descriptive copy' });
    await addCarouselIssueFeedback(req, accounts['just.go.sf'], other.id, { revision: 1, disposition: 'reject', text: 'Other account note' });
    const snapshot = await context();
    expect(snapshot.candidates).toHaveLength(1);
    const feedback = (await listEditorialFeedback(req, accounts['sorry.u.missed.it'])).data;
    expect(snapshot.editorialFeedback).toEqual(JSON.parse(JSON.stringify(feedback)));
    expect(snapshot.editorialFeedback.items.map(row => row.kind).sort()).toEqual(['edit', 'note']);
    expect(JSON.stringify(snapshot.editorialFeedback)).not.toContain('Other account note');
    const incremental = await context('sorry.u.missed.it', PUBLICATION, { sinceVersion: feedback.version });
    expect(incremental.editorialFeedback.items).toEqual([]);
  });

  test('legacy manual posts also provide immutable cover copy and exclude their events', async () => {
    const [event] = await events('sf', ['Legacy posted event'], '2026-11-03T21:00:00Z');
    const created = await createCarouselIssue(req, accounts['just.go.sf'], { name: 'Legacy issue',
      slides: [{ type: 'cover', values: { coverLine: 'Legacy headline' }, events: [{ eventId: event._id }] }],
      socialCaption: 'Legacy caption' });
    expect(created.error).toBeUndefined();
    expect((await markCarouselIssuePosted(req, accounts['just.go.sf'], created.data.issue.id,
      { revision: 1, postedAt: '2026-10-30T20:00:00Z' })).error).toBeUndefined();
    const snapshot = await context('just.go.sf');
    expect(snapshot.candidates).toEqual([]);
    expect(snapshot.lastPostedIssues[0]).toMatchObject({ headline: 'Legacy headline', socialCaption: 'Legacy caption',
      events: [{ sourceTenantKey: 'sf', eventId: String(event._id) }] });
  });

  test('an unconfirmed snapshot does not count as a post; a missing confirmed snapshot blocks unsafe repeat filtering', async () => {
    const [event] = await events('sf', ['Eligible']);
    const own = await issue('sorry.u.missed.it', { sourceTenantKey: 'sf', eventId: String(event._id) });
    const { PivotCarouselRevision } = getGlobalModels(req, 'PivotCarouselRevision');
    await PivotCarouselRevision.create({ accountId: accounts['sorry.u.missed.it'], issueId: own.id,
      headRevision: 1, kind: 'posted', document: own.document, socialCaption: 'Unconfirmed' });
    expect((await context()).candidates).toHaveLength(1);
    await post('sorry.u.missed.it', own);
    await PivotCarouselRevision.deleteMany({ accountId: accounts['sorry.u.missed.it'], issueId: own.id, kind: 'posted' });
    const result = await buildCarouselComposeContextSnapshot(req, { job: { cityKey: 'sf', externalJobId: 'job:compose-test-001',
      options: { editorialAccountKey: 'sorry.u.missed.it', proposedPublicationAt: PUBLICATION } } });
    expect(result.code).toBe('POSTED_HISTORY_UNAVAILABLE');
  });

  test('failed tenant reads remain visible and cannot appear as complete or leak a connection string', async () => {
    await events('ic', ['Readable']);
    const original = connectToDatabase.getMockImplementation();
    connectToDatabase.mockImplementation(key => key === 'sf' ? Promise.reject(new Error('mongodb://secret:password@host')) : original(key));
    const snapshot = await context();
    expect(snapshot.candidates).toHaveLength(1);
    expect(snapshot.coverage.complete).toBe(false);
    expect(snapshot.coverage.tenants.find(row => row.tenantKey === 'sf')).toMatchObject({ error: 'CATALOG_READ_FAILED', pagesRead: 1 });
    expect(JSON.stringify(snapshot)).not.toContain('password');
  });

  test('the existing worker context path serves compose context only to the active lease owner', async () => {
    const now = new Date();
    const { job } = await createComputeJob(req, { externalJobId: 'job:compose-worker-001',
      kind: 'carousel-compose', cityKey: 'sf', contextVersion: 'ctx:compose.pending',
      createIdempotencyKey: 'idem:compose-worker-001', origin: { type: 'admin' },
      options: { editorialAccountKey: 'sorry.u.missed.it', proposedPublicationAt: PUBLICATION } });
    const claim = await claimNextPendingJob(req, { externalJobId: job.externalJobId, workerId: 'compose-worker', now,
      capability: { contractVersion: '1', implementationRevision: 'relay-worker@test',
        supportedContractVersions: ['1'], supportedKinds: ['carousel-compose'] } });
    const result = await fetchJobContext(req, { workerId: 'compose-worker', externalJobId: job.externalJobId,
      leaseToken: claim.job.lease.token, now });
    expect(result.context).toMatchObject({ kind: 'carousel-compose', editorialAccountKey: 'sorry.u.missed.it' });
    expect(result.job.contextVersion).toBe(result.context.contextVersion);
    await expect(fetchJobContext(req, { workerId: 'another-worker', externalJobId: job.externalJobId,
      leaseToken: claim.job.lease.token, now })).rejects.toMatchObject({ code: 'COMPUTE_JOB_WORKER_MISMATCH' });
  });

  test('recapturing unchanged catalog content keeps its version; content edits change the version', async () => {
    const [event] = await events('sf', ['Original']);
    const first = await context();
    const later = await context('sorry.u.missed.it', PUBLICATION, { now: new Date('2026-10-30T07:00:00Z') });
    expect(later.snapshotAt).not.toBe(first.snapshotAt);
    expect(later.contextVersion).toBe(first.contextVersion);
    event.name = 'Edited name'; await event.save();
    const edited = await context();
    expect(edited.contextVersion).not.toBe(first.contextVersion);
    expect(edited.candidates[0].recordVersion).not.toBe(first.candidates[0].recordVersion);
  });

  test('rejects unknown, missing, ambiguous and wrongly owned accounts or invalid publication times', async () => {
    const job = { externalJobId: 'job:compose-test-001', cityKey: 'ic', options: { editorialAccountKey: 'unknown', proposedPublicationAt: PUBLICATION } };
    expect((await buildCarouselComposeContextSnapshot(req, { job })).code).toBe('EDITORIAL_ACCOUNT_UNKNOWN');
    job.options.editorialAccountKey = 'just.go.ic'; job.options.proposedPublicationAt = 'next Monday';
    expect((await buildCarouselComposeContextSnapshot(req, { job })).code).toBe('COMPOSE_WINDOW_INVALID');
    job.options.proposedPublicationAt = PUBLICATION; job.cityKey = 'sf';
    expect((await buildCarouselComposeContextSnapshot(req, { job })).code).toBe('COMPOSE_CITY_MISMATCH');
    const { PivotCarouselAccount } = getGlobalModels(req, 'PivotCarouselAccount');
    await PivotCarouselAccount.updateOne({ _id: accounts['just.go.ic'] }, { $set: { ownerTenantKey: 'sf' } });
    expect((await buildCarouselComposeContextSnapshot(req, { job })).code).toBe('EDITORIAL_ACCOUNT_TENANT_MISMATCH');
    await PivotCarouselAccount.create({ displayName: 'Duplicate', handle: '@just.go.ic', ownerTenantKey: 'ic', sourceTenantKeys: ['ic'] });
    expect((await buildCarouselComposeContextSnapshot(req, { job })).code).toBe('EDITORIAL_ACCOUNT_AMBIGUOUS');
    await PivotCarouselAccount.deleteMany({ handle: '@just.go.ic' });
    expect((await buildCarouselComposeContextSnapshot(req, { job })).code).toBe('EDITORIAL_ACCOUNT_NOT_FOUND');
  });
});
