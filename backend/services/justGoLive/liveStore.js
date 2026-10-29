const crypto = require('crypto');
const { promisify } = require('util');
const getGlobalModels = require('../getGlobalModelService');
const { parseLiveEventDefinition } = require('./liveEventDefinition');

/**
 * Where a Just Go Live night survives a restart: the card and the spotter's
 * state on the event, and each fan's name and picks. The dyno restarts at
 * least daily, so everything that scores is written; cheers aren't.
 */

const scrypt = promisify(crypto.scrypt);
/** Fans leave the database this long after their last save. */
const FAN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function models(globalDb) {
  return getGlobalModels({ globalDb }, 'JustGoLiveEvent', 'JustGoLiveFan');
}

/**
 * The event and its fans (the first `maxFans` to join), or null when
 * there's no such night.
 */
async function loadLiveEvent(globalDb, eventId, { maxFans = 500 } = {}) {
  const { JustGoLiveEvent, JustGoLiveFan } = models(globalDb);
  const event = await JustGoLiveEvent.findOne({ eventId }).lean();
  if (!event) return null;
  const parsed = parseLiveEventDefinition(event.definition);
  if (parsed.errors) {
    console.error('[live] stored card is invalid', { eventId, errors: parsed.errors });
    return null;
  }
  const fans = await JustGoLiveFan.find({ eventId }).sort({ joinedAt: 1 }).limit(maxFans).lean();
  return { definition: parsed.definition, state: event.state || null, fans };
}

async function loadLiveDefinition(globalDb, eventId) {
  const { JustGoLiveEvent } = models(globalDb);
  const event = await JustGoLiveEvent.findOne({ eventId }).select('definition').lean();
  if (!event) return null;
  const parsed = parseLiveEventDefinition(event.definition);
  return parsed.errors ? null : parsed.definition;
}

/**
 * Nights that haven't closed yet: `{eventId, opensAt, closesAt, pinTag}`.
 * `pinTag` changes whenever the spotter PIN does.
 */
async function listLiveHours(globalDb, at = new Date()) {
  const { JustGoLiveEvent } = models(globalDb);
  const events = await JustGoLiveEvent.find({ closesAt: { $gt: at } })
    .select('+spotterPin eventId opensAt closesAt')
    .limit(200)
    .lean();
  return events.map((event) => ({
    eventId: event.eventId,
    opensAt: event.opensAt,
    closesAt: event.closesAt,
    pinTag: event.spotterPin?.salt ? event.spotterPin.salt.slice(0, 12) : '',
  }));
}

async function saveLiveState(globalDb, eventId, state) {
  const { JustGoLiveEvent } = models(globalDb);
  await JustGoLiveEvent.updateOne({ eventId }, { $set: { state } });
}

/** Upserts fans in one round trip. */
async function saveLiveFans(globalDb, eventId, fans) {
  if (!fans.length) return;
  const { JustGoLiveFan } = models(globalDb);
  const expireAt = new Date(Date.now() + FAN_TTL_MS);
  await JustGoLiveFan.bulkWrite(fans.map((fan) => ({
    updateOne: {
      filter: { eventId, deviceId: fan.deviceId },
      update: {
        $set: {
          name: fan.name,
          surface: fan.surface,
          source: fan.source,
          calls: fan.calls,
          expireAt,
        },
        $setOnInsert: { joinedAt: fan.joinedAt },
      },
      upsert: true,
    },
  })), { ordered: false });
}

/** Off the event loop: scrypt runs on libuv's thread pool. */
async function hashPin(pin, salt) {
  return (await scrypt(String(pin), salt, 32)).toString('hex');
}

async function verifyLivePin(globalDb, eventId, pin) {
  if (typeof pin !== 'string' || !pin) return false;
  const { JustGoLiveEvent } = models(globalDb);
  const event = await JustGoLiveEvent.findOne({ eventId }).select('+spotterPin').lean();
  const stored = event?.spotterPin;
  if (!stored?.salt || !stored?.hash) return false;
  const given = Buffer.from(await hashPin(pin.slice(0, 64), stored.salt), 'hex');
  const expected = Buffer.from(stored.hash, 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

/**
 * Creates or replaces an event's card. The spotter's state and the fans
 * stay unless `reset` is set. `pin` sets the spotter PIN; `hours`
 * (`{opensAt, closesAt}`, null to close) sets when phones can join.
 */
async function upsertLiveEvent(globalDb, definition, { pin, reset = false, hours } = {}) {
  const { JustGoLiveEvent, JustGoLiveFan } = models(globalDb);
  const set = { definition };
  if (pin) {
    const salt = crypto.randomBytes(16).toString('hex');
    set.spotterPin = { salt, hash: await hashPin(pin, salt) };
  }
  if (hours !== undefined) {
    set.opensAt = hours?.opensAt ?? null;
    set.closesAt = hours?.closesAt ?? null;
  }
  if (reset) set.state = null;
  await JustGoLiveEvent.updateOne(
    { eventId: definition.eventId },
    { $set: set },
    { upsert: true },
  );
  if (reset) await JustGoLiveFan.deleteMany({ eventId: definition.eventId });
}

module.exports = {
  loadLiveEvent,
  loadLiveDefinition,
  listLiveHours,
  saveLiveState,
  saveLiveFans,
  verifyLivePin,
  upsertLiveEvent,
};
