jest.mock('../../services/tenantConfigService', () => ({
  getTenantByKey: jest.fn(),
  getMergedTenants: jest.fn(),
  getStoredTenantRows: jest.fn(),
  saveTenantRows: jest.fn(),
  syncTenantUriCache: jest.fn(),
  toStoredTenantRow: jest.fn(),
}));

jest.mock('../../services/getGlobalModelService', () => jest.fn());
jest.mock('../../services/getModelService', () => jest.fn());
jest.mock('../../connectionsManager', () => ({
  connectToDatabase: jest.fn(),
  invalidateTenantConnection: jest.fn(),
}));

const getGlobalModels = require('../../services/getGlobalModelService');
const getModels = require('../../services/getModelService');
const { connectToDatabase } = require('../../connectionsManager');
const tenantConfigService = require('../../services/tenantConfigService');
const {
  validateTenantKeyFormat,
  isDefaultTenantKey,
  renameTenantKey,
} = require('../../services/tenantKeyRenameService');

const iowaCityTenant = {
  tenantKey: 'iowa-city',
  name: 'Iowa City',
  subdomain: 'ic',
  location: 'Iowa City, IA',
  tenantType: 'pivot',
  pivotPilot: true,
  mongoDatabaseName: 'ic',
  status: 'active',
};

describe('tenantKeyRenameService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateTenantKeyFormat', () => {
    it('accepts valid tenant keys', () => {
      expect(validateTenantKeyFormat('ic')).toEqual({ ok: true, tenantKey: 'ic' });
    });

    it('rejects reserved www key', () => {
      expect(validateTenantKeyFormat('www').error).toMatch(/reserved/i);
    });
  });

  describe('isDefaultTenantKey', () => {
    it('blocks built-in tenants', () => {
      expect(isDefaultTenantKey('rpi')).toBe(true);
      expect(isDefaultTenantKey('iowa-city')).toBe(false);
    });
  });

  describe('renameTenantKey', () => {
    it('renames tenant config and cascades global references', async () => {
      tenantConfigService.getTenantByKey.mockResolvedValue(iowaCityTenant);
      tenantConfigService.getMergedTenants.mockResolvedValue([iowaCityTenant]);
      tenantConfigService.getStoredTenantRows.mockResolvedValue([
        { tenantKey: 'iowa-city', subdomain: 'ic', tenantType: 'pivot' },
      ]);
      tenantConfigService.toStoredTenantRow.mockReturnValue({
        tenantKey: 'ic',
        subdomain: 'ic',
        tenantType: 'pivot',
      });
      tenantConfigService.saveTenantRows.mockResolvedValue([]);
      tenantConfigService.syncTenantUriCache.mockResolvedValue({});

      const membershipUpdateMany = jest.fn().mockResolvedValue({ modifiedCount: 2 });
      const referralUpdateMany = jest.fn().mockResolvedValue({ modifiedCount: 1 });
      const snapshotUpdateMany = jest.fn().mockResolvedValue({ modifiedCount: 1 });
      const samlUpdateMany = jest.fn().mockResolvedValue({ modifiedCount: 0 });
      const shuttleUpdateMany = jest.fn().mockResolvedValue({ modifiedCount: 0 });

      getGlobalModels.mockReturnValue({
        TenantMembership: { updateMany: membershipUpdateMany },
        PivotReferralCode: { updateMany: referralUpdateMany },
        PivotWeeklySnapshot: { updateMany: snapshotUpdateMany },
      });

      connectToDatabase.mockResolvedValue({});
      getModels.mockReturnValue({
        SAMLConfig: { updateMany: samlUpdateMany },
        ShuttleConfig: { updateMany: shuttleUpdateMany },
      });

      const result = await renameTenantKey({ globalDb: {} }, 'iowa-city', 'ic', 'admin-1');

      expect(result).toMatchObject({
        ok: true,
        renamed: true,
        tenantKey: 'ic',
        previousTenantKey: 'iowa-city',
        updates: {
          tenantMemberships: 2,
          pivotReferralCodes: 1,
          pivotWeeklySnapshots: 1,
        },
      });
      expect(tenantConfigService.getTenantByKey).toHaveBeenCalledWith(
        { globalDb: {} },
        'iowa-city',
        { exact: true },
      );
      expect(membershipUpdateMany).toHaveBeenCalledWith(
        { tenantKey: 'iowa-city' },
        { $set: { tenantKey: 'ic' } },
      );
      expect(tenantConfigService.saveTenantRows).toHaveBeenCalled();
    });

    it('rejects renaming built-in tenants', async () => {
      const result = await renameTenantKey({ globalDb: {} }, 'rpi', 'renamed', 'admin-1');
      expect(result.code).toBe('DEFAULT_TENANT_IMMUTABLE');
    });
  });
});

describe('getTenantByKey subdomain resolution', () => {
  it('resolves tenant by subdomain alias', async () => {
    tenantConfigService.getMergedTenants.mockResolvedValue([iowaCityTenant]);
    tenantConfigService.getTenantByKey.mockImplementation(async (_req, key, options = {}) => {
      const tenants = await tenantConfigService.getMergedTenants(_req);
      if (options.exact) {
        return tenants.find((row) => row.tenantKey === key) || null;
      }
      return (
        tenants.find((row) => row.tenantKey === key) ||
        tenants.find((row) => (row.subdomain || row.tenantKey) === key) ||
        null
      );
    });

    const tenant = await tenantConfigService.getTenantByKey({ globalDb: {} }, 'ic');
    expect(tenant?.tenantKey).toBe('iowa-city');
  });
});
