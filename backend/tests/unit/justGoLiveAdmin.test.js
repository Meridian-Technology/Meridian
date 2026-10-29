const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const {
  listLiveEvents,
  saveLiveEvent,
  resetLiveEvent,
  getLiveEvent,
} = require('../../services/justGoLive/liveAdminService');
const {
  loadLiveEvent,
  saveLiveFans,
  saveLiveState,
  verifyLivePin,
} = require('../../services/justGoLive/liveStore');

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

  it('says when there is no such event', async () => {
    expect(await getLiveEvent(req(), 'nope')).toMatchObject({ status: 404 });
    expect(await loadLiveEvent(globalDb, 'nope')).toBeNull();
  });
});
