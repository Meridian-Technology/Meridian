const { createHash } = require('crypto');
const getGlobalModels = require('./getGlobalModelService');
const { COVER_FAMILIES, EVENT_PRESETS, BACK_PRESETS, generateCoverSlide,
  generateEventSlide, generateBackSlide, walkElements } = require('./pivotCarouselPresets');

const refKey = ref => `${ref.sourceTenantKey}:${ref.eventId}`;
const composeIssueId = jobId => createHash('sha256').update(`carousel-compose:${jobId}`).digest('hex').slice(0, 24);
function invalid(message, code = 'COMPOSE_INVALID') {
  const error = new Error(message); error.code = code; error.status = 422; throw error;
}
function safeUnsplashAsset(asset) {
  if (asset?.provider !== 'unsplash' || !/^[\w-]{1,100}$/.test(asset.photoId || '')) return null;
  try {
    const src = new URL(asset.src);
    if (src.protocol !== 'https:' || src.hostname !== 'images.unsplash.com' || src.username || src.password) return null;
  } catch { return null; }
  // Explicit fields keep account storage keys and arbitrary document data out of the prompt.
  return { id: `unsplash:${asset.photoId}`, provider: 'unsplash', photoId: asset.photoId,
    src: asset.src, alt: String(asset.alt || '').slice(0, 255),
    credit: String(asset.credit || '').slice(0, 1000),
    photographer: String(asset.photographer || '').slice(0, 255),
    photographerUrl: String(asset.photographerUrl || '').slice(0, 2048),
    sourceUrl: String(asset.sourceUrl || '').slice(0, 2048) };
}

/** Saved, account-scoped stock photographs only. No Unsplash search or HTTP request. */
async function listComposeCoverAssets(req, accountId) {
  const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');
  const rows = await PivotCarouselDeck.find({ accountId, document: { $ne: null } })
    .sort({ updatedAt: -1, _id: -1 }).limit(50).select('document').lean();
  const assets = new Map();
  const add = value => { const asset = safeUnsplashAsset(value); if (asset && !assets.has(asset.id)) assets.set(asset.id, asset); };
  for (const row of rows) {
    for (const slide of row.document?.slides || []) {
      add(slide.background?.asset);
      walkElements(slide.elements, element => add(element.asset));
    }
  }
  return [...assets.values()].slice(0, 24);
}

/** Build the editable document with exactly the browser's versioned preset generators. */
function buildCompositionDocument(composition, context, currentCandidates = context.candidates) {
  const known = new Map(context.candidates.map(row => [refKey(row.ref), row]));
  const current = new Map(currentCandidates.map(row => [refKey(row.ref), row]));
  const refs = composition.selectedEventRefs;
  if (refs.length < 3 || refs.length > 5 || new Set(refs.map(refKey)).size !== refs.length) invalid('An issue needs three to five distinct events.');
  function eventFor(ref) {
    const key = refKey(ref); const candidate = current.get(key);
    if (!known.has(key) || !candidate) invalid('An event is unknown, outside the window, or no longer eligible.', 'COMPOSE_EVENT_INELIGIBLE');
    const start = new Date(candidate.snapshot.startTime).getTime();
    if (!context.account.sourceTenantKeys.includes(ref.sourceTenantKey) || !Number.isFinite(start)
      || start < Date.parse(context.window.from)
      || (context.window.toExclusive ? start >= Date.parse(context.window.to) : start > Date.parse(context.window.to))) {
      invalid('An event is outside the account scope or publication window.', 'COMPOSE_EVENT_INELIGIBLE');
    }
    if (known.get(key).recordVersion !== candidate.recordVersion) invalid('An event changed after the agent read it.', 'COMPOSE_EVENT_CHANGED');
    if (!candidate.snapshot.image) invalid('Event slides require the event poster.', 'COMPOSE_POSTER_MISSING');
    return candidate;
  }
  const selected = refs.map(eventFor);
  if (!COVER_FAMILIES.includes(composition.cover.family) || ![1, 2, 3].includes(composition.cover.variation)
    || composition.eventSlides.some(slide => !EVENT_PRESETS.includes(slide.presetId))
    || (composition.optionalClosingSlide && !BACK_PRESETS.includes(composition.optionalClosingSlide.presetId))) {
    invalid('A selected carousel preset does not exist.', 'COMPOSE_PRESET_INVALID');
  }
  const lastCover = context.lastPostedIssues[0]?.cover;
  if (lastCover?.family === composition.cover.family && lastCover.variation === composition.cover.variation
    && (!composition.cover.repeatReason?.trim() || /[\r\n]/.test(composition.cover.repeatReason))) invalid('A repeated cover family and variation needs a one-line reason.', 'COMPOSE_COVER_REPEAT_REASON_REQUIRED');
  let coverImage;
  const coverRef = composition.cover.assetRef;
  if (coverRef.kind === 'event-poster') {
    const candidate = eventFor(coverRef.eventRef);
    coverImage = { src: candidate.snapshot.image, alt: candidate.snapshot.name };
  } else if (coverRef.kind === 'unsplash') {
    coverImage = safeUnsplashAsset((context.coverAssets || []).find(asset => asset.id === coverRef.assetId));
    if (!coverImage) invalid('The Unsplash photo is not in this account catalog.', 'COMPOSE_ASSET_UNKNOWN');
  } else invalid('Cover images must be event posters or catalog Unsplash photos.', 'COMPOSE_ASSET_UNKNOWN');
  const cover = generateCoverSlide({ theme: composition.cover.headline, coverPreset: composition.cover.family,
    variation: composition.cover.variation, coverImage,
    copy: { caption: composition.cover.subtitle, location: context.account.format === 'city-picks' ? selected[0].snapshot.city?.name || '' : '' } });
  walkElements(cover.elements, element => { if (element.kind === 'image') element.crop = { ...composition.cover.crop }; });
  const slides = [cover];
  const usedSlides = new Set();
  for (const proposed of composition.eventSlides) {
    const key = refKey(proposed.eventRef);
    if (!refs.some(ref => refKey(ref) === key) || usedSlides.has(key)
      || proposed.assetRef.kind !== 'event-poster' || refKey(proposed.assetRef.eventRef) !== key) invalid('Each selected event needs exactly one slide with its own poster.');
    usedSlides.add(key);
    const candidate = eventFor(proposed.eventRef);
    slides.push(generateEventSlide({ ref: candidate.ref, snapshot: { ...candidate.snapshot, crop: proposed.crop }, blurb: proposed.blurb },
      proposed.presetId, { format: context.account.format }));
  }
  if (usedSlides.size !== refs.length) invalid('Each selected event needs exactly one slide.');
  if (!composition.socialCaption?.trim() || composition.socialCaption.length > 2200) invalid('A social caption is required.');
  if (composition.optionalClosingSlide) {
    const { presetId, ...copy } = composition.optionalClosingSlide;
    slides.push(generateBackSlide(presetId, { kicker: '', sub: '', url: '', end: '', ...copy }));
  }
  return { schemaVersion: 2, presetVersion: 2, width: 1080, height: 1350, slides };
}

module.exports = { composeIssueId, safeUnsplashAsset, listComposeCoverAssets, buildCompositionDocument, refKey };
