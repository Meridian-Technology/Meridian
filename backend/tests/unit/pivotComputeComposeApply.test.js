const mongoose = require('mongoose');
const { createMongoMemoryConnection } = require('../helpers/mongoMemory');
jest.mock('../../connectionsManager', () => ({ connectToDatabase: jest.fn() }));
const { connectToDatabase } = require('../../connectionsManager');
const getModels = require('../../services/getModelService');
const getGlobalModels = require('../../services/getGlobalModelService');
const { ensurePivotComputeJobIndexes } = require('../../services/ensurePivotComputeJobIndexes');
const { createComputeJob, claimNextPendingJob, startComputeJob, submitComputeJobResult, findJobByExternalId } = require('../../services/pivotComputeJobStore');
const { fetchJobContext, submitTerminalJobResult } = require('../../services/pivotComputeWorkerService');
const { applyCarouselComposeJob, submitManualComputeResult } = require('../../services/pivotComputeAdminService');
const { applyStoredComputeJob, previewStoredComputeJob } = require('../../services/pivotComputeResultApplyService');
const { createCarouselAccount, createCarouselIssue, updateCarouselIssue,
  markCarouselIssuePosted, getCarouselIssue } = require('../../services/pivotCarouselIssueService');
const { loadFixture, validateExecutionResult } = require('../../utilities/pivotAdminComputeJobContract');
const { composeIssueId } = require('../../services/pivotCarouselCompositionService');
const { walkElements } = require('../../services/pivotCarouselPresets');

const PUBLICATION = '2026-10-12T23:00:00.000Z';
const capability = { contractVersion: '1', implementationRevision: 'relay-worker@test', supportedContractVersions: ['1'], supportedKinds: ['carousel-compose'] };
const workerCapability = { ...loadFixture('worker-capability-valid.json'), ...capability, workerId: 'compose-worker',
  capabilities: { firecrawl: false, nativeProviders: [], executionModes: ['artifact-only'] } };
const eventDoc = (name, start = '2026-10-13T23:00:00Z') => ({ name, description: 'Catalog description',
  type: 'social', location: 'Catalog venue', start_time: new Date(start), end_time: new Date(Date.parse(start) + 3600000),
  hostingType: 'Org', hostingId: new mongoose.Types.ObjectId(), expectedAttendance: 30,
  status: 'not-applicable', visibility: 'public', image: 'https://example.test/poster.jpg',
  customFields: { pivot: { ingestStatus: 'published', batchWeek: '2026-W42', tags: ['music'] } } });

describe('compose compute result apply with real persistence', () => {
  let mongo; let req; let account; let globalAccount; let dbs; let postingClock;
  beforeAll(async () => {
    mongo = await createMongoMemoryConnection({ withGlobalDb: true,
      connectionOptions: { autoCreate: false, autoIndex: false } });
    req = { globalDb: mongo.globalConnection, user: { globalUserId: 'editor' } };
  });
  beforeEach(async () => {
    await mongo.reset();
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
    await ensurePivotComputeJobIndexes(req, { force: true });
    account = (await createCarouselAccount(req, { displayName: 'Just Go Curation Iowa City', handle: '@just.go.ic',
      ownerTenantKey: 'ic', sourceTenantKeys: ['ic'], defaultFormat: 'city-picks' })).data.account;
    globalAccount = (await createCarouselAccount(req, { displayName: 'Sorry You Missed It', handle: '@sorry.u.missed.it',
      ownerTenantKey: 'ic', sourceTenantKeys: ['ic'], defaultFormat: 'sorry-you-missed-it' })).data.account;
    const db = await connectToDatabase('ic');
    await getModels({ db }, 'Event').Event.create(['One', 'Two', 'Three'].map(name => eventDoc(name)));
  });
  afterEach(async () => { postingClock?.mockRestore(); jest.restoreAllMocks(); if (dbs) for (const db of dbs.values()) await db.dropDatabase(); });
  afterAll(async () => { if (mongo) await mongo.cleanup(); });

  async function prepare({ decision = 'compose', accountKey = 'just.go.ic', submit = true } = {}) {
    const now = new Date();
    const { job } = await createComputeJob(req, { externalJobId: 'job:compose-ic-001', kind: 'carousel-compose',
      cityKey: 'ic', contextVersion: 'ctx:pending', createIdempotencyKey: 'idem:compose-test-001',
      origin: { type: 'admin' }, options: { editorialAccountKey: accountKey, proposedPublicationAt: PUBLICATION } });
    const claim = await claimNextPendingJob(req, { externalJobId: job.externalJobId, workerId: 'compose-worker', capability, now });
    const { context } = await fetchJobContext(req, { externalJobId: job.externalJobId, workerId: 'compose-worker', leaseToken: claim.job.lease.token, now });
    await startComputeJob(req, { externalJobId: job.externalJobId, workerId: 'compose-worker', leaseToken: claim.job.lease.token, now });
    const result = loadFixture('result-compose-valid.json');
    result.jobId = job.externalJobId; result.cityKey = job.cityKey;
    result.editorialAccountKey = accountKey; result.basedOnContextVersion = context.contextVersion;
    if (decision === 'compose') {
      const selected = context.candidates.slice(0, 3).map(candidate => candidate.ref);
      result.composition.selectedEventRefs = selected;
      result.composition.cover.assetRef = { kind: 'event-poster', eventRef: selected[0] };
      result.composition.eventSlides = selected.map((ref, index) => ({ eventRef: ref,
        blurb: `Authored blurb ${index}`, presetId: ['photo-note', 'on-the-bill', 'in-the-room'][index],
        assetRef: { kind: 'event-poster', eventRef: ref }, crop: { focalX: 0.4, focalY: 0.6, scale: 1.2 } }));
    } else {
      result.decision = decision; delete result.composition; result.reason = 'The available catalog does not support a coherent issue.';
    }
    expect(validateExecutionResult(result)).toEqual({ valid: true });
    if (submit) await submitComputeJobResult(req, { externalJobId: job.externalJobId, workerId: 'compose-worker',
      leaseToken: claim.job.lease.token, result, requiresReview: false, now });
    return { result, context, job, claim, now };
  }
  const apply = () => applyStoredComputeJob(req, 'job:compose-ic-001', { tenantKey: 'ic', actor: 'editor' });
  async function changeResult(change) {
    const { PivotComputeJob } = getGlobalModels(req, 'PivotComputeJob');
    const job = await PivotComputeJob.findOne({ externalJobId: 'job:compose-ic-001' });
    const result = JSON.parse(JSON.stringify(job.result.embedded)); change(result);
    job.result.embedded = result; job.markModified('result.embedded'); await job.save();
  }

  test('compose creates one unapproved generated studio issue with its caption and never posts or approves it', async () => {
    const { result, job } = await prepare();
    expect((await findJobByExternalId(req, result.jobId)).status).toBe('review-required');
    const applied = await apply();
    expect(applied.job.status).toBe('completed');
    expect(applied.job.id).toBe(job.id);
    expect(applied.job.composeOutcome).toMatchObject({ decision: 'compose', issueId: expect.anything() });
    const issue = (await getCarouselIssue(req, account.id, applied.issueId)).data.issue;
    expect(issue).toMatchObject({ origin: 'agent-generated', reviewState: 'unapproved', revision: 1,
      socialCaption: result.composition.socialCaption, approval: null, posting: null });
    expect(issue.postHistory).toEqual([]);
    expect(issue.document.slides.map(slide => slide.role)).toEqual(['cover', 'event', 'event', 'event']);
    expect(issue.document.slides.slice(1).map(slide => slide.preset.id)).toEqual(['photo-note', 'on-the-bill', 'in-the-room']);
    expect(issue.sources).toEqual(result.composition.selectedEventRefs);
  });

  async function stage(name, ingestStatus) {
    const { Event } = getModels({ db: await connectToDatabase('ic') }, 'Event');
    await Event.updateOne({ name }, { $set: { 'customFields.pivot.ingestStatus': ingestStatus } });
  }

  test('a staged event the agent picks is rechecked and kept in the draft', async () => {
    await stage('Two', 'staged');
    const { context, result } = await prepare();
    expect(context.candidates.find(row => row.snapshot.name === 'Two').snapshot.publication).toBe('staged');
    const applied = await apply();
    const issue = (await getCarouselIssue(req, account.id, applied.issueId)).data.issue;
    expect(issue.sources).toEqual(result.composition.selectedEventRefs);
  });

  test('rejects a staged event moved back to draft after capture', async () => {
    await stage('Two', 'staged');
    const { result } = await prepare();
    await stage('Two', 'draft');
    await expect(apply()).rejects.toMatchObject({ code: 'COMPOSE_EVENT_INELIGIBLE' });
    expect((await findJobByExternalId(req, result.jobId)).applicationAudit.outcome).toBe('rejected');
  });

  test('keeps the online trends a draft cites on the issue, and only well-formed ones', async () => {
    await prepare();
    await changeResult(result => { result.composition.evidenceRefs.push('trend:kym:chinamaxxing', 'trend:Later:Odd.Ref', 'trend:kym:chinamaxxing'); });
    const applied = await apply();
    const issue = (await getCarouselIssue(req, account.id, applied.issueId)).data.issue;
    expect(issue.trendRefs).toEqual(['trend:kym:chinamaxxing']);
    const manual = (await createCarouselIssue(req, account.id, { name: 'Manual', document: issue.document })).data.issue;
    expect(manual.trendRefs).toEqual([]);
  });

  test.each(['wait', 'needs-editor'])('%s stores a terminal reason and creates no issue', async decision => {
    const { result } = await prepare({ decision });
    const applied = await apply();
    expect(applied.job).toMatchObject({ status: 'completed', composeOutcome: { decision, reason: result.reason, issueId: null } });
    const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
    expect(await PivotCarouselDeck.countDocuments({})).toBe(0);
    expect((await apply()).duplicate).toBe(true);
  });

  test('duplicate applies with different caller keys preserve the single issue and subsequent human edits', async () => {
    await prepare(); const first = await apply();
    expect((await updateCarouselIssue(req, account.id, first.issueId, { revision: 1, socialCaption: 'Human caption' })).error).toBeUndefined();
    const again = await applyStoredComputeJob(req, 'job:compose-ic-001', { tenantKey: 'ic', idempotencyKey: 'different-caller-key' });
    expect(again.duplicate).toBe(true);
    const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
    expect(await PivotCarouselDeck.countDocuments({ accountId: account.id })).toBe(1);
    expect((await getCarouselIssue(req, account.id, first.issueId)).data.issue).toMatchObject({ revision: 2, socialCaption: 'Human caption' });
  });

  test('the worker submission path applies compose automatically, including a retried outbox submission', async () => {
    const { result, claim, now } = await prepare({ submit: false });
    const input = { workerId: 'compose-worker', externalJobId: result.jobId, now,
      body: { leaseToken: claim.job.lease.token, capability: workerCapability, result, requiresReview: false } };
    expect((await submitTerminalJobResult(req, input)).job.status).toBe('completed');
    expect((await submitTerminalJobResult(req, input)).duplicate).toBe(true);
    const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
    expect(await PivotCarouselDeck.countDocuments({})).toBe(1);
  });

  test('recovery after an interrupted job completion reuses the existing issue even after human edits or catalog changes', async () => {
    await prepare();
    const { PivotComputeJob, PivotCarouselDeck } = getGlobalModels(req, 'PivotComputeJob', 'PivotCarouselDeck');
    expect(getGlobalModels(req, 'PivotComputeJob').PivotComputeJob).toBe(PivotComputeJob);
    const spy = jest.spyOn(PivotComputeJob, 'updateOne').mockImplementationOnce(() => { throw new Error('Interrupted after issue creation'); });
    await expect(apply()).rejects.toThrow('Interrupted after issue creation');
    expect(spy).toHaveBeenCalledTimes(1); spy.mockRestore();
    const id = composeIssueId('job:compose-ic-001');
    expect(await PivotCarouselDeck.countDocuments({ _id: id })).toBe(1);
    await updateCarouselIssue(req, account.id, id, { revision: 1, socialCaption: 'Human correction after interruption' });
    const db = await connectToDatabase('ic'); await getModels({ db }, 'Event').Event.deleteMany({});
    expect((await apply()).job.status).toBe('completed');
    expect((await getCarouselIssue(req, account.id, id)).data.issue.socialCaption).toBe('Human correction after interruption');
  });

  test.each([
    ['unknown event', result => { const ref = { sourceTenantKey: 'ic', eventId: String(new mongoose.Types.ObjectId()) };
      result.composition.selectedEventRefs[0] = ref; result.composition.eventSlides[0].eventRef = ref;
      result.composition.eventSlides[0].assetRef.eventRef = ref; result.composition.cover.assetRef.eventRef = ref; }, 'COMPOSE_EVENT_INELIGIBLE'],
    ['unknown preset', result => { result.composition.eventSlides[0].presetId = 'invented'; }, 'COMPOSE_PRESET_INVALID'],
    ['unknown Unsplash', result => { result.composition.cover.assetRef = { kind: 'unsplash', assetId: 'unsplash:invented' }; }, 'COMPOSE_ASSET_UNKNOWN'],
  ])('rejects %s with no draft', async (_label, change, code) => {
    await prepare(); await changeResult(change);
    await expect(apply()).rejects.toMatchObject({ code });
    const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
    expect(await PivotCarouselDeck.countDocuments({})).toBe(0);
    expect((await findJobByExternalId(req, 'job:compose-ic-001')).status).toBe('review-required');
  });

  test.each(['date', 'unpublish', 'delete', 'poster', 'copy'])('rechecks current catalog eligibility and versions after a %s change', async change => {
    const { result } = await prepare();
    const db = await connectToDatabase('ic'); const { Event } = getModels({ db }, 'Event');
    const update = { date: { start_time: new Date('2026-11-15T00:00:00Z') }, unpublish: { 'customFields.pivot.ingestStatus': 'draft' },
      delete: { isDeleted: true }, poster: { image: null }, copy: { name: 'Changed name' } }[change];
    await Event.updateOne({ _id: result.composition.selectedEventRefs[0].eventId }, { $set: update });
    await expect(apply()).rejects.toMatchObject({ code: expect.stringMatching(/^COMPOSE_(EVENT_INELIGIBLE|EVENT_CHANGED|POSTER_MISSING)$/) });
    const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck'); expect(await PivotCarouselDeck.countDocuments({})).toBe(0);
  });

  test('rejects same-account events posted since capture', async () => {
    const { result } = await prepare();
    const storedContext = (await getGlobalModels(req, 'PivotComputeJob').PivotComputeJob.findOne({ externalJobId: result.jobId }).lean()).composeContext;
    const document = require('../../services/pivotCarouselCompositionService').buildCompositionDocument(result.composition, storedContext);
    const own = (await createCarouselIssue(req, account.id, { name: 'Posted after capture', document })).data.issue;
    await markCarouselIssuePosted(req, account.id, own.id, { revision: 1, postedAt: '2026-10-10T00:00:00Z' });
    await expect(apply()).rejects.toMatchObject({ code: 'COMPOSE_EVENT_ALREADY_POSTED' });
    expect((await findJobByExternalId(req, result.jobId)).applicationAudit.outcome).toBe('rejected');
  });

  test('events posted on the other magazine remain eligible', async () => {
    const { result, context } = await prepare();
    const document = require('../../services/pivotCarouselCompositionService').buildCompositionDocument(result.composition, context);
    const other = await createCarouselIssue(req, globalAccount.id, { name: 'Other magazine', document });
    expect(other.error).toBeUndefined();
    expect((await markCarouselIssuePosted(req, globalAccount.id, other.data.issue.id,
      { revision: 1, postedAt: '2026-10-10T00:00:00Z' })).error).toBeUndefined();
    expect((await apply()).job.status).toBe('completed');
  });

  test.each([2, 6])('rejects a stored composition with %i events without creating a draft', async count => {
    await prepare(); await changeResult(result => {
      while (result.composition.selectedEventRefs.length < count) result.composition.selectedEventRefs.push({ sourceTenantKey: 'ic', eventId: String(new mongoose.Types.ObjectId()) });
      result.composition.selectedEventRefs = result.composition.selectedEventRefs.slice(0, count);
    });
    await expect(apply()).rejects.toMatchObject({ code: 'INVALID_COMPUTE_EXECUTION_RESULT' });
    expect(await getGlobalModels(req, 'PivotCarouselDeck').PivotCarouselDeck.countDocuments({})).toBe(0);
  });

  test('global compositions span tenants, including campuses, and remain editable without changing saved account settings', async () => {
    for (const tenantKey of ['ic', 'sf', 'rpi']) {
      const db = await connectToDatabase(tenantKey);
      await getModels({ db }, 'Event').Event.create(eventDoc(tenantKey, '2026-10-10T23:00:00Z'));
    }
    const { result } = await prepare({ accountKey: 'sorry.u.missed.it' });
    const applied = await apply();
    const issue = (await getCarouselIssue(req, globalAccount.id, applied.issueId)).data.issue;
    expect(new Set(issue.sources.map(ref => ref.sourceTenantKey))).toEqual(new Set(['ic', 'sf', 'rpi']));
    expect((await updateCarouselIssue(req, globalAccount.id, issue.id, { revision: 1, document: issue.document,
      sources: issue.sources, curation: issue.curation, socialCaption: 'Edited retrospective' })).error).toBeUndefined();
    const { PivotCarouselAccount } = getGlobalModels(req, 'PivotCarouselAccount');
    expect((await PivotCarouselAccount.findById(globalAccount.id)).sourceTenantKeys).toEqual(['ic']);
  });

  test('Unsplash assets saved on this account are offered in context and usable without an HTTP lookup', async () => {
    const saved = { id: 'unsplash:stored-photo', provider: 'unsplash', photoId: 'stored-photo',
      src: 'https://images.unsplash.com/photo-123', photographer: 'Pat', credit: 'Pat / Unsplash',
      photographerUrl: 'https://unsplash.com/@pat', sourceUrl: 'https://unsplash.com/photos/stored-photo' };
    const { generateCoverSlide } = require('../../services/pivotCarouselPresets');
    await createCarouselIssue(req, account.id, { name: 'Existing stock cover', document: { schemaVersion: 2, width: 1080, height: 1350,
      slides: [generateCoverSlide({ theme: 'Saved cover', coverImage: saved })] } });
    const { context } = await prepare(); expect(context.coverAssets[0]).toMatchObject(saved);
    await changeResult(result => { result.composition.cover.assetRef = { kind: 'unsplash', assetId: saved.id }; });
    const applied = await apply(); const issue = (await getCarouselIssue(req, account.id, applied.issueId)).data.issue;
    const assets = []; walkElements(issue.document.slides[0].elements, node => { if (node.asset?.provider === 'unsplash') assets.push(node.asset); });
    expect(assets[0]).toMatchObject(saved);
  });

  test('rejects mismatched accounts, missing captured contexts, wrong tenants and contextless manual uploads', async () => {
    const { result } = await prepare();
    await expect(previewStoredComputeJob(req, result.jobId)).rejects.toMatchObject({ code: 'COMPOSE_PREVIEW_UNSUPPORTED' });
    await expect(applyCarouselComposeJob(req, result.jobId, { tenantKey: 'sf' })).rejects.toMatchObject({ code: 'COMPUTE_JOB_TENANT_MISMATCH' });
    await expect(submitManualComputeResult(req, { result })).rejects.toMatchObject({ code: 'COMPOSE_MANUAL_SUBMIT_UNSUPPORTED' });
    await changeResult(value => { value.editorialAccountKey = 'just.go.sf'; });
    await expect(apply()).rejects.toMatchObject({ code: 'COMPOSE_RESULT_BINDING_MISMATCH' });
    await changeResult(value => { value.editorialAccountKey = 'just.go.ic'; });
    const { PivotComputeJob } = getGlobalModels(req, 'PivotComputeJob');
    await PivotComputeJob.updateOne({ externalJobId: result.jobId }, { $unset: { composeContext: '' } });
    await expect(apply()).rejects.toMatchObject({ code: 'COMPOSE_CONTEXT_MISSING' });
  });
});
