const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const mockHub = { refreshEvent: jest.fn(async () => undefined), forget: jest.fn(async () => undefined), unlockSpotter: jest.fn() };
jest.mock('../../services/justGoLive/liveHub', () => ({ getLiveHub: () => mockHub }));

const {
  listLiveEvents,
  saveLiveEvent,
  resetLiveEvent,
  closeLiveEvent,
  unlockLiveSpotter,
  getLiveEvent,
  parseHours,
} = require('../../services/justGoLive/liveAdminService');
const {
  loadLiveEvent,
  listLiveHours,
  saveLiveFans,
  saveLiveState,
  verifyLivePin,
} = require('../../services/justGoLive/liveStore');

const HOUR = 60 * 60 * 1000;

const CARD = {
  title: 'rehearsal night',
  matches: [{
    id: 'm1',
    title: 'rex vs. vega',
    sides: [{ id: 'rex', name: 'Rex Rampage' }, { id: 'vega', name: 'Vega Storm' }],
  }],
};

// The first query on a fresh in-memory Mongo also builds every global model's indexes.
jest.setTimeout(120000);

describe('Just Go Live admin and store, on a real Mongo', () => {
  let server;
  let globalDb;
  const req = () => ({ globalDb });

  beforeAll(async () => {
    server = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
    globalDb = await mongoose.createConnection(server.getUri()).asPromise();
  }, 60000);

  afterAll(async () => {
    await globalDb?.close();
    await server?.stop();
  });

  it('creates an event only with a PIN, and never over an existing one', async () => {
    expect(await saveLiveEvent(req(), 'rehearsal-1', { definition: CARD, create: true })).toMatchObject({
      status: 400,
      error: 'Set a spotter PIN for a new event.',
    });
    expect(await saveLiveEvent(req(), 'rehearsal-1', { definition: CARD, pin: '12' })).toMatchObject({ status: 400 });
    const created = await saveLiveEvent(req(), 'rehearsal-1', { definition: CARD, pin: '2468', create: true });
    expect(created.data.event).toMatchObject({ eventId: 'rehearsal-1', hasPin: true, matches: 1, status: { label: 'not started' } });
    expect(await saveLiveEvent(req(), 'rehearsal-1', { definition: CARD, pin: '1111', create: true })).toMatchObject({ status: 400 });
    expect(await verifyLivePin(globalDb, 'rehearsal-1', '2468')).toBe(true);
    expect(await verifyLivePin(globalDb, 'rehearsal-1', '1111')).toBe(false);
  });

  it('reports a bad card with every reason', async () => {
    const result = await saveLiveEvent(req(), 'rehearsal-1', { definition: { title: '', matches: [] } });
    expect(result.status).toBe(400);
    expect(result.errors).toEqual(expect.arrayContaining(['title is required', 'matches: at least one']));
  });

  it('keeps the night when the card is edited, and clears it on a confirmed reset', async () => {
    await saveLiveState(globalDb, 'rehearsal-1', { stageMatchId: 'm1', status: 'open' });
    await saveLiveFans(globalDb, 'rehearsal-1', [
      { deviceId: 'fan-00000001', name: 'Lu', surface: 'clip', source: null, calls: { m1: 'rex' }, joinedAt: new Date() },
    ]);
    // Saving again upserts the fan rather than duplicating it.
    await saveLiveFans(globalDb, 'rehearsal-1', [
      { deviceId: 'fan-00000001', name: 'Lu', surface: 'clip', source: null, calls: { m1: 'vega' }, joinedAt: new Date() },
    ]);

    await saveLiveEvent(req(), 'rehearsal-1', { definition: { ...CARD, title: 'rehearsal night 2' } });
    const listed = (await listLiveEvents(req())).data.events[0];
    expect(listed).toMatchObject({ title: 'rehearsal night 2', fans: 1, status: { label: 'rex vs. vega · live', tone: 'ok' } });
    const stored = await loadLiveEvent(globalDb, 'rehearsal-1');
    expect(stored.fans).toHaveLength(1);
    expect(stored.fans[0].calls).toEqual({ m1: 'vega' });

    expect(await resetLiveEvent(req(), 'rehearsal-1', { confirm: 'wrong' })).toMatchObject({ status: 400 });
    const reset = await resetLiveEvent(req(), 'rehearsal-1', { confirm: 'rehearsal-1' });
    expect(reset.data.event).toMatchObject({ fans: 0, status: { label: 'not started' }, title: 'rehearsal night 2' });
    expect(await verifyLivePin(globalDb, 'rehearsal-1', '2468')).toBe(true);
  });

  it('sets the night’s hours, lists only nights that haven’t closed, and closes one now', async () => {
    const created = await saveLiveEvent(req(), 'rehearsal-1', { definition: CARD });
    expect(created.data.event).toMatchObject({ open: false, hours: { opensAt: null, closesAt: null } });
    expect(await listLiveHours(globalDb)).toEqual([]);

    const opensAt = new Date(Date.now() - HOUR).toISOString();
    const closesAt = new Date(Date.now() + 2 * HOUR).toISOString();
    const opened = await saveLiveEvent(req(), 'rehearsal-1', { definition: CARD, hours: { opensAt, closesAt } });
    expect(opened.data.event.open).toBe(true);
    expect(mockHub.refreshEvent).toHaveBeenLastCalledWith('rehearsal-1', expect.objectContaining({ definition: expect.any(Object) }));
    const [listed] = await listLiveHours(globalDb);
    expect(listed).toMatchObject({ eventId: 'rehearsal-1', pinTag: expect.stringMatching(/^[0-9a-f]{12}$/) });

    // Saving the card without hours leaves them alone.
    expect((await saveLiveEvent(req(), 'rehearsal-1', { definition: CARD })).data.event.open).toBe(true);

    const closed = await closeLiveEvent(req(), 'rehearsal-1');
    expect(closed.data.event.open).toBe(false);
    expect(await listLiveHours(globalDb)).toEqual([]);
    expect(await closeLiveEvent(req(), 'nope')).toMatchObject({ status: 404 });
    expect(await unlockLiveSpotter(req(), 'rehearsal-1')).toMatchObject({ data: { unlocked: true } });
    expect(mockHub.unlockSpotter).toHaveBeenCalledWith('rehearsal-1');
  });

  it('refuses hours that are half set, backwards, or longer than a day', () => {
    const at = (hours) => new Date(Date.now() + hours * HOUR).toISOString();
    expect(parseHours(undefined)).toEqual({ hours: undefined });
    expect(parseHours({ opensAt: '', closesAt: '' })).toEqual({ hours: null });
    expect(parseHours({ opensAt: at(1) }).error).toMatch(/both/);
    expect(parseHours({ opensAt: at(2), closesAt: at(1) }).error).toMatch(/after/);
    expect(parseHours({ opensAt: at(0), closesAt: at(25) }).error).toMatch(/24/);
    expect(parseHours({ opensAt: 'soon', closesAt: at(1) }).error).toMatch(/dates/);
    expect(parseHours({ opensAt: at(0), closesAt: at(5) }).hours.closesAt).toBeInstanceOf(Date);
  });

  it('gives saved fans an expiry, and loads at most the cap', async () => {
    const fans = [1, 2, 3].map((n) => ({
      deviceId: `fan-cap-000${n}`, name: null, surface: 'clip', source: null, calls: {}, joinedAt: new Date(Date.now() + n),
    }));
    await saveLiveFans(globalDb, 'rehearsal-1', fans);
    const stored = await globalDb.collection('justgo_live_fans').findOne({ deviceId: 'fan-cap-0001' });
    expect(stored.expireAt.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * HOUR);
    await globalDb.model('JustGoLiveFan').init();
    const indexes = await globalDb.collection('justgo_live_fans').indexes();
    expect(indexes).toEqual(expect.arrayContaining([expect.objectContaining({ key: { expireAt: 1 }, expireAfterSeconds: 0 })]));
    const loaded = await loadLiveEvent(globalDb, 'rehearsal-1', { maxFans: 2 });
    expect(loaded.fans).toHaveLength(2);
  });

  it('says when there is no such event', async () => {
    expect(await getLiveEvent(req(), 'nope')).toMatchObject({ status: 404 });
    expect(await loadLiveEvent(globalDb, 'nope')).toBeNull();
  });
});
