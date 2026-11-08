const express = require('express');
const {
  WORKER_ID_HEADER,
  createComputeWorkerAuthMiddleware,
  resolveWorkerCredentialVerifier,
} = require('../services/pivotComputeWorkerAuth');
const {
  registerScheduleOccurrence,
  claimCompatibleJob,
  fetchJobContext,
  startLeasedJob,
  renewJobLease,
  observeJobCancellation,
  submitTerminalJobResult,
  reportRetryableJobFailure,
  handleWorkerServiceError,
  initializeJobArtifactUploads,
  finalizeJobArtifactUploads,
  createJobDraftRender,
} = require('../services/pivotComputeWorkerService');

// Result submissions wrap an up-to-8 MiB result with lease/capability metadata.
const MAX_WORKER_BODY_BYTES = 9 * 1024 * 1024;

function createPivotComputeWorkerRouter({
  verifyWorkerCredential = resolveWorkerCredentialVerifier(),
  now = () => new Date(),
} = {}) {
  const router = express.Router();
  const requireComputeWorkerAuth = createComputeWorkerAuthMiddleware({
    verifyWorkerCredential,
    failClosedWhenUnconfigured: true,
  });

  router.use(express.json({
    limit: MAX_WORKER_BODY_BYTES,
    strict: true,
    type: 'application/json',
  }));

  router.get('/carousel-compose-accounts', requireComputeWorkerAuth, async (req, res) => {
    try {
      const { listCarouselComposeScheduleAccounts } = require('../services/pivotCarouselComposeContextService');
      return res.json(await listCarouselComposeScheduleAccounts(req));
    } catch (error) {
      return handleWorkerServiceError(res, error);
    }
  });

  router.post('/schedule-occurrences', requireComputeWorkerAuth, async (req, res) => {
    try {
      const payload = await registerScheduleOccurrence(req, {
        workerId: req.computeWorker.workerId,
        body: req.body,
        now: now(),
      });
      return res.status(payload.created ? 201 : 200).json(payload);
    } catch (error) {
      return handleWorkerServiceError(res, error);
    }
  });

  router.post('/jobs/claim', requireComputeWorkerAuth, async (req, res) => {
    try {
      const payload = await claimCompatibleJob(req, {
        workerId: req.computeWorker.workerId,
        body: req.body,
        now: now(),
      });
      if (!payload.job) {
        return res.sendStatus(204);
      }
      return res.json(payload);
    } catch (error) {
      return handleWorkerServiceError(res, error);
    }
  });

  router.get('/jobs/:externalJobId/context', requireComputeWorkerAuth, async (req, res) => {
    try {
      const payload = await fetchJobContext(req, {
        workerId: req.computeWorker.workerId,
        externalJobId: req.params.externalJobId,
        leaseToken: req.get('x-pivot-compute-lease-token'),
        now: now(),
      });
      return res.json(payload);
    } catch (error) {
      return handleWorkerServiceError(res, error);
    }
  });

  router.post('/jobs/:externalJobId/start', requireComputeWorkerAuth, async (req, res) => {
    try {
      const payload = await startLeasedJob(req, {
        workerId: req.computeWorker.workerId,
        externalJobId: req.params.externalJobId,
        body: req.body,
        now: now(),
      });
      return res.json(payload);
    } catch (error) {
      return handleWorkerServiceError(res, error);
    }
  });

  router.post('/jobs/:externalJobId/heartbeat', requireComputeWorkerAuth, async (req, res) => {
    try {
      const payload = await renewJobLease(req, {
        workerId: req.computeWorker.workerId,
        externalJobId: req.params.externalJobId,
        body: req.body,
        now: now(),
      });
      return res.json(payload);
    } catch (error) {
      return handleWorkerServiceError(res, error);
    }
  });

  router.get('/jobs/:externalJobId/observation', requireComputeWorkerAuth, async (req, res) => {
    try {
      const payload = await observeJobCancellation(req, {
        workerId: req.computeWorker.workerId,
        externalJobId: req.params.externalJobId,
        leaseToken: req.get('x-pivot-compute-lease-token'),
      });
      return res.json(payload);
    } catch (error) {
      return handleWorkerServiceError(res, error);
    }
  });

  router.post('/jobs/:externalJobId/artifacts/init', requireComputeWorkerAuth, async (req, res) => {
    try {
      const payload = await initializeJobArtifactUploads(req, {
        workerId: req.computeWorker.workerId,
        externalJobId: req.params.externalJobId,
        body: req.body,
        now: now(),
      });
      return res.json(payload);
    } catch (error) {
      return handleWorkerServiceError(res, error);
    }
  });

  router.post('/jobs/:externalJobId/draft-renders', requireComputeWorkerAuth, async (req, res) => {
    try {
      const payload = await createJobDraftRender(req, {
        workerId: req.computeWorker.workerId,
        externalJobId: req.params.externalJobId,
        body: req.body,
        now: now(),
      });
      return res.status(201).json(payload);
    } catch (error) {
      return handleWorkerServiceError(res, error);
    }
  });

  router.post('/jobs/:externalJobId/artifacts/finalize', requireComputeWorkerAuth, async (req, res) => {
    try {
      const payload = await finalizeJobArtifactUploads(req, {
        workerId: req.computeWorker.workerId,
        externalJobId: req.params.externalJobId,
        body: req.body,
        now: now(),
      });
      return res.json(payload);
    } catch (error) {
      return handleWorkerServiceError(res, error);
    }
  });

  router.post('/jobs/:externalJobId/result', requireComputeWorkerAuth, async (req, res) => {
    try {
      const payload = await submitTerminalJobResult(req, {
        workerId: req.computeWorker.workerId,
        externalJobId: req.params.externalJobId,
        body: req.body,
        now: now(),
      });
      return res.json(payload);
    } catch (error) {
      return handleWorkerServiceError(res, error);
    }
  });

  router.post('/jobs/:externalJobId/retryable-failure', requireComputeWorkerAuth, async (req, res) => {
    try {
      const payload = await reportRetryableJobFailure(req, {
        workerId: req.computeWorker.workerId,
        externalJobId: req.params.externalJobId,
        body: req.body,
        now: now(),
      });
      return res.json(payload);
    } catch (error) {
      return handleWorkerServiceError(res, error);
    }
  });

  return router;
}

module.exports = {
  WORKER_ID_HEADER,
  MAX_WORKER_BODY_BYTES,
  createPivotComputeWorkerRouter,
};
