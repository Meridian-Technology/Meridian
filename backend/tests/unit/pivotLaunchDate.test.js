const tenantConfigSchema = require('../../schemas/tenantConfig');
const {
  normalizePivotLaunchDate,
  launchDateToUtc,
} = require('../../utilities/pivotLaunchDate');
const {
  mergeSparseTenantOverrides,
  normalizeTenantOverride,
  normalizeTenantRow,
} = require('../../constants/defaultTenants');
const {
  toStoredTenantRow,
  validateTenantMetadataUpdate,
} = require('../../services/tenantConfigService');

function pivotCity(overrides = {}) {
  return {
    tenantKey: 'nyc',
    name: 'New York',
    subdomain: 'nyc',
    location: 'New York',
    tenantType: 'pivot',
    pivotPilot: true,
    ...overrides,
  };
}

describe('pivotLaunchDate', () => {
  it('accepts a calendar day, clears on null or empty, and ignores undefined', () => {
    expect(normalizePivotLaunchDate('2026-09-10')).toEqual({ value: '2026-09-10' });
    expect(normalizePivotLaunchDate(' 2026-09-10 ')).toEqual({ value: '2026-09-10' });
    expect(normalizePivotLaunchDate(null)).toEqual({ value: null });
    expect(normalizePivotLaunchDate('')).toEqual({ value: null });
    expect(normalizePivotLaunchDate(undefined)).toEqual({ value: undefined });
  });

  it('rejects malformed and impossible dates', () => {
    expect(normalizePivotLaunchDate('09/10/2026').error).toMatch(/YYYY-MM-DD/);
    expect(normalizePivotLaunchDate('2026-02-30').error).toMatch(/real calendar date/);
  });

  it('converts to midnight UTC', () => {
    expect(launchDateToUtc('2026-09-10')).toEqual(new Date('2026-09-10T00:00:00Z'));
    expect(launchDateToUtc(null)).toBeNull();
    expect(launchDateToUtc('nope')).toBeNull();
  });

  it('is declared on the tenant schema', () => {
    expect(tenantConfigSchema.path('tenants').schema.path('pivotLaunchDate')).toBeDefined();
  });

  it('validates tenant updates with INVALID_LAUNCH_DATE', () => {
    expect(validateTenantMetadataUpdate({ pivotLaunchDate: '2026-13-01' })).toMatchObject({
      code: 'INVALID_LAUNCH_DATE',
    });
    expect(validateTenantMetadataUpdate({ pivotLaunchDate: '2026-09-10' }).error).toBeUndefined();
    expect(validateTenantMetadataUpdate({ pivotLaunchDate: null }).error).toBeUndefined();
  });

  it('survives storing and reading a tenant row', () => {
    const stored = toStoredTenantRow(pivotCity({ pivotLaunchDate: '2026-09-10' }));
    expect(stored.pivotLaunchDate).toBe('2026-09-10');
    expect(normalizeTenantRow(stored).pivotLaunchDate).toBe('2026-09-10');
    expect(normalizeTenantRow({ ...stored, pivotLaunchDate: 'bad' }).pivotLaunchDate).toBeUndefined();
  });

  it('lets a sparse override clear an earlier launch date', () => {
    const existing = normalizeTenantOverride({ tenantKey: 'nyc', pivotLaunchDate: '2026-09-10' });
    const cleared = normalizeTenantOverride({ tenantKey: 'nyc', pivotLaunchDate: null });
    expect(existing.pivotLaunchDate).toBe('2026-09-10');
    expect(mergeSparseTenantOverrides(existing, cleared).pivotLaunchDate).toBeNull();
  });
});
