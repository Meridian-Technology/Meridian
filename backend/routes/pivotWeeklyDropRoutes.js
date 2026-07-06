const express = require('express');
const { verifyToken } = require('../middlewares/verifyToken');
const { requirePlatformAdmin } = require('../middlewares/requirePlatformAdmin');
const {
  getWeeklyDropStatus,
  updateWeeklyDropConfig,
  sendWeeklyDropPush,
} = require('../services/pivotWeeklyDropService');

const router = express.Router();

router.get(
  '/admin/platform/tenants/:tenantKey/pivot-weekly-drop',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const tenantKey = String(req.params.tenantKey || '').trim().toLowerCase();
      const batchWeek = req.query.batchWeek ? String(req.query.batchWeek).trim().toUpperCase() : undefined;
      const result = await getWeeklyDropStatus(req, tenantKey, batchWeek);
      if (result.error) {
        return res.status(result.status || 400).json({ success: false, message: result.error });
      }
      res.json({ success: true, data: result });
    } catch (err) {
      console.error('GET pivot-weekly-drop failed:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

router.put(
  '/admin/platform/tenants/:tenantKey/pivot-weekly-drop',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const tenantKey = String(req.params.tenantKey || '').trim().toLowerCase();
      const updatedBy = req.user.globalUserId || req.user.userId || null;
      const result = await updateWeeklyDropConfig(req, tenantKey, req.body, updatedBy);
      if (result.error) {
        return res.status(result.status || 400).json({ success: false, message: result.error });
      }
      res.json({ success: true, data: result });
    } catch (err) {
      console.error('PUT pivot-weekly-drop failed:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

router.post(
  '/admin/platform/tenants/:tenantKey/pivot-weekly-drop/send',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const tenantKey = String(req.params.tenantKey || '').trim().toLowerCase();
      const result = await sendWeeklyDropPush(req, tenantKey, {
        batchWeek: req.body?.batchWeek,
        dryRun: req.body?.dryRun === true,
        force: req.body?.force === true,
      });
      if (result.error) {
        return res.status(result.status || 400).json({
          success: false,
          message: result.error,
          code: result.code,
          data: result.data,
        });
      }
      res.json({ success: true, data: result });
    } catch (err) {
      console.error('POST pivot-weekly-drop/send failed:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

module.exports = router;
