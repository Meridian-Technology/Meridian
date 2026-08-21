jest.mock('../../services/getGlobalModelService', () => jest.fn());
jest.mock('../../services/getModelService', () => jest.fn());
jest.mock('../../services/tenantConfigService', () => ({
  getTenantByKey: jest.fn(),
}));

const getGlobalModels = require('../../services/getGlobalModelService');
const getModels = require('../../services/getModelService');
const { getTenantByKey } = require('../../services/tenantConfigService');
const {
  JUSTGO_LANDING_QR_DEFAULT_FG,
  JUSTGO_LANDING_QR_DEFAULT_BG,
} = require('../../schemas/justGoLandingQr');
const {
  listTenantLandingQrs,
  createTenantLandingQr,
  updateLandingQr,
  deactivateLandingQr,
  wipeLandingQrScans,
  hopLandingQr,
} = require('../../services/pivotLandingQrService');

const NYC_TENANT = {
  tenantKey: 'nyc',
  tenantType: 'pivot',
  status: 'coming_soon',
  location: 'New York City',
};

const TROY_TENANT = {
  tenantKey: 'troy',
  tenantType: 'pivot',
  status: 'active',
  location: 'Troy',
};

const RPI_TENANT = {
  tenantKey: 'rpi',
  tenantType: 'campus',
  status: 'active',
  name: 'RPI',
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

function qrRow(overrides = {}) {
  return {
    _id: 'qr-id-1',
    name: 'poster-a',
    tenantKey: 'nyc',
    description: '',
    isActive: true,
    fgColor: JUSTGO_LANDING_QR_DEFAULT_FG,
    bgColor: JUSTGO_LANDING_QR_DEFAULT_BG,
    transparentBg: true,
    scans: 0,
    uniqueScans: 0,
    lastScannedAt: null,
    scanDays: {},
    createdAt: new Date('2026-08-19T12:00:00.000Z'),
    updatedAt: new Date('2026-08-19T12:00:00.000Z'),
    ...overrides,
  };
}

describe('pivotLandingQrService (Task 5.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getTenantByKey.mockResolvedValue(NYC_TENANT);
    getModels.mockReturnValue({ QR: { create: jest.fn() } });
  });

  it('lists QRs for a pivot city with derived /qr/{name} payload URLs', async () => {
    const find = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([qrRow()]),
      }),
    });
    getGlobalModels.mockReturnValue({ JustGoLandingQr: { find } });

    const result = await listTenantLandingQrs(mockReq(), { tenantKey: 'nyc' });

    expect(result.error).toBeUndefined();
    expect(result.data.tenantKey).toBe('nyc');
    expect(result.data.items[0].payloadUrl).toMatch(/\/qr\/poster-a$/);
    expect(result.data.items[0].fgColor).toBe('#1A1714');
    expect(getModels).not.toHaveBeenCalled();
    expect(getGlobalModels).toHaveBeenCalledWith(expect.anything(), 'JustGoLandingQr');
  });

  it('creates a QR named troy that still belongs to the troy city', async () => {
    getTenantByKey.mockResolvedValue(TROY_TENANT);
    const create = jest.fn().mockImplementation(async (doc) => qrRow({
      ...doc,
      name: doc.name,
      tenantKey: doc.tenantKey,
    }));
    const findOne = jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });
    getGlobalModels.mockReturnValue({ JustGoLandingQr: { create, findOne } });

    const result = await createTenantLandingQr(mockReq(), {
      tenantKey: 'troy',
      name: 'TROY',
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(201);
    expect(result.data.name).toBe('troy');
    expect(result.data.tenantKey).toBe('troy');
    expect(result.data.payloadUrl).toMatch(/\/qr\/troy$/);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'troy',
        tenantKey: 'troy',
        fgColor: '#1A1714',
        transparentBg: true,
      }),
    );
    expect(getModels).not.toHaveBeenCalled();
  });

  it('rejects a campus school tenant instead of writing a school QR', async () => {
    getTenantByKey.mockResolvedValue(RPI_TENANT);
    const create = jest.fn();
    getGlobalModels.mockReturnValue({ JustGoLandingQr: { create, findOne: jest.fn() } });

    const result = await createTenantLandingQr(mockReq(), {
      tenantKey: 'rpi',
      name: 'union-poster',
    });

    expect(result).toEqual({
      error: 'City not found.',
      status: 404,
      code: 'TENANT_NOT_FOUND',
    });
    expect(create).not.toHaveBeenCalled();
    expect(getModels).not.toHaveBeenCalled();
  });

  it('returns QR_NAME_TAKEN when the slug is already used in another city', async () => {
    const findOne = jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({ name: 'poster-a', tenantKey: 'sf' }),
    });
    const create = jest.fn();
    getGlobalModels.mockReturnValue({ JustGoLandingQr: { create, findOne } });

    const result = await createTenantLandingQr(mockReq(), {
      tenantKey: 'nyc',
      name: 'poster-a',
    });

    expect(result).toEqual({
      error: 'That QR name is already taken.',
      status: 409,
      code: 'QR_NAME_TAKEN',
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('returns QR_NAME_TAKEN on a mongo duplicate key', async () => {
    const findOne = jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });
    const err = new Error('E11000 duplicate key');
    err.code = 11000;
    err.keyPattern = { name: 1 };
    const create = jest.fn().mockRejectedValue(err);
    getGlobalModels.mockReturnValue({ JustGoLandingQr: { create, findOne } });

    const result = await createTenantLandingQr(mockReq(), {
      tenantKey: 'nyc',
      name: 'poster-a',
    });

    expect(result.code).toBe('QR_NAME_TAKEN');
    expect(result.status).toBe(409);
  });

  it('rejects an invalid slug', async () => {
    const result = await createTenantLandingQr(mockReq(), {
      tenantKey: 'nyc',
      name: 'Union Square',
    });
    expect(result.code).toBe('INVALID_QR_NAME');
    expect(getGlobalModels).not.toHaveBeenCalled();
  });

  it('deactivates on DELETE rather than removing the row', async () => {
    const save = jest.fn().mockResolvedValue(true);
    const row = qrRow({ save });
    getGlobalModels.mockReturnValue({
      JustGoLandingQr: {
        findOne: jest.fn().mockResolvedValue(row),
      },
    });

    const result = await deactivateLandingQr(mockReq(), { name: 'poster-a' });

    expect(result.data.isActive).toBe(false);
    expect(save).toHaveBeenCalled();
    expect(row.isActive).toBe(false);
  });

  it('PATCHes isActive and colors without changing name or tenant', async () => {
    const save = jest.fn().mockResolvedValue(true);
    const row = qrRow({ save });
    getGlobalModels.mockReturnValue({
      JustGoLandingQr: {
        findOne: jest.fn().mockResolvedValue(row),
      },
    });

    const result = await updateLandingQr(mockReq(), {
      name: 'poster-a',
      isActive: false,
      fgColor: '#FFD23F',
    });

    expect(result.data.isActive).toBe(false);
    expect(result.data.fgColor).toBe('#FFD23F');
    expect(result.data.name).toBe('poster-a');
    expect(row.tenantKey).toBe('nyc');
  });

  it('wipes scan counters and landing events for one named QR', async () => {
    const save = jest.fn().mockResolvedValue(true);
    const row = qrRow({
      save,
      scans: 12,
      uniqueScans: 7,
      lastScannedAt: new Date('2026-08-18T18:00:00.000Z'),
      scanDays: new Map([['2026-08-18', 12]]),
    });
    const deleteMany = jest.fn().mockResolvedValue({ deletedCount: 5 });
    getGlobalModels.mockImplementation((_req, name) => {
      if (name === 'JustGoLandingEvent') {
        return { JustGoLandingEvent: { deleteMany } };
      }
      return {
        JustGoLandingQr: {
          findOne: jest.fn().mockResolvedValue(row),
        },
      };
    });

    const result = await wipeLandingQrScans(mockReq(), { name: 'Poster-A' });

    expect(row.scans).toBe(0);
    expect(row.uniqueScans).toBe(0);
    expect(row.lastScannedAt).toBeNull();
    expect(row.scanDays.size).toBe(0);
    expect(save).toHaveBeenCalled();
    expect(deleteMany).toHaveBeenCalledWith({ qrName: 'poster-a' });
    expect(result.data.scans).toBe(0);
    expect(result.data.wiped).toEqual({
      scans: 12,
      uniqueScans: 7,
      eventsDeleted: 5,
    });
    expect(row.isActive).toBe(true);
  });
});

describe('hopLandingQr (Task 5.2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getModels.mockReturnValue({ QR: { create: jest.fn(), findOne: jest.fn() } });
  });

  it('increments scans and returns a city landing URL with src=qr', async () => {
    const existing = qrRow({ name: 'troy', tenantKey: 'troy', isActive: true });
    const updated = { ...existing, scans: 1, uniqueScans: 1 };
    const findOneAndUpdate = jest.fn().mockResolvedValue(updated);
    getGlobalModels.mockReturnValue({
      JustGoLandingQr: {
        findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(existing) }),
        findOneAndUpdate,
      },
    });

    const result = await hopLandingQr(mockReq(), {
      name: 'TROY',
      visitorId: 'visitor-abc',
      unique: true,
      search: '?utm=ig',
    });

    expect(result.error).toBeUndefined();
    expect(result.data.tenantKey).toBe('troy');
    expect(result.data.name).toBe('troy');
    expect(result.data.redirectUrl).toMatch(/\/troy\?/);
    expect(result.data.redirectUrl).toMatch(/src=qr/);
    expect(result.data.redirectUrl).toMatch(/qr=troy/);
    expect(result.data.redirectUrl).toMatch(/utm=ig/);
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id: existing._id, isActive: true },
      expect.objectContaining({
        $inc: expect.objectContaining({ scans: 1, uniqueScans: 1 }),
        $set: expect.objectContaining({ lastScannedAt: expect.any(Date) }),
      }),
      { new: true },
    );
    expect(getModels).not.toHaveBeenCalled();
  });

  it('returns QR_NOT_FOUND without incrementing', async () => {
    const findOneAndUpdate = jest.fn();
    getGlobalModels.mockReturnValue({
      JustGoLandingQr: {
        findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
        findOneAndUpdate,
      },
    });

    const result = await hopLandingQr(mockReq(), { name: 'missing' });
    expect(result).toEqual({
      error: 'QR code not found.',
      status: 404,
      code: 'QR_NOT_FOUND',
    });
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('returns QR_INACTIVE without incrementing or a redirect URL', async () => {
    const findOneAndUpdate = jest.fn();
    getGlobalModels.mockReturnValue({
      JustGoLandingQr: {
        findOne: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(qrRow({ isActive: false })),
        }),
        findOneAndUpdate,
      },
    });

    const result = await hopLandingQr(mockReq(), { name: 'poster-a', unique: true });
    expect(result).toEqual({
      error: 'QR code is inactive.',
      status: 400,
      code: 'QR_INACTIVE',
    });
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('does not count uniqueScans on a repeat visitor', async () => {
    const existing = qrRow({ isActive: true });
    const findOneAndUpdate = jest.fn().mockResolvedValue({ ...existing, scans: 2 });
    getGlobalModels.mockReturnValue({
      JustGoLandingQr: {
        findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(existing) }),
        findOneAndUpdate,
      },
    });

    await hopLandingQr(mockReq(), {
      name: 'poster-a',
      visitorId: 'visitor-abc',
      unique: false,
    });

    expect(findOneAndUpdate.mock.calls[0][1].$inc.scans).toBe(1);
    expect(findOneAndUpdate.mock.calls[0][1].$inc.uniqueScans).toBeUndefined();
  });

  it('attributes an SF poster QR in America/Chicago to the Iowa sibling row', async () => {
    const printed = qrRow({ _id: 'sf-qr', name: 'sf-1', tenantKey: 'sf', isActive: true });
    const iowa = qrRow({ _id: 'iowa-qr', name: 'iowa-1', tenantKey: 'iowacity', isActive: true });
    const findOne = jest.fn((filter = {}) => ({
      lean: jest.fn().mockResolvedValue(filter.name === 'iowa-1' ? iowa : printed),
    }));
    const findOneAndUpdate = jest.fn().mockResolvedValue({ ...iowa, scans: 1, uniqueScans: 1 });
    const create = jest.fn();
    getGlobalModels.mockReturnValue({
      JustGoLandingQr: { findOne, findOneAndUpdate, create },
    });

    const result = await hopLandingQr(mockReq(), {
      name: 'sf-1',
      timeZone: 'America/Chicago',
      unique: true,
      visitorId: 'visitor-abc',
    });

    expect(result.error).toBeUndefined();
    expect(result.data.name).toBe('iowa-1');
    expect(result.data.tenantKey).toBe('iowacity');
    expect(result.data.posterTzHop).toBe(true);
    expect(result.data.redirectUrl).toMatch(/\/iowacity\?/);
    expect(result.data.redirectUrl).toMatch(/qr=iowa-1/);
    expect(result.data.redirectUrl).not.toMatch(/qr=sf-1/);
    expect(create).not.toHaveBeenCalled();
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'iowa-qr' },
      expect.objectContaining({
        $inc: expect.objectContaining({ scans: 1, uniqueScans: 1 }),
        $set: expect.objectContaining({ tenantKey: 'iowacity', isActive: true }),
      }),
      { new: true },
    );
  });

  it('creates a missing Iowa sibling QR then increments that row, not SF', async () => {
    const printed = qrRow({ _id: 'sf-qr', name: 'sf-1', tenantKey: 'sf', isActive: true });
    const created = qrRow({ _id: 'iowa-qr', name: 'iowa-1', tenantKey: 'iowacity', isActive: true });
    const findOne = jest.fn((filter = {}) => ({
      lean: jest.fn().mockResolvedValue(filter.name === 'iowa-1' ? null : printed),
    }));
    const create = jest.fn().mockResolvedValue(created);
    const findOneAndUpdate = jest.fn().mockResolvedValue({ ...created, scans: 1 });
    getGlobalModels.mockReturnValue({
      JustGoLandingQr: { findOne, findOneAndUpdate, create },
    });

    const result = await hopLandingQr(mockReq(), {
      name: 'sf-1',
      timeZone: 'America/Chicago',
    });

    expect(result.data.name).toBe('iowa-1');
    expect(result.data.tenantKey).toBe('iowacity');
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'iowa-1',
      tenantKey: 'iowacity',
      isActive: true,
    }));
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'iowa-qr' },
      expect.anything(),
      { new: true },
    );
  });

  it('keeps an SF poster QR on sf in America/Los_Angeles', async () => {
    const existing = qrRow({ name: 'sf-1', tenantKey: 'sf', isActive: true });
    const updated = { ...existing, scans: 1 };
    getGlobalModels.mockReturnValue({
      JustGoLandingQr: {
        findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(existing) }),
        findOneAndUpdate: jest.fn().mockResolvedValue(updated),
      },
    });

    const result = await hopLandingQr(mockReq(), {
      name: 'sf-1',
      timeZone: 'America/Los_Angeles',
    });

    expect(result.data.tenantKey).toBe('sf');
    expect(result.data.posterTzHop).toBeUndefined();
    expect(result.data.redirectUrl).toMatch(/\/sf\?/);
  });
});
