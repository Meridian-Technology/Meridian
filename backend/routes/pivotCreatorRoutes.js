/**
 * Just Go Creator Console API — locked prefix `/pivot/creator/*` (Task 0.2).
 * City-scoped, creator JWT. Distinct from `/admin/pivot/*` (platform admin).
 */

const express = require('express');
const { verifyToken } = require('../middlewares/verifyToken');
const { requirePivotCreator } = require('../middlewares/requirePivotCreator');
const {
  createListing,
  updateListing,
  listListings,
  getListing,
} = require('../services/pivotCreatorListingService');
const {
  logPivotRouteError,
  logPivotServiceReject,
  logPivotServiceSuccess,
} = require('../utilities/pivotLogger');

const router = express.Router();

router.use(verifyToken);
router.use(requirePivotCreator);

function sendServiceResult(res, result, { successStatus = 200 } = {}) {
  if (result.error) {
    return res.status(result.status || 400).json({
      success: false,
      message: result.error,
      code: result.code,
      ...(result.data ? { data: result.data } : {}),
    });
  }
  return res.status(successStatus).json({
    success: true,
    data: result.data,
  });
}

/**
 * GET /pivot/creator/events — list current creator's host listings.
 * Optional query: ingestStatus=draft|staged|published (comma-separated ok).
 */
router.get('/events', async (req, res) => {
  try {
    const result = await listListings(req, {
      ingestStatus: req.query?.ingestStatus ?? req.query?.status,
    });
    if (result.error) {
      logPivotServiceReject('GET /pivot/creator/events', result, req);
      return sendServiceResult(res, result);
    }
    logPivotServiceSuccess('GET /pivot/creator/events', req, {
      total: result.data?.total,
      ingestStatus: req.query?.ingestStatus ?? req.query?.status,
    });
    return sendServiceResult(res, result);
  } catch (err) {
    logPivotRouteError('GET /pivot/creator/events', err, req);
    return res.status(500).json({
      success: false,
      message: 'Unable to list listings.',
      code: 'CREATOR_LIST_FAILED',
    });
  }
});

/**
 * GET /pivot/creator/events/:eventId — detail + safe intent/analytics stats.
 */
router.get('/events/:eventId', async (req, res) => {
  try {
    const result = await getListing(req, req.params.eventId);
    if (result.error) {
      logPivotServiceReject('GET /pivot/creator/events/:eventId', result, req);
      return sendServiceResult(res, result);
    }
    logPivotServiceSuccess('GET /pivot/creator/events/:eventId', req, {
      eventId: req.params.eventId,
      ingestStatus: result.data?.event?.ingestStatus,
    });
    return sendServiceResult(res, result);
  } catch (err) {
    logPivotRouteError('GET /pivot/creator/events/:eventId', err, req);
    return res.status(500).json({
      success: false,
      message: 'Unable to load listing.',
      code: 'CREATOR_GET_FAILED',
    });
  }
});

/**
 * POST /pivot/creator/events — create host listing (curation draft by default).
 */
router.post('/events', async (req, res) => {
  try {
    const result = await createListing(req, req.body || {});
    if (result.error) {
      logPivotServiceReject('POST /pivot/creator/events', result, req);
      return sendServiceResult(res, result);
    }
    logPivotServiceSuccess('POST /pivot/creator/events', req, {
      eventId: result.data?.event?._id,
      batchWeek: result.data?.batchWeek,
      ingestStatus: result.data?.ingestStatus,
    });
    return sendServiceResult(res, result, { successStatus: 201 });
  } catch (err) {
    logPivotRouteError('POST /pivot/creator/events', err, req);
    return res.status(500).json({
      success: false,
      message: 'Unable to create listing.',
      code: 'CREATOR_CREATE_FAILED',
    });
  }
});

/**
 * PATCH /pivot/creator/events/:eventId — update own listing.
 */
router.patch('/events/:eventId', async (req, res) => {
  try {
    const result = await updateListing(req, req.params.eventId, req.body || {});
    if (result.error) {
      logPivotServiceReject('PATCH /pivot/creator/events/:eventId', result, req);
      return sendServiceResult(res, result);
    }
    logPivotServiceSuccess('PATCH /pivot/creator/events/:eventId', req, {
      eventId: req.params.eventId,
      ingestStatus: result.data?.ingestStatus,
    });
    return sendServiceResult(res, result);
  } catch (err) {
    logPivotRouteError('PATCH /pivot/creator/events/:eventId', err, req);
    return res.status(500).json({
      success: false,
      message: 'Unable to update listing.',
      code: 'CREATOR_UPDATE_FAILED',
    });
  }
});

/** Placeholder for Task 2.3+ surfaces not yet implemented. */
router.all('*', (req, res) => {
  return res.status(501).json({
    success: false,
    message: 'Just Go Creator API endpoint is not available yet.',
    code: 'CREATOR_API_PENDING',
  });
});

module.exports = router;
