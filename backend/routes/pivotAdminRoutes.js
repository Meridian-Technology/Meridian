const express = require('express');
const { verifyToken } = require('../middlewares/verifyToken');
const { requirePlatformAdmin } = require('../middlewares/requirePlatformAdmin');
const {
  rebuildWeeklySnapshot,
  getWeeklySnapshot,
} = require('../services/pivotWeeklySnapshotService');
const { getPivotOverview } = require('../services/pivotAdminOverviewService');
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
const { listPivotTags } = require('../services/pivotTagCatalogService');
const {
  suggestPivotEventTags,
  suggestPivotEventTagsBatch,
} = require('../services/pivotTagSuggestService');

const router = express.Router();

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
    console.error('GET /admin/pivot/tags failed:', err);
    return res.status(500).json({
      success: false,
      message: 'Unable to load pivot tag catalog.',
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
    console.error('GET /admin/pivot/events failed:', err);
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
    console.error('GET /admin/pivot/interview-notes failed:', err);
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
    console.error('PUT /admin/pivot/interview-notes failed:', err);
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
    console.error('GET /admin/pivot/overview failed:', err);
    return res.status(500).json({
      success: false,
      message: 'Unable to load pivot overview.',
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
    console.error('POST /admin/pivot/snapshots/rebuild failed:', err);
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
    console.error('POST /admin/pivot/ingest/suggest-tags failed:', err);
    return res.status(500).json({
      success: false,
      message: 'Unable to suggest pivot tags.',
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
    console.error('POST /admin/pivot/ingest/preview failed:', err);
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
    console.error('POST /admin/pivot/ingest failed:', err);
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
      return res.status(result.status || 400).json({
        success: false,
        message: result.error,
        code: result.code,
        data: result.data,
      });
    }

    return res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    console.error('POST /admin/pivot/ingest/batch failed:', err);
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
    console.error('PATCH /admin/pivot/ingest/:eventId failed:', err);
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
    console.error('POST /admin/pivot/dev/purge-catalog failed:', err);
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
    console.error('GET /admin/pivot/snapshots/:batchWeek failed:', err);
    return res.status(500).json({
      success: false,
      message: 'Unable to load pivot weekly snapshot.',
    });
  }
});

module.exports = router;
