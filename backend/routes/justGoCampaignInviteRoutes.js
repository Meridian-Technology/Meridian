const express = require('express');
const { verifyToken } = require('../middlewares/verifyToken');
const { createLandingRateLimit } = require('../middlewares/pivotLandingDropRateLimit');
const { previewCampaignInvite, claimCampaignInvite } = require('../services/justGoCampaignService');

const router = express.Router();
const previewLimit = createLandingRateLimit({ message: 'Too many invitation previews.', code: 'CAMPAIGN_PREVIEW_RATE_LIMIT' });
const claimLimit = createLandingRateLimit({ message: 'Too many admission requests.', code: 'CAMPAIGN_CLAIM_RATE_LIMIT' });

function privateResponse(_req, res, next) {
  res.set('Cache-Control', 'no-store');
  res.set('Referrer-Policy', 'no-referrer');
  next();
}

function campaignHandler(service, successStatus = 200) {
  return async (req, res) => {
    try {
      const result = await service(req, req.params.token);
      if (result.error) return res.status(result.status || 400).json({ success: false, message: result.error, code: result.code });
      const status = result.data.existing ? 200 : successStatus;
      return res.status(status).json({ success: true, data: result.data });
    } catch (error) {
      // Error messages (e.g. duplicate-key errors) can contain bearer tokens.
      console.error('[campaign-invites] request failed', { name: error.name, code: error.code });
      return res.status(503).json({ success: false, message: 'Admission service temporarily unavailable. Please retry.', code: 'CAMPAIGN_SERVICE_UNAVAILABLE' });
    }
  };
}

router.use(privateResponse);
router.get('/:token', previewLimit, campaignHandler(previewCampaignInvite));
router.post('/:token/claim', claimLimit, verifyToken, campaignHandler(claimCampaignInvite, 201));

module.exports = router;
