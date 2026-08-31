const {
  opaqueEventKey,
  loadPublicEvent,
  resetPublicEventEndpointState,
} = require('../../services/publicEventEndpointService');

const EVENT_ID = '64f1234567890abcdef12345';

function dependencies(result, delay = null) {
  return {
    getTenants: jest.fn().mockResolvedValue([{
      tenantKey: 'oakland',
      tenantType: 'pivot',
      status: 'active',
      pivotDropTimezone: 'America/Los_Angeles',
    }]),
    connectToDatabase: jest.fn().mockResolvedValue({}),
    getModels: jest.fn(() => ({
      Event: {
        findById: jest.fn(() => ({
          select() { return this; },
          maxTimeMS() { return this; },
          lean: async () => {
            if (delay) await delay;
            return result;
          },
        })),
      },
      Org: { exists: jest.fn(() => ({ maxTimeMS: async () => ({ _id: 'host' }) })) },
      Form: { exists: jest.fn(() => ({ maxTimeMS: async () => null })) },
    })),
  };
}

function event() {
  return {
    _id: EVENT_ID,
    name: 'Public event',
    description: 'Description',
    image: null,
    start_time: '2026-09-05T02:00:00Z',
    end_time: '2026-09-05T04:00:00Z',
    location: 'Public venue',
    status: 'approved',
    visibility: 'public',
    isDeleted: false,
    registrationEnabled: false,
    hostingType: 'Org',
    hostingId: '64f1234567890abcdef99999',
    customFields: { pivot: { ingestStatus: 'published', host: { name: 'Host' } } },
  };
}

describe('public event endpoint cache and observability service', () => {
  beforeEach(() => resetPublicEventEndpointState());

  it('uses an opaque event key rather than logging the raw identifier', () => {
    expect(opaqueEventKey(EVENT_ID)).toMatch(/^[0-9a-f]{12}$/);
    expect(opaqueEventKey(EVENT_ID)).not.toContain(EVENT_ID);
  });

  it('caches a successful safe response', async () => {
    const deps = dependencies(event());
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    const first = await loadPublicEvent({}, EVENT_ID, {
      dependencies: deps,
      now: new Date('2026-09-05T01:00:00Z'),
    });
    const second = await loadPublicEvent({}, EVENT_ID, { dependencies: deps });
    expect(first).toMatchObject({ available: true, cacheStatus: 'miss' });
    expect(second).toMatchObject({ available: true, cacheStatus: 'hit' });
    expect(deps.connectToDatabase).toHaveBeenCalledTimes(1);
    info.mockRestore();
  });

  it('coalesces concurrent cross-city work for the same ID', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const deps = dependencies(event(), gate);
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    const first = loadPublicEvent({}, EVENT_ID, { dependencies: deps });
    const second = loadPublicEvent({}, EVENT_ID, { dependencies: deps });
    release();
    const [a, b] = await Promise.all([first, second]);
    expect([a.cacheStatus, b.cacheStatus].sort()).toEqual(['coalesced', 'miss']);
    expect(deps.connectToDatabase).toHaveBeenCalledTimes(1);
    info.mockRestore();
  });

  it('briefly negative-caches unavailable outcomes', async () => {
    const deps = dependencies(null);
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    const first = await loadPublicEvent({}, EVENT_ID, { dependencies: deps });
    const second = await loadPublicEvent({}, EVENT_ID, { dependencies: deps });
    expect(first).toMatchObject({ available: false, cacheStatus: 'miss' });
    expect(second).toMatchObject({ available: false, cacheStatus: 'hit' });
    expect(deps.connectToDatabase).toHaveBeenCalledTimes(1);
    info.mockRestore();
  });
});
