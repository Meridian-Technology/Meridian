const {
  COMPUTE_APPLY_ORIGINS,
  mergePivotComputeApplyPolicy,
  resolvePivotComputeApplyPolicy,
  validatePivotComputeApplyPolicyPatch,
  mergePivotComputeApplyOverrides,
  updateCityComputeApplyConfig,
} = require('../../utilities/pivotComputeApplyPolicy');
const {
  normalizeTenantRow,
  normalizeTenantOverride,
  mergeTenantRows,
} = require('../../constants/defaultTenants');
const tenantConfigService = require('../../services/tenantConfigService');
const { validateTenantMetadataUpdate } = tenantConfigService;

describe('pivotComputeApplyPolicy', () => {
  it('resolves safe defaults for sparse tenant rows', () => {
    expect(mergePivotComputeApplyPolicy()).toEqual({
      trusted: false,
      autoApplyRefresh: false,
      autoApplyDiscovery: false,
      autoApplyOrigins: ['admin', 'schedule'],
      notifyAdminsEmail: true,
      maxNewSources: null,
      maxEventCreates: null,
    });
    expect(COMPUTE_APPLY_ORIGINS).toEqual(['admin', 'schedule']);
    expect(resolvePivotComputeApplyPolicy({ pivotComputeApply: { trusted: true } }).trusted).toBe(true);
  });

  it('merges valid sparse controls without exposing mutable origin defaults', () => {
    const first = mergePivotComputeApplyPolicy({
      trusted: true,
      autoApplyOrigins: ['schedule', 'schedule'],
      maxEventCreates: 20,
    });
    first.autoApplyOrigins.push('admin');
    expect(mergePivotComputeApplyPolicy().autoApplyOrigins).toEqual(['admin', 'schedule']);
    expect(first).toEqual(expect.objectContaining({
      trusted: true,
      autoApplyOrigins: ['schedule', 'admin'],
      maxEventCreates: 20,
    }));
  });

  it('validates booleans, origins, and optional non-negative discovery guardrails', () => {
    expect(validatePivotComputeApplyPolicyPatch({
      trusted: true,
      autoApplyRefresh: true,
      autoApplyOrigins: ['admin'],
      maxNewSources: 0,
      maxEventCreates: null,
    }).patch).toEqual({
      trusted: true,
      autoApplyRefresh: true,
      autoApplyOrigins: ['admin'],
      maxNewSources: 0,
      maxEventCreates: null,
    });
    expect(validatePivotComputeApplyPolicyPatch({ autoApplyOrigins: ['worker'] }).code)
      .toBe('INVALID_COMPUTE_APPLY_ORIGINS');
    expect(validatePivotComputeApplyPolicyPatch({ maxNewSources: -1 }).code)
      .toBe('INVALID_COMPUTE_APPLY_GUARDRAIL');
    expect(validateTenantMetadataUpdate({ pivotComputeApply: { trusted: 'yes' } }).code)
      .toBe('INVALID_COMPUTE_APPLY_POLICY');
  });

  it('normalizes and merges sparse default tenant overrides', () => {
    expect(normalizeTenantRow({
      tenantKey: 'city', name: 'City', subdomain: 'city', pivotComputeApply: { trusted: true },
    }).pivotComputeApply).toEqual({ trusted: true });
    expect(normalizeTenantOverride({ tenantKey: 'rpi', pivotComputeApply: { autoApplyDiscovery: true } }))
      .toEqual({ tenantKey: 'rpi', pivotComputeApply: { autoApplyDiscovery: true } });
    expect(mergePivotComputeApplyOverrides({ trusted: true }, { autoApplyRefresh: true }))
      .toEqual({ trusted: true, autoApplyRefresh: true });
    expect(mergeTenantRows(
      [{ tenantKey: 'rpi', name: 'RPI', subdomain: 'rpi', pivotComputeApply: { trusted: true } }],
      [{ tenantKey: 'rpi', pivotComputeApply: { autoApplyRefresh: true } }],
    )[0].pivotComputeApply).toEqual({ trusted: true, autoApplyRefresh: true });
  });

  describe('updateCityComputeApplyConfig', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('merges a sparse trusted patch and returns the effective policy', async () => {
      const stored = {
        tenantKey: 'nyc',
        tenantType: 'pivot',
        pivotComputeApply: { notifyAdminsEmail: false },
      };
      jest.spyOn(tenantConfigService, 'getMergedTenants').mockResolvedValue([stored]);
      jest.spyOn(tenantConfigService, 'getTenantByKey').mockResolvedValue(stored);
      jest.spyOn(tenantConfigService, 'upsertStoredTenantRow').mockImplementation(async (_req, row) => row);

      const result = await updateCityComputeApplyConfig(
        { user: { email: 'ops@meridian.app' } },
        { tenantKey: 'nyc', patch: { trusted: true, autoApplyRefresh: true } },
      );

      expect(result.error).toBeUndefined();
      expect(result.data.tenantKey).toBe('nyc');
      expect(result.data.policy).toEqual(expect.objectContaining({
        trusted: true,
        autoApplyRefresh: true,
        autoApplyDiscovery: false,
        notifyAdminsEmail: false,
      }));
      expect(tenantConfigService.upsertStoredTenantRow).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          tenantKey: 'nyc',
          pivotComputeApply: {
            notifyAdminsEmail: false,
            trusted: true,
            autoApplyRefresh: true,
          },
        }),
        'ops@meridian.app',
      );
    });

    it('rejects an invalid boolean patch without writing', async () => {
      jest.spyOn(tenantConfigService, 'getMergedTenants').mockResolvedValue([
        { tenantKey: 'nyc', tenantType: 'pivot' },
      ]);
      const upsert = jest.spyOn(tenantConfigService, 'upsertStoredTenantRow');

      const result = await updateCityComputeApplyConfig(
        {},
        { tenantKey: 'nyc', patch: { trusted: 'yes' } },
      );

      expect(result.code).toBe('INVALID_COMPUTE_APPLY_POLICY');
      expect(result.status).toBe(400);
      expect(upsert).not.toHaveBeenCalled();
    });
  });
});
