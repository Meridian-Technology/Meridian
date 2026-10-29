const crypto = require('crypto');
const express = require('express');
const { getLiveHub } = require('../services/justGoLive/liveHub');
const { renderSpotterPage } = require('../services/justGoLive/spotterPage');

/**
 * Just Go Live over HTTP, mounted at /pivot/live. Phones use the socket
 * (`liveHub.attach`) and fall back to these when it fails; the spotter uses
 * these only.
 *
 * No IP rate limits here: a venue's phones often share one address. The
 * engine caps cheers per device, and the hub caps PIN attempts per event.
 */
function createJustGoLiveRouter(hub = getLiveHub()) {
  const router = express.Router();

  const failed = (res, label, error) => {
    console.error(`[live] ${label} failed`, { message: error.message });
    return res.status(503).json({ success: false, message: 'live is having a moment. try again.' });
  };

  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/:eventId/spot', (req, res) => {
    const nonce = crypto.randomBytes(16).toString('base64');
    res.set('Content-Security-Policy', [
      "default-src 'none'",
      `script-src 'nonce-${nonce}'`,
      `style-src 'nonce-${nonce}'`,
      "connect-src 'self'",
      "img-src 'self' data:",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join('; '));
    res.set('Referrer-Policy', 'no-referrer');
    res.type('html').send(renderSpotterPage(req.params.eventId, nonce));
  });

  router.get('/:eventId/spot/state', async (req, res) => {
    try {
      const result = await hub.spotterState(req.params.eventId, req.get('x-live-pin'));
      if (result.status !== 200) return res.status(result.status).json({ success: false, message: result.message });
      return res.json({ success: true, data: { view: result.view } });
    } catch (error) {
      return failed(res, 'spotter state', error);
    }
  });

  router.post('/:eventId/spot/command', async (req, res) => {
    try {
      const result = await hub.spotterCommand(req.params.eventId, req.get('x-live-pin'), req.body);
      return res.status(result.status).json({
        success: result.status === 200,
        message: result.message,
        data: result.view ? { view: result.view, saved: result.saved, undone: result.undone } : undefined,
      });
    } catch (error) {
      return failed(res, 'spotter command', error);
    }
  });

  router.get('/:eventId', async (req, res) => {
    try {
      const result = await hub.poll(req.params.eventId, {
        deviceId: typeof req.query.device === 'string' ? req.query.device : '',
        surface: req.query.surface === 'app' ? 'app' : 'clip',
      });
      if (result.status !== 200) return res.status(result.status).json({ success: false, message: result.message });
      return res.json({ success: true, data: { snapshot: result.snapshot } });
    } catch (error) {
      return failed(res, 'poll', error);
    }
  });

  router.post('/:eventId/messages', async (req, res) => {
    try {
      const result = await hub.post(req.params.eventId, req.body);
      if (!result.snapshot) return res.status(result.status).json({ success: false, message: result.message });
      return res.status(result.status).json({
        success: result.ok,
        message: result.message,
        data: { snapshot: result.snapshot },
      });
    } catch (error) {
      return failed(res, 'message', error);
    }
  });

  return router;
}

module.exports = { createJustGoLiveRouter };
