jest.mock('../../services/getModelService', () => jest.fn());

const getModels = require('../../services/getModelService');
const {
  normalizePlanVisibility,
  resolvePlanVisibleUserIds,
  updatePivotPlanVisibility,
  getPivotPlanVisibility,
} = require('../../services/pivotPlanVisibilityService');

const viewer = '64a000000000000000000001';
const open = '64a000000000000000000002';
const circleMate = '64a000000000000000000003';
const circleStranger = '64a000000000000000000004';
const hidden = '64a000000000000000000005';

describe('normalizePlanVisibility', () => {
  it('defaults unknown or missing values to friends', () => {
    expect(normalizePlanVisibility(undefined)).toBe('friends');
    expect(normalizePlanVisibility('everyone')).toBe('friends');
    expect(normalizePlanVisibility('circles')).toBe('circles');
  });
});

describe('resolvePlanVisibleUserIds', () => {
  let PivotCrewMembership;

  beforeEach(() => {
    PivotCrewMembership = {
      distinct: jest.fn(async (field) => (field === 'crewId' ? ['crew-1'] : [circleMate])),
    };
    getModels.mockReturnValue({ PivotCrewMembership });
  });

  it('shows friends-visible plans, hides nobody, and shows circles-only to circle-mates', async () => {
    const visible = await resolvePlanVisibleUserIds({}, viewer, [
      { _id: open },
      { _id: circleMate, pivotPlanVisibility: 'circles' },
      { _id: circleStranger, pivotPlanVisibility: 'circles' },
      { _id: hidden, pivotPlanVisibility: 'nobody' },
    ]);

    expect([...visible].sort()).toEqual([open, circleMate].sort());
    const [, sharedQuery] = PivotCrewMembership.distinct.mock.calls[1];
    expect(sharedQuery.crewId).toEqual({ $in: ['crew-1'] });
  });

  it('skips the circle lookup when nobody chose circles-only', async () => {
    const visible = await resolvePlanVisibleUserIds({}, viewer, [{ _id: open }]);
    expect([...visible]).toEqual([open]);
    expect(PivotCrewMembership.distinct).not.toHaveBeenCalled();
  });

  it('hides circles-only plans from a viewer with no circles', async () => {
    PivotCrewMembership.distinct.mockResolvedValueOnce([]);
    const visible = await resolvePlanVisibleUserIds({}, viewer, [
      { _id: circleMate, pivotPlanVisibility: 'circles' },
    ]);
    expect(visible.size).toBe(0);
  });
});

describe('plan visibility setting', () => {
  let User;
  const req = { user: { userId: viewer } };

  beforeEach(() => {
    User = {
      updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
      findById: jest.fn(() => ({
        select: () => ({ lean: () => Promise.resolve({ pivotPlanVisibility: 'nobody' }) }),
      })),
    };
    getModels.mockReturnValue({ User });
  });

  it('saves a valid choice', async () => {
    const result = await updatePivotPlanVisibility(req, { planVisibility: 'circles' });
    expect(result.data).toEqual({ planVisibility: 'circles' });
    expect(User.updateOne).toHaveBeenCalledWith(
      { _id: viewer },
      { $set: { pivotPlanVisibility: 'circles' } },
    );
  });

  it('rejects anything else', async () => {
    const result = await updatePivotPlanVisibility(req, { planVisibility: 'public' });
    expect(result.status).toBe(400);
    expect(User.updateOne).not.toHaveBeenCalled();
  });

  it('reads the stored choice', async () => {
    expect((await getPivotPlanVisibility(req)).data).toEqual({ planVisibility: 'nobody' });
  });

  it('requires sign-in', async () => {
    expect((await getPivotPlanVisibility({})).status).toBe(401);
  });
});
