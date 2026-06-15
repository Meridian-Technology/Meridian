const express = require('express');
const { validateReferralCode, redeemReferralCode } = require('../services/pivotReferralCodeService');
const {
  pivotReferralValidateRateLimit,
} = require('../middlewares/pivotReferralValidateRateLimit');

const { verifyToken } = require('../middlewares/verifyToken');

const router = express.Router();

router.post('/referral/validate', pivotReferralValidateRateLimit, async (req, res) => {
  try {
    const result = await validateReferralCode(req, req.body?.code);
    if (result.error) {
      return res.status(result.status || 400).json({
        success: false,
        message: result.error,
        code: result.code,
      });
    }

    return res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    console.error('POST /pivot/referral/validate failed:', err);
    return res.status(500).json({
      success: false,
      message: 'Unable to validate referral code.',
    });
  }
});

router.post('/referral/redeem', verifyToken, async (req, res) => {
  try {
    const result = await redeemReferralCode(req, req.body?.code);
    if (result.error) {
      return res.status(result.status || 400).json({
        success: false,
        message: result.error,
        code: result.code,
      });
    }

    return res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    console.error('POST /pivot/referral/redeem failed:', err);
    return res.status(500).json({
      success: false,
      message: 'Unable to redeem referral code.',
    });
  }
});

module.exports = router;
