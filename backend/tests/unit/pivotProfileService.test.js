jest.mock('../../services/getModelService', () => jest.fn());
jest.mock('../../services/pivotTagCatalogService', () => ({
  validatePivotInterestTags: jest.fn(),
}));
jest.mock('../../utilities/sessionUtils', () => ({
  deleteAllUserSessions: jest.fn(),
  deleteAllGlobalUserSessions: jest.fn(),
}));

const getModels = require('../../services/getModelService');
const { validatePivotInterestTags } = require('../../services/pivotTagCatalogService');
const {
  deleteAllUserSessions,
  deleteAllGlobalUserSessions,
} = require('../../utilities/sessionUtils');
const {
  getPivotProfileInterests,
  updatePivotProfileInterests,
  updatePivotProfileAgeVerification,
  leavePivotPilot,
  normalizePivotLeaveAuthUser,
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
    deleteAllUserSessions.mockReset();
    deleteAllGlobalUserSessions.mockReset();
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

  it('stores age verification for 18+ users', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    User.findById.mockResolvedValue({
      pivotBirthYear: null,
      pivotAgeVerifiedAt: null,
      save,
    });

    const result = await updatePivotProfileAgeVerification(req, { birthYear: 2000 });

    expect(save).toHaveBeenCalled();
    expect(result.data.birthYear).toBe(2000);
    expect(result.data.pivotAgeVerifiedAt).toBeTruthy();
  });

  it('rejects underage verification requests', async () => {
    const birthYear = new Date().getUTCFullYear() - 17;
    const result = await updatePivotProfileAgeVerification(req, { birthYear });

    expect(result.code).toBe('UNDERAGE');
    expect(result.status).toBe(403);
    expect(User.findById).not.toHaveBeenCalled();
  });

  it('marks pivot participation left and clears sessions when leaving pilot', async () => {
    const user = {
      accessSuspended: false,
      accessSuspendedAt: null,
      pivotParticipationStatus: 'active',
      pivotLeftAt: null,
      refreshToken: 'legacy-refresh',
      save: jest.fn().mockImplementation(function save() {
        return Promise.resolve(this);
      }),
    };
    User.findById.mockResolvedValue(user);

    const result = await leavePivotPilot(req);

    expect(user.pivotParticipationStatus).toBe('left');
    expect(user.pivotLeftAt).toBeTruthy();
    expect(user.accessSuspended).toBe(false);
    expect(user.save).toHaveBeenCalled();
    expect(result.data.deactivated).toBe(true);
    expect(deleteAllUserSessions).toHaveBeenCalledWith(req.user.userId, req);
  });

  it('clears mistaken pivot leave suspension for users without onboarding data', async () => {
    const pivotReq = {
      ...req,
      school: 'test-pivot',
    };
    const user = {
      _id: req.user.userId,
      accessSuspended: true,
      accessSuspendedAt: new Date('2026-01-01T00:00:00.000Z'),
      pivotParticipationStatus: 'active',
      pivotLeftAt: null,
      roles: ['user'],
      save: jest.fn().mockImplementation(function save() {
        return Promise.resolve(this);
      }),
    };
    User.findById.mockResolvedValue(user);

    jest.spyOn(require('../../services/tenantConfigService'), 'getTenantByKey').mockResolvedValue({
      pivotPilot: true,
      tenantType: 'pivot',
    });

    const normalized = await normalizePivotLeaveAuthUser(pivotReq, req.user.userId);

    expect(normalized?.accessSuspended).toBe(false);
    expect(normalized?.pivotParticipationStatus).toBe('left');
    expect(normalized?.pivotLeftAt).toBeTruthy();
    expect(user.save).toHaveBeenCalled();
  });
});
