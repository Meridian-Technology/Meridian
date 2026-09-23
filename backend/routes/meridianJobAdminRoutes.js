const express = require('express');
const { verifyToken } = require('../middlewares/verifyToken');
const { requirePlatformAdmin } = require('../middlewares/requirePlatformAdmin');
const {
  listMeridianJobRuns,
  getMeridianJobRun,
  enqueueMeridianJobAdmin,
  listEnqueueableMeridianJobHandlers,
} = require('../services/meridianJobAdminService');
const {
  listAdaptedComputeJobRuns,
  getAdaptedComputeJobRun,
} = require('../services/meridianComputeJobRunAdapter');
const { notificationRuleCatalog } = require('../utilities/meridianNotificationRules');
const {
  listMeridianNotificationDefinitions,
  getMeridianNotificationDefinition,
  createMeridianNotificationDefinition,
  updateMeridianNotificationDefinition,
  restoreDefaultMeridianNotificationSchedules,
  deleteMeridianNotificationDefinition,
  upsertMeridianNotificationOverride,
} = require('../services/meridianNotificationDefinitionService');

const router = express.Router();

function handleMeridianJobAdminError(res, error) {
  const status = error?.status || 500;
  if (status >= 500) {
    console.error('meridian job admin route failed:', error);
  }
  return res.status(status).json({
    success: false,
    message: error?.message || 'Meridian job admin error',
    code: error?.code || 'MERIDIAN_JOB_ADMIN_ERROR',
  });
}

router.get(
  '/admin/meridian/jobs/compute-runs',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const data = await listAdaptedComputeJobRuns(req, {
        tenantKey: req.query.tenantKey,
        type: req.query.type,
        status: req.query.status,
        limit: req.query.limit,
        cursor: req.query.cursor,
      });
      return res.json({ success: true, data });
    } catch (error) {
      return handleMeridianJobAdminError(res, error);
    }
  },
);

router.get(
  '/admin/meridian/jobs/compute-runs/:id',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const data = await getAdaptedComputeJobRun(req, req.params.id, {
        tenantKey: req.query.tenantKey,
      });
      return res.json({ success: true, data });
    } catch (error) {
      return handleMeridianJobAdminError(res, error);
    }
  },
);

router.get(
  '/admin/platform/tenants/:tenantKey/meridian/jobs/compute-runs',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const tenantKey = String(req.params.tenantKey || '').trim().toLowerCase();
      const data = await listAdaptedComputeJobRuns(req, {
        tenantKey,
        type: req.query.type,
        status: req.query.status,
        limit: req.query.limit,
        cursor: req.query.cursor,
      });
      return res.json({ success: true, data });
    } catch (error) {
      return handleMeridianJobAdminError(res, error);
    }
  },
);

router.get(
  '/admin/platform/tenants/:tenantKey/meridian/jobs/compute-runs/:id',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const tenantKey = String(req.params.tenantKey || '').trim().toLowerCase();
      const data = await getAdaptedComputeJobRun(req, req.params.id, { tenantKey });
      return res.json({ success: true, data });
    } catch (error) {
      return handleMeridianJobAdminError(res, error);
    }
  },
);

router.get(
  '/admin/meridian/jobs/runs',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const data = await listMeridianJobRuns(req, {
        tenantKey: req.query.tenantKey,
        type: req.query.type,
        status: req.query.status,
        from: req.query.from,
        to: req.query.to,
        limit: req.query.limit,
        cursor: req.query.cursor,
      });
      return res.json({ success: true, data });
    } catch (error) {
      return handleMeridianJobAdminError(res, error);
    }
  },
);

router.post(
  '/admin/meridian/jobs/runs/enqueue',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const data = await enqueueMeridianJobAdmin(req, {
        handlerKey: body.handlerKey,
        tenantKey: body.tenantKey,
        payload: body.payload,
        scheduledFor: body.scheduledFor,
        triggeredBy: req.user?.globalUserId || req.user?.userId || null,
      });
      return res.status(data.created ? 201 : 200).json({ success: true, data });
    } catch (error) {
      return handleMeridianJobAdminError(res, error);
    }
  },
);

router.get(
  '/admin/meridian/jobs/runs/:id',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const data = await getMeridianJobRun(req, req.params.id, {
        deliveriesLimit: req.query.deliveriesLimit || req.query.limit,
        deliveriesCursor: req.query.deliveriesCursor || req.query.cursor,
        deliveryStatus: req.query.deliveryStatus,
      });
      return res.json({ success: true, data });
    } catch (error) {
      return handleMeridianJobAdminError(res, error);
    }
  },
);

router.get(
  '/admin/platform/tenants/:tenantKey/meridian/jobs/runs',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const tenantKey = String(req.params.tenantKey || '').trim().toLowerCase();
      const data = await listMeridianJobRuns(req, {
        tenantKey,
        type: req.query.type,
        status: req.query.status,
        from: req.query.from,
        to: req.query.to,
        limit: req.query.limit,
        cursor: req.query.cursor,
      });
      return res.json({ success: true, data });
    } catch (error) {
      return handleMeridianJobAdminError(res, error);
    }
  },
);

router.get(
  '/admin/platform/tenants/:tenantKey/meridian/jobs/runs/:id',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const tenantKey = String(req.params.tenantKey || '').trim().toLowerCase();
      const data = await getMeridianJobRun(req, req.params.id, {
        tenantKey,
        deliveriesLimit: req.query.deliveriesLimit || req.query.limit,
        deliveriesCursor: req.query.deliveriesCursor || req.query.cursor,
        deliveryStatus: req.query.deliveryStatus,
      });
      return res.json({ success: true, data });
    } catch (error) {
      return handleMeridianJobAdminError(res, error);
    }
  },
);

router.get(
  '/admin/meridian/jobs/handlers',
  verifyToken,
  requirePlatformAdmin,
  async (_req, res) => {
    try {
      const data = listEnqueueableMeridianJobHandlers();
      return res.json({ success: true, data });
    } catch (error) {
      return handleMeridianJobAdminError(res, error);
    }
  },
);

router.get(
  '/admin/meridian/jobs/notification-rule-catalog',
  verifyToken,
  requirePlatformAdmin,
  (req, res) => {
    const handlerKey = String(req.query.handlerKey || '').trim();
    return res.json({ success: true, data: notificationRuleCatalog(handlerKey) });
  },
);

router.get(
  '/admin/meridian/jobs/definitions',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const data = await listMeridianNotificationDefinitions(req, {
        tenantKey: req.query.tenantKey,
        includeDisabled: req.query.includeDisabled !== 'false',
      });
      return res.json({ success: true, data });
    } catch (error) {
      return handleMeridianJobAdminError(res, error);
    }
  },
);

router.post(
  '/admin/meridian/jobs/definitions/restore-defaults',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const data = await restoreDefaultMeridianNotificationSchedules(req);
      return res.json({ success: true, data });
    } catch (error) {
      return handleMeridianJobAdminError(res, error);
    }
  },
);

router.post(
  '/admin/meridian/jobs/definitions',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const data = await createMeridianNotificationDefinition(req, body);
      return res.status(201).json({ success: true, data });
    } catch (error) {
      return handleMeridianJobAdminError(res, error);
    }
  },
);

router.get(
  '/admin/meridian/jobs/definitions/:id',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const data = await getMeridianNotificationDefinition(req, req.params.id, {
        tenantKey: req.query.tenantKey,
      });
      return res.json({ success: true, data });
    } catch (error) {
      return handleMeridianJobAdminError(res, error);
    }
  },
);

router.patch(
  '/admin/meridian/jobs/definitions/:id',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const data = await updateMeridianNotificationDefinition(req, req.params.id, body);
      return res.json({ success: true, data });
    } catch (error) {
      return handleMeridianJobAdminError(res, error);
    }
  },
);

router.delete(
  '/admin/meridian/jobs/definitions/:id',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const data = await deleteMeridianNotificationDefinition(req, req.params.id);
      return res.json({ success: true, data });
    } catch (error) {
      return handleMeridianJobAdminError(res, error);
    }
  },
);

router.get(
  '/admin/platform/tenants/:tenantKey/meridian/jobs/definitions',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const tenantKey = String(req.params.tenantKey || '').trim().toLowerCase();
      const data = await listMeridianNotificationDefinitions(req, {
        tenantKey,
        includeDisabled: req.query.includeDisabled !== 'false',
      });
      return res.json({ success: true, data });
    } catch (error) {
      return handleMeridianJobAdminError(res, error);
    }
  },
);

router.put(
  '/admin/platform/tenants/:tenantKey/meridian/jobs/definitions/:definitionKey/override',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const tenantKey = String(req.params.tenantKey || '').trim().toLowerCase();
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const data = await upsertMeridianNotificationOverride(
        req,
        tenantKey,
        req.params.definitionKey,
        body.patch === null ? null : body,
      );
      return res.json({ success: true, data });
    } catch (error) {
      return handleMeridianJobAdminError(res, error);
    }
  },
);

module.exports = router;
