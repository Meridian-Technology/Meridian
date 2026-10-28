const express = require('express');
const { verifyToken } = require('../middlewares/verifyToken');
const { requirePlatformAdmin } = require('../middlewares/requirePlatformAdmin');
const {
  listTags,
  createTag,
  rotateTagCode,
  eraseTag,
  markTagWritten,
  setTagStatus,
} = require('../services/justGoTagService');

// Mounted at /admin/pivot/tenants/:tenantKey/tags: every tag belongs to a city.
const router = express.Router({ mergeParams: true });
// Responses can carry a freshly issued tag code.
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.use(verifyToken, requirePlatformAdmin);

function handle(service) {
  return async (req, res) => {
    try {
      const result = await service(req);
      if (result.error) return res.status(result.status || 400).json({ success: false, message: result.error, code: result.code });
      return res.status(result.status || 200).json({ success: true, data: result.data });
    } catch (error) {
      console.error('[tag-admin] request failed', { name: error.name, code: error.code });
      return res.status(503).json({ success: false, message: 'Tag service temporarily unavailable. Please retry.', code: 'TAG_SERVICE_UNAVAILABLE' });
    }
  };
}

router.get('/', handle(req => listTags(req, req.params.tenantKey)));
router.post('/', handle(req => createTag(req, req.params.tenantKey, req.body)));
router.post('/erase', handle(req => eraseTag(req, req.params.tenantKey, req.body)));
router.post('/:tagId/code', handle(req => rotateTagCode(req, req.params.tenantKey, req.params.tagId)));
router.post('/:tagId/written', handle(req => markTagWritten(req, req.params.tenantKey, req.params.tagId)));
router.post('/:tagId/status', handle(req => setTagStatus(req, req.params.tenantKey, req.params.tagId, req.body)));

module.exports = router;
