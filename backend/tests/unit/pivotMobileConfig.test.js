const {
  PIVOT_MOBILE_CONFIG_DEFAULTS,
  PIVOT_MOBILE_STORE_URLS,
  mergePivotMobileConfig,
  validatePivotMobileConfigPatch,
  readEnvMobileOverrides,
} = require('../../utilities/pivotMobileConfig');

describe('pivotMobileConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.PIVOT_MOBILE_MIN_APP_VERSION;
    delete process.env.PIVOT_MOBILE_FORCE_UPDATE;
    delete process.env.PIVOT_MOBILE_UPDATE_MESSAGE;
    delete process.env.PIVOT_MOBILE_STORE_URL_IOS;
    delete process.env.PIVOT_MOBILE_STORE_URL_ANDROID;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns safe defaults below current store version', () => {
    const mobile = mergePivotMobileConfig();
    expect(mobile.minAppVersion).toBe(PIVOT_MOBILE_CONFIG_DEFAULTS.minAppVersion);
    expect(mobile.forceUpdate).toBe(false);
    expect(mobile.storeUrls.ios).toBe(PIVOT_MOBILE_STORE_URLS.ios);
    expect(mobile.storeUrls.android).toBe(PIVOT_MOBILE_STORE_URLS.android);
    expect(mobile.message).toMatch(/crew this week/i);
  });

  it('merges tenant overrides onto defaults', () => {
    const mobile = mergePivotMobileConfig({
      minAppVersion: '1.5.0',
      forceUpdate: true,
      message: 'please update',
    });

    expect(mobile.minAppVersion).toBe('1.5.0');
    expect(mobile.forceUpdate).toBe(true);
    expect(mobile.message).toBe('please update');
    expect(mobile.storeUrls.android).toBe(PIVOT_MOBILE_STORE_URLS.android);
  });

  it('applies env overrides after tenant config', () => {
    process.env.PIVOT_MOBILE_MIN_APP_VERSION = '2.0.0';
    process.env.PIVOT_MOBILE_FORCE_UPDATE = 'true';

    const mobile = mergePivotMobileConfig({ minAppVersion: '1.5.0', forceUpdate: false });
    expect(mobile.minAppVersion).toBe('2.0.0');
    expect(mobile.forceUpdate).toBe(true);
  });

  it('validates tenant admin patches', () => {
    expect(validatePivotMobileConfigPatch({ minAppVersion: '1.2.3' }).ok).toBe(true);
    expect(validatePivotMobileConfigPatch({ minAppVersion: 'bad' }).error).toMatch(/semver/i);
    expect(validatePivotMobileConfigPatch({ forceUpdate: 'yes' }).error).toMatch(/boolean/i);
  });

  it('reads env overrides independently', () => {
    process.env.PIVOT_MOBILE_MIN_APP_VERSION = '1.9.0';
    process.env.PIVOT_MOBILE_UPDATE_MESSAGE = 'update now';

    expect(readEnvMobileOverrides()).toEqual({
      minAppVersion: '1.9.0',
      message: 'update now',
    });
  });
});
