const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.mock('../../services/pivotTagCatalogService', () => ({
  validatePivotInterestTags: jest.fn(),
}));

const getModels = require('../../services/getModelService');
const { validatePivotInterestTags } = require('../../services/pivotTagCatalogService');
const { updatePivotProfileInterests } = require('../../services/pivotProfileService');

// The first query on a fresh in-memory Mongo also builds every tenant model's indexes.
jest.setTimeout(120000);

describe('interests saved stamp, on a real Mongo', () => {
  let server;
  let db;
  const users = () => getModels({ db }, 'User').User;
  const reqFor = (user) => ({ db, user: { userId: String(user._id) } });

  beforeAll(async () => {
    server = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
    db = await mongoose.createConnection(server.getUri('pivot_nyc')).asPromise();
  }, 60000);

  afterEach(async () => {
    validatePivotInterestTags.mockReset();
    await users().deleteMany({});
  });

  afterAll(async () => {
    await db?.close();
    await server?.stop();
  });

  it('stamps pivotInterestsUpdatedAt each time interests are saved', async () => {
    const user = await users().create({ email: 'ada@example.com' });
    expect(user.pivotInterestsUpdatedAt).toBeNull();

    validatePivotInterestTags.mockResolvedValue({ tags: ['live-music'] });
    const before = Date.now();
    await updatePivotProfileInterests(reqFor(user), { interestTags: ['live-music'] });

    const first = await users().findById(user._id).lean();
    expect(first.pivotInterestTags).toEqual(['live-music']);
    expect(first.pivotInterestsUpdatedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(first.pivotInterestsUpdatedAt.getTime()).toBeLessThanOrEqual(Date.now());

    // Clearing interests is still a save.
    await new Promise((resolve) => setTimeout(resolve, 5));
    validatePivotInterestTags.mockResolvedValue({ tags: [] });
    await updatePivotProfileInterests(reqFor(user), { interestTags: [] });

    const second = await users().findById(user._id).lean();
    expect(second.pivotInterestTags).toEqual([]);
    expect(second.pivotInterestsUpdatedAt.getTime()).toBeGreaterThan(
      first.pivotInterestsUpdatedAt.getTime(),
    );
  });

  it('leaves the stamp alone when the tags fail validation', async () => {
    const user = await users().create({ email: 'bo@example.com' });
    validatePivotInterestTags.mockResolvedValue({
      error: 'Unknown interest tag: nope',
      status: 400,
      code: 'VALIDATION_ERROR',
    });

    const result = await updatePivotProfileInterests(reqFor(user), { interestTags: ['nope'] });

    expect(result.code).toBe('VALIDATION_ERROR');
    expect((await users().findById(user._id).lean()).pivotInterestsUpdatedAt).toBeNull();
  });
});
