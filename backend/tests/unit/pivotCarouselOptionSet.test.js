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
} = require('../../services/pivotCarouselIssueService');

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

  afterAll(async () => {
    await mongo.cleanup();
  });

  async function optionSet(setId = OPTION_SET) {
    const themes = ['Jazz this weekend', 'Late downtown nights', 'Campus weekdays'];
    const issues = [];
    for (const [index, themeLabel] of themes.entries()) {
      const created = await createGeneratedCarouselIssue(req, accountId, {
        name: themeLabel,
        document: makeDocument(themeLabel),
        socialCaption: `caption ${index}`,
      }, { optionSetId: setId, optionIndex: index, themeLabel });
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
});
