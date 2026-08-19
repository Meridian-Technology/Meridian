jest.mock('../../services/tenantConfigService', () => ({
  getTenantByKey: jest.fn(),
}));

const getGlobalModels = require('../../services/getGlobalModelService');
const { getTenantByKey } = require('../../services/tenantConfigService');
const { createMongoMemoryConnection } = require('../helpers/mongoMemory');
const {
  COPY_ENTRY_MAX_LENGTH,
  COPY_PATCH_MAX_KEYS,
  COPY_TOKEN_MAX_LENGTH,
  isCatalogCopyKey,
  isCopyTokenName,
  isRemoteCopyKey,
} = require('../../utilities/pivotCopyCatalog');
const {
  COPY_REVISION_FORMAT,
  formatCopyRevision,
  copyRevisionEtag,
  copyRevisionNotModified,
  mergeStoredCopyPacks,
  validateCopyPatch,
  getMergedCopyPack,
  getMergedCopyPackOrEmpty,
  getPlatformLandingCopy,
  filterLandingCopyPack,
  getCopyPointer,
  getCopyCatalog,
  getCopyLayers,
  getPlatformCopyLayers,
  getPivotCopy,
  patchCopyPack,
  resetCopyPack,
} = require('../../services/pivotCopyService');

describe('pivotCopyCatalog (Task 2.2)', () => {
  it('allows consumer leaves and first-class tokens', () => {
    expect(isRemoteCopyKey('ticker.week')).toBe(true);
    expect(isRemoteCopyKey('crew.createTitle')).toBe(true);
    expect(isRemoteCopyKey('brand.name')).toBe(true);
    expect(isCopyTokenName('brand.name')).toBe(true);
    expect(isCopyTokenName('group.singular')).toBe(true);
  });

  it('denies unknown, section-only, and never-remote keys', () => {
    const denied = [
      '',
      'brand',
      'admin.title',
      'demo.ticker',
      'dev.previewFeedbackButton',
      'network.offline',
      'mobile.updateGateTitle',
      'week.adminNextDeckCta',
      'profile.devResetWeekTitle',
      'crew.week.devClearPickCta',
      'crew.interestBleedSubtitleEnabled',
    ];
    for (const path of denied) {
      expect(isRemoteCopyKey(path)).toBe(false);
    }
  });
});

describe('pivotCopyDefaults catalog (Task 4.1)', () => {
  it('includes shipped consumer keys and first-class tokens', () => {
    expect(isCatalogCopyKey('ticker.week')).toBe(true);
    expect(isCatalogCopyKey('auth.joinCity')).toBe(true);
    expect(isCatalogCopyKey('crew.createTitle')).toBe(true);
    expect(isCatalogCopyKey('crew.push.weeklyDrop.ritualBody')).toBe(true);
    expect(isCatalogCopyKey('crew.push.weeklyDrop.decideBody')).toBe(true);
    expect(isCatalogCopyKey('crew.push.ritual.quorumWaitingBody')).toBe(true);
    expect(isCatalogCopyKey('landing.cta')).toBe(true);
    expect(isCopyTokenName('group.singular')).toBe(true);

    const catalog = getCopyCatalog().data;
    expect(catalog.schemaVersion).toBe(1);
    const week = catalog.keys.find((key) => key.path === 'ticker.week');
    expect(week).toMatchObject({
      kind: 'string',
      shipped: 'swipe what’s on. just go',
    });
    const joinCity = catalog.keys.find((key) => key.path === 'auth.joinCity');
    expect(joinCity).toMatchObject({
      kind: 'template',
      params: ['city'],
      shipped: '{brand.cta} in {city}',
    });
    expect(catalog.tokens.map((token) => token.name)).toEqual([
      'brand.name',
      'brand.cta',
      'group.singular',
      'group.plural',
    ]);
  });

  it('omits denied sections and nested admin/dev leaves', () => {
    expect(isCatalogCopyKey('admin.title')).toBe(false);
    expect(isCatalogCopyKey('week.adminNextDeckCta')).toBe(false);
    expect(isCatalogCopyKey('ticker.notARealKey')).toBe(false);
    const paths = getCopyCatalog().data.keys.map((key) => key.path);
    expect(paths).not.toContain('admin.title');
    expect(paths).not.toContain('profile.devResetWeekTitle');
  });

  it('filterLandingCopyPack keeps landing and brand keys only', () => {
    expect(
      filterLandingCopyPack({
        revision: 'p1:t0',
        schemaVersion: 1,
        tokens: { 'group.singular': 'crew' },
        entries: {
          'ticker.week': 'nope',
          'landing.cta': 'yes',
          'brand.name': 'block',
        },
      }),
    ).toEqual({
      revision: 'p1:t0',
      schemaVersion: 1,
      tokens: { 'group.singular': 'crew' },
      entries: {
        'landing.cta': 'yes',
        'brand.name': 'block',
      },
    });
  });
});

describe('pivotCopyService (Task 2.2)', () => {
  let mongo;
  let req;

  beforeAll(async () => {
    mongo = await createMongoMemoryConnection({ withGlobalDb: true });
    req = { globalDb: mongo.globalConnection, school: 'nyc', user: { email: 'ops@meridian.study' } };
    const { PivotCopyPack } = getGlobalModels(req, 'PivotCopyPack');
    await PivotCopyPack.syncIndexes();
  });

  beforeEach(() => {
    getTenantByKey.mockReset();
    getTenantByKey.mockImplementation(async (_req, key) => ({
      tenantKey: String(key || '').trim().toLowerCase(),
      tenantType: 'pivot',
    }));
  });

  afterEach(async () => {
    await mongo.reset();
    const { PivotCopyPack } = getGlobalModels(req, 'PivotCopyPack');
    await PivotCopyPack.syncIndexes();
  });

  afterAll(async () => {
    await mongo.cleanup();
  });

  describe('formatCopyRevision', () => {
    it('documents p{platformRev}:t{tenantRev} with missing layers as 0', () => {
      expect(COPY_REVISION_FORMAT).toBe('p{platformRev}:t{tenantRev}');
      expect(formatCopyRevision(undefined, undefined)).toBe('p0:t0');
      expect(formatCopyRevision(3, null)).toBe('p3:t0');
      expect(formatCopyRevision(2, 4)).toBe('p2:t4');
    });

    it('builds a quoted ETag and honors If-None-Match', () => {
      expect(copyRevisionEtag('p1:t0')).toBe('"p1:t0"');
      expect(copyRevisionNotModified('"p1:t0"', 'p1:t0')).toBe(true);
      expect(copyRevisionNotModified('W/"p1:t0"', 'p1:t0')).toBe(true);
      expect(copyRevisionNotModified('"p0:t0"', 'p1:t0')).toBe(false);
      expect(copyRevisionNotModified(undefined, 'p1:t0')).toBe(false);
    });
  });

  describe('validateCopyPatch', () => {
    it('rejects denied keys on write', () => {
      const result = validateCopyPatch({
        entries: { 'admin.title': 'nope' },
      });
      expect(result.status).toBe(400);
      expect(result.code).toBe('DENIED_COPY_KEY');
    });

    it('rejects nested admin/dev ops leaves', () => {
      expect(
        validateCopyPatch({ entries: { 'week.adminNextDeckCta': 'skip' } }).code,
      ).toBe('DENIED_COPY_KEY');
    });

    it('rejects over-long entry and token values', () => {
      const longEntry = 'x'.repeat(COPY_ENTRY_MAX_LENGTH + 1);
      const longToken = 'y'.repeat(COPY_TOKEN_MAX_LENGTH + 1);
      expect(
        validateCopyPatch({ entries: { 'ticker.week': longEntry } }).code,
      ).toBe('COPY_VALUE_TOO_LONG');
      expect(
        validateCopyPatch({ tokens: { 'group.singular': longToken } }).code,
      ).toBe('COPY_VALUE_TOO_LONG');
    });

    it('accepts allowlisted entries and token names', () => {
      const result = validateCopyPatch({
        entries: { 'ticker.week': 'this week' },
        tokens: { 'group.singular': 'crew' },
      });
      expect(result.ok).toBe(true);
      expect(result.entries['ticker.week']).toBe('this week');
      expect(result.tokens['group.singular']).toBe('crew');
    });

    it('rejects unknown catalog keys on write', () => {
      const result = validateCopyPatch({
        entries: { 'ticker.notARealKey': 'nope' },
      });
      expect(result.status).toBe(400);
      expect(result.code).toBe('UNKNOWN_COPY_KEY');
    });

    it('rejects a batch larger than the editor cap', () => {
      const oversized = {};
      for (let i = 0; i <= COPY_PATCH_MAX_KEYS; i += 1) {
        oversized[`k${i}`] = 'value';
      }
      expect(validateCopyPatch({ entries: oversized }).code).toBe(
        'COPY_PATCH_TOO_LARGE',
      );
    });
  });

  describe('mergeStoredCopyPacks', () => {
    it('unions stored keys without a bundled default catalog', () => {
      const merged = mergeStoredCopyPacks(
        { revision: 1, entries: { 'ticker.week': 'platform' }, tokens: {} },
        null,
        1,
      );
      expect(merged.entries['ticker.week']).toBe('platform');
      expect(merged.revision).toBe('p1:t0');
    });

    it('lets tenant overlay win on the same key', () => {
      const merged = mergeStoredCopyPacks(
        {
          revision: 2,
          entries: { 'ticker.week': 'platform', 'entry.title': 'all cities' },
          tokens: { 'group.singular': 'circle' },
        },
        {
          revision: 5,
          entries: { 'ticker.week': 'nyc week' },
          tokens: { 'group.singular': 'crew' },
        },
        1,
      );
      expect(merged.entries['ticker.week']).toBe('nyc week');
      expect(merged.entries['entry.title']).toBe('all cities');
      expect(merged.tokens['group.singular']).toBe('crew');
      expect(merged.revision).toBe('p2:t5');
    });
  });

  describe('getMergedCopyPack', () => {
    it('returns an empty overlay when no packs exist', async () => {
      const result = await getMergedCopyPack(req, { tenantKey: 'nyc' });
      expect(result.data).toEqual({
        revision: 'p0:t0',
        schemaVersion: 1,
        tokens: {},
        entries: {},
      });
    });

    it('getMergedCopyPackOrEmpty never fails the caller', async () => {
      const empty = await getMergedCopyPackOrEmpty({}, { tenantKey: 'nyc' });
      expect(empty).toEqual({
        revision: 'p0:t0',
        schemaVersion: 1,
        tokens: {},
        entries: {},
      });

      await patchCopyPack(req, {
        scope: 'platform',
        entries: { 'crew.push.weeklyDrop.ritualBody': 'overlay ritual' },
      });
      const merged = await getMergedCopyPackOrEmpty(req, { tenantKey: 'nyc' });
      expect(merged.entries['crew.push.weeklyDrop.ritualBody']).toBe('overlay ritual');
    });

    it('getPlatformLandingCopy returns platform landing keys only', async () => {
      await patchCopyPack(req, {
        scope: 'platform',
        entries: {
          'ticker.week': 'secret week',
          'landing.cta': 'get overlay',
          'brand.name': 'block',
        },
        tokens: { 'group.singular': 'block' },
      });
      await patchCopyPack(req, {
        scope: 'tenant',
        tenantKey: 'nyc',
        entries: { 'landing.cta': 'nyc only' },
      });

      const result = await getPlatformLandingCopy(req);
      expect(result.data.entries['landing.cta']).toBe('get overlay');
      expect(result.data.entries['brand.name']).toBe('block');
      expect(result.data.entries).not.toHaveProperty('ticker.week');
      expect(result.data.tokens['group.singular']).toBe('block');
    });

    it('merges platform-only when no tenant row exists', async () => {
      await patchCopyPack(req, {
        scope: 'platform',
        entries: { 'ticker.week': 'platform week' },
      });

      const result = await getMergedCopyPack(req, { tenantKey: 'nyc' });
      expect(result.data.revision).toBe('p1:t0');
      expect(result.data.entries['ticker.week']).toBe('platform week');
    });

    it('lets the tenant overlay win over platform on the same key', async () => {
      await patchCopyPack(req, {
        scope: 'platform',
        entries: {
          'ticker.week': 'platform week',
          'entry.title': 'all cities',
        },
        tokens: { 'group.singular': 'circle' },
      });
      await patchCopyPack(req, {
        scope: 'tenant',
        tenantKey: 'nyc',
        entries: { 'ticker.week': 'nyc week' },
        tokens: { 'group.singular': 'crew' },
      });

      const nyc = await getMergedCopyPack(req, { tenantKey: 'nyc' });
      expect(nyc.data.entries['ticker.week']).toBe('nyc week');
      expect(nyc.data.entries['entry.title']).toBe('all cities');
      expect(nyc.data.tokens['group.singular']).toBe('crew');
      expect(nyc.data.revision).toBe('p1:t1');

      const brooklyn = await getMergedCopyPack(req, { tenantKey: 'brooklyn' });
      expect(brooklyn.data.entries['ticker.week']).toBe('platform week');
      expect(brooklyn.data.revision).toBe('p1:t0');
    });
  });

  describe('getCopyPointer', () => {
    it('returns revision and schemaVersion without overlay maps', async () => {
      await patchCopyPack(req, {
        scope: 'platform',
        entries: { 'ticker.week': 'platform week' },
        tokens: { 'group.singular': 'crew' },
      });

      const result = await getCopyPointer(req, { tenantKey: 'nyc' });

      expect(result.data).toEqual({
        revision: 'p1:t0',
        schemaVersion: 1,
      });
      expect(result.data.entries).toBeUndefined();
      expect(result.data.tokens).toBeUndefined();
    });
  });

  describe('patchCopyPack', () => {
    it('bumps revision on every successful write', async () => {
      const first = await patchCopyPack(req, {
        scope: 'platform',
        entries: { 'ticker.week': 'one' },
      });
      const second = await patchCopyPack(req, {
        scope: 'platform',
        entries: { 'entry.title': 'two' },
      });

      expect(first.data.revision).toBe(1);
      expect(second.data.revision).toBe(2);
      expect(second.data.entries).toEqual({
        'ticker.week': 'one',
        'entry.title': 'two',
      });
      expect(second.data.updatedBy).toBe('ops@meridian.study');
    });

    it('does not persist denied keys', async () => {
      const denied = await patchCopyPack(req, {
        scope: 'platform',
        entries: { 'admin.title': 'nope' },
      });
      expect(denied.code).toBe('DENIED_COPY_KEY');

      const { PivotCopyPack } = getGlobalModels(req, 'PivotCopyPack');
      expect(await PivotCopyPack.countDocuments()).toBe(0);
    });
  });

  describe('getPivotCopy', () => {
    beforeEach(() => {
      getTenantByKey.mockReset();
    });

    it('returns the stored-union overlay for a pivot city', async () => {
      getTenantByKey.mockResolvedValue({
        tenantKey: 'nyc',
        tenantType: 'pivot',
      });
      await patchCopyPack(req, {
        scope: 'platform',
        entries: { 'ticker.week': 'platform week' },
      });

      const result = await getPivotCopy(req, { schemaVersion: 1 });

      expect(getTenantByKey).toHaveBeenCalledWith(req, 'nyc');
      expect(result.data.revision).toBe('p1:t0');
      expect(result.data.schemaVersion).toBe(1);
      expect(result.data.entries).toEqual({ 'ticker.week': 'platform week' });
      expect(result.data.tokens).toEqual({});
    });

    it('rejects a non-pivot tenant with 400 (same gate as /pivot/config)', async () => {
      getTenantByKey.mockResolvedValue({
        tenantKey: 'rpi',
        tenantType: 'campus',
        pivotPilot: false,
      });

      const result = await getPivotCopy({ ...req, school: 'rpi' });

      expect(result.status).toBe(400);
      expect(result.error).toMatch(/pivot city tenants/i);
    });

    it('returns 404 when the tenant is missing', async () => {
      getTenantByKey.mockResolvedValue(null);

      const result = await getPivotCopy(req);

      expect(result.status).toBe(404);
    });

    it('rejects a non-integer schemaVersion', async () => {
      getTenantByKey.mockResolvedValue({
        tenantKey: 'nyc',
        tenantType: 'pivot',
      });

      const result = await getPivotCopy(req, { schemaVersion: 'nope' });

      expect(result.status).toBe(400);
      expect(result.code).toBe('INVALID_SCHEMA_VERSION');
    });

    it('returns tenant overlay winning over platform (NYC vs Brooklyn)', async () => {
      getTenantByKey.mockImplementation(async (_req, key) => ({
        tenantKey: String(key || '').trim().toLowerCase(),
        tenantType: 'pivot',
      }));
      await patchCopyPack(req, {
        scope: 'platform',
        entries: { 'ticker.week': 'platform week' },
      });
      await patchCopyPack(req, {
        scope: 'tenant',
        tenantKey: 'nyc',
        entries: { 'ticker.week': 'nyc week' },
      });

      const nyc = await getPivotCopy({ ...req, school: 'nyc' }, { schemaVersion: 1 });
      expect(nyc.data.entries['ticker.week']).toBe('nyc week');
      expect(nyc.data.revision).toBe('p1:t1');

      const brooklyn = await getPivotCopy(
        { ...req, school: 'brooklyn' },
        { schemaVersion: 1 },
      );
      expect(brooklyn.data.entries['ticker.week']).toBe('platform week');
      expect(brooklyn.data.entries['ticker.week']).not.toBe('nyc week');
      expect(brooklyn.data.revision).toBe('p1:t0');
    });
  });

  describe('getPlatformCopyLayers (Task 4.1)', () => {
    it('returns shipped defaults when no platform pack exists', async () => {
      const result = await getPlatformCopyLayers(req);
      expect(result.data.scope).toBe('platform');
      expect(result.data.revision).toBe(0);
      expect(result.data.compositeRevision).toBe('p0:t0');
      expect(result.data.entries['ticker.week']).toEqual({
        shipped: 'swipe what’s on. just go',
        platform: null,
        tenant: null,
        effective: 'swipe what’s on. just go',
      });
      expect(result.data.tokens['group.singular']).toEqual({
        shipped: 'circle',
        platform: null,
        tenant: null,
        effective: 'circle',
      });
      expect(result.data.entries['admin.title']).toBeUndefined();
    });

    it('lets platform overlay win on effective without dropping shipped', async () => {
      await patchCopyPack(req, {
        scope: 'platform',
        entries: { 'ticker.week': 'platform week' },
        tokens: { 'group.singular': 'crew' },
      });

      const result = await getPlatformCopyLayers(req);
      expect(result.data.revision).toBe(1);
      expect(result.data.entries['ticker.week']).toEqual({
        shipped: 'swipe what’s on. just go',
        platform: 'platform week',
        tenant: null,
        effective: 'platform week',
      });
      expect(result.data.tokens['group.singular']).toEqual({
        shipped: 'circle',
        platform: 'crew',
        tenant: null,
        effective: 'crew',
      });
      expect(result.data.entries['entry.title'].platform).toBeNull();
      expect(result.data.entries['entry.title'].effective).toBe(
        result.data.entries['entry.title'].shipped,
      );
    });
  });

  describe('resetCopyPack (Task 4.1)', () => {
    it('removes a stored key and bumps revision', async () => {
      await patchCopyPack(req, {
        scope: 'platform',
        entries: {
          'ticker.week': 'platform week',
          'entry.title': 'all cities',
        },
      });

      const reset = await resetCopyPack(req, {
        scope: 'platform',
        entries: ['ticker.week'],
      });

      expect(reset.data.revision).toBe(2);
      expect(reset.data.entries).toEqual({ 'entry.title': 'all cities' });
      expect(reset.data.entries['ticker.week']).toBeUndefined();

      const layers = await getPlatformCopyLayers(req);
      expect(layers.data.entries['ticker.week'].platform).toBeNull();
      expect(layers.data.entries['ticker.week'].effective).toBe(
        'swipe what’s on. just go',
      );
      expect(layers.data.entries['entry.title'].platform).toBe('all cities');
    });

    it('rejects unknown and denied reset keys', async () => {
      const unknown = await resetCopyPack(req, {
        scope: 'platform',
        entries: ['ticker.notARealKey'],
      });
      expect(unknown.status).toBe(400);
      expect(unknown.code).toBe('UNKNOWN_COPY_KEY');

      const denied = await resetCopyPack(req, {
        scope: 'platform',
        entries: ['admin.title'],
      });
      expect(denied.status).toBe(400);
      expect(denied.code).toBe('DENIED_COPY_KEY');
    });

    it('does not create a pack when resetting a missing platform row', async () => {
      const result = await resetCopyPack(req, {
        scope: 'platform',
        entries: ['ticker.week'],
      });
      expect(result.data.revision).toBe(0);
      expect(result.data.entries).toEqual({});
      const { PivotCopyPack } = getGlobalModels(req, 'PivotCopyPack');
      expect(await PivotCopyPack.countDocuments()).toBe(0);
    });
  });

  describe('tenant copy packs (Task 5.1)', () => {
    it('admin GET layers: tenant wins, then platform, then shipped', async () => {
      await patchCopyPack(req, {
        scope: 'platform',
        entries: {
          'ticker.week': 'platform week',
          'entry.title': 'all cities',
        },
        tokens: { 'group.singular': 'crew' },
      });
      await patchCopyPack(req, {
        scope: 'tenant',
        tenantKey: 'nyc',
        entries: { 'ticker.week': 'nyc week' },
      });

      const layers = await getCopyLayers(req, {
        scope: 'tenant',
        tenantKey: 'nyc',
      });
      expect(layers.data.scope).toBe('tenant');
      expect(layers.data.tenantKey).toBe('nyc');
      expect(layers.data.revision).toBe(1);
      expect(layers.data.compositeRevision).toBe('p1:t1');
      expect(layers.data.entries['ticker.week']).toEqual({
        shipped: 'swipe what’s on. just go',
        platform: 'platform week',
        tenant: 'nyc week',
        effective: 'nyc week',
      });
      expect(layers.data.entries['entry.title']).toEqual({
        shipped: layers.data.entries['entry.title'].shipped,
        platform: 'all cities',
        tenant: null,
        effective: 'all cities',
      });
      expect(layers.data.tokens['group.singular']).toEqual({
        shipped: 'circle',
        platform: 'crew',
        tenant: null,
        effective: 'crew',
      });
    });

    it('does not leak an NYC overlay into Brooklyn admin GET', async () => {
      await patchCopyPack(req, {
        scope: 'platform',
        entries: { 'ticker.week': 'platform week' },
      });
      await patchCopyPack(req, {
        scope: 'tenant',
        tenantKey: 'nyc',
        entries: { 'ticker.week': 'nyc week' },
      });

      const brooklyn = await getCopyLayers(req, {
        scope: 'tenant',
        tenantKey: 'brooklyn',
      });
      expect(brooklyn.data.tenantKey).toBe('brooklyn');
      expect(brooklyn.data.revision).toBe(0);
      expect(brooklyn.data.compositeRevision).toBe('p1:t0');
      expect(brooklyn.data.entries['ticker.week']).toEqual({
        shipped: 'swipe what’s on. just go',
        platform: 'platform week',
        tenant: null,
        effective: 'platform week',
      });

      const nyc = await getCopyLayers(req, {
        scope: 'tenant',
        tenantKey: 'nyc',
      });
      expect(nyc.data.entries['ticker.week'].tenant).toBe('nyc week');
      expect(nyc.data.entries['ticker.week'].effective).toBe('nyc week');
    });

    it('tenant reset inherits platform, then shipped', async () => {
      await patchCopyPack(req, {
        scope: 'platform',
        entries: { 'ticker.week': 'platform week' },
        tokens: { 'group.singular': 'crew' },
      });
      await patchCopyPack(req, {
        scope: 'tenant',
        tenantKey: 'nyc',
        entries: { 'ticker.week': 'nyc week' },
        tokens: { 'group.singular': 'block' },
      });

      let layers = await getCopyLayers(req, { scope: 'tenant', tenantKey: 'nyc' });
      expect(layers.data.entries['ticker.week'].effective).toBe('nyc week');
      expect(layers.data.tokens['group.singular'].effective).toBe('block');

      const resetEntry = await resetCopyPack(req, {
        scope: 'tenant',
        tenantKey: 'nyc',
        entries: ['ticker.week'],
      });
      expect(resetEntry.data.revision).toBe(2);
      expect(resetEntry.data.entries['ticker.week']).toBeUndefined();
      expect(resetEntry.data.tokens['group.singular']).toBe('block');

      layers = await getCopyLayers(req, { scope: 'tenant', tenantKey: 'nyc' });
      expect(layers.data.entries['ticker.week']).toEqual({
        shipped: 'swipe what’s on. just go',
        platform: 'platform week',
        tenant: null,
        effective: 'platform week',
      });
      expect(layers.data.tokens['group.singular'].tenant).toBe('block');

      await resetCopyPack(req, {
        scope: 'tenant',
        tenantKey: 'nyc',
        tokens: ['group.singular'],
      });
      await resetCopyPack(req, {
        scope: 'platform',
        entries: ['ticker.week'],
      });

      layers = await getCopyLayers(req, { scope: 'tenant', tenantKey: 'nyc' });
      expect(layers.data.entries['ticker.week']).toEqual({
        shipped: 'swipe what’s on. just go',
        platform: null,
        tenant: null,
        effective: 'swipe what’s on. just go',
      });
      expect(layers.data.tokens['group.singular']).toEqual({
        shipped: 'circle',
        platform: 'crew',
        tenant: null,
        effective: 'crew',
      });
    });

    it('rejects tenant writes for a missing or campus tenant', async () => {
      getTenantByKey.mockResolvedValueOnce(null);
      const missing = await patchCopyPack(req, {
        scope: 'tenant',
        tenantKey: 'nowhere',
        entries: { 'ticker.week': 'nope' },
      });
      expect(missing.status).toBe(404);
      expect(missing.code).toBe('TENANT_NOT_FOUND');

      getTenantByKey.mockResolvedValueOnce({
        tenantKey: 'rpi',
        tenantType: 'campus',
        pivotPilot: false,
      });
      const campus = await getCopyLayers(req, {
        scope: 'tenant',
        tenantKey: 'rpi',
      });
      expect(campus.status).toBe(400);
      expect(campus.code).toBe('NOT_PIVOT_TENANT');

      const { PivotCopyPack } = getGlobalModels(req, 'PivotCopyPack');
      expect(await PivotCopyPack.countDocuments()).toBe(0);
    });
  });
});
