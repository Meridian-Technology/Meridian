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
    expect(config.duplicate.titleMin).toBeGreaterThan(0.8);
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
  });

  describe('isNativeIndexUrl', () => {
    describe('partiful URLs', () => {
      it('recognizes valid index URLs', () => {
        expect(isNativeIndexUrl('partiful', 'https://partiful.com/explore/sf')).toBe(true);
        expect(isNativeIndexUrl('partiful', 'https://partiful.com/explore/nyc')).toBe(true);
        expect(isNativeIndexUrl('partiful', 'https://partiful.com/explore/san-francisco')).toBe(true);
      });

      it('rejects event URLs', () => {
        expect(isNativeIndexUrl('partiful', 'https://partiful.com/e/abc123')).toBe(false);
        expect(isNativeIndexUrl('partiful', 'https://partiful.com/e/xyz')).toBe(false);
      });

      it('rejects non-explore paths', () => {
        expect(isNativeIndexUrl('partiful', 'https://partiful.com/sf')).toBe(false);
        expect(isNativeIndexUrl('partiful', 'https://partiful.com/user/profile')).toBe(false);
        expect(isNativeIndexUrl('partiful', 'https://partiful.com/home')).toBe(false);
      });

      it('rejects nested explore paths', () => {
        expect(isNativeIndexUrl('partiful', 'https://partiful.com/explore/sf/tech')).toBe(false);
        expect(isNativeIndexUrl('partiful', 'https://partiful.com/explore/')).toBe(false);
      });
    });

    describe('luma URLs', () => {
      it('recognizes valid index URLs', () => {
        expect(isNativeIndexUrl('luma', 'https://luma.com/sf')).toBe(true);
        expect(isNativeIndexUrl('luma', 'https://luma.com/nyc')).toBe(true);
        expect(isNativeIndexUrl('luma', 'https://luma.com/san-francisco')).toBe(true);
        expect(isNativeIndexUrl('luma', 'https://lu.ma/sf')).toBe(true);
      });

      it('rejects event URLs', () => {
        expect(isNativeIndexUrl('luma', 'https://luma.com/e/evt-abc123')).toBe(false);
        expect(isNativeIndexUrl('luma', 'https://luma.com/event/xyz')).toBe(false);
        expect(isNativeIndexUrl('luma', 'https://lu.ma/e/something')).toBe(false);
      });

      it('rejects reserved slugs', () => {
        expect(isNativeIndexUrl('luma', 'https://luma.com/user')).toBe(false);
        expect(isNativeIndexUrl('luma', 'https://luma.com/discover')).toBe(false);
        expect(isNativeIndexUrl('luma', 'https://luma.com/signin')).toBe(false);
        expect(isNativeIndexUrl('luma', 'https://luma.com/signup')).toBe(false);
        expect(isNativeIndexUrl('luma', 'https://luma.com/home')).toBe(false);
        expect(isNativeIndexUrl('luma', 'https://luma.com/login')).toBe(false);
        expect(isNativeIndexUrl('luma', 'https://luma.com/e')).toBe(false);
        expect(isNativeIndexUrl('luma', 'https://luma.com/event')).toBe(false);
      });

      it('rejects nested paths', () => {
        expect(isNativeIndexUrl('luma', 'https://luma.com/sf/tech')).toBe(false);
        expect(isNativeIndexUrl('luma', 'https://luma.com/discover/sf')).toBe(false);
      });
    });

    it('handles malformed URLs gracefully', () => {
      expect(isNativeIndexUrl('luma', 'not-a-url')).toBe(false);
      expect(isNativeIndexUrl('partiful', 'http://')).toBe(false);
      expect(isNativeIndexUrl('unknown', 'https://example.com')).toBe(false);
    });
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

  it('accepts duplicate threshold patches', () => {
    const result = validatePivotDiscoveryConfigPatch({ duplicate: { titleMin: 0.9 } });
    expect(result.patch.duplicate.titleMin).toBe(0.9);
    expect(
      mergePivotDiscoveryConfig({ duplicate: { titleMin: 0.9 } }).duplicate.titleMin,
    ).toBe(0.9);
  });
});
