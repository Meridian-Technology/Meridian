const { randomUUID } = require('crypto');
const sharp = require('sharp');
const getGlobalModels = require('../getGlobalModelService');
const { uploadImageToS3 } = require('../imageUploadService');
const { parseLiveEventDefinition, EVENT_ID } = require('./liveEventDefinition');
const { upsertLiveEvent } = require('./liveStore');
const { getLiveHub } = require('./liveHub');

/**
 * Pivot admin's Live page: set up a night's card, its spotter PIN and its
 * images without a terminal. Saving a card updates phones already in the
 * event; resetting clears the spotter's calls and every fan.
 */

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const IMAGE_MAX_BYTES = 12 * 1024 * 1024;
const IMAGE_MAX_SIDE = 1600;
const PIN = /^\d{4,8}$/;

const invalid = (message, extra = {}) => ({ error: message, status: 400, code: 'INVALID_LIVE_EVENT', ...extra });

function models(req) {
  return getGlobalModels(req, 'JustGoLiveEvent', 'JustGoLiveFan');
}

/** Where the night stands, in a few words, from the spotter's stored state. */
function nightStatus(definition, state) {
  if (!state) return { label: 'not started', tone: 'muted' };
  if (state.ended) return { label: 'ended', tone: 'muted' };
  const match = definition?.matches?.find((each) => each.id === state.stageMatchId);
  if (!match) return { label: 'doors', tone: 'info' };
  const labels = { upcoming: 'picks open', open: 'live', locked: 'paused', settled: 'called' };
  return {
    label: `${match.title} · ${labels[state.status] || state.status}`,
    tone: state.status === 'open' || state.status === 'upcoming' ? 'ok' : 'info',
  };
}

async function fanCounts(req, eventIds) {
  const { JustGoLiveFan } = models(req);
  const rows = await JustGoLiveFan.aggregate([
    { $match: { eventId: { $in: eventIds } } },
    { $group: { _id: '$eventId', fans: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [row._id, row.fans]));
}

function summarize(event, fans) {
  return {
    eventId: event.eventId,
    title: event.definition?.title || event.eventId,
    matches: event.definition?.matches?.length || 0,
    hasPin: Boolean(event.spotterPin?.hash),
    fans: fans ?? 0,
    status: nightStatus(event.definition, event.state),
    updatedAt: event.updatedAt,
  };
}

async function listLiveEvents(req) {
  const { JustGoLiveEvent } = models(req);
  const events = await JustGoLiveEvent.find({})
    .select('+spotterPin eventId definition state updatedAt')
    .sort({ updatedAt: -1 })
    .limit(100)
    .lean();
  const counts = await fanCounts(req, events.map((event) => event.eventId));
  return { data: { events: events.map((event) => summarize(event, counts.get(event.eventId))) } };
}

async function getLiveEvent(req, eventId) {
  const { JustGoLiveEvent } = models(req);
  const event = await JustGoLiveEvent.findOne({ eventId }).select('+spotterPin').lean();
  if (!event) return { error: 'No such event.', status: 404, code: 'LIVE_EVENT_NOT_FOUND' };
  const counts = await fanCounts(req, [eventId]);
  return { data: { event: { ...summarize(event, counts.get(eventId)), definition: event.definition } } };
}

/**
 * Creates or updates a card. `create: true` refuses an id that's taken, so
 * a new event can't overwrite a night by accident. A PIN is required the
 * first time.
 */
async function saveLiveEvent(req, eventId, body = {}) {
  if (!EVENT_ID.test(eventId || '')) return invalid('Event ids are letters, numbers, - and _ (64 at most).');
  const parsed = parseLiveEventDefinition({ ...(body.definition || {}), eventId });
  if (parsed.errors) return invalid('The card has problems.', { errors: parsed.errors });
  const pin = typeof body.pin === 'string' && body.pin.trim() ? body.pin.trim() : undefined;
  if (pin !== undefined && !PIN.test(pin)) return invalid('The PIN must be 4 to 8 digits.');

  const { JustGoLiveEvent } = models(req);
  const existing = await JustGoLiveEvent.findOne({ eventId }).select('+spotterPin').lean();
  if (body.create && existing) return invalid('That event id is taken. Pick another, or open the existing event.');
  if (!existing && !pin) return invalid('Set a spotter PIN for a new event.');

  await upsertLiveEvent(req.globalDb, parsed.definition, { pin });
  getLiveHub().refreshDefinition(eventId, parsed.definition);
  return getLiveEvent(req, eventId);
}

/** Clears the spotter's calls and every fan's pick and name. Needs the id typed back. */
async function resetLiveEvent(req, eventId, body = {}) {
  if (body.confirm !== eventId) return invalid('Type the event id to confirm the reset.');
  const { JustGoLiveEvent } = models(req);
  const event = await JustGoLiveEvent.findOne({ eventId }).lean();
  if (!event) return { error: 'No such event.', status: 404, code: 'LIVE_EVENT_NOT_FOUND' };
  await upsertLiveEvent(req.globalDb, event.definition, { reset: true });
  await getLiveHub().forget(eventId);
  return getLiveEvent(req, eventId);
}

/**
 * A photo for a card: fighters, the opening screen. Cut-outs keep their
 * transparency (PNG); everything else becomes a JPEG.
 */
async function uploadLiveImage(req, eventId, file) {
  if (!EVENT_ID.test(eventId || '')) return invalid('Save the event before adding photos.');
  if (!file || !IMAGE_TYPES.has(file.mimetype)) return invalid('Choose a JPEG, PNG or WebP image.');
  if (file.size > IMAGE_MAX_BYTES) return invalid('Images must be 12 MB or smaller.');
  let buffer;
  let ext;
  try {
    const image = sharp(file.buffer, { limitInputPixels: 60_000_000, animated: false }).rotate();
    const { hasAlpha } = await image.metadata();
    const resized = image.resize({ width: IMAGE_MAX_SIDE, height: IMAGE_MAX_SIDE, fit: 'inside', withoutEnlargement: true });
    if (hasAlpha) {
      buffer = await resized.png({ compressionLevel: 9 }).toBuffer();
      ext = 'png';
    } else {
      buffer = await resized.jpeg({ quality: 84, mozjpeg: true }).toBuffer();
      ext = 'jpg';
    }
  } catch (_) {
    return invalid('That image could not be read.');
  }
  const url = await uploadImageToS3(
    { buffer, mimetype: ext === 'png' ? 'image/png' : 'image/jpeg', size: buffer.length, originalname: `live.${ext}` },
    `justgo-live/${eventId}`,
    `${randomUUID()}.${ext}`,
    { maxBytes: IMAGE_MAX_BYTES },
  );
  return { status: 201, data: { url, cutout: ext === 'png' } };
}

module.exports = { listLiveEvents, getLiveEvent, saveLiveEvent, resetLiveEvent, uploadLiveImage, nightStatus };
