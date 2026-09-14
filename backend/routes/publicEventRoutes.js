const crypto = require('crypto');
const express = require('express');
const {
  isCanonicalPublicEventId,
} = require('../events/contracts/publicEventResolutionPolicy');
const { loadPublicEvent } = require('../services/publicEventEndpointService');
const { getPublicEventLanguage } = require('../services/publicEventLanguageService');
const {
  renderJustGoPublicEventShareImage,
} = require('../services/justGoPublicEventShareImageService');
const { publicEventRateLimit } = require('../middlewares/publicEventRateLimit');

const router = express.Router();
const UNAVAILABLE = Object.freeze({
  contractVersion: '1',
  error: { code: 'EVENT_UNAVAILABLE' },
});

function responseEtag(body) {
  const digest = crypto.createHash('sha256').update(JSON.stringify(body)).digest('base64url');
  return `"${digest}"`;
}

async function getPublicEvent(req, res) {
  const eventId = req.params.eventId;
  if (!isCanonicalPublicEventId(eventId)) {
    res.set('Cache-Control', 'no-store');
    return res.status(404).json(UNAVAILABLE);
  }

  try {
    const result = await loadPublicEvent(req, eventId);
    res.set('X-Public-Event-Cache', result.cacheStatus);
    if (!result.available) {
      res.set('Cache-Control', 'no-store');
      return res.status(404).json(UNAVAILABLE);
    }

    const etag = responseEtag(result.body);
    res.set('ETag', etag);
    res.set('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=30');
    res.set('Vary', 'Accept-Encoding');
    if (req.headers['if-none-match'] === etag) return res.status(304).end();
    return res.status(200).json(result.body);
  } catch (error) {
    console.error('[public-event] route failed', { errorName: error?.name || 'Error' });
    res.set('Cache-Control', 'no-store');
    return res.status(503).json({
      contractVersion: '1',
      error: { code: 'SERVICE_UNAVAILABLE' },
    });
  }
}

function openGraphImageEtag(buffer) {
  const digest = crypto.createHash('sha256').update(buffer).digest('base64url');
  return `"${digest}"`;
}

async function getPublicEventOpenGraphImage(req, res) {
  const eventId = req.params.eventId;
  if (!isCanonicalPublicEventId(eventId)) {
    res.set('Cache-Control', 'no-store');
    return res.status(404).end();
  }

  try {
    const result = await loadPublicEvent(req, eventId);
    res.set('X-Public-Event-Cache', result.cacheStatus);
    if (!result.available) {
      res.set('Cache-Control', 'no-store');
      return res.status(404).end();
    }

    const rendered = await renderJustGoPublicEventShareImage(result.body.data);
    if (rendered.error || !rendered.buffer) {
      console.error('[public-event] opengraph render failed', {
        error: rendered.error || 'missing buffer',
      });
      res.set('Cache-Control', 'no-store');
      return res.status(503).end();
    }

    const etag = openGraphImageEtag(rendered.buffer);
    res.set('Content-Type', 'image/png');
    res.set('ETag', etag);
    res.set('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=30');
    res.set('Vary', 'Accept-Encoding');
    if (req.headers['if-none-match'] === etag) return res.status(304).end();
    return res.status(200).send(rendered.buffer);
  } catch (error) {
    console.error('[public-event] opengraph route failed', { errorName: error?.name || 'Error' });
    res.set('Cache-Control', 'no-store');
    return res.status(503).end();
  }
}

async function getPublicEventLanguageRoute(req, res) {
  const eventId = req.params.eventId;
  if (!isCanonicalPublicEventId(eventId)) {
    res.set('Cache-Control', 'no-store');
    return res.status(404).json(UNAVAILABLE);
  }
  try {
    const body = await getPublicEventLanguage(req, eventId);
    const etag = responseEtag(body);
    res.set('ETag', etag);
    res.set('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=30');
    res.set('Vary', 'Accept-Encoding');
    if (req.headers['if-none-match'] === etag) return res.status(304).end();
    return res.status(200).json(body);
  } catch (error) {
    console.error('[public-event] language route failed', { errorName: error?.name || 'Error' });
    res.set('Cache-Control', 'no-store');
    return res.status(503).json({
      contractVersion: '1', error: { code: 'SERVICE_UNAVAILABLE' },
    });
  }
}

router.get(
  '/api/public/events/:eventId/opengraph.png',
  publicEventRateLimit,
  getPublicEventOpenGraphImage,
);
router.get('/api/public/events/:eventId', publicEventRateLimit, getPublicEvent);
router.get(
  '/api/public/events/:eventId/language',
  publicEventRateLimit,
  getPublicEventLanguageRoute,
);

module.exports = router;
module.exports.getPublicEvent = getPublicEvent;
module.exports.getPublicEventOpenGraphImage = getPublicEventOpenGraphImage;
module.exports.getPublicEventLanguageRoute = getPublicEventLanguageRoute;
module.exports.responseEtag = responseEtag;
module.exports.openGraphImageEtag = openGraphImageEtag;
module.exports.UNAVAILABLE = UNAVAILABLE;
