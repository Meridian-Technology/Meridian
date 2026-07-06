jest.mock('../../services/getModelService', () => jest.fn());
jest.mock('../../services/pivotTagCatalogService', () => ({
  validatePivotInterestTags: jest.fn(),
}));

const getModels = require('../../services/getModelService');
const { validatePivotInterestTags } = require('../../services/pivotTagCatalogService');
const {
  getPivotProfileInterests,
  updatePivotProfileInterests,
} = require('../../services/pivotProfileService');

describe('pivotProfileService', () => {
  let User;

  const req = {
    user: { userId: '507f191e810c19729de860eb' },
    globalDb: {},
  };

  beforeEach(() => {
    User = {
      findById: jest.fn(),
    };
    getModels.mockReturnValue({ User });
    validatePivotInterestTags.mockReset();
  });

  it('returns unauthorized when user id is missing', async () => {
    const result = await getPivotProfileInterests({ globalDb: {} });

    expect(result.code).toBe('UNAUTHORIZED');
    expect(result.status).toBe(401);
  });

  it('returns saved interest tags for the authenticated user', async () => {
    User.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          pivotInterestTags: ['live-music', 'board-games'],
        }),
      }),
    });

    const result = await getPivotProfileInterests(req);

    expect(User.findById).toHaveBeenCalledWith(req.user.userId);
    expect(result.data.interestTags).toEqual(['live-music', 'board-games']);
  });

  it('returns empty array when user has no saved interests', async () => {
    User.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({}),
      }),
    });

    const result = await getPivotProfileInterests(req);

    expect(result.data.interestTags).toEqual([]);
  });

  it('persists validated interest tags on update', async () => {
    validatePivotInterestTags.mockResolvedValue({
      tags: ['live-music', 'social'],
    });

    const save = jest.fn().mockResolvedValue(undefined);
    User.findById.mockResolvedValue({
      pivotInterestTags: [],
      save,
    });

    const result = await updatePivotProfileInterests(req, {
      interestTags: ['live-music', 'social'],
    });

    expect(validatePivotInterestTags).toHaveBeenCalledWith(req, ['live-music', 'social']);
    expect(save).toHaveBeenCalled();
    expect(result.data.interestTags).toEqual(['live-music', 'social']);
  });

  it('allows clearing interests with an empty array', async () => {
    validatePivotInterestTags.mockResolvedValue({ tags: [] });

    const save = jest.fn().mockResolvedValue(undefined);
    User.findById.mockResolvedValue({
      pivotInterestTags: ['live-music'],
      save,
    });

    const result = await updatePivotProfileInterests(req, { interestTags: [] });

    expect(result.data.interestTags).toEqual([]);
    expect(save).toHaveBeenCalled();
  });

  it('returns validation errors from catalog validation', async () => {
    validatePivotInterestTags.mockResolvedValue({
      error: 'Unknown catalog tag(s): fake-tag',
      status: 400,
      code: 'INVALID_TAG',
    });

    const result = await updatePivotProfileInterests(req, {
      interestTags: ['fake-tag'],
    });

    expect(result.code).toBe('INVALID_TAG');
    expect(User.findById).not.toHaveBeenCalled();
  });

  it('requires interestTags in request body', async () => {
    const result = await updatePivotProfileInterests(req, {});

    expect(result.code).toBe('VALIDATION_ERROR');
    expect(validatePivotInterestTags).not.toHaveBeenCalled();
  });
});
