const express = require('express');
const multer = require('multer');
const { verifyToken } = require('../middlewares/verifyToken');
const { requirePlatformAdmin } = require('../middlewares/requirePlatformAdmin');
const {
  listLiveEvents,
  getLiveEvent,
  saveLiveEvent,
  resetLiveEvent,
  closeLiveEvent,
  unlockLiveSpotter,
  uploadLiveImage,
} = require('../services/justGoLive/liveAdminService');

// Mounted at /admin/pivot/live-events: Just Go Live nights aren't tied to a city.
const router = express.Router();
router.use(verifyToken, requirePlatformAdmin);

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
}).single('image');

function receiveImage(req, res, next) {
  imageUpload(req, res, (error) => {
    if (!error) return next();
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'Images must be 12 MB or smaller.'
      : 'That upload could not be read.';
    return res.status(400).json({ success: false, message, code: 'INVALID_LIVE_EVENT' });
  });
}

function handle(service) {
  return async (req, res) => {
    try {
      const result = await service(req);
      if (result.error) {
        return res.status(result.status || 400).json({
          success: false,
          message: result.error,
          code: result.code,
          errors: result.errors,
        });
      }
      return res.status(result.status || 200).json({ success: true, data: result.data });
    } catch (error) {
      console.error('[live-admin] request failed', { name: error.name, code: error.code, message: error.message });
      return res.status(503).json({ success: false, message: 'Live events are temporarily unavailable. Please retry.', code: 'LIVE_ADMIN_UNAVAILABLE' });
    }
  };
}

router.get('/', handle((req) => listLiveEvents(req)));
router.get('/:eventId', handle((req) => getLiveEvent(req, req.params.eventId)));
router.put('/:eventId', handle((req) => saveLiveEvent(req, req.params.eventId, req.body)));
router.post('/:eventId/reset', handle((req) => resetLiveEvent(req, req.params.eventId, req.body)));
router.post('/:eventId/close', handle((req) => closeLiveEvent(req, req.params.eventId)));
router.post('/:eventId/unlock-spotter', handle((req) => unlockLiveSpotter(req, req.params.eventId)));
router.post('/:eventId/image', receiveImage, handle((req) => uploadLiveImage(req, req.params.eventId, req.file)));

module.exports = router;
