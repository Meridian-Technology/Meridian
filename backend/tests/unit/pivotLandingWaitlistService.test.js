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
  listTenantWaitlist,
  exportTenantWaitlistCsv,
  deleteTenantWaitlistRow,
  parseWaitlistId,
  waitlistRowsToCsv,
} = require('../../services/pivotLandingWaitlistService');

const WAITLIST_ID = '507f1f77bcf86cd799439011';

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
        store: 'ios',
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

  it('stores ios or android from the signup body', async () => {
    const { create } = mockWaitlist();
    const result = await joinWaitlist(mockReq(), {
      phone: '4155550100',
      tenantKey: 'nyc',
      visitorId: 'visitor-abc',
      store: 'android',
      userAgent: 'Mozilla/5.0 (Linux; Android 14)',
    });

    expect(result.error).toBeUndefined();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        store: 'android',
        userAgent: 'Mozilla/5.0 (Linux; Android 14)',
      }),
    );
  });

  it('infers android from the request user-agent when store is omitted', async () => {
    const { create } = mockWaitlist();
    const req = mockReq();
    req.get.mockImplementation((header) => {
      if (header === 'host') return 'justgo.lol';
      if (header === 'user-agent') return 'Mozilla/5.0 (Linux; Android 14)';
      return undefined;
    });

    await joinWaitlist(req, {
      phone: '4155550100',
      tenantKey: 'nyc',
      visitorId: 'visitor-abc',
    });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ store: 'android' }));
  });

  it('rejects an unknown store', async () => {
    const result = await joinWaitlist(mockReq(), {
      phone: '4155550100',
      tenantKey: 'nyc',
      visitorId: 'visitor-abc',
      store: 'web',
    });
    expect(result).toEqual({
      error: 'store must be ios or android.',
      status: 400,
      code: 'INVALID_STORE',
    });
    expect(getGlobalModels).not.toHaveBeenCalled();
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

function mockWaitlistQuery({ rows = [], total = 0 } = {}) {
  const lean = jest.fn().mockResolvedValue(rows);
  const limit = jest.fn().mockReturnValue({ lean });
  const skip = jest.fn().mockReturnValue({ limit });
  const sort = jest.fn().mockReturnValue({ skip, lean });
  const find = jest.fn().mockReturnValue({ sort });
  const countDocuments = jest.fn().mockResolvedValue(total);
  getGlobalModels.mockReturnValue({ JustGoWaitlist: { find, countDocuments } });
  return { find, sort, skip, limit, lean, countDocuments };
}

describe('admin waitlist list + CSV (Task 4.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getTenantByKey.mockResolvedValue(NYC_TENANT);
    getMergedTenants.mockResolvedValue([NYC_TENANT, SF_TENANT]);
  });

  const sampleRow = {
    _id: WAITLIST_ID,
    createdAt: new Date('2026-08-10T12:00:00.000Z'),
    phoneE164: '+14155550100',
    source: 'share',
    qrName: 'poster-night',
    refCode: 'abc12',
    friendsJoined: 3,
  };

  it('returns a paginated table with phones for platform-admin consumers', async () => {
    const { find, skip, limit, countDocuments } = mockWaitlistQuery({
      rows: [sampleRow],
      total: 21,
    });

    const result = await listTenantWaitlist(mockReq(), {
      tenantKey: 'nyc',
      page: 2,
      limit: 10,
    });

    expect(result.data).toEqual({
      tenantKey: 'nyc',
      items: [
        {
          id: WAITLIST_ID,
          createdAt: '2026-08-10T12:00:00.000Z',
          phoneE164: '+14155550100',
          source: 'share',
          qrName: 'poster-night',
          refCode: 'abc12',
          friendsJoined: 3,
        },
      ],
      pagination: { page: 2, limit: 10, total: 21 },
    });
    expect(find).toHaveBeenCalledWith({ tenantKey: 'nyc' });
    expect(skip).toHaveBeenCalledWith(10);
    expect(limit).toHaveBeenCalledWith(10);
    expect(countDocuments).toHaveBeenCalledWith({ tenantKey: 'nyc' });
  });

  it('exports CSV with the same columns and escaped values', async () => {
    mockWaitlistQuery({
      rows: [
        sampleRow,
        {
          createdAt: new Date('2026-08-09T00:00:00.000Z'),
          phoneE164: '+14155550101',
          source: 'direct',
          qrName: null,
          refCode: 'say "hi", friend',
          friendsJoined: 0,
        },
      ],
      total: 2,
    });

    const result = await exportTenantWaitlistCsv(mockReq(), { tenantKey: 'nyc' });
    expect(result.contentType).toBe('text/csv; charset=utf-8');
    expect(result.filename).toBe('justgo-waitlist-nyc.csv');
    expect(result.body.split('\n')[0]).toBe(
      'createdAt,phoneE164,source,qrName,refCode,friendsJoined',
    );
    expect(result.body).toContain('+14155550100');
    expect(result.body).toContain('"say ""hi"", friend"');
  });

  it('waitlistRowsToCsv quotes commas and quotes', () => {
    const csv = waitlistRowsToCsv([
      {
        createdAt: '2026-08-10T12:00:00.000Z',
        phoneE164: '+14155550100',
        source: 'direct',
        qrName: null,
        refCode: 'a,b',
        friendsJoined: 0,
      },
    ]);
    expect(csv).toContain('"a,b"');
  });

  it('returns TENANT_NOT_FOUND for campus tenants', async () => {
    getTenantByKey.mockResolvedValue({ tenantKey: 'rpi', tenantType: 'campus' });
    const result = await listTenantWaitlist(mockReq(), { tenantKey: 'rpi' });
    expect(result.code).toBe('TENANT_NOT_FOUND');
    expect(getGlobalModels).not.toHaveBeenCalled();
  });
});

describe('deleteTenantWaitlistRow (Task 6.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getTenantByKey.mockResolvedValue(NYC_TENANT);
    getMergedTenants.mockResolvedValue([NYC_TENANT, SF_TENANT]);
  });

  function mockWaitlistDelete({ row = null } = {}) {
    const lean = jest.fn().mockResolvedValue(row);
    const findOneAndDelete = jest.fn().mockReturnValue({ lean });
    getGlobalModels.mockReturnValue({ JustGoWaitlist: { findOneAndDelete } });
    return { findOneAndDelete, lean };
  }

  it('deletes a row in that city and does not echo the phone', async () => {
    const { findOneAndDelete } = mockWaitlistDelete({
      row: { _id: WAITLIST_ID, tenantKey: 'nyc', phoneE164: '+14155550100' },
    });

    const result = await deleteTenantWaitlistRow(mockReq(), {
      tenantKey: 'nyc',
      id: WAITLIST_ID,
    });

    expect(findOneAndDelete).toHaveBeenCalledWith({ _id: WAITLIST_ID, tenantKey: 'nyc' });
    expect(result.data).toEqual({
      tenantKey: 'nyc',
      id: WAITLIST_ID,
      deleted: true,
    });
    expect(result.data).not.toHaveProperty('phone');
    expect(result.data).not.toHaveProperty('phoneE164');
    expect(JSON.stringify(result.data)).not.toMatch(/4155550100|\+14155550100/i);
  });

  it('returns WAITLIST_NOT_FOUND when the id is missing or belongs to another city', async () => {
    mockWaitlistDelete({ row: null });
    const result = await deleteTenantWaitlistRow(mockReq(), {
      tenantKey: 'nyc',
      id: WAITLIST_ID,
    });
    expect(result.code).toBe('WAITLIST_NOT_FOUND');
    expect(result.status).toBe(404);
  });

  it('returns INVALID_WAITLIST_ID for a non-ObjectId', async () => {
    const result = await deleteTenantWaitlistRow(mockReq(), {
      tenantKey: 'nyc',
      id: 'not-an-id',
    });
    expect(result.code).toBe('INVALID_WAITLIST_ID');
    expect(result.status).toBe(400);
    expect(getGlobalModels).not.toHaveBeenCalled();
  });

  it('rejects 12-character strings that mongoose would otherwise treat as ObjectIds', () => {
    expect(parseWaitlistId('abcdefghijkl')).toBeNull();
    expect(parseWaitlistId(WAITLIST_ID)).toBe(WAITLIST_ID);
  });

  it('returns TENANT_NOT_FOUND for campus tenants', async () => {
    getTenantByKey.mockResolvedValue({ tenantKey: 'rpi', tenantType: 'campus' });
    const result = await deleteTenantWaitlistRow(mockReq(), {
      tenantKey: 'rpi',
      id: WAITLIST_ID,
    });
    expect(result.code).toBe('TENANT_NOT_FOUND');
    expect(getGlobalModels).not.toHaveBeenCalled();
  });
});
