const crypto = require('crypto');
const { monitorEventLoopDelay } = require('perf_hooks');
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
 * It shares that dyno with the rest of Meridian, so nothing a stranger
 * sends can grow without a bound:
 * - Phones reach a night only between its hours (set in Pivot admin). Any
 *   other id is refused from memory; which nights are open is read from
 *   Mongo at most once a minute, and only once someone asks.
 * - A night holds `maxFans` fans. Fans already in it always get back in.
 * - Sockets are capped across every night, and dropped if they don't join
 *   or stop reading.
 * - The spotter's PIN is checked once (scrypt, off the event loop) for a
 *   signed token, and wrong PINs lock out one address, not the spotter.
 * - When the event loop lags, live snapshots slow down before Meridian does.
 *
 * Load: the rope needs 4 snapshots a second while it's live. Each tick
 * serializes what every phone shares once and adds each phone's own part,
 * and the feed goes out once a second as one shared string.
 */

const ROUTE = /^\/pivot\/live\/([A-Za-z0-9_-]{1,64})\/socket\/?$/;
const DEVICE_ID = /^[A-Za-z0-9_-]{8,64}$/;
const PIN = /^\d{4,8}$/;
const TICK_MS = 250;
/** Feed batches about once a second. */
const FEED_EVERY_TICKS = 4;
/** Picks and names are written in a batch about once a second. */
const FLUSH_EVERY_TICKS = 4;
/** Off the rope, phones still hear from the server this often. */
const HEARTBEAT_MS = 10 * 1000;
/** Socket pings, to drop phones that walked out of signal. */
const SOCKET_PING_MS = 30 * 1000;
/** A phone this far behind on reading skips snapshots until it catches up… */
const MAX_BUFFERED_BYTES = 64 * 1024;
/** …and is hung up on if it stays behind this long. It reconnects. */
const SLOW_SOCKET_MS = 15 * 1000;
/** An event with no phones for this long leaves memory. */
const IDLE_UNLOAD_MS = 30 * 60 * 1000;
/** Which nights are open is read again after this long. */
const HOURS_FRESH_MS = 60 * 1000;
/** After a failed read of the hours, try again this soon. */
const HOURS_RETRY_MS = 5 * 1000;
/** A night whose stored card can't load isn't looked up again for this long. */
const UNLOADABLE_MS = 15 * 1000;
/** Wrong PINs from one address, and from everyone, before a lockout. */
const PIN_FAILURES = 8;
const PIN_FAILURES_PER_EVENT = 100;
const PIN_WINDOW_MS = 10 * 60 * 1000;
/** A spotter signs in once a night. */
const SPOTTER_TOKEN_MS = 12 * 60 * 60 * 1000;
/** Per-address counters are forgotten each minute, or sooner past this many addresses. */
const MAX_TRACKED_ADDRESSES = 20000;
/** Event-loop lag (p99) that slows live snapshots, and that restores them. */
const LAG_SLOW_MS = 100;
const LAG_OK_MS = 40;
const LAG_EVERY_TICKS = 4;
/** While slowed, the rope's snapshots go out every this many ticks. */
const SLOW_SNAPSHOT_EVERY_TICKS = 4;
const STATS_EVERY_MS = 60 * 1000;

const LIMITS = Object.freeze({
  /** Fans in one night. */
  maxFans: 500,
  /** Open sockets across every night, joined or not. */
  maxSockets: 1000,
  /** A socket that hasn't joined by then is dropped. */
  joinTimeoutMs: 10 * 1000,
  /** New fans from one address a minute. Generous: a venue's Wi-Fi is one address. */
  newFansPerAddress: 60,
  /** Socket opens from one address a minute. */
  socketsPerAddress: 300,
});

const NOT_LIVE = 'this one isn’t live.';
const CLOSED = 'that’s the night. see you at the next one.';
const FULL = { status: 403, fatal: true, message: 'the room’s full on here tonight. enjoy the show.' };
const BUSY = { status: 429, fatal: false, message: 'lots of phones on this connection. trying again…' };
const SPOTTER_CLOSED = 'this night isn’t open right now. check its hours in pivot admin.';

/** `JUSTGO_LIVE_DISABLED=1` turns every live route and socket off. */
function liveDisabled() {
  return process.env.JUSTGO_LIVE_DISABLED === '1';
}

/**
 * The phone's address. Heroku's router appends it to X-Forwarded-For;
 * anything before it came from the client and can't be trusted.
 */
function clientAddress(req) {
  const forwarded = req?.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    const parts = forwarded.split(',');
    return parts[parts.length - 1].trim();
  }
  return req?.socket?.remoteAddress || 'unknown';
}

/** Counts per address in one-minute windows; true while under `limit`. */
function createAddressLimiter(limit, now) {
  let windowStart = now();
  let counts = new Map();
  return (address) => {
    if (now() - windowStart >= 60 * 1000 || counts.size >= MAX_TRACKED_ADDRESSES) {
      windowStart = now();
      counts = new Map();
    }
    const count = (counts.get(address) || 0) + 1;
    counts.set(address, count);
    return count <= limit;
  };
}

function eventLoopDelayMonitor() {
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();
  return {
    read() {
      const ms = histogram.percentile(99) / 1e6;
      histogram.reset();
      return ms;
    },
    stop: () => histogram.disable(),
  };
}

function spotterSecret() {
  const base = process.env.JWT_SECRET;
  // Tokens survive a restart when the secret does.
  return base
    ? crypto.createHash('sha256').update(`justgo-live-spotter:${base}`).digest()
    : crypto.randomBytes(32);
}

function createLiveHub({
  store = defaultStore,
  getGlobalDb = connectToGlobalDatabase,
  now = Date.now,
  isProfane,
  limits: limitOverrides = {},
  /** `() => ms`: the event loop's recent lag. Defaults to perf_hooks. */
  loopDelay,
  secret = spotterSecret(),
} = {}) {
  const limits = { ...LIMITS, ...limitOverrides };
  /** eventId → Promise<entry | null>. Only nights that are open get here. */
  const events = new Map();
  /** eventId → {opensAt, closesAt, pinTag} (ms), for nights that haven't closed. */
  let hours = new Map();
  let hoursReadAt = null;
  let hoursGeneration = 0;
  let hoursApplied = 0;
  let pendingHours = null;
  /** `${eventId} ${address}` → recent wrong-PIN times; eventId → the same, from anyone. */
  const pinFailures = new Map();
  const eventPinFailures = new Map();
  const allowNewFan = createAddressLimiter(limits.newFansPerAddress, now);
  const allowSocket = createAddressLimiter(limits.socketsPerAddress, now);
  let wss = null;
  let tickTimer = null;
  let pingTimer = null;
  let lagMonitor = null;
  let ticks = 0;
  let slow = false;
  let peakLagMs = 0;
  let lastStatsAt = now();

  async function db() {
    return getGlobalDb();
  }

  // --- Which nights are open ------------------------------------------------

  /** Reads every night that hasn't closed. A newer read always wins. */
  function readHours({ fresh = false } = {}) {
    if (pendingHours && !fresh) return pendingHours;
    hoursGeneration += 1;
    const generation = hoursGeneration;
    const reading = (async () => {
      try {
        const rows = await store.listLiveHours(await db(), new Date(now()));
        if (generation <= hoursApplied) return;
        hoursApplied = generation;
        hours = new Map(rows.map((row) => [row.eventId, {
          opensAt: row.opensAt ? new Date(row.opensAt).getTime() : Infinity,
          closesAt: row.closesAt ? new Date(row.closesAt).getTime() : 0,
          pinTag: row.pinTag || '',
        }]));
        hoursReadAt = now();
      } catch (error) {
        console.error('[live] reading the nights’ hours failed', { message: error.message });
        // Requests keep the last answer meanwhile, and none of them wait on Mongo.
        if (generation > hoursApplied) hoursReadAt = now() - HOURS_FRESH_MS + HOURS_RETRY_MS;
      } finally {
        if (pendingHours === reading) pendingHours = null;
      }
    })();
    pendingHours = reading;
    return reading;
  }

  function openNow(eventId) {
    const night = hours.get(eventId);
    return Boolean(night && night.opensAt <= now() && now() < night.closesAt);
  }

  /** Whether phones can join this night now. No query per request. */
  async function isOpen(eventId) {
    if (hoursReadAt === null) await readHours();
    else if (now() - hoursReadAt > HOURS_FRESH_MS) void readHours();
    return openNow(eventId);
  }

  // --- Nights in memory -----------------------------------------------------

  async function loadEntry(eventId) {
    const stored = await store.loadLiveEvent(await db(), eventId, { maxFans: limits.maxFans });
    if (!stored) return null;
    return {
      eventId,
      engine: createLiveEngine({ ...stored, now, ...(isProfane ? { isProfane } : {}) }),
      /** ws → deviceId, joined sockets only. */
      sockets: new Map(),
      /** deviceId → its one socket. */
      devices: new Map(),
      dirtyFans: new Set(),
      dirty: true,
      /** Shut for the night: phones get a last word. */
      closed: false,
      /** Dropped by a reset: phones reconnect to a fresh copy. */
      retired: false,
      lastSnapshotAt: 0,
      lastActiveAt: now(),
      saving: Promise.resolve(),
    };
  }

  /** The night, or null when it isn't open (or doesn't exist). */
  async function loadEvent(eventId) {
    if (!EVENT_ID.test(eventId || '') || !(await isOpen(eventId))) return null;
    const known = events.get(eventId);
    if (known) return known;
    const loading = loadEntry(eventId);
    events.set(eventId, loading);
    // A card that won't load, or a failed read, is held briefly so it isn't queried per request.
    const forgetAfter = (ms) => setTimeout(() => {
      if (events.get(eventId) === loading) events.delete(eventId);
    }, ms).unref?.();
    loading.then((entry) => {
      if (!entry) forgetAfter(UNLOADABLE_MS);
    }, () => forgetAfter(HOURS_RETRY_MS));
    return loading;
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

  /**
   * The night's hours are over (or an admin closed it): phones get a last
   * word and are hung up on, and the night leaves memory once it's written.
   */
  async function shut(entry, message = CLOSED) {
    if (entry.closed) return;
    entry.closed = true;
    events.delete(entry.eventId);
    const text = JSON.stringify({ type: 'error', message, fatal: true });
    for (const ws of entry.sockets.keys()) {
      send(ws, text);
      ws.close(4410, 'closed');
    }
    entry.sockets.clear();
    entry.devices.clear();
    await flushFans(entry);
    await entry.saving.catch(() => undefined);
  }

  // --- Sending --------------------------------------------------------------

  function send(ws, text) {
    if (ws.readyState !== ws.OPEN) return;
    ws.send(text);
  }

  /** False for a phone that's behind on reading; one that stays behind is hung up on. */
  function keepingUp(ws) {
    if (ws.bufferedAmount <= MAX_BUFFERED_BYTES) {
      ws.slowSince = null;
      return true;
    }
    ws.slowSince ??= now();
    if (now() - ws.slowSince > SLOW_SOCKET_MS) ws.terminate();
    return false;
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
      if (ws.readyState !== ws.OPEN || !keepingUp(ws)) continue;
      const own = JSON.stringify(entry.engine.personal(deviceId));
      ws.send(`${head}${own.slice(1)}}`);
    }
  }

  function broadcastText(entry, text) {
    for (const ws of entry.sockets.keys()) {
      if (keepingUp(ws)) send(ws, text);
    }
  }

  // --- The clock ------------------------------------------------------------

  function measureLag() {
    const lagMs = loopDelay ? loopDelay() : lagMonitor?.read();
    if (typeof lagMs !== 'number' || Number.isNaN(lagMs)) return;
    peakLagMs = Math.max(peakLagMs, lagMs);
    if (!slow && lagMs > LAG_SLOW_MS) {
      slow = true;
      console.warn('[live] the event loop is lagging; live snapshots slowed', { lagMs: Math.round(lagMs) });
    } else if (slow && lagMs < LAG_OK_MS) {
      slow = false;
      console.info('[live] the event loop caught up; live snapshots back to full speed');
    }
  }

  function tickEvent(entry) {
    entry.engine.tick();
    if (ticks % FEED_EVERY_TICKS === 0) {
      const items = entry.engine.drainFeed();
      if (items.length) broadcastText(entry, JSON.stringify({ type: 'feed', items }));
    }
    const every = slow ? SLOW_SNAPSHOT_EVERY_TICKS : 1;
    const due = (entry.engine.isLive() || entry.dirty) && ticks % every === 0;
    if (due || now() - entry.lastSnapshotAt >= HEARTBEAT_MS) broadcastSnapshots(entry);
    if (ticks % FLUSH_EVERY_TICKS === 0) void flushFans(entry);
  }

  function sweepPinFailures() {
    for (const map of [pinFailures, eventPinFailures]) {
      for (const [key, times] of map) {
        if (!times.some((at) => now() - at < PIN_WINDOW_MS)) map.delete(key);
      }
    }
  }

  /** One line a minute while a night is in memory, for `heroku logs`. */
  function logStats(nights) {
    lastStatsAt = now();
    sweepPinFailures();
    if (nights.length) {
      const each = nights.map((n) => `${n.eventId} fans=${n.fans} phones=${n.phones}`).join(' · ');
      const rssMb = Math.round(process.memoryUsage().rss / (1024 * 1024));
      console.log(`[live] ${each} · sockets=${wss?.clients.size ?? 0} lagP99=${Math.round(peakLagMs)}ms slow=${slow} rss=${rssMb}MB`);
    }
    peakLagMs = 0;
  }

  async function tick() {
    ticks += 1;
    if (ticks % LAG_EVERY_TICKS === 0) measureLag();
    if (events.size && hoursReadAt !== null && now() - hoursReadAt > HOURS_FRESH_MS) void readHours();
    const nights = [];
    for (const [eventId, loading] of events) {
      let entry;
      try {
        entry = await loading;
      } catch {
        continue;
      }
      if (!entry || entry.closed || entry.retired) continue;
      if (!openNow(eventId)) {
        void shut(entry);
        continue;
      }
      try {
        tickEvent(entry);
      } catch (error) {
        console.error('[live] tick failed', { eventId, message: error.message });
      }
      nights.push({ eventId, fans: entry.engine.fanCount(), phones: entry.sockets.size });
      if (entry.sockets.size) entry.lastActiveAt = now();
      else if (now() - entry.lastActiveAt > IDLE_UNLOAD_MS && !entry.dirtyFans.size) events.delete(eventId);
    }
    if (now() - lastStatsAt >= STATS_EVERY_MS) logStats(nights);
  }

  // --- Fans -------------------------------------------------------------------

  /** Null when this phone may join; otherwise why not. */
  function admit(entry, deviceId, address) {
    if (entry.engine.hasFan(deviceId)) return null;
    if (entry.engine.fanCount() >= limits.maxFans) return FULL;
    if (!allowNewFan(address)) return BUSY;
    return null;
  }

  // --- Phones on the socket ------------------------------------------------

  function receive(ws, entry, raw) {
    if (entry.retired) {
      ws.close(1012, 'reset');
      return;
    }
    if (entry.closed) {
      send(ws, JSON.stringify({ type: 'error', message: CLOSED, fatal: true }));
      ws.close(4410, 'closed');
      return;
    }
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (!message || typeof message !== 'object') return;
    if (message.type === 'join') {
      // One device per socket; a second join changes nothing.
      if (ws.deviceId) return;
      const deviceId = typeof message.deviceId === 'string' ? message.deviceId : '';
      if (!DEVICE_ID.test(deviceId)) {
        send(ws, JSON.stringify({ type: 'error', message: 'can’t join without a device id', fatal: true }));
        ws.close(4400);
        return;
      }
      const refused = admit(entry, deviceId, ws.address);
      if (refused) {
        send(ws, JSON.stringify({ type: 'error', message: refused.message, fatal: refused.fatal }));
        // Fatal stops the app. Otherwise the join timeout hangs up and the
        // app tries again after it: closing now would have it retry at once.
        if (refused.fatal) ws.close(4403);
        return;
      }
      ws.deviceId = deviceId;
      clearTimeout(ws.joinTimer);
      const previous = entry.devices.get(deviceId);
      if (previous && previous !== ws) {
        entry.sockets.delete(previous);
        previous.close(4409, 'replaced');
      }
      entry.devices.set(deviceId, ws);
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

  function leave(entry, ws) {
    entry.sockets.delete(ws);
    if (ws.deviceId && entry.devices.get(ws.deviceId) === ws) entry.devices.delete(ws.deviceId);
  }

  function connect(ws, eventId, address) {
    ws.isAlive = true;
    ws.address = address;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    ws.on('error', () => undefined);
    ws.joinTimer = setTimeout(() => {
      if (!ws.deviceId) ws.terminate();
    }, limits.joinTimeoutMs);
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
      clearTimeout(ws.joinTimer);
      ready.then((entry) => entry && leave(entry, ws)).catch(() => undefined);
    });
  }

  function refuseUpgrade(socket, status, reason) {
    socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  }

  /** Listens for live sockets on the app's HTTP server, beside socket.io. */
  function attach(server) {
    wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 });
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
      const address = clientAddress(req);
      if (wss.clients.size >= limits.maxSockets) return refuseUpgrade(socket, 503, 'Service Unavailable');
      if (!allowSocket(address)) return refuseUpgrade(socket, 429, 'Too Many Requests');
      wss.handleUpgrade(req, socket, head, (ws) => connect(ws, match[1], address));
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
    if (!loopDelay) lagMonitor = eventLoopDelayMonitor();
    tickTimer = setInterval(() => {
      tick().catch((error) => console.error('[live] tick loop failed', error.message));
    }, TICK_MS);
  }

  /** Before the process exits: write every fan still waiting. */
  async function stop() {
    if (tickTimer) clearInterval(tickTimer);
    if (pingTimer) clearInterval(pingTimer);
    lagMonitor?.stop();
    tickTimer = null;
    pingTimer = null;
    lagMonitor = null;
    const entries = await Promise.all([...events.values()].map((loading) => loading.catch(() => null)));
    await Promise.all(entries.filter(Boolean).map(async (entry) => {
      await flushFans(entry);
      await entry.saving.catch(() => undefined);
    }));
  }

  // --- Phones over HTTP (the polling fallback) ---------------------------------

  /** `GET /pivot/live/:eventId?device=&surface=`: join (or rejoin) and read. */
  async function poll(eventId, { deviceId, surface, address }) {
    const entry = await loadEvent(eventId);
    if (!entry) return { status: 404, message: NOT_LIVE };
    if (!DEVICE_ID.test(deviceId || '')) return { status: 400, message: 'device required' };
    const refused = admit(entry, deviceId, address);
    if (refused) return { status: refused.status, message: refused.message };
    const { changed } = entry.engine.join(deviceId, { surface });
    if (changed) markFan(entry, deviceId);
    return { status: 200, snapshot: entry.engine.snapshot(deviceId, { feed: true }) };
  }

  /** `POST /pivot/live/:eventId/messages`: a call, cheer, or action while polling. */
  async function post(eventId, body, { address } = {}) {
    const entry = await loadEvent(eventId);
    if (!entry) return { status: 404, message: NOT_LIVE };
    const deviceId = typeof body?.deviceId === 'string' ? body.deviceId : '';
    if (!DEVICE_ID.test(deviceId)) return { status: 400, message: 'device required' };
    if (!entry.engine.hasFan(deviceId)) {
      const refused = admit(entry, deviceId, address);
      if (refused) return { status: refused.status, message: refused.message };
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

  function hmac(text) {
    return crypto.createHmac('sha256', secret).update(text).digest('base64url');
  }

  /** `{eventId}.{pinTag}.{expiry}`, signed. A new PIN ends every token. */
  function signToken(eventId) {
    const body = `${eventId}.${hours.get(eventId)?.pinTag || ''}.${now() + SPOTTER_TOKEN_MS}`;
    return `${Buffer.from(body).toString('base64url')}.${hmac(body)}`;
  }

  function checkToken(eventId, token) {
    if (typeof token !== 'string' || token.length > 512) return false;
    const [encoded, mac] = token.split('.');
    if (!encoded || !mac) return false;
    const body = Buffer.from(encoded, 'base64url').toString();
    const expected = Buffer.from(hmac(body));
    const given = Buffer.from(mac);
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return false;
    const [id, pinTag, expiry] = body.split('.');
    return id === eventId && pinTag === (hours.get(eventId)?.pinTag || '') && Number(expiry) > now();
  }

  function recent(map, key) {
    const times = (map.get(key) || []).filter((at) => now() - at < PIN_WINDOW_MS);
    if (times.length) map.set(key, times);
    else map.delete(key);
    return times;
  }

  function view(entry) {
    return { ...entry.engine.spotterView(), connected: entry.sockets.size };
  }

  /** `POST /spot/session`: the PIN, once, for a token good for the night. */
  async function spotterLogin(eventId, pin, address) {
    const entry = await loadEvent(eventId);
    if (!entry) return { status: 404, message: SPOTTER_CLOSED };
    const key = `${eventId} ${address}`;
    if (recent(pinFailures, key).length >= PIN_FAILURES) {
      return { status: 429, message: 'too many wrong PINs from here. wait ten minutes.' };
    }
    if (recent(eventPinFailures, eventId).length >= PIN_FAILURES_PER_EVENT) {
      return { status: 429, message: 'too many wrong PINs tonight. ask an admin to unlock the spotter.' };
    }
    if (typeof pin === 'string' && PIN.test(pin) && await store.verifyLivePin(await db(), eventId, pin)) {
      pinFailures.delete(key);
      return { status: 200, token: signToken(eventId), view: view(entry) };
    }
    if (pinFailures.size < MAX_TRACKED_ADDRESSES) pinFailures.set(key, [...recent(pinFailures, key), now()]);
    eventPinFailures.set(eventId, [...recent(eventPinFailures, eventId), now()]);
    return { status: 401, message: 'wrong PIN' };
  }

  async function spotterState(eventId, token) {
    const entry = await loadEvent(eventId);
    if (!entry) return { status: 404, message: SPOTTER_CLOSED };
    if (!checkToken(eventId, token)) return { status: 401, message: 'enter the PIN again' };
    return { status: 200, view: view(entry) };
  }

  async function spotterCommand(eventId, token, body) {
    const entry = await loadEvent(eventId);
    if (!entry) return { status: 404, message: SPOTTER_CLOSED };
    if (!checkToken(eventId, token)) return { status: 401, message: 'enter the PIN again' };

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

  /**
   * After an admin save: the hours and PIN are read again, a night that's
   * now closed hangs up, and phones in an open one see the new card at once.
   */
  async function refreshEvent(eventId, { definition } = {}) {
    await readHours({ fresh: true });
    const loading = events.get(eventId);
    if (!loading) return;
    const entry = await loading.catch(() => null);
    if (!entry) {
      // A card that didn't load before may load now.
      if (events.get(eventId) === loading) events.delete(eventId);
      return;
    }
    if (!openNow(eventId)) {
      await shut(entry);
      return;
    }
    if (definition) {
      entry.engine.setDefinition(definition);
      broadcastSnapshots(entry);
    }
  }

  /**
   * After a reset: drop the event from memory and hang up its phones. They
   * reconnect on their own and load the night fresh from the database.
   */
  async function forget(eventId) {
    const loading = events.get(eventId);
    if (!loading) return;
    events.delete(eventId);
    const entry = await loading.catch(() => null);
    if (!entry) return;
    entry.retired = true;
    entry.dirtyFans.clear();
    for (const ws of entry.sockets.keys()) ws.close(1012, 'reset');
  }

  /** Clears every wrong-PIN lockout on a night. */
  function unlockSpotter(eventId) {
    eventPinFailures.delete(eventId);
    for (const key of pinFailures.keys()) {
      if (key.startsWith(`${eventId} `)) pinFailures.delete(key);
    }
  }

  return {
    attach,
    start,
    stop,
    tick,
    poll,
    post,
    spotterLogin,
    spotterState,
    spotterCommand,
    loadEvent,
    refreshEvent,
    forget,
    unlockSpotter,
    /** For tests: whether live snapshots are slowed. */
    isSlowed: () => slow,
  };
}

let hub = null;

/** The process's hub, shared by the HTTP routes and the socket server. */
function getLiveHub() {
  hub ??= createLiveHub();
  return hub;
}

module.exports = { createLiveHub, getLiveHub, clientAddress, liveDisabled, LIVE_LIMITS: LIMITS };
