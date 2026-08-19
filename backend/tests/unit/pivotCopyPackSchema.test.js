const getGlobalModels = require('../../services/getGlobalModelService');
const pivotCopyPackSchema = require('../../schemas/pivotCopyPack');
const tenantConfigSchema = require('../../schemas/tenantConfig');
const { createMongoMemoryConnection } = require('../helpers/mongoMemory');

const {
  PIVOT_COPY_PACK_SCOPES,
  PIVOT_COPY_PACK_DEFAULT_SCHEMA_VERSION,
  PIVOT_COPY_PACK_INDEX_NAMES,
} = pivotCopyPackSchema;

describe('PivotCopyPack schema (Task 2.1)', () => {
  let mongo;
  let req;
  let PivotCopyPack;

  beforeAll(async () => {
    mongo = await createMongoMemoryConnection({ withGlobalDb: true });
    req = { globalDb: mongo.globalConnection };
    ({ PivotCopyPack } = getGlobalModels(req, 'PivotCopyPack'));
    await PivotCopyPack.syncIndexes();
  });

  afterEach(async () => {
    await mongo.reset();
    await PivotCopyPack.syncIndexes();
  });

  afterAll(async () => {
    await mongo.cleanup();
  });

  describe('getGlobalModels registration', () => {
    it('registers PivotCopyPack on the global/platform connection', () => {
      const models = getGlobalModels(req, 'PivotCopyPack');

      expect(models.PivotCopyPack).toBeDefined();
      expect(models.PivotCopyPack.modelName).toBe('PivotCopyPack');
      expect(models.PivotCopyPack.collection.name).toBe('pivot_copy_packs');
    });
  });

  describe('schema indexes', () => {
    it('declares a unique platform row and a unique tenant row per tenantKey', () => {
      expect(PIVOT_COPY_PACK_INDEX_NAMES).toEqual([
        'pivot_copy_pack_platform_unique',
        'pivot_copy_pack_tenant_unique',
      ]);

      const indexes = pivotCopyPackSchema.indexes();
      const byName = new Map(
        indexes.map(([keys, options]) => [options?.name, { keys, options }]),
      );

      const platform = byName.get('pivot_copy_pack_platform_unique');
      expect(platform).toBeDefined();
      expect(platform.keys).toEqual({ scope: 1 });
      expect(platform.options.unique).toBe(true);
      expect(platform.options.partialFilterExpression).toEqual({
        scope: 'platform',
      });

      const tenant = byName.get('pivot_copy_pack_tenant_unique');
      expect(tenant).toBeDefined();
      expect(tenant.keys).toEqual({ tenantKey: 1 });
      expect(tenant.options.unique).toBe(true);
      expect(tenant.options.partialFilterExpression).toEqual({
        scope: 'tenant',
        tenantKey: { $type: 'string' },
      });
    });
  });

  describe('empty platform pack', () => {
    it('creates a platform pack with empty overlay defaults', async () => {
      const pack = await PivotCopyPack.create({ scope: 'platform' });

      expect(pack.scope).toBe('platform');
      expect(pack.tenantKey).toBeNull();
      expect(pack.schemaVersion).toBe(PIVOT_COPY_PACK_DEFAULT_SCHEMA_VERSION);
      expect(pack.revision).toBe(0);
      expect(pack.tokens).toEqual({});
      expect(pack.entries).toEqual({});
      expect(pack.updatedBy).toBeNull();
      expect(pack.createdAt).toBeInstanceOf(Date);
      expect(pack.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('scope + tenantKey', () => {
    it('exports locked scopes', () => {
      expect(PIVOT_COPY_PACK_SCOPES).toEqual(['platform', 'tenant']);
    });

    it('rejects an invalid scope', async () => {
      await expect(PivotCopyPack.create({ scope: 'all-cities' })).rejects.toThrow(
        /scope/,
      );
    });

    it('rejects a tenant pack without tenantKey', async () => {
      await expect(PivotCopyPack.create({ scope: 'tenant' })).rejects.toThrow(
        /tenantKey/,
      );
    });

    it('clears tenantKey on a platform pack even if one is supplied', async () => {
      const pack = await PivotCopyPack.create({
        scope: 'platform',
        tenantKey: 'nyc',
      });

      expect(pack.tenantKey).toBeNull();
    });
  });

  describe('unique indexes', () => {
    it('rejects a second platform pack', async () => {
      await PivotCopyPack.create({ scope: 'platform' });

      await expect(PivotCopyPack.create({ scope: 'platform' })).rejects.toThrow(
        /duplicate key/i,
      );
    });

    it('rejects a second pack for the same tenantKey', async () => {
      await PivotCopyPack.create({ scope: 'tenant', tenantKey: 'nyc' });

      await expect(
        PivotCopyPack.create({ scope: 'tenant', tenantKey: 'NYC' }),
      ).rejects.toThrow(/duplicate key/i);
    });

    it('allows one platform pack plus distinct city packs', async () => {
      await PivotCopyPack.create({ scope: 'platform' });
      await PivotCopyPack.create({ scope: 'tenant', tenantKey: 'nyc' });
      await PivotCopyPack.create({ scope: 'tenant', tenantKey: 'brooklyn' });

      expect(await PivotCopyPack.countDocuments()).toBe(3);
    });
  });

  describe('sparse overlay maps', () => {
    it('persists dotted keys on tokens and entries as literal map keys', async () => {
      const pack = await PivotCopyPack.create({
        scope: 'platform',
        tokens: { 'group.singular': 'crew' },
        entries: { 'ticker.week': 'this week' },
      });

      const lean = await PivotCopyPack.findById(pack._id).lean();
      expect(lean.tokens['group.singular']).toBe('crew');
      expect(lean.entries['ticker.week']).toBe('this week');
    });

    it('rejects non-string overlay values', async () => {
      await expect(
        PivotCopyPack.create({
          scope: 'platform',
          entries: { 'ticker.week': { nested: true } },
        }),
      ).rejects.toThrow(/entries/);
    });
  });

  describe('tenant_configs unchanged', () => {
    it('does not add a pivotCopy blob to tenantEntrySchema', () => {
      const tenantEntry = tenantConfigSchema.path('tenants').schema;

      expect(tenantEntry.paths.pivotCopy).toBeUndefined();
      expect(tenantConfigSchema.paths.pivotCopy).toBeUndefined();
      expect(tenantEntry.paths.pivotCrewConfig).toBeDefined();
      expect(tenantEntry.paths.pivotMobileConfig).toBeDefined();
    });
  });
});
