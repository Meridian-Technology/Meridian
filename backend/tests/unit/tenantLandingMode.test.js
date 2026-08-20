const tenantConfigSchema = require('../../schemas/tenantConfig');
const {
  DEFAULT_LANDING_MODE,
  LANDING_MODE_VALUES,
  mergeTenantRows,
  normalizeTenantRow,
  resolveLandingMode,
} = require('../../constants/defaultTenants');
const {
  toStoredTenantRow,
  validateNewTenantPayload,
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

describe('landingMode on tenant config (Task 2.1)', () => {
  describe('schema', () => {
    it('declares waitlist | launched on pivot tenant entries with waitlist default', () => {
      const tenantEntry = tenantConfigSchema.path('tenants').schema;
      const landingMode = tenantEntry.path('landingMode');

      expect(landingMode).toBeDefined();
      expect(landingMode.options.enum).toEqual(LANDING_MODE_VALUES);
      expect(landingMode.options.default).toBe('waitlist');
    });
  });

  describe('resolveLandingMode', () => {
    it('reads a missing field as waitlist', () => {
      expect(resolveLandingMode(undefined)).toBe('waitlist');
      expect(resolveLandingMode(null)).toBe('waitlist');
      expect(resolveLandingMode('')).toBe('waitlist');
      expect(resolveLandingMode('waitlist')).toBe('waitlist');
      expect(resolveLandingMode('launched')).toBe('launched');
    });
  });

  describe('normalizeTenantRow', () => {
    it('defaults missing landingMode to waitlist', () => {
      const row = normalizeTenantRow(pivotCity({ status: 'active' }));
      expect(row.landingMode).toBe(DEFAULT_LANDING_MODE);
      expect(row.landingMode).toBe('waitlist');
    });

    it('allows coming_soon + launched and active + waitlist', () => {
      const comingSoonLaunched = normalizeTenantRow(
        pivotCity({ status: 'coming_soon', landingMode: 'launched' }),
      );
      expect(comingSoonLaunched.status).toBe('coming_soon');
      expect(comingSoonLaunched.landingMode).toBe('launched');

      const activeWaitlist = normalizeTenantRow(
        pivotCity({ status: 'active', landingMode: 'waitlist' }),
      );
      expect(activeWaitlist.status).toBe('active');
      expect(activeWaitlist.landingMode).toBe('waitlist');
    });
  });

  describe('mergeTenantRows', () => {
    it('defaults sparse stored cities to waitlist on read', () => {
      const [row] = mergeTenantRows([], [
        pivotCity({ status: 'active', name: 'New York' }),
      ]);
      expect(row.landingMode).toBe('waitlist');
    });

    it('does not derive landingMode from status', () => {
      const [comingSoonLaunched] = mergeTenantRows([], [
        pivotCity({ status: 'coming_soon', landingMode: 'launched' }),
      ]);
      expect(comingSoonLaunched.status).toBe('coming_soon');
      expect(comingSoonLaunched.landingMode).toBe('launched');

      const [activeWaitlist] = mergeTenantRows([], [
        pivotCity({ tenantKey: 'sf', subdomain: 'sf', name: 'SF', location: 'San Francisco', status: 'active' }),
      ]);
      expect(activeWaitlist.status).toBe('active');
      expect(activeWaitlist.landingMode).toBe('waitlist');
    });
  });

  describe('validateTenantMetadataUpdate', () => {
    it('accepts landingMode independently of status', () => {
      expect(validateTenantMetadataUpdate({ landingMode: 'launched' }).ok).toBe(true);
      expect(validateTenantMetadataUpdate({ landingMode: 'waitlist' }).ok).toBe(true);
      expect(
        validateTenantMetadataUpdate({ status: 'coming_soon', landingMode: 'launched' }).ok,
      ).toBe(true);
      expect(
        validateTenantMetadataUpdate({ status: 'active', landingMode: 'waitlist' }).ok,
      ).toBe(true);
    });

    it('rejects unknown landingMode with INVALID_LANDING_MODE', () => {
      const result = validateTenantMetadataUpdate({ landingMode: 'live' });
      expect(result.error).toMatch(/waitlist or launched/);
      expect(result.code).toBe('INVALID_LANDING_MODE');
    });
  });

  describe('validateNewTenantPayload', () => {
    const baseCreate = {
      tenantKey: 'nyc',
      name: 'New York',
      location: 'New York',
      tenantType: 'pivot',
      mongoUri: 'mongodb://localhost/nyc',
    };

    it('defaults created cities to waitlist', () => {
      const result = validateNewTenantPayload({ ...baseCreate, status: 'coming_soon' });
      expect(result.row.landingMode).toBe('waitlist');
      expect(result.row.status).toBe('coming_soon');
    });

    it('accepts coming_soon + launched and active + waitlist on create', () => {
      const launched = validateNewTenantPayload({
        ...baseCreate,
        status: 'coming_soon',
        landingMode: 'launched',
      });
      expect(launched.row.status).toBe('coming_soon');
      expect(launched.row.landingMode).toBe('launched');

      const waitlist = validateNewTenantPayload({
        ...baseCreate,
        tenantKey: 'sf',
        status: 'active',
        landingMode: 'waitlist',
      });
      expect(waitlist.row.status).toBe('active');
      expect(waitlist.row.landingMode).toBe('waitlist');
    });

    it('rejects unknown landingMode with INVALID_LANDING_MODE', () => {
      const result = validateNewTenantPayload({ ...baseCreate, landingMode: 'preview' });
      expect(result.error).toMatch(/waitlist or launched/);
      expect(result.code).toBe('INVALID_LANDING_MODE');
    });
  });

  describe('toStoredTenantRow', () => {
    it('persists landingMode on pivot cities', () => {
      const stored = toStoredTenantRow(
        pivotCity({ status: 'coming_soon', landingMode: 'launched' }),
      );
      expect(stored.landingMode).toBe('launched');
      expect(stored.status).toBe('coming_soon');
    });

    it('does not write waitlist as a campus default-tenant override', () => {
      const stored = toStoredTenantRow({
        tenantKey: 'rpi',
        name: 'Rensselaer Polytechnic Institute',
        subdomain: 'rpi',
        location: 'Troy, NY',
        status: 'active',
        statusMessage: '',
        tenantType: 'campus',
        pivotPilot: false,
        landingMode: 'waitlist',
      });
      expect(stored).toBeNull();
    });
  });
});
