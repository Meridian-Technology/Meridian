const { createMongoMemoryConnection } = require('../helpers/mongoMemory');

jest.mock('../../services/tenantConfigService', () => ({
  getTenantByKey: jest.fn(async (_req, key) => {
    const tenantKey = String(key || '').toLowerCase();
    if (tenantKey === 'sf' || tenantKey === 'nyc') return { tenantKey, pivotPilot: true };
    return null;
  }),
}));

const getGlobalModels = require('../../services/getGlobalModelService');
const {
  migrateCarouselDecksToAccounts,
  rollbackCarouselAccountMigration,
} = require('../../services/pivotCarouselMigrationService');
const { createEditableCopy, convertLegacySlide } = require('../../services/pivotCarouselIssueService');

describe('carousel library migration', () => {
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

  test('dry-run writes nothing, a rerun adds no accounts, and rollback clears the link', async () => {
    const { PivotCarouselDeck, PivotCarouselAccount } = getGlobalModels(req, 'PivotCarouselDeck', 'PivotCarouselAccount');
    const first = await PivotCarouselDeck.create({ tenantKey: 'sf', title: 'Lanterns', slides: [] });
    const second = await PivotCarouselDeck.create({ tenantKey: 'nyc', title: 'Jazz', slides: [] });
    const originalUpdatedAt = first.updatedAt.toISOString();

    const preview = await migrateCarouselDecksToAccounts(req, { dryRun: true });
    expect(preview.data.report.issuesAssigned).toHaveLength(2);
    expect(await PivotCarouselAccount.countDocuments()).toBe(0);
    expect(String((await PivotCarouselDeck.findById(first._id)).accountId || '')).toBe('');

    const applied = await migrateCarouselDecksToAccounts(req, { dryRun: false });
    expect(applied.data.report.accountsCreated).toHaveLength(2);
    const assigned = await PivotCarouselDeck.findById(first._id);
    expect(String(assigned.accountId)).toHaveLength(24);
    expect(assigned.updatedAt.toISOString()).toBe(originalUpdatedAt);
    expect(assigned.schemaVersion || 1).toBe(1);

    const again = await migrateCarouselDecksToAccounts(req, { dryRun: false });
    expect(again.data.report.issuesAssigned).toHaveLength(0);
    expect(await PivotCarouselAccount.countDocuments()).toBe(2);

    await rollbackCarouselAccountMigration(req, applied.data.report.rollback);
    expect((await PivotCarouselDeck.findById(first._id)).accountId).toBeNull();
    expect((await PivotCarouselDeck.findById(second._id)).accountId).toBeNull();
    expect(await PivotCarouselAccount.countDocuments()).toBe(2);
  });

  test('an editable copy keeps the original and reports an unknown slide', async () => {
    const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
    const deck = await PivotCarouselDeck.create({
      tenantKey: 'sf',
      title: 'Lanterns',
      slides: [{ type: 'cover', values: { coverLine: 'lanterns' }, events: [] }],
    });
    await migrateCarouselDecksToAccounts(req, { dryRun: false, tenantKey: 'sf' });
    const assigned = await PivotCarouselDeck.findById(deck._id);
    const copy = await createEditableCopy(req, String(assigned.accountId), String(deck._id));
    const original = await PivotCarouselDeck.findById(deck._id);
    expect(original.schemaVersion || 1).toBe(1);
    expect(original.slides).toHaveLength(1);
    expect(copy.data.issue.id).not.toBe(String(deck._id));
    expect(copy.data.issue.schemaVersion).toBe(2);
    expect(copy.data.issue.document.slides[0].elements[0].text).toBe('lanterns');

    const unknown = convertLegacySlide({ type: 'poster', values: {} }, 0);
    expect(unknown.unsupported[0].reason).toBe('unknown slide type');
    expect(unknown.slide.elements[0].unsupported).toBe(true);
  });
});
