const mongoose = require('mongoose');
const { createMongoMemoryConnection } = require('../helpers/mongoMemory');
jest.mock('../../connectionsManager', () => ({ connectToDatabase: jest.fn() }));
jest.mock('../../utilities/pivotLogger', () => {
  const actual = jest.requireActual('../../utilities/pivotLogger');
  return { ...actual, logPivot: jest.fn() };
});
jest.mock('../../services/imageUploadService', () => ({
  uploadImageToS3: jest.fn(async (_file, folder, name) => `https://assets.example/${folder}/${name}`),
}));
const { connectToDatabase } = require('../../connectionsManager');
const getModels = require('../../services/getModelService');
const getGlobalModels = require('../../services/getGlobalModelService');
const { ensurePivotComputeJobIndexes } = require('../../services/ensurePivotComputeJobIndexes');
const { createComputeJob, claimNextPendingJob, startComputeJob, submitComputeJobResult, findJobByExternalId } = require('../../services/pivotComputeJobStore');
const { fetchJobContext, submitTerminalJobResult } = require('../../services/pivotComputeWorkerService');
const { applyCarouselComposeJob, submitManualComputeResult } = require('../../services/pivotComputeAdminService');
const { applyStoredComputeJob, previewStoredComputeJob } = require('../../services/pivotComputeResultApplyService');
const { createCarouselAccount, createCarouselIssue, createGeneratedCarouselIssue, updateCarouselIssue,
  approveCarouselIssue, requestCarouselRevision, markCarouselIssuePosted, getCarouselIssue } = require('../../services/pivotCarouselIssueService');
const { loadFixture, validateExecutionResult } = require('../../utilities/pivotAdminComputeJobContract');
const { logPivot } = require('../../utilities/pivotLogger');
const { composeIssueId, composeOptionIssueId } = require('../../services/pivotCarouselCompositionService');
const { walkElements } = require('../../services/pivotCarouselPresets');

const PUBLICATION = '2026-10-12T23:00:00.000Z';
const EXPORT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64',
);
const STORED_WINDOW = {
  from: PUBLICATION, to: '2026-10-26T23:00:00.000Z', toExclusive: false,
  timezone: 'America/Chicago', mode: 'upcoming', days: 14,
};
function studioDocument(ref) {
  return { schemaVersion: 2, width: 1080, height: 1350, slides: [
    { id: 'cover', role: 'cover', preset: { family: 'open-invitation', variation: 2 },
      elements: [{ id: 'title', kind: 'text', role: 'cover-title', text: 'Draft headline',
        frame: { x: 0, y: 0, width: 400, height: 80 } }] },
    { id: 'event', role: 'event', source: ref, preset: { id: 'photo-note' },
      elements: [{ id: 'copy', kind: 'text', text: 'Event copy', frame: { x: 0, y: 0, width: 400, height: 80 } }] },
  ] };
}
const capability = { contractVersion: '1', implementationRevision: 'relay-worker@test', supportedContractVersions: ['1'], supportedKinds: ['carousel-compose'] };
const workerCapability = { ...loadFixture('worker-capability-valid.json'), ...capability, workerId: 'compose-worker',
  capabilities: { firecrawl: false, nativeProviders: [], executionModes: ['artifact-only'] } };
const eventDoc = (name, start = '2026-10-13T23:00:00Z') => ({ name, description: 'Catalog description',
  type: 'social', location: 'Catalog venue', start_time: new Date(start), end_time: new Date(Date.parse(start) + 3600000),
  hostingType: 'Org', hostingId: new mongoose.Types.ObjectId(), expectedAttendance: 30,
  status: 'not-applicable', visibility: 'public', image: 'https://example.test/poster.jpg',
  customFields: { pivot: { ingestStatus: 'published', batchWeek: '2026-W42', tags: ['music'] } } });

describe('compose compute result apply with real persistence', () => {
  let mongo; let req; let account; let globalAccount; let dbs; let postingClock; let originalFetch;
  beforeAll(async () => {
    originalFetch = global.fetch;
    mongo = await createMongoMemoryConnection({ withGlobalDb: true,
      connectionOptions: { autoCreate: false, autoIndex: false } });
    req = { globalDb: mongo.globalConnection, user: { globalUserId: 'editor' } };
  });
  beforeEach(async () => {
    await mongo.reset();
    logPivot.mockClear();
    global.fetch = jest.fn(async () => ({ ok: false, status: 404 }));
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
  afterEach(async () => {
    global.fetch = originalFetch;
    postingClock?.mockRestore();
    jest.restoreAllMocks();
    if (dbs) for (const db of dbs.values()) await db.dropDatabase();
  });
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
  function allowExportPins() {
    global.fetch = jest.fn(async () => ({
      ok: true,
      arrayBuffer: async () => Uint8Array.from(EXPORT_PNG).buffer,
    }));
  }
  async function exportJobs() {
    const { PivotComputeJob } = getGlobalModels(req, 'PivotComputeJob');
    return PivotComputeJob.find({ kind: 'carousel-export' }).sort({ externalJobId: 1 }).lean();
  }
  async function exportPins(issueId) {
    const { PivotCarouselRevision } = getGlobalModels(req, 'PivotCarouselRevision');
    return PivotCarouselRevision.find({ issueId, kind: 'export' }).lean();
  }
  async function changeResult(change) {
    const { PivotComputeJob } = getGlobalModels(req, 'PivotComputeJob');
    const job = await PivotComputeJob.findOne({ externalJobId: 'job:compose-ic-001' });
    const result = JSON.parse(JSON.stringify(job.result.embedded)); change(result);
    job.result.embedded = result; job.markModified('result.embedded'); await job.save();
  }

  test('compose creates one unapproved generated studio issue with its caption and never posts or approves it', async () => {
    const { result, job, context } = await prepare();
    expect((await findJobByExternalId(req, result.jobId)).status).toBe('review-required');
    const applied = await apply();
    expect(applied.job.status).toBe('completed');
    expect(applied.job.id).toBe(job.id);
    expect(applied.job.composeOutcome).toMatchObject({ decision: 'compose', issueId: expect.anything() });
    expect(applied.issueIds).toEqual([composeIssueId(result.jobId)]);
    expect(String(applied.issueId)).toBe(composeIssueId(result.jobId));
    const issue = (await getCarouselIssue(req, account.id, applied.issueId)).data.issue;
    expect(issue.optionSetId).toBeUndefined();
    expect(issue).toMatchObject({ origin: 'agent-generated', reviewState: 'unapproved', revision: 1,
      socialCaption: result.composition.socialCaption, approval: null, posting: null,
      agentRevision: 1, hasEditsSinceAgent: false, contextWindow: context.window });
    expect(issue.composition).toEqual(result.composition);
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
    expect(await exportJobs()).toEqual([]);
    expect((await apply()).duplicate).toBe(true);
    expect(await exportJobs()).toEqual([]);
  });

  test('three themed options become one unapproved set, and applying again keeps that set', async () => {
    const { context } = await prepare();
    const themes = [
      { themeLabel: 'Jazz this weekend', rationale: 'Featured jazz shows that belong together.' },
      { themeLabel: 'Late downtown nights', rationale: 'A separate curated group of late shows.', curatedGroupId: 'ic:507f1f77bcf86cd799439011' },
      { themeLabel: 'Campus weekdays', rationale: 'Student events from another group, distinct from downtown.', curatedGroupId: 'ic:507f1f77bcf86cd799439012' },
    ];
    await changeResult(result => {
      result.compositions = themes.map((theme, index) => {
        const composition = JSON.parse(JSON.stringify(result.composition));
        return {
          ...theme,
          ...composition,
          socialCaption: `Option ${index} caption`,
          cover: { ...composition.cover, headline: theme.themeLabel },
        };
      });
      delete result.composition;
    });
    const issueIds = themes.map((_, index) => composeOptionIssueId('job:compose-ic-001', index));
    const applied = await apply();
    expect(applied.issueIds).toEqual(issueIds);
    expect(applied.job.composeOutcome.issueIds.map(id => String(id))).toEqual(issueIds);
    const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
    expect(await PivotCarouselDeck.countDocuments({ accountId: account.id })).toBe(3);
    for (const [index, theme] of themes.entries()) {
      const issue = (await getCarouselIssue(req, account.id, issueIds[index])).data.issue;
      expect(issue).toMatchObject({
        origin: 'agent-generated', reviewState: 'unapproved', revision: 1, approval: null, posting: null,
        optionSetId: 'job:compose-ic-001', optionIndex: index, themeLabel: theme.themeLabel,
        name: theme.themeLabel, socialCaption: `Option ${index} caption`,
        agentRevision: 1, hasEditsSinceAgent: false, contextWindow: context.window,
      });
      expect(issue.composition).toMatchObject({
        themeLabel: theme.themeLabel,
        rationale: theme.rationale,
        socialCaption: `Option ${index} caption`,
        ...(theme.curatedGroupId ? { curatedGroupId: theme.curatedGroupId } : {}),
      });
      expect(issue.composition.curatedGroupId).toBe(theme.curatedGroupId);
      expect(issue.postHistory).toEqual([]);
    }
    const again = await apply();
    expect(again.duplicate).toBe(true);
    expect(again.issueIds).toEqual(issueIds);
    expect(await PivotCarouselDeck.countDocuments({ accountId: account.id })).toBe(3);
    expect((await getCarouselIssue(req, account.id, issueIds[1])).data.issue.socialCaption).toBe('Option 1 caption');
  });

  test('duplicate applies with different caller keys preserve the single issue and subsequent human edits', async () => {
    const { result, context } = await prepare(); const first = await apply();
    const edited = await updateCarouselIssue(req, account.id, first.issueId, { revision: 1, socialCaption: 'Human caption' });
    expect(edited.error).toBeUndefined();
    expect(edited.data.issue).toMatchObject({
      revision: 2, agentRevision: 1, hasEditsSinceAgent: true, socialCaption: 'Human caption',
      contextWindow: context.window,
    });
    expect(edited.data.issue.composition).toEqual(result.composition);
    const again = await applyStoredComputeJob(req, 'job:compose-ic-001', { tenantKey: 'ic', idempotencyKey: 'different-caller-key' });
    expect(again.duplicate).toBe(true);
    const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
    expect(await PivotCarouselDeck.countDocuments({ accountId: account.id })).toBe(1);
    const kept = (await getCarouselIssue(req, account.id, first.issueId)).data.issue;
    expect(kept).toMatchObject({ revision: 2, socialCaption: 'Human caption', agentRevision: 1, hasEditsSinceAgent: true });
    const manual = (await createCarouselIssue(req, account.id, { name: 'Manual', document: kept.document })).data.issue;
    expect(manual.composition).toBeUndefined();
    expect(manual.contextWindow).toBeUndefined();
    expect(manual.agentRevision).toBeUndefined();
    expect(manual.hasEditsSinceAgent).toBeUndefined();
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

  async function queueRevision({ approveFirst = true } = {}) {
    const { Event } = getModels({ db: await connectToDatabase('ic') }, 'Event');
    const [event] = await Event.find().sort({ name: 1 });
    const created = await createGeneratedCarouselIssue(req, account.id, {
      name: 'Draft', document: studioDocument({ sourceTenantKey: 'ic', eventId: String(event._id) }),
      socialCaption: 'Before caption',
    }, { composition: { socialCaption: 'Before caption' }, contextWindow: STORED_WINDOW, agentRevision: 1 });
    expect(created.error).toBeUndefined();
    const issue = created.data.issue;
    if (approveFirst) expect((await approveCarouselIssue(req, account.id, issue.id, { revision: 1 })).error).toBeUndefined();
    const requested = await requestCarouselRevision(req, account.id, issue.id, { revision: 1, text: 'Swap the cover line.' });
    expect(requested.error).toBeUndefined();
    const job = requested.data.job;
    const now = new Date();
    const reviseCapability = { contractVersion: '1', implementationRevision: 'relay-worker@test',
      supportedContractVersions: ['1'], supportedKinds: ['carousel-revise'] };
    const claim = await claimNextPendingJob(req, { externalJobId: job.externalJobId, workerId: 'revise-worker', capability: reviseCapability, now });
    const { context } = await fetchJobContext(req, { externalJobId: job.externalJobId, workerId: 'revise-worker',
      leaseToken: claim.job.lease.token, now });
    await startComputeJob(req, { externalJobId: job.externalJobId, workerId: 'revise-worker', leaseToken: claim.job.lease.token, now });
    return { issue, job, context, request: requested.data.request, now };
  }
  function reviseResult(job, context, { decision = 'revise' } = {}) {
    const result = loadFixture('result-compose-valid.json');
    delete result.editorialAccountKey;
    Object.assign(result, {
      kind: 'carousel-revise', decision, jobId: job.externalJobId, cityKey: job.cityKey,
      basedOnContextVersion: context.contextVersion, issueId: job.options.issueId, requestId: job.options.requestId,
      idempotencyKey: `idem:revise:${job.options.requestId}`,
    });
    if (decision === 'revise') {
      const selected = context.candidates.slice(0, 3).map(candidate => candidate.ref);
      result.composition.socialCaption = 'Revised caption';
      result.composition.cover.headline = 'Revised headline';
      result.composition.selectedEventRefs = selected;
      result.composition.cover.assetRef = { kind: 'event-poster', eventRef: selected[0] };
      result.composition.eventSlides = selected.map((ref, index) => ({
        eventRef: ref, blurb: `Revised blurb ${index}`, presetId: ['photo-note', 'on-the-bill', 'in-the-room'][index],
        assetRef: { kind: 'event-poster', eventRef: ref }, crop: { focalX: 0.4, focalY: 0.6, scale: 1.2 },
      }));
    } else {
      delete result.composition;
      result.reason = 'The cover line is already what they asked for.';
    }
    expect(validateExecutionResult(result)).toEqual({ valid: true });
    return result;
  }
  const applyRevision = externalJobId => applyStoredComputeJob(req, externalJobId, { tenantKey: 'ic', actor: 'editor' });

  test('revise rebuilds the approved draft once and a second apply writes nothing', async () => {
    const { issue, job, context } = await queueRevision();
    const result = reviseResult(job, context);
    await submitComputeJobResult(req, { externalJobId: job.externalJobId, workerId: 'revise-worker',
      leaseToken: (await findJobByExternalId(req, job.externalJobId)).lease.token, result, requiresReview: false, now: new Date() });
    const applied = await applyRevision(job.externalJobId);
    expect(applied).toMatchObject({ duplicate: false, decision: 'revise', issueId: issue.id });
    expect(applied.job).toMatchObject({ status: 'completed', reviseOutcome: { decision: 'revise' } });
    const saved = (await getCarouselIssue(req, account.id, issue.id)).data.issue;
    expect(saved).toMatchObject({
      revision: 2, agentRevision: 2, hasEditsSinceAgent: false, reviewState: 'unapproved', approval: null,
      socialCaption: 'Revised caption', contextWindow: STORED_WINDOW,
    });
    expect(saved.composition).toMatchObject({ socialCaption: 'Revised caption', cover: { headline: 'Revised headline' } });
    expect(saved.document.slides.map(slide => slide.role)).toEqual(['cover', 'event', 'event', 'event']);
    const again = await applyRevision(job.externalJobId);
    expect(again).toMatchObject({ duplicate: true, decision: 'revise', issueId: issue.id });
    const kept = (await getCarouselIssue(req, account.id, issue.id)).data.issue;
    expect(kept).toMatchObject({ revision: 2, editorialVersion: saved.editorialVersion, socialCaption: 'Revised caption', agentRevision: 2 });
    expect(kept.document).toEqual(saved.document);
  });

  test('a revised cover may use the poster of an eligible event the draft does not feature', async () => {
    await getModels({ db: await connectToDatabase('ic') }, 'Event').Event.create(eventDoc('Four'));
    const { issue, job, context } = await queueRevision();
    const result = reviseResult(job, context);
    const featured = new Set(result.composition.selectedEventRefs.map(ref => ref.eventId));
    const unfeatured = context.candidates.find(candidate => !featured.has(candidate.ref.eventId));
    expect(unfeatured).toBeDefined();
    result.composition.cover.assetRef = { kind: 'event-poster', eventRef: unfeatured.ref };
    expect(validateExecutionResult(result)).toEqual({ valid: true });
    await submitComputeJobResult(req, { externalJobId: job.externalJobId, workerId: 'revise-worker',
      leaseToken: (await findJobByExternalId(req, job.externalJobId)).lease.token, result, requiresReview: false, now: new Date() });

    const applied = await applyRevision(job.externalJobId);
    expect(applied).toMatchObject({ duplicate: false, decision: 'revise', issueId: issue.id });
    const saved = (await getCarouselIssue(req, account.id, issue.id)).data.issue;
    expect(saved).toMatchObject({ revision: 2, agentRevision: 2, socialCaption: 'Revised caption' });
    expect(saved.composition.cover.assetRef).toEqual({ kind: 'event-poster', eventRef: unfeatured.ref });
    expect(saved.sources).toEqual(result.composition.selectedEventRefs);
  });

  // new Date() reads the real clock here; Date.now is pinned for posting.
  const nextMillisecond = () => new Promise(resolve => setTimeout(resolve, 5));

  test('an approval given after the request keeps the draft and the revise ends in conflict', async () => {
    const { issue, job, context } = await queueRevision({ approveFirst: false });
    await nextMillisecond();
    const approved = await approveCarouselIssue(req, account.id, issue.id, { revision: 1 });
    expect(approved.error).toBeUndefined();
    await submitComputeJobResult(req, { externalJobId: job.externalJobId, workerId: 'revise-worker',
      leaseToken: (await findJobByExternalId(req, job.externalJobId)).lease.token,
      result: reviseResult(job, context), requiresReview: false, now: new Date() });

    const applied = await applyRevision(job.externalJobId);
    expect(applied).toMatchObject({ duplicate: false, decision: 'conflict', issueId: issue.id });
    expect(applied.job.reviseOutcome.decision).toBe('conflict');
    const after = (await getCarouselIssue(req, account.id, issue.id)).data.issue;
    expect(after).toMatchObject({
      revision: 1, agentRevision: 1, reviewState: 'approved', socialCaption: 'Before caption',
      approval: { revision: 1, approvedAt: approved.data.issue.approval.approvedAt },
    });
    expect(await exportJobs()).toEqual([]);
  });

  test('an approval that lands during the revise apply still wins', async () => {
    const { issue, job, context } = await queueRevision({ approveFirst: false });
    await submitComputeJobResult(req, { externalJobId: job.externalJobId, workerId: 'revise-worker',
      leaseToken: (await findJobByExternalId(req, job.externalJobId)).lease.token,
      result: reviseResult(job, context), requiresReview: false, now: new Date() });
    const { collection } = getGlobalModels(req, 'PivotCarouselDeck').PivotCarouselDeck;
    const write = collection.findOneAndUpdate.bind(collection);
    jest.spyOn(collection, 'findOneAndUpdate').mockImplementationOnce(async (...args) => {
      await nextMillisecond();
      expect((await approveCarouselIssue(req, account.id, issue.id, { revision: 1 })).error).toBeUndefined();
      return write(...args);
    });

    const applied = await applyRevision(job.externalJobId);
    expect(applied).toMatchObject({ decision: 'conflict', issueId: issue.id });
    const after = (await getCarouselIssue(req, account.id, issue.id)).data.issue;
    expect(after).toMatchObject({ revision: 1, reviewState: 'approved', approval: { revision: 1 }, socialCaption: 'Before caption' });
  });

  test('a draft that moved on or was edited by hand stores a conflict and keeps the hand edit', async () => {
    const { issue, job, context } = await queueRevision();
    await submitComputeJobResult(req, { externalJobId: job.externalJobId, workerId: 'revise-worker',
      leaseToken: (await findJobByExternalId(req, job.externalJobId)).lease.token,
      result: reviseResult(job, context), requiresReview: false, now: new Date() });
    const edited = await updateCarouselIssue(req, account.id, issue.id, { revision: 1, socialCaption: 'Hand edited caption' });
    expect(edited.data.issue).toMatchObject({ revision: 2, agentRevision: 1, hasEditsSinceAgent: true, socialCaption: 'Hand edited caption' });
    const applied = await applyRevision(job.externalJobId);
    expect(applied).toMatchObject({ duplicate: false, decision: 'conflict', issueId: issue.id });
    expect(applied.job.reviseOutcome.decision).toBe('conflict');
    const after = (await getCarouselIssue(req, account.id, issue.id)).data.issue;
    expect(after).toMatchObject({
      revision: 2, agentRevision: 1, hasEditsSinceAgent: true, socialCaption: 'Hand edited caption',
      composition: { socialCaption: 'Before caption' }, document: edited.data.issue.document,
    });
    const again = await applyRevision(job.externalJobId);
    expect(again).toMatchObject({ duplicate: true, decision: 'conflict' });
    const kept = (await getCarouselIssue(req, account.id, issue.id)).data.issue;
    expect(kept).toMatchObject({ revision: 2, editorialVersion: after.editorialVersion, socialCaption: 'Hand edited caption' });
    expect(await exportJobs()).toEqual([]);
  });

  test('cannot-revise stores the reason on the request and a second apply writes nothing', async () => {
    const { issue, job, context, request } = await queueRevision();
    const result = reviseResult(job, context, { decision: 'cannot-revise' });
    await submitComputeJobResult(req, { externalJobId: job.externalJobId, workerId: 'revise-worker',
      leaseToken: (await findJobByExternalId(req, job.externalJobId)).lease.token, result, requiresReview: false, now: new Date() });
    const applied = await applyRevision(job.externalJobId);
    expect(applied).toMatchObject({ duplicate: false, decision: 'cannot-revise', issueId: issue.id });
    const after = (await getCarouselIssue(req, account.id, issue.id)).data.issue;
    expect(after).toMatchObject({
      revision: 1, agentRevision: 1, hasEditsSinceAgent: false, reviewState: 'approved',
      socialCaption: 'Before caption', composition: { socialCaption: 'Before caption' },
    });
    expect(after.document.slides).toHaveLength(2);
    expect(after.revisionRequests.find(row => row.id === request.id).reason).toBe(result.reason);
    const again = await applyRevision(job.externalJobId);
    expect(again).toMatchObject({ duplicate: true, decision: 'cannot-revise' });
    const kept = (await getCarouselIssue(req, account.id, issue.id)).data.issue;
    expect(kept).toMatchObject({ revision: 1, editorialVersion: after.editorialVersion, socialCaption: 'Before caption' });
    expect(kept.revisionRequests.find(row => row.id === request.id).reason).toBe(result.reason);
    expect(await exportJobs()).toEqual([]);
  });

  test('a compose apply queues one export per written option, and applying again does not queue another', async () => {
    allowExportPins();
    await prepare();
    const applied = await apply();
    const issueId = String(applied.issueId);
    let jobs = await exportJobs();
    expect(jobs.map(job => job.externalJobId)).toEqual([`job:export:${issueId}:r1`]);
    expect(jobs[0]).toMatchObject({
      status: 'pending', kind: 'carousel-export', cityKey: 'ic',
      createIdempotencyKey: `export:${issueId}:r1`,
      options: { deckId: issueId },
    });
    const deck = await getGlobalModels(req, 'PivotCarouselDeck').PivotCarouselDeck.findById(issueId).lean();
    expect(jobs[0].options.deckRevision).toBe(new Date(deck.updatedAt).toISOString());
    expect(await exportPins(issueId)).toMatchObject([
      { headRevision: 1, sourceRevision: jobs[0].options.deckRevision },
    ]);
    expect((await apply()).duplicate).toBe(true);
    expect(await exportJobs()).toHaveLength(1);
    expect(await exportPins(issueId)).toHaveLength(1);
  });

  test('three themed options each queue one export, and applying again does not queue another', async () => {
    allowExportPins();
    const themes = [
      { themeLabel: 'Jazz this weekend', rationale: 'Featured jazz shows that belong together.' },
      { themeLabel: 'Late downtown nights', rationale: 'A separate curated group of late shows.' },
      { themeLabel: 'Campus weekdays', rationale: 'Student events from another group, distinct from downtown.' },
    ];
    await prepare();
    await changeResult(result => {
      result.compositions = themes.map(theme => {
        const composition = JSON.parse(JSON.stringify(result.composition));
        return { ...theme, ...composition, cover: { ...composition.cover, headline: theme.themeLabel } };
      });
      delete result.composition;
    });
    const optionIds = themes.map((_, index) => composeOptionIssueId('job:compose-ic-001', index));
    const applied = await apply();
    expect(applied.issueIds).toEqual(optionIds);
    const jobs = await exportJobs();
    expect(jobs.map(job => job.options.deckId).sort()).toEqual([...optionIds].sort());
    expect(jobs.map(job => job.externalJobId).sort()).toEqual(optionIds.map(id => `job:export:${id}:r1`).sort());
    expect(jobs.every(job => job.status === 'pending' && job.createIdempotencyKey === `export:${job.options.deckId}:r1`)).toBe(true);
    for (const issueId of optionIds) {
      expect(await exportPins(issueId)).toHaveLength(1);
    }
    expect((await apply()).duplicate).toBe(true);
    expect(await exportJobs()).toHaveLength(3);
    for (const issueId of optionIds) expect(await exportPins(issueId)).toHaveLength(1);
  });

  test('a revise apply queues one export for the new revision, and applying again does not queue another', async () => {
    allowExportPins();
    const { issue, job, context } = await queueRevision();
    expect(await exportJobs()).toEqual([]);
    await submitComputeJobResult(req, {
      externalJobId: job.externalJobId, workerId: 'revise-worker',
      leaseToken: (await findJobByExternalId(req, job.externalJobId)).lease.token,
      result: reviseResult(job, context), requiresReview: false, now: new Date(),
    });
    const revised = await applyRevision(job.externalJobId);
    expect(revised).toMatchObject({ duplicate: false, decision: 'revise', issueId: issue.id });
    const jobs = await exportJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      status: 'pending', externalJobId: `job:export:${issue.id}:r2`,
      createIdempotencyKey: `export:${issue.id}:r2`, options: { deckId: issue.id },
    });
    expect((await exportPins(issue.id))[0].headRevision).toBe(2);
    expect((await applyRevision(job.externalJobId)).duplicate).toBe(true);
    expect(await exportJobs()).toHaveLength(1);
    expect(await exportPins(issue.id)).toHaveLength(1);
  });

  test('a failed export queue is logged and does not fail the apply', async () => {
    logPivot.mockClear();
    await prepare();
    const applied = await apply();
    expect(applied.job.status).toBe('completed');
    expect(applied.duplicate).toBe(false);
    expect(await exportJobs()).toEqual([]);
    expect((await getCarouselIssue(req, account.id, applied.issueId)).data.issue.revision).toBe(1);
    expect(logPivot).toHaveBeenCalledWith('warn', 'carousel export queue failed', expect.objectContaining({
      code: 'ASSET_UNAVAILABLE',
      issueId: String(applied.issueId),
      revision: 1,
    }));
    expect((await apply()).duplicate).toBe(true);
    expect(logPivot).toHaveBeenCalledTimes(1);
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
