jest.mock('../../services/getGlobalModelService', () => jest.fn());
jest.mock('../../services/tenantConfigService', () => ({
  getTenantByKey: jest.fn(),
  getMergedTenants: jest.fn(),
}));

const getGlobalModels = require('../../services/getGlobalModelService');
const { getTenantByKey, getMergedTenants } = require('../../services/tenantConfigService');
const {
  joinWaitlist,
  attributeWaitlistShareRef,
} = require('../../services/pivotLandingWaitlistService');

const NYC_TENANT = {
  tenantKey: 'nyc',
  tenantType: 'pivot',
  status: 'coming_soon',
  location: 'New York City',
  name: 'New York',
};

const SF_TENANT = {
  tenantKey: 'sf',
  tenantType: 'pivot',
  status: 'active',
  location: 'San Francisco',
  name: 'San Francisco',
};

function mockReq() {
  return {
    globalDb: {},
    get: jest.fn((header) => {
      if (header === 'host') return 'justgo.lol';
      return undefined;
    }),
  };
}

function mockWaitlist({ existing = null, referrer = null, createImpl } = {}) {
  const create =
    createImpl ||
    jest.fn().mockImplementation(async (doc) => ({
      ...doc,
      _id: 'new-waitlist-id',
      friendsJoined: doc.friendsJoined ?? 0,
    }));
  const updateOne = jest.fn().mockResolvedValue({ acknowledged: true, modifiedCount: 1 });
  const findOne = jest.fn().mockImplementation((query = {}) => {
    const row = query.shareCode != null ? referrer : existing;
    return { lean: jest.fn().mockResolvedValue(row) };
  });
  getGlobalModels.mockReturnValue({ JustGoWaitlist: { create, findOne, updateOne } });
  return { create, findOne, updateOne };
}

describe('joinWaitlist (Task 2.2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getTenantByKey.mockResolvedValue(NYC_TENANT);
    getMergedTenants.mockResolvedValue([NYC_TENANT, SF_TENANT]);
  });

  it('mints shareCode and returns shareUrl without echoing the phone', async () => {
    const { create } = mockWaitlist();

    const result = await joinWaitlist(mockReq(), {
      phone: '(415) 555-0100',
      tenantKey: 'nyc',
      visitorId: 'visitor-abc',
    });

    expect(result.error).toBeUndefined();
    expect(result.data).toEqual({
      shareUrl: expect.stringMatching(/\/nyc\?ref=/),
      friendsJoined: 0,
      tenantKey: 'nyc',
    });
    expect(JSON.stringify(result.data)).not.toMatch(/4155550100|\+14155550100|phone/i);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        phoneE164: '+14155550100',
        tenantKey: 'nyc',
        cityLabel: 'New York City',
        visitorId: 'visitor-abc',
        source: 'direct',
        friendsJoined: 0,
        shareCode: expect.stringMatching(/^[0-9a-z]{10}$/),
      }),
    );
  });

  it('infers city from tenantKey (tenant URL) without a city field', async () => {
    mockWaitlist();

    const result = await joinWaitlist(mockReq(), {
      phone: '4155550100',
      tenantKey: 'NYC',
      visitorId: 'visitor-abc',
    });

    expect(result.data.tenantKey).toBe('nyc');
    expect(getMergedTenants).not.toHaveBeenCalled();
  });

  it('requires city on the generic landing (no tenantKey)', async () => {
    mockWaitlist();

    const missing = await joinWaitlist(mockReq(), {
      phone: '4155550100',
      visitorId: 'visitor-abc',
    });
    expect(missing).toEqual({
      error: 'City is required.',
      status: 400,
      code: 'CITY_REQUIRED',
    });
    expect(getGlobalModels).not.toHaveBeenCalled();

    const byName = await joinWaitlist(mockReq(), {
      phone: '4155550100',
      city: 'San Francisco',
      visitorId: 'visitor-abc',
    });
    expect(byName.data.tenantKey).toBe('sf');
  });

  it('returns 409 WAITLIST_DUPLICATE for the same phone+city', async () => {
    mockWaitlist({
      existing: { tenantKey: 'nyc', phoneE164: '+14155550100' },
    });

    const result = await joinWaitlist(mockReq(), {
      phone: '4155550100',
      tenantKey: 'nyc',
      visitorId: 'visitor-abc',
    });

    expect(result).toEqual({
      error: 'This number is already on the waitlist for this city.',
      status: 409,
      code: 'WAITLIST_DUPLICATE',
    });
  });

  it('rejects garbage phones with INVALID_PHONE', async () => {
    const result = await joinWaitlist(mockReq(), {
      phone: 'nope',
      tenantKey: 'nyc',
      visitorId: 'visitor-abc',
    });
    expect(result.code).toBe('INVALID_PHONE');
    expect(getGlobalModels).not.toHaveBeenCalled();
  });

  it('rejects an unknown tenantKey', async () => {
    getTenantByKey.mockResolvedValue(null);
    const result = await joinWaitlist(mockReq(), {
      phone: '4155550100',
      tenantKey: 'missing',
      visitorId: 'visitor-abc',
    });
    expect(result.code).toBe('TENANT_NOT_FOUND');
  });

  it('rejects a campus tenantKey', async () => {
    getTenantByKey.mockResolvedValue({
      tenantKey: 'rpi',
      tenantType: 'campus',
      status: 'active',
    });
    const result = await joinWaitlist(mockReq(), {
      phone: '4155550100',
      tenantKey: 'rpi',
      visitorId: 'visitor-abc',
    });
    expect(result.code).toBe('TENANT_NOT_FOUND');
  });

  it('does not include Mixpanel-style phone props in the public payload', async () => {
    mockWaitlist();
    const result = await joinWaitlist(mockReq(), {
      phone: '+1 415 555 0100',
      tenantKey: 'nyc',
      visitorId: 'visitor-abc',
      source: 'share',
      ref: 'friendcode1',
    });

    expect(Object.keys(result.data).sort()).toEqual(['friendsJoined', 'shareUrl', 'tenantKey']);
    expect(result.data).not.toHaveProperty('phone');
    expect(result.data).not.toHaveProperty('phoneE164');
  });
});

describe('waitlist ref attribution (Task 3.1)', () => {
  const FRIEND_PHONE = '+14155550999';
  const SELF_PHONE = '+14155550100';
  const NYC_REFERRER = {
    _id: 'nyc-referrer-id',
    tenantKey: 'nyc',
    phoneE164: FRIEND_PHONE,
    shareCode: 'friendcode1',
    friendsJoined: 0,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getTenantByKey.mockResolvedValue(NYC_TENANT);
    getMergedTenants.mockResolvedValue([NYC_TENANT, SF_TENANT]);
  });

  function mockModel({ referrer = NYC_REFERRER } = {}) {
    const updateOne = jest.fn().mockResolvedValue({ acknowledged: true, modifiedCount: 1 });
    const findOne = jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(referrer),
    });
    return { findOne, updateOne };
  }

  it('increments friendsJoined for a same-city ref', async () => {
    const model = mockModel();
    const attributed = await attributeWaitlistShareRef(model, {
      tenantKey: 'nyc',
      phoneE164: SELF_PHONE,
      refCode: 'FriendCode1',
      createdId: 'new-waitlist-id',
    });

    expect(attributed).toBe(true);
    expect(model.findOne).toHaveBeenCalledWith({ shareCode: 'friendcode1' });
    expect(model.updateOne).toHaveBeenCalledWith(
      { _id: 'nyc-referrer-id' },
      { $inc: { friendsJoined: 1 } },
    );
  });

  it('does not increment for a cross-city ref', async () => {
    const model = mockModel({
      referrer: { ...NYC_REFERRER, tenantKey: 'sf' },
    });
    const attributed = await attributeWaitlistShareRef(model, {
      tenantKey: 'nyc',
      phoneE164: SELF_PHONE,
      refCode: 'friendcode1',
      createdId: 'new-waitlist-id',
    });

    expect(attributed).toBe(false);
    expect(model.updateOne).not.toHaveBeenCalled();
  });

  it('does not increment for a self-ref (same phone or same waitlist id)', async () => {
    const samePhone = mockModel({
      referrer: { ...NYC_REFERRER, phoneE164: SELF_PHONE },
    });
    expect(
      await attributeWaitlistShareRef(samePhone, {
        tenantKey: 'nyc',
        phoneE164: SELF_PHONE,
        refCode: 'friendcode1',
        createdId: 'new-waitlist-id',
      }),
    ).toBe(false);
    expect(samePhone.updateOne).not.toHaveBeenCalled();

    const sameId = mockModel({
      referrer: { ...NYC_REFERRER, _id: 'new-waitlist-id' },
    });
    expect(
      await attributeWaitlistShareRef(sameId, {
        tenantKey: 'nyc',
        phoneE164: SELF_PHONE,
        refCode: 'friendcode1',
        createdId: 'new-waitlist-id',
      }),
    ).toBe(false);
    expect(sameId.updateOne).not.toHaveBeenCalled();
  });

  it('ignores an unknown ref and still allows signup', async () => {
    const model = mockModel({ referrer: null });
    const attributed = await attributeWaitlistShareRef(model, {
      tenantKey: 'nyc',
      phoneE164: SELF_PHONE,
      refCode: 'no-such-ref',
      createdId: 'new-waitlist-id',
    });

    expect(attributed).toBe(false);
    expect(model.updateOne).not.toHaveBeenCalled();
  });

  it('joinWaitlist credits a same-city friend after insert', async () => {
    getTenantByKey.mockResolvedValue(NYC_TENANT);
    getMergedTenants.mockResolvedValue([NYC_TENANT, SF_TENANT]);
    const { updateOne, create } = mockWaitlist({ referrer: NYC_REFERRER });

    const result = await joinWaitlist(mockReq(), {
      phone: '4155550100',
      tenantKey: 'nyc',
      visitorId: 'visitor-abc',
      ref: 'friendcode1',
    });

    expect(result.error).toBeUndefined();
    expect(result.data.tenantKey).toBe('nyc');
    expect(result.data.shareUrl).toMatch(/\/nyc\?ref=/);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        refCode: 'friendcode1',
        source: 'share',
      }),
    );
    expect(updateOne).toHaveBeenCalledWith(
      { _id: 'nyc-referrer-id' },
      { $inc: { friendsJoined: 1 } },
    );
  });

  it('does not credit a friend when the signup is a duplicate', async () => {
    getTenantByKey.mockResolvedValue(NYC_TENANT);
    const { updateOne, create } = mockWaitlist({
      existing: { tenantKey: 'nyc', phoneE164: '+14155550100' },
      referrer: NYC_REFERRER,
    });

    const result = await joinWaitlist(mockReq(), {
      phone: '4155550100',
      tenantKey: 'nyc',
      visitorId: 'visitor-abc',
      ref: 'friendcode1',
    });

    expect(result.code).toBe('WAITLIST_DUPLICATE');
    expect(create).not.toHaveBeenCalled();
    expect(updateOne).not.toHaveBeenCalled();
  });
});
