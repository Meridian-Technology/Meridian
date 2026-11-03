const express = require('express');
const { verifyToken } = require('../middlewares/verifyToken');
const { requirePlatformAdmin } = require('../middlewares/requirePlatformAdmin');
const { createCampaign, issueCampaignInvite } = require('../services/justGoCampaignService');

const router = express.Router();
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.use(verifyToken, requirePlatformAdmin);

function handle(service) {
  return async (req, res) => {
    try {
      const result = await service(req);
      if (result.error) return res.status(result.status || 400).json({ success: false, message: result.error, code: result.code });
      return res.status(201).json({ success: true, data: result.data });
    } catch (error) {
      console.error('[campaign-admin] request failed', { name: error.name, code: error.code });
      return res.status(503).json({ success: false, message: 'Unable to provision campaign admission.', code: 'CAMPAIGN_SERVICE_UNAVAILABLE' });
    }
  };
}

router.post('/', handle(req => createCampaign(req, req.body)));
router.post('/:campaignId/invites', handle(req => issueCampaignInvite(req, req.params.campaignId, req.body)));

module.exports = router;
