const {
  DISCOVERY_FLOWS,
  mergePivotDiscoveryConfig,
  resolvePivotDiscoveryConfig,
  validatePivotDiscoveryConfigPatch,
  nativeSourceSpecs,
  isNativeSkipHost,
  isNativeIndexUrl,
} = require('../../utilities/pivotDiscoveryConfig');

describe('pivotDiscoveryConfig', () => {
  it('defaults to native-then-firecrawl with no slugs', () => {
    const config = resolvePivotDiscoveryConfig({});
    expect(config.flow).toBe('native-then-firecrawl');
    expect(config.runNative).toBe(true);
    expect(config.runFirecrawl).toBe(true);
    expect(config.skipNativeHostsInSearch).toBe(true);
    expect(config.lumaSlug).toBeNull();
    expect(config.partifulSlug).toBeNull();
  });

  it('lets a tenant pick native-only or firecrawl-only', () => {
    expect(
      resolvePivotDiscoveryConfig({ pivotDiscovery: { flow: 'native-only' } }).runFirecrawl,
    ).toBe(false);
    expect(
      resolvePivotDiscoveryConfig({ pivotDiscovery: { flow: 'firecrawl-only' } }).runNative,
    ).toBe(false);
    expect(
      resolvePivotDiscoveryConfig({ pivotDiscovery: { flow: 'firecrawl-only' } })
        .skipNativeHostsInSearch,
    ).toBe(false);
  });

  it('lets a run override the tenant default', () => {
    const config = resolvePivotDiscoveryConfig(
      { pivotDiscovery: { flow: 'native-then-firecrawl', lumaSlug: 'sf' } },
      { flow: 'native-only', partifulSlug: 'san-francisco' },
    );
    expect(config.flow).toBe('native-only');
    expect(config.lumaSlug).toBe('sf');
    expect(config.partifulSlug).toBe('san-francisco');
  });

  it('builds city-index URLs from slugs only when native is on', () => {
    const specs = nativeSourceSpecs(
      resolvePivotDiscoveryConfig({
        pivotDiscovery: { lumaSlug: 'nyc', partifulSlug: 'brooklyn' },
      }),
      'New York',
    );
    expect(specs).toEqual([
      expect.objectContaining({
        provider: 'partiful',
        url: 'https://partiful.com/explore/brooklyn',
      }),
      expect.objectContaining({
        provider: 'luma',
        url: 'https://luma.com/nyc',
      }),
    ]);
    expect(
      nativeSourceSpecs(
        resolvePivotDiscoveryConfig({
          pivotDiscovery: { flow: 'firecrawl-only', lumaSlug: 'nyc' },
        }),
        'New York',
      ),
    ).toEqual([]);
  });

  it('recognizes native hosts and city-index URLs', () => {
    expect(isNativeSkipHost('www.partiful.com')).toBe(true);
    expect(isNativeSkipHost('lu.ma')).toBe(true);
    expect(isNativeSkipHost('englert.org')).toBe(false);
    expect(isNativeIndexUrl('partiful', 'https://partiful.com/explore/sf')).toBe(true);
    expect(isNativeIndexUrl('partiful', 'https://partiful.com/e/abc')).toBe(false);
    expect(isNativeIndexUrl('luma', 'https://luma.com/sf')).toBe(true);
    expect(isNativeIndexUrl('luma', 'https://luma.com/e/abc')).toBe(false);
  });

  it('rejects a bad flow or slug on patch', () => {
    expect(validatePivotDiscoveryConfigPatch({ flow: 'agentic' }).code).toBe(
      'INVALID_DISCOVERY_FLOW',
    );
    expect(validatePivotDiscoveryConfigPatch({ lumaSlug: 'NYC!!' }).code).toBe(
      'INVALID_LUMA_SLUG',
    );
    expect(DISCOVERY_FLOWS).toContain(mergePivotDiscoveryConfig({ flow: 'nope' }).flow);
  });
});
