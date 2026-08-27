jest.mock('../../services/publicEventEndpointService', () => ({
  loadPublicEvent: jest.fn(),
}));
jest.mock('../../services/publicEventLanguageService', () => ({
  getPublicEventLanguage: jest.fn(),
}));

const { loadPublicEvent } = require('../../services/publicEventEndpointService');
const { getPublicEventLanguage } = require('../../services/publicEventLanguageService');
const {
  getPublicEvent,
  getPublicEventLanguageRoute,
  responseEtag,
  UNAVAILABLE,
} = require('../../routes/publicEventRoutes');
const {
  createPublicEventRateLimit,
} = require('../../middlewares/publicEventRateLimit');

const EVENT_ID = '64f1234567890abcdef12345';
const BODY = {
  contractVersion: '1',
  data: { id: EVENT_ID, cityId: 'oakland' },
};

function response() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    ended: false,
    set: jest.fn(function set(name, value) { this.headers[name] = value; return this; }),
    status: jest.fn(function status(code) { this.statusCode = code; return this; }),
    json: jest.fn(function json(body) { this.body = body; return this; }),
    end: jest.fn(function end() { this.ended = true; return this; }),
  };
}

describe('GET /api/public/events/:eventId handler', () => {
  beforeEach(() => {
    loadPublicEvent.mockReset();
    getPublicEventLanguage.mockReset();
  });

  it('rejects malformed IDs before service or database work', async () => {
    const res = response();
    await getPublicEvent({ params: { eventId: 'BAD-ID' }, headers: {} }, res);
    expect(loadPublicEvent).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual(UNAVAILABLE);
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('returns an edge-cacheable safe event with an ETag', async () => {
    loadPublicEvent.mockResolvedValue({ body: BODY, available: true, cacheStatus: 'miss' });
    const res = response();
    await getPublicEvent({ params: { eventId: EVENT_ID }, headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(BODY);
    expect(res.headers.ETag).toBe(responseEtag(BODY));
    expect(res.headers['Cache-Control']).toContain('s-maxage=60');
    expect(res.headers['X-Public-Event-Cache']).toBe('miss');
  });

  it('returns 304 for a matching representation ETag', async () => {
    loadPublicEvent.mockResolvedValue({ body: BODY, available: true, cacheStatus: 'hit' });
    const res = response();
    await getPublicEvent({
      params: { eventId: EVENT_ID },
      headers: { 'if-none-match': responseEtag(BODY) },
    }, res);
    expect(res.statusCode).toBe(304);
    expect(res.ended).toBe(true);
    expect(res.json).not.toHaveBeenCalled();
  });

  it.each(['private', 'missing', 'collision', 'inaccessible'])(
    'returns the same no-store 404 for %s results',
    async () => {
      loadPublicEvent.mockResolvedValue({
        body: UNAVAILABLE,
        available: false,
        cacheStatus: 'miss',
      });
      const res = response();
      await getPublicEvent({ params: { eventId: EVENT_ID }, headers: {} }, res);
      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual(UNAVAILABLE);
      expect(res.headers['Cache-Control']).toBe('no-store');
    },
  );

  it('uses a stable generic 503 without exposing thrown details', async () => {
    loadPublicEvent.mockRejectedValue(new Error('mongodb://secret-host/private-db'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = response();
    await getPublicEvent({ params: { eventId: EVENT_ID }, headers: {} }, res);
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({
      contractVersion: '1', error: { code: 'SERVICE_UNAVAILABLE' },
    });
    expect(JSON.stringify(res.body)).not.toContain('secret');
    errorSpy.mockRestore();
  });
});

describe('GET /api/public/events/:eventId/language handler', () => {
  it('returns cacheable language independently from event data', async () => {
    const body = {
      contractVersion: '1',
      context: { product: 'justgo', cityId: 'oakland' },
      language: { revision: 'p1:t2', schemaVersion: 1, tokens: {}, entries: {} },
    };
    getPublicEventLanguage.mockResolvedValue(body);
    const res = response();
    await getPublicEventLanguageRoute({
      params: { eventId: EVENT_ID }, headers: {},
    }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(body);
    expect(res.headers['Cache-Control']).toContain('s-maxage=60');
    expect(res.headers.ETag).toBe(responseEtag(body));
  });

  it('rejects malformed IDs before resolving language or an event', async () => {
    const res = response();
    await getPublicEventLanguageRoute({ params: { eventId: 'bad' }, headers: {} }, res);
    expect(getPublicEventLanguage).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual(UNAVAILABLE);
  });
});

describe('public event rate limiting', () => {
  it('returns stable 429 semantics and standard rate headers', () => {
    const limit = createPublicEventRateLimit({ max: 1, windowMs: 60_000 });
    const req = { ip: '203.0.113.2' };
    const first = response();
    const second = response();
    const next = jest.fn();
    limit(req, first, next);
    limit(req, second, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(second.statusCode).toBe(429);
    expect(second.body).toEqual({
      contractVersion: '1', error: { code: 'RATE_LIMITED' },
    });
    expect(second.headers['Retry-After']).toBe('60');
    expect(second.headers['Cache-Control']).toBe('no-store');
  });
});
