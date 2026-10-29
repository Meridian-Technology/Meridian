const { WebSocketServer } = require('ws');
const { connectToGlobalDatabase } = require('../../connectionsManager');
const defaultStore = require('./liveStore');
const { createLiveEngine } = require('./liveEngine');
const { EVENT_ID } = require('./liveEventDefinition');

/**
 * Just Go Live's transport: phones on a WebSocket at
 * `/pivot/live/{eventId}/socket` (polling over HTTP when that fails), the
 * spotter over HTTP, and one live engine per event in memory.
 *
 * Built for one dyno: an event's state lives in this process, and every
 * change that scores is written to Mongo, so a restart picks the night up
 * where it was. Don't scale this past one dyno; two would split the room.
 *
 * Load: the rope needs 4 snapshots a second while it's live. Each tick
 * serializes what every phone shares once and adds each phone's own part,
 * and the feed goes out once a second as one shared string.
 */

const ROUTE = /^\/pivot\/live\/([A-Za-z0-9_-]{1,64})\/socket\/?$/;
const DEVICE_ID = /^[A-Za-z0-9_-]{8,64}$/;
const TICK_MS = 250;
/** Feed batches about once a second. */
const FEED_EVERY_TICKS = 4;
/** Picks and names are written in a batch about once a second. */
const FLUSH_EVERY_TICKS = 4;
/** Off the rope, phones still hear from the server this often. */
const HEARTBEAT_MS = 10 * 1000;
/** Socket pings, to drop phones that walked out of signal. */
const SOCKET_PING_MS = 30 * 1000;
/** A phone this far behind on reading skips snapshots until it catches up. */
const MAX_BUFFERED_BYTES = 256 * 1024;
/** A misprinted or unknown event id is remembered as missing this long. */
const MISSING_TTL_MS = 15 * 1000;
/** An event with no phones for this long leaves memory. */
const IDLE_UNLOAD_MS = 30 * 60 * 1000;
const PIN_FAILURES = 8;
const PIN_WINDOW_MS = 10 * 60 * 1000;
const NOT_LIVE = 'this one isn’t live.';

function createLiveHub({
  store = defaultStore,
  getGlobalDb = connectToGlobalDatabase,
  now = Date.now,
  isProfane,
} = {}) {
  /** eventId → Promise<entry | null>. */
  const events = new Map();
  /** eventId → when it may be looked up again. */
  const missing = new Map();
  /** eventId → recent failed PIN times. */
  const pinFailures = new Map();
  let tickTimer = null;
  let pingTimer = null;
  let ticks = 0;

  function loadEvent(eventId) {
    if (!EVENT_ID.test(eventId)) return Promise.resolve(null);
    const known = events.get(eventId);
    if (known) return known;
    if ((missing.get(eventId) ?? 0) > now()) return Promise.resolve(null);
    const loading = (async () => {
      const db = await getGlobalDb();
      const stored = await store.loadLiveEvent(db, eventId);
      if (!stored) {
        events.delete(eventId);
        missing.set(eventId, now() + MISSING_TTL_MS);
        return null;
      }
      return {
        eventId,
        engine: createLiveEngine({ ...stored, now, ...(isProfane ? { isProfane } : {}) }),
        sockets: new Map(),
        dirtyFans: new Set(),
        dirty: true,
        lastSnapshotAt: 0,
        lastActiveAt: now(),
        saving: Promise.resolve(),
      };
    })().catch((error) => {
      events.delete(eventId);
      throw error;
    });
    events.set(eventId, loading);
    return loading;
  }

  async function db() {
    return getGlobalDb();
  }

  function markFan(entry, deviceId) {
    entry.dirtyFans.add(deviceId);
    entry.dirty = true;
    entry.lastActiveAt = now();
  }

  /** Writes changed fans in one batch; on failure they're retried next time. */
  async function flushFans(entry) {
    if (!entry.dirtyFans.size) return;
    const ids = [...entry.dirtyFans];
    entry.dirtyFans.clear();
    const fans = ids.map((id) => entry.engine.exportFan(id)).filter(Boolean);
    try {
      await store.saveLiveFans(await db(), entry.eventId, fans);
    } catch (error) {
      ids.forEach((id) => entry.dirtyFans.add(id));
      console.error('[live] saving fans failed', { eventId: entry.eventId, count: ids.length, message: error.message });
    }
  }

  /** Saves the spotter's state; saves run in order, each writing the latest. */
  function saveState(entry) {
    entry.saving = entry.saving
      .catch(() => undefined)
      .then(async () => store.saveLiveState(await db(), entry.eventId, entry.engine.exportState()));
    return entry.saving;
  }

  function send(ws, text) {
    if (ws.readyState !== ws.OPEN) return;
    ws.send(text);
  }

  function snapshotText(entry, deviceId, options) {
    return JSON.stringify({ type: 'snapshot', snapshot: entry.engine.snapshot(deviceId, options) });
  }

  /** Every phone's snapshot: the shared part serialized once. */
  function broadcastSnapshots(entry) {
    entry.dirty = false;
    entry.lastSnapshotAt = now();
    if (!entry.sockets.size) return;
    const sharedJson = JSON.stringify(entry.engine.shared());
    const head = `{"type":"snapshot","snapshot":${sharedJson.slice(0, -1)},`;
    for (const [ws, deviceId] of entry.sockets) {
      if (ws.readyState !== ws.OPEN || ws.bufferedAmount > MAX_BUFFERED_BYTES) continue;
      const own = JSON.stringify(entry.engine.personal(deviceId));
      ws.send(`${head}${own.slice(1)}}`);
    }
  }

  function broadcastText(entry, text) {
    for (const ws of entry.sockets.keys()) {
      if (ws.bufferedAmount <= MAX_BUFFERED_BYTES) send(ws, text);
    }
  }

  function tickEvent(entry) {
    entry.engine.tick();
    if (ticks % FEED_EVERY_TICKS === 0) {
      const items = entry.engine.drainFeed();
      if (items.length) broadcastText(entry, JSON.stringify({ type: 'feed', items }));
    }
    if (entry.engine.isLive() || entry.dirty || now() - entry.lastSnapshotAt >= HEARTBEAT_MS) {
      broadcastSnapshots(entry);
    }
    if (ticks % FLUSH_EVERY_TICKS === 0) void flushFans(entry);
  }

  async function tick() {
    ticks += 1;
    for (const [eventId, loading] of events) {
      let entry;
      try {
        entry = await loading;
      } catch {
        continue;
      }
      if (!entry) continue;
      try {
        tickEvent(entry);
      } catch (error) {
        console.error('[live] tick failed', { eventId, message: error.message });
      }
      if (entry.sockets.size) entry.lastActiveAt = now();
      else if (now() - entry.lastActiveAt > IDLE_UNLOAD_MS && !entry.dirtyFans.size) events.delete(eventId);
    }
  }

  // --- Phones on the socket ------------------------------------------------

  function receive(ws, entry, raw) {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (!message || typeof message !== 'object') return;
    if (message.type === 'join') {
      const deviceId = typeof message.deviceId === 'string' ? message.deviceId : '';
      if (!DEVICE_ID.test(deviceId)) {
        send(ws, JSON.stringify({ type: 'error', message: 'can’t join without a device id', fatal: true }));
        ws.close(4400);
        return;
      }
      entry.sockets.set(ws, deviceId);
      const { changed } = entry.engine.join(deviceId, {
        surface: message.surface,
        name: typeof message.name === 'string' ? message.name : undefined,
        source: typeof message.source === 'string' ? message.source : undefined,
      });
      if (changed) markFan(entry, deviceId);
      send(ws, snapshotText(entry, deviceId, { feed: true }));
      return;
    }
    const deviceId = entry.sockets.get(ws);
    if (!deviceId) return;
    if (message.type === 'ping') {
      send(ws, snapshotText(entry, deviceId));
      return;
    }
    const { ack, fanChanged } = entry.engine.handle(deviceId, message);
    if (ack) send(ws, JSON.stringify({ type: 'ack', ...ack }));
    if (fanChanged) {
      markFan(entry, deviceId);
      send(ws, snapshotText(entry, deviceId));
    }
  }

  function connect(ws, eventId) {
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    ws.on('error', () => undefined);
    const ready = loadEvent(eventId);
    let queue = ready;
    ready.then((entry) => {
      if (entry) return;
      send(ws, JSON.stringify({ type: 'error', message: NOT_LIVE, fatal: true }));
      ws.close(4404);
    }).catch((error) => {
      console.error('[live] loading the event failed', { eventId, message: error.message });
      ws.close(1011);
    });
    // Messages run in order, after the event has loaded.
    ws.on('message', (raw) => {
      queue = queue
        .then((entry) => {
          if (entry) receive(ws, entry, raw);
          return entry;
        })
        .catch(() => null);
    });
    ws.on('close', () => {
      ready.then((entry) => entry?.sockets.delete(ws)).catch(() => undefined);
    });
  }

  /** Listens for live sockets on the app's HTTP server, beside socket.io. */
  function attach(server) {
    const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 });
    server.on('upgrade', (req, socket, head) => {
      let pathname;
      try {
        pathname = new URL(req.url || '/', 'http://live.invalid').pathname;
      } catch {
        return;
      }
      const match = ROUTE.exec(pathname);
      // Not ours: socket.io's handler takes it.
      if (!match) return;
      wss.handleUpgrade(req, socket, head, (ws) => connect(ws, match[1]));
    });
    start();
    pingTimer = setInterval(() => {
      for (const ws of wss.clients) {
        if (!ws.isAlive) {
          ws.terminate();
          continue;
        }
        ws.isAlive = false;
        ws.ping();
      }
    }, SOCKET_PING_MS);
    return wss;
  }

  function start() {
    if (tickTimer) return;
    tickTimer = setInterval(() => {
      tick().catch((error) => console.error('[live] tick loop failed', error.message));
    }, TICK_MS);
  }

  /** Before the process exits: write every fan still waiting. */
  async function stop() {
    if (tickTimer) clearInterval(tickTimer);
    if (pingTimer) clearInterval(pingTimer);
    tickTimer = null;
    pingTimer = null;
    const entries = await Promise.all([...events.values()].map((loading) => loading.catch(() => null)));
    await Promise.all(entries.filter(Boolean).map(async (entry) => {
      await flushFans(entry);
      await entry.saving.catch(() => undefined);
    }));
  }

  // --- Phones over HTTP (the polling fallback) ---------------------------------

  /** `GET /pivot/live/:eventId?device=&surface=`: join (or rejoin) and read. */
  async function poll(eventId, { deviceId, surface }) {
    const entry = await loadEvent(eventId);
    if (!entry) return { status: 404, message: NOT_LIVE };
    if (!DEVICE_ID.test(deviceId || '')) return { status: 400, message: 'device required' };
    const { changed } = entry.engine.join(deviceId, { surface });
    if (changed) markFan(entry, deviceId);
    return { status: 200, snapshot: entry.engine.snapshot(deviceId, { feed: true }) };
  }

  /** `POST /pivot/live/:eventId/messages`: a call, cheer, or action while polling. */
  async function post(eventId, body) {
    const entry = await loadEvent(eventId);
    if (!entry) return { status: 404, message: NOT_LIVE };
    const deviceId = typeof body?.deviceId === 'string' ? body.deviceId : '';
    if (!DEVICE_ID.test(deviceId)) return { status: 400, message: 'device required' };
    if (!entry.engine.hasFan(deviceId)) {
      entry.engine.join(deviceId, { surface: body.surface });
      markFan(entry, deviceId);
    }
    const { ack, fanChanged } = entry.engine.handle(deviceId, body);
    if (fanChanged) markFan(entry, deviceId);
    const ok = ack ? ack.ok : true;
    return {
      status: ok ? 200 : 409,
      ok,
      message: ack?.message,
      snapshot: entry.engine.snapshot(deviceId),
    };
  }

  // --- The spotter ---------------------------------------------------------

  async function checkPin(eventId, pin) {
    const recent = (pinFailures.get(eventId) || []).filter((at) => now() - at < PIN_WINDOW_MS);
    pinFailures.set(eventId, recent);
    if (recent.length >= PIN_FAILURES) return { status: 429, message: 'too many wrong PINs. wait ten minutes.' };
    if (await store.verifyLivePin(await db(), eventId, pin)) return null;
    recent.push(now());
    return { status: 401, message: 'wrong PIN' };
  }

  function view(entry) {
    return { ...entry.engine.spotterView(), connected: entry.sockets.size };
  }

  async function spotterState(eventId, pin) {
    const entry = await loadEvent(eventId);
    if (!entry) return { status: 404, message: 'no such event' };
    const refused = await checkPin(eventId, pin);
    if (refused) return refused;
    return { status: 200, view: view(entry) };
  }

  async function spotterCommand(eventId, pin, body) {
    const entry = await loadEvent(eventId);
    if (!entry) return { status: 404, message: 'no such event' };
    const refused = await checkPin(eventId, pin);
    if (refused) return refused;

    if (body?.type === 'reload') {
      const definition = await store.loadLiveDefinition(await db(), eventId);
      if (!definition) return { status: 409, message: 'the stored card is invalid' };
      entry.engine.setDefinition(definition);
      broadcastSnapshots(entry);
      return { status: 200, view: view(entry) };
    }

    const result = entry.engine.command(body || {});
    if (!result.ok) return { status: 409, message: result.message, view: view(entry) };
    let saved = true;
    if (!result.duplicate) {
      try {
        await saveState(entry);
      } catch (error) {
        saved = false;
        console.error('[live] saving the spotter state failed', { eventId, message: error.message });
      }
      if (result.moment) broadcastText(entry, JSON.stringify({ type: 'moment', moment: result.moment }));
      broadcastSnapshots(entry);
    }
    return { status: 200, view: view(entry), saved, undone: result.undone };
  }

  // --- Pivot admin ---------------------------------------------------------

  /** A card saved from admin: phones already in the event see it at once. */
  function refreshDefinition(eventId, definition) {
    missing.delete(eventId);
    const loading = events.get(eventId);
    if (!loading) return;
    loading.then((entry) => {
      if (!entry) return;
      entry.engine.setDefinition(definition);
      broadcastSnapshots(entry);
    }).catch(() => undefined);
  }

  /**
   * After a reset: drop the event from memory and hang up its phones. They
   * reconnect on their own and load the night fresh from the database.
   */
  async function forget(eventId) {
    missing.delete(eventId);
    const loading = events.get(eventId);
    if (!loading) return;
    events.delete(eventId);
    const entry = await loading.catch(() => null);
    if (!entry) return;
    entry.dirtyFans.clear();
    for (const ws of entry.sockets.keys()) ws.close(1012, 'reset');
  }

  return {
    attach,
    start,
    stop,
    tick,
    poll,
    post,
    spotterState,
    spotterCommand,
    loadEvent,
    refreshDefinition,
    forget,
  };
}

let hub = null;

/** The process's hub, shared by the HTTP routes and the socket server. */
function getLiveHub() {
  hub ??= createLiveHub();
  return hub;
}

module.exports = { createLiveHub, getLiveHub };
