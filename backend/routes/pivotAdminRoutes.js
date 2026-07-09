const express = require('express');
const { verifyToken } = require('../middlewares/verifyToken');
const { requirePlatformAdmin } = require('../middlewares/requirePlatformAdmin');
const {
  rebuildWeeklySnapshot,
  getWeeklySnapshot,
} = require('../services/pivotWeeklySnapshotService');
const { getPivotOverview } = require('../services/pivotAdminOverviewService');
const { getPivotRetention } = require('../services/pivotRetentionService');
const { listPivotLabEvents } = require('../services/pivotLabEventsService');
const {
  getInterviewNotes,
  saveInterviewNotes,
} = require('../services/pivotLabNotesService');
const { previewIngestUrl } = require('../services/pivotIngestPreviewService');
const {
  publishIngestEvent,
  publishBatchIngestEvents,
  updateIngestEvent,
} = require('../services/pivotIngestPublishService');
const { purgePivotCatalog } = require('../services/pivotCatalogPurgeService');
const { listPivotTags, seedPivotTagCatalog } = require('../services/pivotTagCatalogService');
const {
  suggestPivotEventTags,
  suggestPivotEventTagsBatch,
} = require('../services/pivotTagSuggestService');
const {
  searchTmdbMovies,
  fetchTmdbMovieDetails,
} = require('../services/pivotTmdbService');
const {
  pivotRequestLogger,
  logPivotRouteError,
  logPivotServiceReject,
  logPivotServiceSuccess,
} = require('../utilities/pivotLogger');

const router = express.Router();

router.use(pivotRequestLogger);

router.get('/tags', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await listPivotTags(req);
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
    logPivotRouteError('GET /admin/pivot/tags', err, req);
    return res.status(500).json({
      success: false,
      message: 'Unable to load pivot tag catalog.',
    });
  }
});

router.post('/tags/seed', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await seedPivotTagCatalog(req);
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
    logPivotRouteError('POST /admin/pivot/tags/seed', err, req);
    return res.status(500).json({
      success: false,
      message: 'Unable to seed pivot tag catalog.',
    });
  }
});

router.get('/events', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await listPivotLabEvents(req, {
      tenantKey: req.query?.tenantKey,
      batchWeek: req.query?.batchWeek,
    });
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
    logPivotRouteError('GET /admin/pivot/events', err, req);
    return res.status(500).json({
      success: false,
      message: 'Unable to load pivot catalog events.',
    });
  }
});

router.get('/interview-notes', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await getInterviewNotes(req, { batchWeek: req.query?.batchWeek });
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
    logPivotRouteError('GET /admin/pivot/interview-notes', err, req);
    return res.status(500).json({
      success: false,
      message: 'Unable to load interview notes.',
    });
  }
});

router.put('/interview-notes', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await saveInterviewNotes(req, {
      batchWeek: req.body?.batchWeek ?? req.query?.batchWeek,
      notes: req.body?.notes,
    });
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
    logPivotRouteError('PUT /admin/pivot/interview-notes', err, req);
    return res.status(500).json({
      success: false,
      message: 'Unable to save interview notes.',
    });
  }
});

router.get('/overview', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await getPivotOverview(req, { batchWeek: req.query?.batchWeek });
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
    logPivotRouteError('GET /admin/pivot/overview', err, req);
    return res.status(500).json({
      success: false,
      message: 'Unable to load pivot overview.',
    });
  }
});

router.get('/retention', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await getPivotRetention(req, {
      batchWeek: req.query?.batchWeek,
      weeks: req.query?.weeks,
    });
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
    logPivotRouteError('GET /admin/pivot/retention', err, req);
    return res.status(500).json({
      success: false,
      message: 'Unable to load pivot retention.',
    });
  }
});

router.post('/snapshots/rebuild', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const batchWeek = req.body?.batchWeek ?? req.query?.batchWeek;
    const result = await rebuildWeeklySnapshot(req, { batchWeek });
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
    logPivotRouteError('POST /admin/pivot/snapshots/rebuild', err, req);
    return res.status(500).json({
      success: false,
      message: 'Unable to rebuild pivot weekly snapshot.',
    });
  }
});

router.post('/ingest/suggest-tags', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const events = req.body?.events;
    const isBatch = Array.isArray(events);
    console.log('[pivotTagSuggest] route request', {
      mode: isBatch ? 'batch' : 'single',
      eventCount: isBatch ? events.length : 1,
      hasGlobalDb: Boolean(req.globalDb),
      hasApiKey: Boolean(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY),
      model: process.env.CLAUDE_MODEL || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
    });

    const result = isBatch
      ? await suggestPivotEventTagsBatch(req, events)
      : await suggestPivotEventTags(req, req.body?.event || req.body);

    if (result.error) {
      console.warn('[pivotTagSuggest] route error', {
        mode: isBatch ? 'batch' : 'single',
        code: result.code,
        message: result.error,
        suggestedCount: result.data?.suggestedCount,
        failedCount: result.data?.failedCount,
      });
      return res.status(result.status || 400).json({
        success: false,
        message: result.error,
        code: result.code,
        data: result.data,
      });
    }

    console.log('[pivotTagSuggest] route success', {
      mode: isBatch ? 'batch' : 'single',
      tags: result.data?.tags,
      suggestedCount: result.data?.suggestedCount,
      failedCount: result.data?.failedCount,
    });

    return res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    logPivotRouteError('POST /admin/pivot/ingest/suggest-tags', err, req);
    return res.status(500).json({
      success: false,
      message: 'Unable to suggest pivot tags.',
    });
  }
});

router.get('/tmdb/search', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await searchTmdbMovies({
      query: req.query?.query,
      year: req.query?.year,
    });
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
    logPivotRouteError('GET /admin/pivot/tmdb/search', err, req);
    return res.status(500).json({
      success: false,
      message: 'Unable to search TMDB.',
    });
  }
});

router.get('/tmdb/movies/:tmdbId', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await fetchTmdbMovieDetails({ tmdbId: req.params.tmdbId });
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
    logPivotRouteError('GET /admin/pivot/tmdb/movies/:tmdbId', err, req);
    return res.status(500).json({
      success: false,
      message: 'Unable to load TMDB movie.',
    });
  }
});

router.post('/ingest/preview', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await previewIngestUrl(req, {
      url: req.body?.url,
      tenantKey: req.body?.tenantKey,
    });
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
    logPivotRouteError('POST /admin/pivot/ingest/preview', err, req);
    return res.status(500).json({
      success: false,
      message: 'Unable to preview event import.',
    });
  }
});

router.post('/ingest', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await publishIngestEvent(req, {
      tenantKey: req.body?.tenantKey,
      url: req.body?.url,
      batchWeek: req.body?.batchWeek,
      overrides: req.body?.overrides,
    });
    if (result.error) {
      logPivotServiceReject('POST /admin/pivot/ingest', result, req, {
        tenantKey: req.body?.tenantKey,
        batchWeek: req.body?.batchWeek,
        eventName: req.body?.overrides?.name,
      });
      return res.status(result.status || 400).json({
        success: false,
        message: result.error,
        code: result.code,
      });
    }

    logPivotServiceSuccess('POST /admin/pivot/ingest', req, {
      tenantKey: req.body?.tenantKey,
      batchWeek: req.body?.batchWeek,
      eventId: result.data?.event?._id,
      eventName: result.data?.event?.name,
    });

    return res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    logPivotRouteError('POST /admin/pivot/ingest', err, req);
    return res.status(500).json({
      success: false,
      message: 'Unable to publish pivot catalog event.',
    });
  }
});

router.post('/ingest/batch', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await publishBatchIngestEvents(req, {
      tenantKey: req.body?.tenantKey,
      batchWeek: req.body?.batchWeek,
      events: req.body?.events,
    });
    if (result.error && !result.data?.published?.length) {
      logPivotServiceReject('POST /admin/pivot/ingest/batch', result, req, {
        tenantKey: req.body?.tenantKey,
        batchWeek: req.body?.batchWeek,
        requestedCount: Array.isArray(req.body?.events) ? req.body.events.length : 0,
      });
      return res.status(result.status || 400).json({
        success: false,
        message: result.error,
        code: result.code,
        data: result.data,
      });
    }

    logPivotServiceSuccess('POST /admin/pivot/ingest/batch', req, {
      tenantKey: req.body?.tenantKey,
      batchWeek: req.body?.batchWeek,
      publishedCount: result.data?.publishedCount ?? result.data?.published?.length ?? 0,
      failedCount: result.data?.failedCount ?? result.data?.failures?.length ?? 0,
    });

    return res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    logPivotRouteError('POST /admin/pivot/ingest/batch', err, req);
    return res.status(500).json({
      success: false,
      message: 'Unable to publish pivot catalog events.',
    });
  }
});

router.patch('/ingest/:eventId', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await updateIngestEvent(req, {
      eventId: req.params.eventId,
      tenantKey: req.body?.tenantKey,
      overrides: req.body?.overrides,
    });
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
    logPivotRouteError('PATCH /admin/pivot/ingest/:eventId', err, req);
    return res.status(500).json({
      success: false,
      message: 'Unable to update pivot catalog event.',
    });
  }
});

router.post('/dev/purge-catalog', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await purgePivotCatalog(req, {
      tenantKey: req.body?.tenantKey,
      confirm: req.body?.confirm,
      clearSnapshots: req.body?.clearSnapshots,
    });
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
    logPivotRouteError('POST /admin/pivot/dev/purge-catalog', err, req);
    return res.status(500).json({
      success: false,
      message: 'Unable to purge pivot catalog data.',
    });
  }
});

router.get('/snapshots/:batchWeek', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await getWeeklySnapshot(req, { batchWeek: req.params.batchWeek });
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
    logPivotRouteError('GET /admin/pivot/snapshots/:batchWeek', err, req);
    return res.status(500).json({
      success: false,
      message: 'Unable to load pivot weekly snapshot.',
    });
  }
});

module.exports = router;
