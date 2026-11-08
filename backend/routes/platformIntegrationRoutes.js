/**
 * Platform Admin → Integrations. Access tokens for grokbot's connector and
 * grokbot's webhook settings. Reads need a platform admin; every change also
 * needs an MFA-verified session.
 */
const express = require('express');
const { verifyToken } = require('../middlewares/verifyToken');
const { requirePlatformAdmin } = require('../middlewares/requirePlatformAdmin');
const { requireAdminMfaVerified } = require('../middlewares/requireAdminMfaVerified');
const {
  mintPlatformAccessToken,
  listPlatformAccessTokens,
  revokePlatformAccessToken,
} = require('../services/platformAccessTokenService');
const {
  getGrokbotSettings,
  updateGrokbotSettings,
  mcpServerUrl,
} = require('../services/grokbotIntegrationService');
const { sendTestNotice } = require('../services/pivotCarouselGrokbotNotifyService');

const router = express.Router();
const adminChange = [verifyToken, requirePlatformAdmin, requireAdminMfaVerified];

function sendResult(res, result, successStatus = 200) {
  if (result.error) {
    return res.status(result.status || 400).json({
      success: false,
      message: result.error,
      code: result.code,
    });
  }
  return res.status(successStatus).json({ success: true, data: result.data });
}

router.get('/admin/platform/access-tokens', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    return sendResult(res, await listPlatformAccessTokens(req));
  } catch (err) {
    console.error('GET /admin/platform/access-tokens failed:', err);
    return res.status(500).json({ success: false, message: 'Could not list access tokens.' });
  }
});

// Always mints for the signed-in admin; the body cannot name another owner.
router.post('/admin/platform/access-tokens', ...adminChange, async (req, res) => {
  try {
    const result = await mintPlatformAccessToken(req, {
      globalUserId: req.user.globalUserId,
      label: req.body?.label,
      createdBy: req.user.globalUserId,
    });
    return sendResult(res, result, 201);
  } catch (err) {
    console.error('POST /admin/platform/access-tokens failed:', err);
    return res.status(500).json({ success: false, message: 'Could not create an access token.' });
  }
});

router.post('/admin/platform/access-tokens/:id/revoke', ...adminChange, async (req, res) => {
  try {
    const result = await revokePlatformAccessToken(req, req.params.id, {
      actor: { globalUserId: req.user.globalUserId },
    });
    return sendResult(res, result);
  } catch (err) {
    console.error('POST /admin/platform/access-tokens/:id/revoke failed:', err);
    return res.status(500).json({ success: false, message: 'Could not revoke the access token.' });
  }
});

function withServerUrl(req, result) {
  if (result.error) return result;
  return { data: { ...result.data, mcpServerUrl: mcpServerUrl(req) } };
}

router.get('/admin/platform/integrations/grokbot', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    return sendResult(res, withServerUrl(req, await getGrokbotSettings(req)));
  } catch (err) {
    console.error('GET /admin/platform/integrations/grokbot failed:', err);
    return res.status(500).json({ success: false, message: 'Could not load grokbot settings.' });
  }
});

router.put('/admin/platform/integrations/grokbot', ...adminChange, async (req, res) => {
  try {
    const result = await updateGrokbotSettings(req, req.body, { actorId: req.user.globalUserId });
    return sendResult(res, withServerUrl(req, result));
  } catch (err) {
    console.error('PUT /admin/platform/integrations/grokbot failed:', err);
    return res.status(500).json({ success: false, message: 'Could not save grokbot settings.' });
  }
});

router.post('/admin/platform/integrations/grokbot/test', ...adminChange, async (req, res) => {
  try {
    return sendResult(res, await sendTestNotice(req));
  } catch (err) {
    console.error('POST /admin/platform/integrations/grokbot/test failed:', err);
    return res.status(500).json({ success: false, message: 'Could not send the test notice.' });
  }
});

module.exports = router;
