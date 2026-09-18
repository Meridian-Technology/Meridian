import {
  buildMobileConfigPatch,
  mergePivotMobileForm,
  summarizeFleetMobileConfig,
  validateMobileUpdateForm,
} from './pivotMobileConfigForm';

describe('pivotMobileConfigForm', () => {
  it('fills defaults when a tenant has no stored mobile config', () => {
    expect(mergePivotMobileForm(null)).toEqual({
      minAppVersion: '1.0.0',
      forceUpdate: false,
      message: 'update to keep going with your crew this week',
    });
  });

  it('rejects a non-semver min version', () => {
    expect(validateMobileUpdateForm({ minAppVersion: '2', forceUpdate: true, message: 'go' }).error)
      .toMatch(/semver/i);
  });

  it('keeps existing store URLs on the saved patch', () => {
    const result = buildMobileConfigPatch(
      { minAppVersion: '1.2.0', forceUpdate: true, message: 'please update' },
      { storeUrls: { ios: 'https://apps.apple.com/us/app/just-go-weekly-curated-events/id6801364892' } },
    );
    expect(result.patch.minAppVersion).toBe('1.2.0');
    expect(result.patch.forceUpdate).toBe(true);
    expect(result.patch.storeUrls.ios).toContain('id6801364892');
    expect(result.patch.storeUrls.android).toBeUndefined();
  });

  it('flags mixed city configs and counts blocking cities', () => {
    const summary = summarizeFleetMobileConfig([
      {
        tenantKey: 'sf',
        location: 'San Francisco',
        tenantType: 'pivot',
        pivotMobileConfig: { minAppVersion: '1.0.0', forceUpdate: false },
      },
      {
        tenantKey: 'nyc',
        location: 'New York',
        tenantType: 'pivot',
        pivotMobileConfig: { minAppVersion: '1.2.0', forceUpdate: true, message: 'update now' },
      },
      {
        tenantKey: 'rpi',
        location: 'Troy',
        tenantType: 'campus',
      },
    ]);

    expect(summary.cities).toHaveLength(2);
    expect(summary.mixed).toBe(true);
    expect(summary.blockingCount).toBe(1);
    expect(summary.cities[0].tenantKey).toBe('nyc');
  });
});
