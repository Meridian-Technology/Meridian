const {
  COMPUTE_APPLY_ORIGINS,
  mergePivotComputeApplyPolicy,
  resolvePivotComputeApplyPolicy,
  validatePivotComputeApplyPolicyPatch,
  mergePivotComputeApplyOverrides,
} = require('../../utilities/pivotComputeApplyPolicy');
const {
  normalizeTenantRow,
  normalizeTenantOverride,
  mergeTenantRows,
} = require('../../constants/defaultTenants');
const { validateTenantMetadataUpdate } = require('../../services/tenantConfigService');

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
});
