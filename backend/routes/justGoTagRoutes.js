const express = require('express');
const { createLandingRateLimit } = require('../middlewares/pivotLandingDropRateLimit');
const { lookupTag } = require('../services/justGoTagService');

const router = express.Router();
const lookupLimit = createLandingRateLimit({ message: 'Too many tag lookups.', code: 'TAG_LOOKUP_RATE_LIMIT' });

/**
 * Public, no account: the App Clip looks a tapped tag up too. The code comes
 * in the body so it never lands in request-path logs.
 */
router.post('/lookup', lookupLimit, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.set('Referrer-Policy', 'no-referrer');
  try {
    const result = await lookupTag(req, req.body);
    if (result.error) return res.status(result.status || 400).json({ success: false, message: result.error, code: result.code });
    return res.json({ success: true, data: result.data });
  } catch (error) {
    console.error('[tags] lookup failed', { name: error.name, code: error.code });
    return res.status(503).json({ success: false, message: 'Tag lookup temporarily unavailable. Please retry.', code: 'TAG_SERVICE_UNAVAILABLE' });
  }
});

module.exports = router;
