const express = require('express');
const { verifyToken } = require('../middlewares/verifyToken');
const { requirePlatformAdmin } = require('../middlewares/requirePlatformAdmin');
const {
  previewStoredComputeJob,
  previewManualComputeResult,
  applyStoredComputeJob,
} = require('../services/pivotComputeResultApplyService');
const {
  createAdminComputeJob,
  listAdminComputeJobs,
  getAdminComputeJob,
  submitManualComputeResult,
  cancelAdminComputeJob,
  retryAdminComputeJob,
  createAdminCarouselArtifactDownload,
  rejectUnknownFields,
  handleAdminServiceError,
} = require('../services/pivotComputeAdminService');
const { diagnoseComputeWorkerWake } = require('../services/pivotComputeWakeService');
const { diagnoseCarouselExportStorage } = require('../services/pivotExportArtifactStorage');

const MAX_MANUAL_RESULT_BYTES = 9 * 1024 * 1024;
const router = express.Router();

router.use(express.json({
  limit: MAX_MANUAL_RESULT_BYTES,
  strict: true,
  type: 'application/json',
}));

function actorFromRequest(req) {
  return req.user?.email || req.user?.globalUserId || null;
}

function parseBooleanQuery(value, defaultValue) {
  if (value == null || value === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes'].includes(normalized)) return true;
  if (['0', 'false', 'no'].includes(normalized)) return false;
  return defaultValue;
}

router.get('/', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const payload = await listAdminComputeJobs(req, {
      cityKey: req.query.cityKey,
      status: req.query.status,
      kind: req.query.kind,
      limit: req.query.limit,
      cursor: req.query.cursor,
    });
    return res.json(payload);
  } catch (error) {
    return handleAdminServiceError(res, error);
  }
});

router.post('/', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    rejectUnknownFields(req.body, ['request', 'jobRequest']);
    const request = req.body?.request || req.body?.jobRequest || req.body;
    const payload = await createAdminComputeJob(req, {
      request,
      actor: actorFromRequest(req),
      now: new Date(),
    });
    return res.status(payload.created ? 201 : 200).json(payload);
  } catch (error) {
    return handleAdminServiceError(res, error);
  }
});

router.post('/wake-diagnostic', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    rejectUnknownFields(req.body, []);
    const diagnostic = await diagnoseComputeWorkerWake();
    // Delivery failure is the diagnostic result, not a failure to run the
    // diagnostic. Keeping the envelope successful lets the UI render every
    // sanitized check instead of collapsing it into a generic request error.
    return res.json({ diagnostic });
  } catch (error) {
    return handleAdminServiceError(res, error);
  }
});

router.post('/artifact-diagnostic', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    rejectUnknownFields(req.body, []);
    const diagnostic = await diagnoseCarouselExportStorage();
    return res.json({ diagnostic });
  } catch (error) {
    return handleAdminServiceError(res, error);
  }
});

router.post('/manual-preview', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    rejectUnknownFields(req.body, ['result', 'currentContextVersion']);
    const preview = await previewManualComputeResult(req, req.body?.result || req.body, {
      currentContextVersion: req.body?.currentContextVersion,
      now: new Date(),
    });
    return res.json({ preview });
  } catch (error) {
    return handleAdminServiceError(res, error);
  }
});

router.post('/manual-submit', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    rejectUnknownFields(req.body, ['result']);
    const payload = await submitManualComputeResult(req, {
      result: req.body?.result,
      actor: actorFromRequest(req),
      now: new Date(),
    });
    return res.status(payload.created ? 201 : 200).json(payload);
  } catch (error) {
    return handleAdminServiceError(res, error);
  }
});

router.get('/:externalJobId/attempts', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const payload = await getAdminComputeJob(req, req.params.externalJobId, {
      includeAttempts: true,
      includeApplyManifest: parseBooleanQuery(req.query.includeApplyManifest, true),
    });
    return res.json({
      job: payload.job,
      attempts: payload.attempts,
    });
  } catch (error) {
    return handleAdminServiceError(res, error);
  }
});

router.post('/:externalJobId/preview', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    rejectUnknownFields(req.body, ['currentContextVersion']);
    const payload = await previewStoredComputeJob(req, req.params.externalJobId, {
      currentContextVersion: req.body?.currentContextVersion,
      now: new Date(),
    });
    return res.json(payload);
  } catch (error) {
    return handleAdminServiceError(res, error);
  }
});

router.post('/:externalJobId/apply', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    rejectUnknownFields(req.body, ['idempotencyKey', 'preview', 'tenantKey']);
    const payload = await applyStoredComputeJob(req, req.params.externalJobId, {
      idempotencyKey: req.body?.idempotencyKey,
      preview: req.body?.preview,
      tenantKey: req.body?.tenantKey,
      actor: actorFromRequest(req),
      now: new Date(),
    });
    if (payload?.async) {
      return res.status(202).json(payload);
    }
    return res.json(payload);
  } catch (error) {
    return handleAdminServiceError(res, error);
  }
});

router.post('/:externalJobId/cancel', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    rejectUnknownFields(req.body, []);
    const payload = await cancelAdminComputeJob(req, {
      externalJobId: req.params.externalJobId,
      actor: actorFromRequest(req),
      now: new Date(),
    });
    return res.json(payload);
  } catch (error) {
    return handleAdminServiceError(res, error);
  }
});

router.post('/:externalJobId/retry', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    rejectUnknownFields(req.body, ['contextVersion']);
    const payload = await retryAdminComputeJob(req, {
      externalJobId: req.params.externalJobId,
      contextVersion: req.body?.contextVersion,
      now: new Date(),
    });
    return res.json(payload);
  } catch (error) {
    return handleAdminServiceError(res, error);
  }
});

router.get('/:externalJobId/artifacts/:artifactId', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const payload = await createAdminCarouselArtifactDownload(req, {
      externalJobId: req.params.externalJobId,
      artifactId: req.params.artifactId,
      tenantKey: req.query.tenantKey,
    });
    return res.json(payload);
  } catch (error) {
    return handleAdminServiceError(res, error);
  }
});

router.get('/:externalJobId', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const payload = await getAdminComputeJob(req, req.params.externalJobId, {
      includeAttempts: true,
      includeApplyManifest: parseBooleanQuery(req.query.includeApplyManifest, true),
    });
    return res.json(payload);
  } catch (error) {
    return handleAdminServiceError(res, error);
  }
});

module.exports = router;
