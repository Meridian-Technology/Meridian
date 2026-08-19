import {
  applySparseOverlay,
  buildVoiceRows,
  filterVoiceRows,
  groupVoiceRows,
  pivotCopyAdminPaths,
  sparseOverlayFromLayers,
} from './pivotVoiceCatalog';

const catalog = {
  tokens: [{ name: 'group.singular', shipped: 'circle' }],
  keys: [
    {
      path: 'ticker.week',
      kind: 'string',
      shipped: "swipe what's on. just go",
    },
    {
      path: 'auth.joinCity',
      kind: 'template',
      params: ['city'],
      sampleArgs: { city: 'brooklyn' },
      shipped: '{brand.cta} in {city}',
      usesTokens: true,
    },
  ],
};

const layers = {
  tokens: {
    'group.singular': { shipped: 'circle', platform: null, effective: 'circle' },
  },
  entries: {
    'ticker.week': {
      shipped: "swipe what's on. just go",
      platform: 'this week',
      effective: 'this week',
    },
    'auth.joinCity': {
      shipped: '{brand.cta} in {city}',
      platform: null,
      effective: '{brand.cta} in {city}',
    },
  },
};

describe('pivotVoiceCatalog', () => {
  it('builds platform rows with override flags', () => {
    const rows = buildVoiceRows({ ...catalog, layers, scope: 'platform' });
    const week = rows.find((row) => row.path === 'ticker.week');
    expect(week.overridden).toBe(true);
    expect(week.effective).toBe('this week');
    expect(week.tenant).toBeNull();
    const join = rows.find((row) => row.path === 'auth.joinCity');
    expect(join.kind).toBe('template');
    expect(join.usesTokens).toBe(true);
    expect(join.overridden).toBe(false);
  });

  it('finds a key by path and by shipped string', () => {
    const rows = buildVoiceRows({ ...catalog, layers, scope: 'platform' });
    expect(filterVoiceRows(rows, { query: 'ticker.week' }).map((row) => row.path)).toEqual([
      'ticker.week',
    ]);
    expect(
      filterVoiceRows(rows, { query: "swipe what's on" }).map((row) => row.path),
    ).toEqual(['ticker.week']);
  });

  it('filters overridden, interpolator, and token-using', () => {
    const rows = buildVoiceRows({ ...catalog, layers, scope: 'platform' });
    expect(filterVoiceRows(rows, { overridden: true }).map((row) => row.path)).toEqual([
      'ticker.week',
    ]);
    expect(filterVoiceRows(rows, { interpolator: true }).map((row) => row.path)).toEqual([
      'auth.joinCity',
    ]);
    expect(filterVoiceRows(rows, { tokenUsing: true }).map((row) => row.path)).toEqual([
      'auth.joinCity',
    ]);
  });

  it('groups keys into product families with nested sections', () => {
    const rows = buildVoiceRows({ ...catalog, layers, scope: 'platform' });
    const families = groupVoiceRows(rows);
    expect(families.map((family) => family.id)).toEqual(['tokens', 'getting-started']);
    expect(families[0].groups.map((group) => group.section)).toEqual(['tokens']);
    expect(families[1].groups.map((group) => group.section)).toEqual(['ticker', 'auth']);
    expect(families[1].count).toBe(2);
    expect(families[1].overrideCount).toBe(1);
  });

  it('nests crew keys under ritual and push subgroups', () => {
    const crewRows = buildVoiceRows({
      tokens: [],
      keys: [
        { path: 'crew.homeTitle', kind: 'string', shipped: 'your crews' },
        { path: 'crew.week.sectionTitle', kind: 'string', shipped: 'this week' },
        { path: 'crew.push.ritual.swipeBody', kind: 'string', shipped: 'finish swiping' },
      ],
      layers: { tokens: {}, entries: {} },
      scope: 'platform',
    });
    const [crew] = groupVoiceRows(crewRows);
    expect(crew.id).toBe('crew');
    expect(crew.groups.map((group) => group.label)).toEqual([
      'Overview',
      'Week ritual',
      'Push',
    ]);
  });

  it('applies a sparse overlay after save', () => {
    const rows = buildVoiceRows({ ...catalog, layers, scope: 'platform' });
    const overlay = sparseOverlayFromLayers(layers, 'platform');
    expect(overlay.entries['ticker.week']).toBe('this week');
    const next = applySparseOverlay(rows, { entries: {}, tokens: {} }, 'platform');
    const week = next.find((row) => row.path === 'ticker.week');
    expect(week.platform).toBeNull();
    expect(week.effective).toBe("swipe what's on. just go");
  });

  it('enables tenant writes on the city pack path', () => {
    expect(pivotCopyAdminPaths('platform').canWrite).toBe(true);
    expect(pivotCopyAdminPaths('platform').write).toBe('/admin/pivot/copy');
    expect(pivotCopyAdminPaths('tenant').canWrite).toBe(false);
    expect(pivotCopyAdminPaths('tenant', 'nyc').canWrite).toBe(true);
    expect(pivotCopyAdminPaths('tenant', 'nyc').layers).toBe(
      '/admin/pivot/tenants/nyc/copy',
    );
    expect(pivotCopyAdminPaths('tenant', 'nyc').write).toBe(
      '/admin/pivot/tenants/nyc/copy',
    );
  });

  it('builds tenant rows with city overlay winning over platform', () => {
    const tenantLayers = {
      tokens: {
        'group.singular': {
          shipped: 'circle',
          platform: 'crew',
          tenant: null,
          effective: 'crew',
        },
      },
      entries: {
        'ticker.week': {
          shipped: "swipe what's on. just go",
          platform: 'this week',
          tenant: 'nyc week',
          effective: 'nyc week',
        },
        'auth.joinCity': {
          shipped: '{brand.cta} in {city}',
          platform: null,
          tenant: null,
          effective: '{brand.cta} in {city}',
        },
      },
    };
    const rows = buildVoiceRows({
      ...catalog,
      layers: tenantLayers,
      scope: 'tenant',
    });
    const week = rows.find((row) => row.path === 'ticker.week');
    expect(week.tenant).toBe('nyc week');
    expect(week.platform).toBe('this week');
    expect(week.effective).toBe('nyc week');
    expect(week.overridden).toBe(true);
    const join = rows.find((row) => row.path === 'auth.joinCity');
    expect(join.overridden).toBe(false);
    expect(join.effective).toBe('{brand.cta} in {city}');
  });
});
