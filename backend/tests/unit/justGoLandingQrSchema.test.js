const getGlobalModels = require('../../services/getGlobalModelService');
const getModels = require('../../services/getModelService');
const justGoLandingQrSchema = require('../../schemas/justGoLandingQr');
const { createMongoMemoryConnection } = require('../helpers/mongoMemory');

const {
  JUSTGO_LANDING_QR_INDEX_NAMES,
  JUSTGO_LANDING_QR_DEFAULT_FG,
  JUSTGO_LANDING_QR_DEFAULT_BG,
  applyLandingQrScan,
  utcDayKey,
} = justGoLandingQrSchema;

describe('JustGoLandingQr schema (Task 5.1)', () => {
  let mongo;
  let req;
  let JustGoLandingQr;

  function baseQr(overrides = {}) {
    return {
      name: 'poster-a',
      tenantKey: 'nyc',
      description: 'Union Square posters',
      ...overrides,
    };
  }

  beforeAll(async () => {
    mongo = await createMongoMemoryConnection({ withGlobalDb: true });
    req = { globalDb: mongo.globalConnection, db: mongo.connection };
    ({ JustGoLandingQr } = getGlobalModels(req, 'JustGoLandingQr'));
    await JustGoLandingQr.syncIndexes();
  });

  afterEach(async () => {
    await mongo.reset();
    await JustGoLandingQr.syncIndexes();
  });

  afterAll(async () => {
    await mongo.cleanup();
  });

  describe('getGlobalModels registration', () => {
    it('registers JustGoLandingQr on the global/platform connection', () => {
      const models = getGlobalModels(req, 'JustGoLandingQr');

      expect(models.JustGoLandingQr).toBeDefined();
      expect(models.JustGoLandingQr.modelName).toBe('JustGoLandingQr');
      expect(models.JustGoLandingQr.collection.name).toBe('justgo_landing_qrs');
      expect(models.JustGoLandingQr.db).toBe(req.globalDb);
    });

    it('throws when req.globalDb is missing', () => {
      expect(() => getGlobalModels({}, 'JustGoLandingQr')).toThrow(/req\.globalDb is not set/);
    });

    it('is not registered on tenant getModels (campus QR stays school-scoped)', () => {
      const models = getModels(req, 'JustGoLandingQr', 'QR');

      expect(models.JustGoLandingQr).toBeUndefined();
      expect(models.QR).toBeDefined();
      expect(models.QR.collection.name).toBe('QR');
    });
  });

  describe('schema indexes', () => {
    it('documents unique name and tenant+createdAt indexes', () => {
      expect(JUSTGO_LANDING_QR_INDEX_NAMES).toEqual([
        'justgo_landing_qr_name_unique',
        'justgo_landing_qr_tenant_created',
      ]);

      const indexes = justGoLandingQrSchema.indexes();
      const byName = new Map(
        indexes.map(([keys, options]) => [options?.name, { keys, options }]),
      );

      const byQrName = byName.get('justgo_landing_qr_name_unique');
      expect(byQrName).toBeDefined();
      expect(byQrName.keys).toEqual({ name: 1 });
      expect(byQrName.options.unique).toBe(true);

      const byTenant = byName.get('justgo_landing_qr_tenant_created');
      expect(byTenant).toBeDefined();
      expect(byTenant.keys).toEqual({ tenantKey: 1, createdAt: -1 });
    });
  });

  describe('fields', () => {
    it('creates a QR with Just Go defaults (not campus green)', async () => {
      const row = await JustGoLandingQr.create(baseQr());

      expect(row.name).toBe('poster-a');
      expect(row.tenantKey).toBe('nyc');
      expect(row.description).toBe('Union Square posters');
      expect(row.isActive).toBe(true);
      expect(row.fgColor).toBe(JUSTGO_LANDING_QR_DEFAULT_FG);
      expect(row.bgColor).toBe(JUSTGO_LANDING_QR_DEFAULT_BG);
      expect(row.fgColor).not.toBe('#4DAA57');
      expect(row.transparentBg).toBe(true);
      expect(row.dotType).toBe('extra-rounded');
      expect(row.cornerType).toBe('extra-rounded');
      expect(row.scans).toBe(0);
      expect(row.uniqueScans).toBe(0);
      expect(row.lastScannedAt).toBeNull();
      expect(row.createdAt).toBeInstanceOf(Date);
      expect(row.updatedAt).toBeInstanceOf(Date);
      expect(row.redirectUrl).toBeUndefined();
    });

    it('allows name troy even when that slug is also a city key', async () => {
      const row = await JustGoLandingQr.create(
        baseQr({ name: 'TROY', tenantKey: 'Troy' }),
      );
      expect(row.name).toBe('troy');
      expect(row.tenantKey).toBe('troy');
    });

    it('rejects a duplicate name globally', async () => {
      await JustGoLandingQr.create(baseQr({ name: 'poster-a', tenantKey: 'nyc' }));
      await expect(
        JustGoLandingQr.create(baseQr({ name: 'poster-a', tenantKey: 'sf' })),
      ).rejects.toThrow(/duplicate key/i);
    });
  });

  describe('validation', () => {
    it('requires name and tenantKey', async () => {
      await expect(
        JustGoLandingQr.create(baseQr({ name: undefined })),
      ).rejects.toThrow(/name/);
      await expect(
        JustGoLandingQr.create(baseQr({ tenantKey: undefined, name: 'other' })),
      ).rejects.toThrow(/tenantKey/);
    });

    it('rejects a non-slug name', async () => {
      await expect(
        JustGoLandingQr.create(baseQr({ name: 'Union Square' })),
      ).rejects.toThrow(/name/);
    });

    it('rejects campus-green-shaped invalid colors', async () => {
      await expect(
        JustGoLandingQr.create(baseQr({ name: 'bad-color', fgColor: 'green' })),
      ).rejects.toThrow(/fgColor/);
    });
  });

  describe('daily scan rollup', () => {
    it('increments integer totals and a day bucket instead of appending history rows', async () => {
      const row = await JustGoLandingQr.create(baseQr({ name: 'scan-roll' }));
      const at = new Date('2026-08-19T15:00:00.000Z');

      applyLandingQrScan(row, { unique: true, at });
      applyLandingQrScan(row, { unique: false, at: new Date('2026-08-19T18:00:00.000Z') });
      await row.save();

      expect(row.scans).toBe(2);
      expect(row.uniqueScans).toBe(1);
      expect(row.scanDays.get(utcDayKey(at))).toBe(2);
      expect(row.scanHistory).toBeUndefined();
      expect(Array.isArray(row.scanDays)).toBe(false);
    });
  });
});
