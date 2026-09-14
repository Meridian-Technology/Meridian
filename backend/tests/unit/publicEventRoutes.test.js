jest.mock('../../services/publicEventEndpointService', () => ({
  loadPublicEvent: jest.fn(),
}));
jest.mock('../../services/justGoPublicEventShareImageService', () => ({
  renderJustGoPublicEventShareImage: jest.fn(),
}));

const { loadPublicEvent } = require('../../services/publicEventEndpointService');
const {
  renderJustGoPublicEventShareImage,
} = require('../../services/justGoPublicEventShareImageService');
const {
  getPublicEventOpenGraphImage,
  openGraphImageEtag,
} = require('../../routes/publicEventRoutes');

const EVENT_ID = '64f1234567890abcdef12345';
const EVENT = {
  id: EVENT_ID,
  title: 'Movie night under the stars',
  startsAt: '2026-09-05T02:00:00.000Z',
  endsAt: '2026-09-05T04:30:00.000Z',
  timezone: 'America/Los_Angeles',
  venue: { text: 'Civic Center Lawn' },
  organizer: { name: 'Night Owl Cinema' },
};
const PNG = Buffer.from('fake-png');

function response() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    ended: false,
    set: jest.fn(function set(name, value) {
      this.headers[name] = value;
      return this;
    }),
    status: jest.fn(function status(code) {
      this.statusCode = code;
      return this;
    }),
    send: jest.fn(function send(body) {
      this.body = body;
      return this;
    }),
    end: jest.fn(function end() {
      this.ended = true;
      return this;
    }),
  };
}

describe('GET /api/public/events/:eventId/opengraph.png handler', () => {
  beforeEach(() => {
    loadPublicEvent.mockReset();
    renderJustGoPublicEventShareImage.mockReset();
  });

  it('rejects malformed IDs before service or render work', async () => {
    const res = response();
    await getPublicEventOpenGraphImage({ params: { eventId: 'BAD-ID' }, headers: {} }, res);
    expect(loadPublicEvent).not.toHaveBeenCalled();
    expect(renderJustGoPublicEventShareImage).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(res.ended).toBe(true);
  });

  it('returns a cacheable PNG with public headers for available events', async () => {
    loadPublicEvent.mockResolvedValue({
      body: { contractVersion: '1', data: EVENT },
      available: true,
      cacheStatus: 'miss',
    });
    renderJustGoPublicEventShareImage.mockResolvedValue({ buffer: PNG });
    const res = response();
    await getPublicEventOpenGraphImage({ params: { eventId: EVENT_ID }, headers: {} }, res);
    expect(renderJustGoPublicEventShareImage).toHaveBeenCalledWith(EVENT);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(PNG);
    expect(res.headers['Content-Type']).toBe('image/png');
    expect(res.headers.ETag).toBe(openGraphImageEtag(PNG));
    expect(res.headers['Cache-Control']).toContain('s-maxage=60');
    expect(res.headers['X-Public-Event-Cache']).toBe('miss');
  });

  it('returns 304 for a matching image ETag', async () => {
    loadPublicEvent.mockResolvedValue({
      body: { contractVersion: '1', data: EVENT },
      available: true,
      cacheStatus: 'hit',
    });
    renderJustGoPublicEventShareImage.mockResolvedValue({ buffer: PNG });
    const res = response();
    await getPublicEventOpenGraphImage({
      params: { eventId: EVENT_ID },
      headers: { 'if-none-match': openGraphImageEtag(PNG) },
    }, res);
    expect(res.statusCode).toBe(304);
    expect(res.ended).toBe(true);
    expect(res.send).not.toHaveBeenCalled();
  });

  it.each(['private', 'missing', 'collision', 'inaccessible'])(
    'returns the same no-store 404 for %s results',
    async () => {
      loadPublicEvent.mockResolvedValue({
        body: { contractVersion: '1', error: { code: 'EVENT_UNAVAILABLE' } },
        available: false,
        cacheStatus: 'miss',
      });
      const res = response();
      await getPublicEventOpenGraphImage({ params: { eventId: EVENT_ID }, headers: {} }, res);
      expect(renderJustGoPublicEventShareImage).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(404);
      expect(res.headers['Cache-Control']).toBe('no-store');
      expect(res.ended).toBe(true);
    },
  );

  it('returns no-store 503 when rendering fails without exposing details', async () => {
    loadPublicEvent.mockResolvedValue({
      body: { contractVersion: '1', data: EVENT },
      available: true,
      cacheStatus: 'miss',
    });
    renderJustGoPublicEventShareImage.mockResolvedValue({
      error: 'title exceeds 200 characters.',
      status: 400,
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = response();
    await getPublicEventOpenGraphImage({ params: { eventId: EVENT_ID }, headers: {} }, res);
    expect(res.statusCode).toBe(503);
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(res.ended).toBe(true);
    errorSpy.mockRestore();
  });

  it('returns no-store 503 when the route throws', async () => {
    loadPublicEvent.mockRejectedValue(new Error('mongodb://secret-host/private-db'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = response();
    await getPublicEventOpenGraphImage({ params: { eventId: EVENT_ID }, headers: {} }, res);
    expect(res.statusCode).toBe(503);
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(res.ended).toBe(true);
    errorSpy.mockRestore();
  });
});
