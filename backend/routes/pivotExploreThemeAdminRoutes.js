const express = require('express');
const multer = require('multer');
const { verifyToken } = require('../middlewares/verifyToken');
const { requirePlatformAdmin } = require('../middlewares/requirePlatformAdmin');
const {
  listExploreThemes,
  createExploreTheme,
  updateExploreTheme,
  deleteExploreTheme,
  uploadExploreThemeImage,
  searchExploreThemeEvents,
} = require('../services/pivotExploreThemeService');

// Mounted at /admin/pivot/tenants/:tenantKey/explore-themes: every theme belongs to a city.
const router = express.Router({ mergeParams: true });
router.use(verifyToken, requirePlatformAdmin);

const IMAGE_MAX_BYTES = 12 * 1024 * 1024;
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMAGE_MAX_BYTES },
}).single('image');

function receiveImage(req, res, next) {
  imageUpload(req, res, (error) => {
    if (!error) return next();
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'Photos must be 12 MB or smaller.'
      : 'That upload could not be read.';
    return res.status(400).json({ success: false, message, code: 'INVALID_THEME_INPUT' });
  });
}

function handle(service) {
  return async (req, res) => {
    try {
      const result = await service(req);
      if (result.error) return res.status(result.status || 400).json({ success: false, message: result.error, code: result.code });
      return res.status(result.status || 200).json({ success: true, data: result.data });
    } catch (error) {
      console.error('[explore-theme-admin] request failed', { name: error.name, code: error.code, message: error.message });
      return res.status(503).json({ success: false, message: 'Explore themes are temporarily unavailable. Please retry.', code: 'THEME_SERVICE_UNAVAILABLE' });
    }
  };
}

router.get('/', handle(req => listExploreThemes(req, req.params.tenantKey)));
router.post('/', handle(req => createExploreTheme(req, req.params.tenantKey, req.body)));
router.get('/events', handle(req => searchExploreThemeEvents(req, req.params.tenantKey, req.query)));
router.post('/image', receiveImage, handle(req => uploadExploreThemeImage(req, req.params.tenantKey, req.file)));
router.patch('/:themeId', handle(req => updateExploreTheme(req, req.params.tenantKey, req.params.themeId, req.body)));
router.delete('/:themeId', handle(req => deleteExploreTheme(req, req.params.tenantKey, req.params.themeId)));

module.exports = router;
