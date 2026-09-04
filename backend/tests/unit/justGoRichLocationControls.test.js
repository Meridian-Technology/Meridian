const {
  DEFAULT_RICH_LOCATION_CONTROLS,
  normalizeRichLocationControls,
  validateRichLocationControls,
  resolveRichLocationControls,
  isRichLocationCapabilityEnabled,
} = require('../../utilities/justGoRichLocationControls');
const {
  normalizeTenantRow,
  normalizeTenantOverride,
  mergeTenantRows,
} = require('../../constants/defaultTenants');

describe('justGoRichLocationControls', () => {
  it('defaults every capability and rollout off', () => {
    expect(resolveRichLocationControls({
      tenantKey: 'nyc',
      tenantType: 'pivot',
    })).toEqual(DEFAULT_RICH_LOCATION_CONTROLS);
  });

  it('keeps capabilities off until rollout is explicitly on', () => {
    const tenant = {
      tenantType: 'pivot',
      richLocationControls: {
        rollout: 'off',
        reads: true,
        writes: true,
        autocomplete: true,
        search: true,
      },
    };
    expect(resolveRichLocationControls(tenant)).toEqual(DEFAULT_RICH_LOCATION_CONTROLS);
  });

  it('supports independent per-city capability switches', () => {
    const tenant = {
      tenantType: 'pivot',
      richLocationControls: {
        rollout: 'on',
        reads: true,
        writes: false,
        autocomplete: true,
        search: false,
      },
    };
    expect(resolveRichLocationControls(tenant)).toEqual({
      rollout: 'on',
      reads: true,
      writes: false,
      autocomplete: true,
      search: false,
    });
    expect(isRichLocationCapabilityEnabled(tenant, 'reads')).toBe(true);
    expect(isRichLocationCapabilityEnabled(tenant, 'writes')).toBe(false);
    expect(isRichLocationCapabilityEnabled(tenant, 'autocomplete')).toBe(true);
    expect(isRichLocationCapabilityEnabled(tenant, 'search')).toBe(false);
  });

  it('forces all rich-location controls off for campus tenants', () => {
    const campus = {
      tenantType: 'campus',
      pivotPilot: false,
      richLocationControls: {
        rollout: 'on',
        reads: true,
        writes: true,
        autocomplete: true,
        search: true,
      },
    };
    expect(resolveRichLocationControls(campus)).toEqual(DEFAULT_RICH_LOCATION_CONTROLS);
    expect(isRichLocationCapabilityEnabled(campus, 'writes')).toBe(false);
    expect(isRichLocationCapabilityEnabled(campus, 'reads')).toBe(false);
  });

  it('rejects malformed control patches instead of coercing them on', () => {
    expect(validateRichLocationControls({ rollout: 'half' })).toEqual({
      error: 'richLocationControls.rollout must be off or on.',
    });
    expect(validateRichLocationControls({ writes: 'true' })).toEqual({
      error: 'richLocationControls.writes must be boolean.',
    });
  });

  it('normalizes full and sparse control documents', () => {
    expect(normalizeRichLocationControls({ writes: true })).toEqual({
      rollout: 'off',
      reads: false,
      writes: true,
      autocomplete: false,
      search: false,
    });
    expect(normalizeRichLocationControls({ writes: true }, { sparse: true })).toEqual({
      writes: true,
    });
  });

  it('preserves controls through tenant normalization and sparse merging', () => {
    const base = normalizeTenantRow({
      tenantKey: 'nyc',
      name: 'New York City',
      subdomain: 'nyc',
      location: 'New York City',
      tenantType: 'pivot',
      richLocationControls: { rollout: 'off' },
    });
    const override = normalizeTenantOverride({
      tenantKey: 'nyc',
      richLocationControls: {
        rollout: 'on',
        reads: true,
        writes: true,
        autocomplete: false,
        search: false,
      },
    });
    const [merged] = mergeTenantRows([base], [override]);
    expect(merged.richLocationControls).toEqual({
      rollout: 'on',
      reads: true,
      writes: true,
      autocomplete: false,
      search: false,
    });
  });
});
