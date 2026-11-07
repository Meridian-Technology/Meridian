const { createMongoMemoryConnection } = require('../helpers/mongoMemory');

jest.mock('../../services/tenantConfigService', () => ({
  getTenantByKey: jest.fn(async (_req, key) => {
    const tenantKey = String(key || '').toLowerCase();
    if (tenantKey === 'sf') return { tenantKey, pivotPilot: true };
    return null;
  }),
}));

const getGlobalModels = require('../../services/getGlobalModelService');
const {
  createCarouselAccount,
  createGeneratedCarouselIssue,
  listCarouselOptionSet,
  pickCarouselOption,
  approveCarouselIssue,
  restoreCarouselIssue,
  markCarouselIssuePosted,
  requestCarouselRevision,
} = require('../../services/pivotCarouselIssueService');

const AGENT_WINDOW = {
  from: '2026-10-01T00:00:00.000Z',
  to: '2026-10-15T00:00:00.000Z',
  toExclusive: false,
  timezone: 'America/Los_Angeles',
  mode: 'upcoming',
  days: 14,
};

const OPTION_SET = 'job:compose-sf-001';

function makeDocument(text) {
  return {
    schemaVersion: 2,
    width: 1080,
    height: 1350,
    slides: [{
      id: 'slide-a',
      elements: [{
        id: 'slide-a-title',
        kind: 'text',
        text,
        frame: { x: 0, y: 0, width: 400, height: 80 },
      }],
    }],
  };
}

describe('carousel option sets', () => {
  let mongo;
  let req;
  let accountId;

  beforeAll(async () => {
    mongo = await createMongoMemoryConnection({ withGlobalDb: true });
    req = { globalDb: mongo.globalConnection, user: { globalUserId: 'admin-1' } };
  });

  beforeEach(async () => {
    await mongo.reset();
    const account = await createCarouselAccount(req, {
      displayName: 'Just Go SF',
      ownerTenantKey: 'sf',
      sourceTenantKeys: ['sf'],
    });
    accountId = account.data.account.id;
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await mongo.cleanup();
  });

  const decks = () => getGlobalModels(req, 'PivotCarouselDeck').PivotCarouselDeck;

  // Let another write land just before the next deck write.
  function interleaveNextWrite(interleave) {
    const { collection } = decks();
    const write = collection.findOneAndUpdate.bind(collection);
    return jest.spyOn(collection, 'findOneAndUpdate').mockImplementationOnce(async (...args) => {
      await interleave();
      return write(...args);
    });
  }

  async function optionSet(setId = OPTION_SET) {
    const themes = ['Jazz this weekend', 'Late downtown nights', 'Campus weekdays'];
    const issues = [];
    for (const [index, themeLabel] of themes.entries()) {
      const created = await createGeneratedCarouselIssue(req, accountId, {
        name: themeLabel,
        document: makeDocument(themeLabel),
        socialCaption: `caption ${index}`,
      }, {
        optionSetId: setId,
        optionIndex: index,
        themeLabel,
        composition: { themeLabel, socialCaption: `caption ${index}` },
        contextWindow: AGENT_WINDOW,
        agentRevision: 1,
      });
      expect(created.error).toBeUndefined();
      issues.push(created.data.issue);
    }
    return issues;
  }

  function states(listed) {
    return listed.data.options.map(option => ({
      id: option.id,
      optionIndex: option.optionIndex,
      themeLabel: option.themeLabel,
      status: option.status,
      reviewState: option.reviewState,
      picked: option.picked,
      revision: option.revision,
    }));
  }

  test('picking an option archives its siblings and records the pick', async () => {
    const [first, second, third] = await optionSet();
    const picked = await pickCarouselOption(req, accountId, second.id, { revision: 1 });
    expect(picked.error).toBeUndefined();
    expect(picked.data.issue).toMatchObject({
      id: second.id,
      status: 'active',
      reviewState: 'unapproved',
      revision: 1,
      optionPick: { pickedBy: 'admin-1' },
    });
    expect(picked.data.issue.optionPick.pickedAt).toEqual(expect.any(Date));

    const listed = await listCarouselOptionSet(req, accountId, first.id);
    expect(listed.data.optionSetId).toBe(OPTION_SET);
    expect(listed.data.pickedIssueId).toBe(second.id);
    expect(states(listed)).toEqual([
      { id: first.id, optionIndex: 0, themeLabel: 'Jazz this weekend', status: 'archived', reviewState: 'unapproved', picked: false, revision: 2 },
      { id: second.id, optionIndex: 1, themeLabel: 'Late downtown nights', status: 'active', reviewState: 'unapproved', picked: true, revision: 1 },
      { id: third.id, optionIndex: 2, themeLabel: 'Campus weekdays', status: 'archived', reviewState: 'unapproved', picked: false, revision: 2 },
    ]);

    const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
    const archived = await PivotCarouselDeck.findById(first.id).lean();
    expect(archived.editLog).toHaveLength(1);
    expect(archived.editLog[0]).toMatchObject({ fromRevision: 1, toRevision: 2 });
  });

  test('approving an option picks it and archives the others', async () => {
    const [first, second, third] = await optionSet('job:compose-sf-approve');
    const approved = await approveCarouselIssue(req, accountId, third.id, { revision: 1 });
    expect(approved.error).toBeUndefined();
    expect(approved.data.issue).toMatchObject({
      id: third.id,
      status: 'active',
      reviewState: 'approved',
      revision: 1,
      approval: { revision: 1, approvedBy: 'admin-1' },
      optionPick: { pickedBy: 'admin-1' },
    });

    const listed = await listCarouselOptionSet(req, accountId, third.id);
    expect(listed.data.pickedIssueId).toBe(third.id);
    expect(states(listed)).toEqual([
      { id: first.id, optionIndex: 0, themeLabel: 'Jazz this weekend', status: 'archived', reviewState: 'unapproved', picked: false, revision: 2 },
      { id: second.id, optionIndex: 1, themeLabel: 'Late downtown nights', status: 'archived', reviewState: 'unapproved', picked: false, revision: 2 },
      { id: third.id, optionIndex: 2, themeLabel: 'Campus weekdays', status: 'active', reviewState: 'approved', picked: true, revision: 1 },
    ]);
  });

  test('restoring an archived sibling leaves the picked option picked', async () => {
    const [first, second] = await optionSet('job:compose-sf-restore');
    expect((await pickCarouselOption(req, accountId, first.id, { revision: 1 })).error).toBeUndefined();
    const restored = await restoreCarouselIssue(req, accountId, second.id, { revision: 2 });
    expect(restored.error).toBeUndefined();
    expect(restored.data.issue).toMatchObject({ id: second.id, status: 'active', optionPick: null });

    const listed = await listCarouselOptionSet(req, accountId, second.id);
    expect(listed.data.pickedIssueId).toBe(first.id);
    const picked = listed.data.options.find(option => option.id === first.id);
    const sibling = listed.data.options.find(option => option.id === second.id);
    expect(picked).toMatchObject({ status: 'active', picked: true, reviewState: 'unapproved' });
    expect(picked.optionPick.pickedBy).toBe('admin-1');
    expect(sibling).toMatchObject({ status: 'active', picked: false, optionPick: null, reviewState: 'unapproved' });
  });

  test('a restored sibling still reads as the agent draft and can be revised', async () => {
    const [first, second] = await optionSet('job:compose-sf-revise-sibling');
    expect((await pickCarouselOption(req, accountId, first.id, { revision: 1 })).error).toBeUndefined();
    const restored = await restoreCarouselIssue(req, accountId, second.id, { revision: 2 });
    expect(restored.error).toBeUndefined();
    expect(restored.data.issue).toMatchObject({ revision: 3, agentRevision: 3, hasEditsSinceAgent: false });

    const requested = await requestCarouselRevision(req, accountId, second.id, {
      revision: 3,
      text: 'Tighten the caption.',
    });
    expect(requested.error).toBeUndefined();
    expect(requested.data.job.options).toMatchObject({ issueId: second.id, revision: 3 });
  });

  test('a pick that loses its revision archives nothing', async () => {
    const [first, second, third] = await optionSet('job:compose-sf-stale-pick');
    // The picked issue moves after the pick read it and before anything is written.
    interleaveNextWrite(() => decks().collection.updateOne(
      { _id: decks().castObject({ _id: first.id })._id },
      { $inc: { revision: 1 } },
    ));
    const picked = await pickCarouselOption(req, accountId, first.id, { revision: 1 });
    expect(picked).toMatchObject({ status: 409, code: 'REVISION_CONFLICT' });

    const listed = await listCarouselOptionSet(req, accountId, first.id);
    expect(listed.data.pickedIssueId).toBeNull();
    expect(states(listed).map(({ id, status, revision }) => ({ id, status, revision }))).toEqual([
      { id: first.id, status: 'active', revision: 2 },
      { id: second.id, status: 'active', revision: 1 },
      { id: third.id, status: 'active', revision: 1 },
    ]);
  });

  test('approving another option leaves a posted sibling posted', async () => {
    const [first, second] = await optionSet('job:compose-sf-posted-sibling');
    expect((await approveCarouselIssue(req, accountId, first.id, { revision: 1 })).error).toBeUndefined();
    expect((await markCarouselIssuePosted(req, accountId, first.id, { revision: 1 })).error).toBeUndefined();
    expect((await restoreCarouselIssue(req, accountId, second.id, { revision: 2 })).error).toBeUndefined();

    const approved = await approveCarouselIssue(req, accountId, second.id, { revision: 3 });
    expect(approved.error).toBeUndefined();
    expect(approved.data.issue).toMatchObject({ reviewState: 'approved', optionPick: { pickedBy: 'admin-1' } });

    const posted = await decks().findById(first.id).lean();
    expect(posted).toMatchObject({
      status: 'active',
      reviewState: 'posted',
      revision: 1,
      approval: { revision: 1 },
      posting: { revision: 1 },
    });
  });

  test('a refused approval archives no siblings', async () => {
    const [first, second] = await optionSet('job:compose-sf-refused-approval');
    interleaveNextWrite(() => decks().collection.updateOne(
      { _id: decks().castObject({ _id: first.id })._id },
      { $inc: { revision: 1 } },
    ));
    const approved = await approveCarouselIssue(req, accountId, first.id, { revision: 1 });
    expect(approved).toMatchObject({ status: 409, code: 'REVISION_CONFLICT' });
    expect((await decks().findById(second.id).lean()).status).toBe('active');
  });
});
