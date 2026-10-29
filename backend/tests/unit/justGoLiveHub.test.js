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

/** The store, in memory. */
function memoryStore() {
  const data = { state: null, fans: new Map(), stateSaves: 0 };
  return {
    data,
    loadLiveEvent: async (db, eventId) => (eventId === 'night-1'
      ? { definition, state: data.state, fans: [...data.fans.values()] }
      : null),
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

function open(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const messages = [];
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

  beforeEach(async () => {
    store = memoryStore();
    hub = createLiveHub({ store, getGlobalDb: async () => ({}), isProfane: () => false });
    const app = express();
    app.use(express.json());
    app.use('/pivot/live', createJustGoLiveRouter(hub));
    server = http.createServer(app);
    hub.attach(server);
    await new Promise((resolve) => server.listen(0, resolve));
    base = `127.0.0.1:${server.address().port}`;
  });

  afterEach(async () => {
    sockets.splice(0).forEach((ws) => ws.terminate());
    await hub.stop();
    await new Promise((resolve) => server.close(resolve));
  });

  const spot = (path, { method = 'GET', pin = '4821', body } = {}) => fetch(`http://${base}/pivot/live/night-1/spot${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Live-Pin': pin },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (response) => ({ status: response.status, payload: await response.json() }));

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

  it('tells phones an unknown event isn’t live', async () => {
    const response = await fetch(`http://${base}/pivot/live/nope?device=poller-12345678`);
    expect(response.status).toBe(404);
    const phone = await open(`ws://${base}/pivot/live/nope/socket?device=phone-abcdefgh`);
    sockets.push(phone.ws);
    const error = await until(() => phone.messages.find((m) => m.type === 'error'));
    expect(error).toMatchObject({ fatal: true });
  });

  it('serves the spotter page and refuses a wrong PIN, then locks out', async () => {
    const page = await fetch(`http://${base}/pivot/live/night-1/spot`);
    expect(page.headers.get('content-security-policy')).toMatch(/script-src 'nonce-/);
    expect(await page.text()).toMatch(/"night-1"/);
    for (let i = 0; i < 8; i += 1) expect((await spot('/state', { pin: '0000' })).status).toBe(401);
    expect((await spot('/state', { pin: '4821' })).status).toBe(429);
  });
});
