const { createMongoMemoryConnection } = require('../helpers/mongoMemory');

jest.mock('../../services/tenantConfigService', () => ({
  getTenantByKey: jest.fn(async (_req, key) => {
    const tenantKey = String(key || '').toLowerCase();
    if (['sf', 'nyc', 'chicago'].includes(tenantKey)) {
      return { tenantKey, pivotPilot: true };
    }
    if (tenantKey === 'campus') return { tenantKey, tenantType: 'school' };
    return null;
  }),
}));

const {
  createCarouselAccount,
  createCarouselIssue,
  listCarouselIssues,
  renameCarouselIssue,
  archiveCarouselIssue,
  restoreCarouselIssue,
  duplicateCarouselIssue,
  updateCarouselIssue,
  ISSUE_LIMITS,
} = require('../../services/pivotCarouselIssueService');

function slide(id) {
  return {
    id,
    elements: [{
      id: `${id}-title`,
      kind: 'text',
      text: 'lanterns',
      frame: { x: 0, y: 0, width: 400, height: 80 },
      asset: { id: 'asset-shared', key: 'pivot-carousel/sf/sticker.png' },
    }],
  };
}

function document() {
  return { schemaVersion: 2, width: 1080, height: 1350, slides: [slide('slide-a')] };
}

describe('carousel accounts and issues', () => {
  let mongo;
  let req;

  beforeAll(async () => {
    mongo = await createMongoMemoryConnection({ withGlobalDb: true });
    req = { globalDb: mongo.globalConnection, user: { globalUserId: 'admin-1' } };
  });

  beforeEach(async () => {
    await mongo.reset();
  });

  afterAll(async () => {
    await mongo.cleanup();
  });

  async function account(overrides = {}) {
    const created = await createCarouselAccount(req, {
      displayName: 'Just Go SF',
      ownerTenantKey: 'sf',
      sourceTenantKeys: ['sf', 'nyc'],
      ...overrides,
    });
    return created;
  }

  test('two issues in one account and an issue in another account stay separate', async () => {
    const sf = await account();
    const nyc = await account({
      displayName: 'Just Go NYC',
      ownerTenantKey: 'nyc',
      sourceTenantKeys: ['nyc'],
    });
    expect(sf.data.account.limits.maxSlides).toBe(20);

    const first = await createCarouselIssue(req, sf.data.account.id, { name: 'Lanterns', document: document() });
    const second = await createCarouselIssue(req, sf.data.account.id, { name: 'Jazz' });
    await createCarouselIssue(req, nyc.data.account.id, { name: 'One more set' });

    const sfList = await listCarouselIssues(req, sf.data.account.id, {});
    const nycList = await listCarouselIssues(req, nyc.data.account.id, {});
    expect(sfList.data.issues.map((issue) => issue.name).sort()).toEqual(['Jazz', 'Lanterns']);
    expect(nycList.data.issues.map((issue) => issue.name)).toEqual(['One more set']);
    expect(first.data.issue.id).not.toBe(second.data.issue.id);
    expect(sfList.data.issues.every((issue) => issue.ownerTenantKey === 'sf')).toBe(true);
    expect(nycList.data.issues[0].ownerTenantKey).toBe('nyc');
  });

  test('a source outside the account and a mismatched owner are rejected', async () => {
    const sf = await account();
    const outside = await createCarouselIssue(req, sf.data.account.id, {
      name: 'Seoul night',
      sources: [{ sourceTenantKey: 'chicago', eventId: 'evt-1' }],
    });
    expect(outside.code).toBe('SOURCE_NOT_ALLOWED');

    const owner = await createCarouselIssue(req, sf.data.account.id, {
      name: 'Wrong city',
      ownerTenantKey: 'nyc',
    });
    expect(owner.code).toBe('OWNER_MISMATCH');

    const campus = await createCarouselAccount(req, {
      displayName: 'Campus',
      ownerTenantKey: 'campus',
      sourceTenantKeys: ['sf'],
    });
    expect(campus.code).toBe('NOT_PIVOT_TENANT');
  });

  test('duplicate, archive, restore, stale revision, and invalid documents', async () => {
    const sf = await account();
    const created = await createCarouselIssue(req, sf.data.account.id, {
      name: 'Lanterns',
      document: document(),
      sources: [{ sourceTenantKey: 'sf', eventId: 'evt-1' }],
    });
    const issue = created.data.issue;
    expect(issue.revision).toBe(1);
    expect(issue.schemaVersion).toBe(2);

    const copy = await duplicateCarouselIssue(req, sf.data.account.id, issue.id);
    expect(copy.data.issue.id).not.toBe(issue.id);
    expect(copy.data.issue.revision).toBe(1);
    expect(copy.data.issue.document.slides[0].id).not.toBe(issue.document.slides[0].id);
    expect(copy.data.issue.document.slides[0].elements[0].id).not.toBe('slide-a-title');
    expect(copy.data.issue.document.slides[0].elements[0].asset).toEqual(
      issue.document.slides[0].elements[0].asset,
    );

    const archived = await archiveCarouselIssue(req, sf.data.account.id, issue.id, { revision: 1 });
    expect(archived.data.issue.status).toBe('archived');
    expect(archived.data.issue.revision).toBe(2);

    const stale = await renameCarouselIssue(req, sf.data.account.id, issue.id, {
      name: 'Too late',
      revision: 1,
    });
    expect(stale.code).toBe('REVISION_CONFLICT');
    expect(stale.storedRevision).toBe(2);

    const restored = await restoreCarouselIssue(req, sf.data.account.id, issue.id, { revision: 2 });
    expect(restored.data.issue.status).toBe('active');

    const renamed = await renameCarouselIssue(req, sf.data.account.id, issue.id, {
      name: 'Lantern walk',
      revision: restored.data.issue.revision,
    });
    expect(renamed.data.issue.name).toBe('Lantern walk');

    const overflow = await createCarouselIssue(req, sf.data.account.id, {
      name: 'Too many',
      slides: Array.from({ length: ISSUE_LIMITS.maxSlides + 1 }, (_, index) => ({ type: 'card' })),
    });
    expect(overflow.code).toBe('SLIDE_CAP');
    expect(overflow.limits.maxSlides).toBe(20);

    const invalid = await updateCarouselIssue(req, sf.data.account.id, issue.id, {
      revision: renamed.data.issue.revision,
      document: {
        schemaVersion: 2,
        slides: [{
          id: 'bad',
          elements: [{ id: 'crop', kind: 'image', frame: { x: 0, y: 0, width: 100, height: 100 }, crop: { scale: 12 } }],
        }],
      },
    });
    expect(invalid.code).toBe('INVALID_DOCUMENT');
  });
});
