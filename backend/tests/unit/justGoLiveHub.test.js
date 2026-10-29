const http = require('http');
const express = require('express');
const WebSocket = require('ws');
const { createLiveHub } = require('../../services/justGoLive/liveHub');
const { createJustGoLiveRouter } = require('../../routes/justGoLiveRoutes');
const { parseLiveEventDefinition } = require('../../services/justGoLive/liveEventDefinition');

const { definition } = parseLiveEventDefinition({
  eventId: 'night-1',
  title: 'test night',
  matches: [{
    id: 'm1',
    title: 'rex vs. vega',
    sides: [{ id: 'rex', name: 'Rex Rampage' }, { id: 'vega', name: 'Vega Storm' }],
  }],
});

const HOUR = 60 * 60 * 1000;

/** The store, in memory. night-1 is open; closed-1 exists but its hours are over. */
function memoryStore() {
  const data = {
    state: null,
    fans: new Map(),
    stateSaves: 0,
    loads: 0,
    hourReads: 0,
    hours: [
      { eventId: 'night-1', opensAt: new Date(Date.now() - HOUR), closesAt: new Date(Date.now() + HOUR), pinTag: 'tag-a' },
      { eventId: 'later-1', opensAt: new Date(Date.now() + HOUR), closesAt: new Date(Date.now() + 2 * HOUR), pinTag: 'tag-b' },
    ],
  };
  return {
    data,
    listLiveHours: async () => {
      data.hourReads += 1;
      return data.hours;
    },
    loadLiveEvent: async (db, eventId) => {
      data.loads += 1;
      return eventId === 'night-1' || eventId === 'later-1'
        ? { definition, state: data.state, fans: [...data.fans.values()] }
        : null;
    },
    loadLiveDefinition: async () => definition,
    saveLiveState: async (db, eventId, state) => {
      data.state = state;
      data.stateSaves += 1;
    },
    saveLiveFans: async (db, eventId, fans) => {
      fans.forEach((fan) => data.fans.set(fan.deviceId, fan));
    },
    verifyLivePin: async (db, eventId, pin) => pin === '4821',
  };
}

function open(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers });
    const messages = [];
    ws.closeCode = null;
    ws.on('close', (code) => {
      ws.closeCode = code;
    });
    ws.on('message', (raw) => messages.push(JSON.parse(String(raw))));
    ws.once('open', () => resolve({ ws, messages }));
    ws.once('error', reject);
  });
}

async function until(check, timeoutMs = 3000) {
  const started = Date.now();
  for (;;) {
    const value = check();
    if (value) return value;
    if (Date.now() - started > timeoutMs) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe('liveHub over HTTP and WebSocket', () => {
  let server;
  let hub;
  let store;
  let base;
  const sockets = [];

  const limits = { maxFans: 3, newFansPerAddress: 2, joinTimeoutMs: 2000 };

  beforeEach(async () => {
    store = memoryStore();
    hub = createLiveHub({
      store,
      getGlobalDb: async () => ({}),
      isProfane: () => false,
      limits,
      loopDelay: () => 0,
      secret: 'test-secret',
    });
    const app = express();
    app.use(express.json());
    app.use('/pivot/live', createJustGoLiveRouter(hub));
    server = http.createServer(app);
    hub.attach(server);
    await new Promise((resolve) => server.listen(0, resolve));
    base = `127.0.0.1:${server.address().port}`;
  });

  afterEach(async () => {
    token = '';
    sockets.splice(0).forEach((ws) => ws.terminate());
    await hub.stop();
    await new Promise((resolve) => server.close(resolve));
  });

  const request = (path, { method = 'GET', headers = {}, body } = {}) => fetch(`http://${base}/pivot/live/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (response) => ({ status: response.status, payload: await response.json() }));

  const signIn = (pin = '4821', address = '10.0.0.1', eventId = 'night-1') => request(`${eventId}/spot/session`, {
    method: 'POST',
    headers: { 'X-Forwarded-For': `6.6.6.6, ${address}` },
    body: { pin },
  });

  let token = '';
  const spot = async (path, { method = 'GET', body } = {}) => {
    if (!token) token = (await signIn()).payload.data.token;
    return request(`night-1/spot${path}`, { method, headers: { 'X-Live-Token': token }, body });
  };

  const join = async (deviceId, { address = '10.0.0.1' } = {}) => {
    const phone = await open(`ws://${base}/pivot/live/night-1/socket?device=${deviceId}`, { 'X-Forwarded-For': address });
    sockets.push(phone.ws);
    phone.ws.send(JSON.stringify({ type: 'join', eventId: 'night-1', deviceId, surface: 'clip', protocol: 1 }));
    await until(() => phone.messages.find((m) => m.type === 'snapshot' || m.type === 'error'));
    return phone;
  };

  it('joins over the socket, takes a pick, and broadcasts the spotter’s bell', async () => {
    const phone = await open(`ws://${base}/pivot/live/night-1/socket?device=phone-abcdefgh`);
    sockets.push(phone.ws);
    phone.ws.send(JSON.stringify({ type: 'join', eventId: 'night-1', deviceId: 'phone-abcdefgh', surface: 'clip', protocol: 1 }));
    const first = await until(() => phone.messages.find((m) => m.type === 'snapshot'));
    expect(first.snapshot).toMatchObject({ eventId: 'night-1', stage: null, prompt: { id: 'name' } });
    expect(first.snapshot.feed).toEqual([]);

    expect((await spot('/command', { method: 'POST', body: { commandId: 'a', type: 'open', matchId: 'm1' } })).status).toBe(200);
    phone.ws.send(JSON.stringify({ type: 'call', ref: 'r1', stageId: 'm1', sideId: 'vega' }));
    await until(() => phone.messages.find((m) => m.type === 'ack' && m.ref === 'r1' && m.ok));

    const bell = await spot('/command', { method: 'POST', body: { commandId: 'b', type: 'bell' } });
    expect(bell.payload.data.view.stage).toMatchObject({ status: 'open' });
    const moment = await until(() => phone.messages.find((m) => m.type === 'moment'));
    expect(moment.moment.headline).toBe('ding ding');
    await until(() => phone.messages.find((m) => m.type === 'snapshot' && m.snapshot.stage?.status === 'open'));
    expect(store.data.state.status).toBe('open');

    // Picks reach the store within a flush.
    await until(() => store.data.fans.get('phone-abcdefgh')?.calls?.m1 === 'vega');
  });

  it('serves the polling fallback and answers posted calls', async () => {
    const poll = await fetch(`http://${base}/pivot/live/night-1?device=poller-12345678&surface=app`).then((r) => r.json());
    expect(poll.success).toBe(true);
    expect(poll.data.snapshot.upNext[0].id).toBe('m1');

    const early = await fetch(`http://${base}/pivot/live/night-1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'call', ref: 'x', stageId: 'm1', sideId: 'rex', deviceId: 'poller-12345678' }),
    });
    expect(early.status).toBe(409);
    expect((await early.json()).message).toBe('picks open soon');
  });

  it('keeps its sockets open beside socket.io on the same server', async () => {
    const { Server } = require('socket.io');
    const io = new Server(server);
    try {
      const phone = await open(`ws://${base}/pivot/live/night-1/socket?device=phone-abcdefgh`);
      sockets.push(phone.ws);
      // socket.io ends upgrades it doesn't own after a second if nothing answered.
      await new Promise((resolve) => setTimeout(resolve, 1300));
      expect(phone.ws.readyState).toBe(WebSocket.OPEN);
      phone.ws.send(JSON.stringify({ type: 'join', eventId: 'night-1', deviceId: 'phone-abcdefgh', surface: 'app', protocol: 1 }));
      await until(() => phone.messages.find((m) => m.type === 'snapshot'));
    } finally {
      io.close();
    }
  });

  it('refuses unknown and closed nights from memory, reading the hours once', async () => {
    for (const id of ['nope', 'nope-2', 'nope-3', 'later-1']) {
      expect((await fetch(`http://${base}/pivot/live/${id}?device=poller-12345678`)).status).toBe(404);
    }
    const phone = await open(`ws://${base}/pivot/live/nope/socket?device=phone-abcdefgh`);
    sockets.push(phone.ws);
    const error = await until(() => phone.messages.find((m) => m.type === 'error'));
    expect(error).toMatchObject({ fatal: true, message: 'this one isn’t live.' });
    // No lookup per id: one read of the hours, and no night loaded.
    expect(store.data.hourReads).toBe(1);
    expect(store.data.loads).toBe(0);
    expect((await signIn('4821', '10.0.0.1', 'later-1')).status).toBe(404);
  });

  it('caps the night’s fans, and lets fans already in it back in', async () => {
    const first = await join('fan-00000001', { address: '10.0.0.1' });
    await join('fan-00000002', { address: '10.0.0.2' });
    await join('fan-00000003', { address: '10.0.0.3' });
    const fourth = await join('fan-00000004', { address: '10.0.0.4' });
    expect(fourth.messages.find((m) => m.type === 'error')).toMatchObject({ fatal: true, message: expect.stringMatching(/full/) });
    await until(() => fourth.ws.closeCode === 4403);

    // Polling can't get past the cap either.
    const polled = await fetch(`http://${base}/pivot/live/night-1?device=fan-00000005`);
    expect(polled.status).toBe(403);

    // A fan who drops and comes back is still in, on a new socket.
    first.ws.terminate();
    const back = await join('fan-00000001', { address: '10.0.0.9' });
    expect(back.messages.find((m) => m.type === 'snapshot')).toBeTruthy();
  });

  it('slows new fans from one address without hanging up on them at once', async () => {
    await join('fan-0000000a', { address: '10.9.9.9' });
    await join('fan-0000000b', { address: '10.9.9.9' });
    const third = await join('fan-0000000c', { address: '10.9.9.9' });
    expect(third.messages.find((m) => m.type === 'error')).toMatchObject({ fatal: false });
    expect(third.ws.readyState).toBe(WebSocket.OPEN);
    // The join timeout hangs up later, and the app tries again then.
    await until(() => third.ws.readyState === WebSocket.CLOSED, 4000);
  });

  it('drops sockets that never join', async () => {
    const idle = await open(`ws://${base}/pivot/live/night-1/socket?device=idle-1234567`);
    sockets.push(idle.ws);
    await until(() => idle.ws.readyState === WebSocket.CLOSED, 4000);
  });

  it('keeps one socket per device', async () => {
    const first = await join('fan-0000000d');
    const second = await join('fan-0000000d');
    await until(() => first.ws.closeCode === 4409);
    expect(second.ws.readyState).toBe(WebSocket.OPEN);
  });

  it('hangs up when the night’s hours end', async () => {
    const phone = await join('fan-0000000e');
    store.data.hours = [];
    await hub.refreshEvent('night-1');
    const last = await until(() => phone.messages.find((m) => m.type === 'error'));
    expect(last).toMatchObject({ fatal: true, message: expect.stringMatching(/that’s the night/) });
    await until(() => phone.ws.closeCode === 4410);
    expect((await fetch(`http://${base}/pivot/live/night-1?device=fan-0000000e`)).status).toBe(404);
  });

  it('signs the spotter in once, and locks out an address, not the spotter', async () => {
    const page = await fetch(`http://${base}/pivot/live/night-1/spot`);
    expect(page.headers.get('content-security-policy')).toMatch(/script-src 'nonce-/);
    expect(await page.text()).toMatch(/"night-1"/);

    const session = await signIn('4821', '10.0.0.1');
    expect(session.status).toBe(200);
    const good = session.payload.data.token;
    expect(session.payload.data.view.title).toBe('test night');

    // Guesses from elsewhere lock that address out…
    for (let i = 0; i < 8; i += 1) expect((await signIn('0000', '203.0.113.7')).status).toBe(401);
    expect((await signIn('4821', '203.0.113.7')).status).toBe(429);
    // …not the spotter's address, and not a spotter who's signed in.
    expect((await signIn('4821', '10.0.0.1')).status).toBe(200);
    const state = await request('night-1/spot/state', { headers: { 'X-Live-Token': good } });
    expect(state.status).toBe(200);

    // An admin can lift the lockout.
    hub.unlockSpotter('night-1');
    expect((await signIn('4821', '203.0.113.7')).status).toBe(200);

    // A forged or stale token is refused; a new PIN ends the old ones.
    expect((await request('night-1/spot/state', { headers: { 'X-Live-Token': `${good}x` } })).status).toBe(401);
    store.data.hours = store.data.hours.map((night) => ({ ...night, pinTag: 'tag-new' }));
    await hub.refreshEvent('night-1');
    expect((await request('night-1/spot/state', { headers: { 'X-Live-Token': good } })).status).toBe(401);
  });

  it('slows the rope’s snapshots while the event loop lags', async () => {
    let lag = 0;
    const slowHub = createLiveHub({ store, getGlobalDb: async () => ({}), loopDelay: () => lag });
    for (let i = 0; i < 4; i += 1) await slowHub.tick();
    expect(slowHub.isSlowed()).toBe(false);
    lag = 250;
    for (let i = 0; i < 4; i += 1) await slowHub.tick();
    expect(slowHub.isSlowed()).toBe(true);
    lag = 10;
    for (let i = 0; i < 4; i += 1) await slowHub.tick();
    expect(slowHub.isSlowed()).toBe(false);
  });
});

describe('the live routes when turned off', () => {
  it('answer 404 without touching the hub', async () => {
    const app = express();
    app.use('/pivot/live', createJustGoLiveRouter({}, { disabled: true }));
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/pivot/live/night-1?device=poller-12345678`);
      expect(response.status).toBe(404);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
