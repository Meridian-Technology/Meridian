const crypto = require('crypto');
const getGlobalModels = require('../getGlobalModelService');
const { parseLiveEventDefinition } = require('./liveEventDefinition');

/**
 * Where a Just Go Live night survives a restart: the card and the spotter's
 * state on the event, and each fan's name and picks. The dyno restarts at
 * least daily, so everything that scores is written; cheers aren't.
 */

function models(globalDb) {
  return getGlobalModels({ globalDb }, 'JustGoLiveEvent', 'JustGoLiveFan');
}

/** The event and its fans, or null when there's no such night. */
async function loadLiveEvent(globalDb, eventId) {
  const { JustGoLiveEvent, JustGoLiveFan } = models(globalDb);
  const event = await JustGoLiveEvent.findOne({ eventId }).lean();
  if (!event) return null;
  const parsed = parseLiveEventDefinition(event.definition);
  if (parsed.errors) {
    console.error('[live] stored card is invalid', { eventId, errors: parsed.errors });
    return null;
  }
  const fans = await JustGoLiveFan.find({ eventId }).lean();
  return { definition: parsed.definition, state: event.state || null, fans };
}

async function loadLiveDefinition(globalDb, eventId) {
  const { JustGoLiveEvent } = models(globalDb);
  const event = await JustGoLiveEvent.findOne({ eventId }).select('definition').lean();
  if (!event) return null;
  const parsed = parseLiveEventDefinition(event.definition);
  return parsed.errors ? null : parsed.definition;
}

async function saveLiveState(globalDb, eventId, state) {
  const { JustGoLiveEvent } = models(globalDb);
  await JustGoLiveEvent.updateOne({ eventId }, { $set: { state } });
}

/** Upserts fans in one round trip. */
async function saveLiveFans(globalDb, eventId, fans) {
  if (!fans.length) return;
  const { JustGoLiveFan } = models(globalDb);
  await JustGoLiveFan.bulkWrite(fans.map((fan) => ({
    updateOne: {
      filter: { eventId, deviceId: fan.deviceId },
      update: {
        $set: {
          name: fan.name,
          surface: fan.surface,
          source: fan.source,
          calls: fan.calls,
        },
        $setOnInsert: { joinedAt: fan.joinedAt },
      },
      upsert: true,
    },
  })), { ordered: false });
}

function hashPin(pin, salt) {
  return crypto.scryptSync(String(pin), salt, 32).toString('hex');
}

async function verifyLivePin(globalDb, eventId, pin) {
  if (typeof pin !== 'string' || !pin) return false;
  const { JustGoLiveEvent } = models(globalDb);
  const event = await JustGoLiveEvent.findOne({ eventId }).select('+spotterPin').lean();
  const stored = event?.spotterPin;
  if (!stored?.salt || !stored?.hash) return false;
  const given = Buffer.from(hashPin(pin.slice(0, 64), stored.salt), 'hex');
  const expected = Buffer.from(stored.hash, 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

/**
 * Creates or replaces an event's card. The spotter's state and the fans
 * stay unless `reset` is set. `pin` sets the spotter PIN.
 */
async function upsertLiveEvent(globalDb, definition, { pin, reset = false } = {}) {
  const { JustGoLiveEvent, JustGoLiveFan } = models(globalDb);
  const set = { definition };
  if (pin) {
    const salt = crypto.randomBytes(16).toString('hex');
    set.spotterPin = { salt, hash: hashPin(pin, salt) };
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
  saveLiveState,
  saveLiveFans,
  verifyLivePin,
  upsertLiveEvent,
};
