const {
  PUBLIC_EVENT_LANGUAGE_KEYS,
  PUBLIC_EVENT_TOKEN_KEYS,
  resolvePublicEventLanguage,
  getPublicEventLanguage,
} = require('../../services/publicEventLanguageService');
const {
  CATALOG_SHIPPED_ENTRIES,
  CATALOG_SHIPPED_TOKENS,
} = require('../../utilities/pivotCopyCatalog');

const EVENT_ID = '64f1234567890abcdef12345';

describe('public event dynamic language', () => {
  it('exposes only the supported public-event keys and brand tokens', () => {
    const result = resolvePublicEventLanguage({
      entries: {
        'landing.web.event.ended': 'finished',
        'eventDetail.register': 'private unrelated key',
        'admin.title': 'never public',
      },
      tokens: {
        'brand.name': 'go outside',
        'group.singular': 'crew',
      },
    });
    expect(Object.keys(result.entries)).toEqual(PUBLIC_EVENT_LANGUAGE_KEYS);
    expect(Object.keys(result.tokens)).toEqual(PUBLIC_EVENT_TOKEN_KEYS);
    expect(result.entries['landing.web.event.ended']).toBe('finished');
    expect(result.tokens['brand.name']).toBe('go outside');
    expect(JSON.stringify(result)).not.toMatch(/admin|private unrelated|group\.singular/);
  });

  it('falls back for missing, empty, overlong, or malformed-template overrides', () => {
    const result = resolvePublicEventLanguage({
      entries: {
        'landing.web.event.loading': '',
        'landing.web.event.retry': 'x'.repeat(501),
        'landing.web.event.openAppCta': 'open {unknown}',
        'landing.web.event.unavailableBody': 'broken {brand.name',
      },
      tokens: { 'brand.name': '', 'brand.cta': 'x'.repeat(241) },
    });
    for (const key of [
      'landing.web.event.loading',
      'landing.web.event.retry',
      'landing.web.event.openAppCta',
      'landing.web.event.unavailableBody',
    ]) {
      expect(result.entries[key]).toBe(CATALOG_SHIPPED_ENTRIES[key]);
    }
    expect(result.tokens).toEqual({
      'brand.name': CATALOG_SHIPPED_TOKENS['brand.name'],
      'brand.cta': CATALOG_SHIPPED_TOKENS['brand.cta'],
    });
  });

  it('preserves configured casing and approved placeholders', () => {
    const result = resolvePublicEventLanguage({
      entries: {
        'landing.web.event.openAppCta': 'OPEN {brand.name}',
        'landing.web.event.registerCta': 'Reserve In The App',
      },
    });
    expect(result.entries['landing.web.event.openAppCta']).toBe('OPEN {brand.name}');
    expect(result.entries['landing.web.event.registerCta']).toBe('Reserve In The App');
  });

  it('uses the uniquely resolved event city for tenant overrides', async () => {
    const loadEvent = jest.fn().mockResolvedValue({
      available: true,
      body: { data: { cityId: 'oakland' } },
    });
    const getCopyPack = jest.fn().mockResolvedValue({
      revision: 'p3:t7', schemaVersion: 1,
      entries: { 'landing.web.event.ended': 'that was a wrap' },
      tokens: {},
    });
    const result = await getPublicEventLanguage({}, EVENT_ID, {
      loadPublicEvent: loadEvent,
      getCopyPack,
    });
    expect(getCopyPack).toHaveBeenCalledWith({}, { tenantKey: 'oakland', schemaVersion: 1 });
    expect(result).toMatchObject({
      context: { product: 'justgo', cityId: 'oakland' },
      language: {
        revision: 'p3:t7',
        entries: { 'landing.web.event.ended': 'that was a wrap' },
      },
    });
  });

  it('observes refreshed copy packs without a separate stale language cache', async () => {
    const getCopyPack = jest.fn()
      .mockResolvedValueOnce({
        revision: 'p1:t1', entries: { 'landing.web.event.ended': 'finished' }, tokens: {},
      })
      .mockResolvedValueOnce({
        revision: 'p1:t2', entries: { 'landing.web.event.ended': 'all done' }, tokens: {},
      });
    const options = {
      loadPublicEvent: jest.fn().mockResolvedValue({
        available: true, body: { data: { cityId: 'oakland' } },
      }),
      getCopyPack,
    };
    const first = await getPublicEventLanguage({}, EVENT_ID, options);
    const second = await getPublicEventLanguage({}, EVENT_ID, options);
    expect(first.language).toMatchObject({
      revision: 'p1:t1', entries: { 'landing.web.event.ended': 'finished' },
    });
    expect(second.language).toMatchObject({
      revision: 'p1:t2', entries: { 'landing.web.event.ended': 'all done' },
    });
  });

  it.each(['missing', 'private', 'collision', 'inaccessible'])(
    'uses the same product defaults without a city for an unavailable %s event',
    async () => {
      const getCopyPack = jest.fn().mockResolvedValue({
        revision: 'p2:t0', entries: {}, tokens: {},
      });
      const result = await getPublicEventLanguage({}, EVENT_ID, {
        loadPublicEvent: jest.fn().mockResolvedValue({ available: false }),
        getCopyPack,
      });
      expect(getCopyPack).toHaveBeenCalledWith({}, { tenantKey: null, schemaVersion: 1 });
      expect(result.context).toEqual({ product: 'justgo', cityId: null });
      expect(result.language.entries['landing.web.event.unavailableTitle']).toBe(
        CATALOG_SHIPPED_ENTRIES['landing.web.event.unavailableTitle'],
      );
    },
  );
});
