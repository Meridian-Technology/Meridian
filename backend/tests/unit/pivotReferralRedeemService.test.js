jest.mock('../../services/getGlobalModelService', () => jest.fn());

const mongoose = require('mongoose');
const getGlobalModels = require('../../services/getGlobalModelService');
const { redeemReferralCode } = require('../../services/pivotReferralCodeService');

describe('pivotReferralCodeService.redeemReferralCode', () => {
  const globalUserId = new mongoose.Types.ObjectId();
  const codeId = new mongoose.Types.ObjectId();

  function makeReq({ school = 'nyc', gid = globalUserId } = {}) {
    return {
      school,
      user: gid ? { globalUserId: String(gid) } : {},
    };
  }

  let redemptionFindOne;
  let codeFindOne;
  let create;
  let findOneAndUpdate;
  let updateOne;

  beforeEach(() => {
    redemptionFindOne = jest.fn();
    codeFindOne = jest.fn();
    create = jest.fn();
    findOneAndUpdate = jest.fn();
    updateOne = jest.fn();
    getGlobalModels.mockReturnValue({
      PivotReferralCode: {
        findOne: codeFindOne,
        findOneAndUpdate,
        updateOne,
      },
      PivotReferralRedemption: {
        findOne: redemptionFindOne,
        create,
      },
    });
  });

  it('rejects legacy sessions without globalUserId', async () => {
    const result = await redeemReferralCode({ school: 'nyc', user: {} }, 'NYC-PILOT-A');
    expect(result.status).toBe(403);
    expect(result.code).toBe('GLOBAL_USER_REQUIRED');
  });

  it('returns alreadyRedeemed when row exists without incrementing', async () => {
    redemptionFindOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        globalUserId,
        code: 'NYC-PILOT-A',
      }),
    });

    codeFindOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ redemptionCount: 3, maxRedemptions: 50 }),
      }),
    });

    const result = await redeemReferralCode(makeReq(), 'nyc-pilot-a');

    expect(result.data.alreadyRedeemed).toBe(true);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('increments and creates redemption for first-time user', async () => {
    redemptionFindOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });

    const referralDoc = {
      _id: codeId,
      code: 'NYC-PILOT-A',
      tenantKey: 'nyc',
      active: true,
      expiresAt: null,
      redemptionCount: 2,
      maxRedemptions: 50,
      cohortId: 'a',
    };

    codeFindOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(referralDoc),
    });

    findOneAndUpdate.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: codeId,
        redemptionCount: 3,
        maxRedemptions: 50,
      }),
    });

    create.mockResolvedValue({});

    const result = await redeemReferralCode(makeReq(), 'NYC-PILOT-A');

    expect(result.data.redeemed).toBe(true);
    expect(result.data.redemptionCount).toBe(3);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'NYC-PILOT-A',
        pivotReferralCodeId: codeId,
      }),
    );
  });

  it('rolls back increment when duplicate creation races', async () => {
    redemptionFindOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });

    const referralDoc = {
      _id: codeId,
      code: 'NYC-PILOT-A',
      tenantKey: 'nyc',
      active: true,
      expiresAt: null,
      redemptionCount: 0,
      maxRedemptions: 50,
    };

    codeFindOne
      .mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue(referralDoc),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({ redemptionCount: 5, maxRedemptions: 50 }),
        }),
      });

    findOneAndUpdate.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: codeId,
        redemptionCount: 1,
        maxRedemptions: 50,
      }),
    });

    const dup = new Error('duplicate');
    dup.code = 11000;
    create.mockRejectedValue(dup);

    const result = await redeemReferralCode(makeReq(), 'NYC-PILOT-A');

    expect(result.data.alreadyRedeemed).toBe(true);
    expect(updateOne).toHaveBeenCalledWith(
      { _id: codeId },
      { $inc: { redemptionCount: -1 } },
    );
  });

  it('rejects tenant mismatch', async () => {
    redemptionFindOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });
    codeFindOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: codeId,
        code: 'NYC-PILOT-A',
        tenantKey: 'nyc',
        active: true,
        expiresAt: null,
        redemptionCount: 0,
        maxRedemptions: 50,
      }),
    });

    const result = await redeemReferralCode(makeReq({ school: 'rpi' }), 'NYC-PILOT-A');
    expect(result.status).toBe(403);
    expect(result.code).toBe('TENANT_MISMATCH');
  });
});
