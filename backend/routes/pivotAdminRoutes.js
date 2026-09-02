const express = require('express');
const { verifyToken } = require('../middlewares/verifyToken');
const { requirePlatformAdmin } = require('../middlewares/requirePlatformAdmin');
const {
  rebuildWeeklySnapshot,
  getWeeklySnapshot,
} = require('../services/pivotWeeklySnapshotService');
const {
  getPivotOverview,
  getTenantOverview,
  getTenantEventPerformance,
} = require('../services/pivotAdminOverviewService');
const { getTenantInsights } = require('../services/pivotTenantInsightsService');
const { getTenantCrewMetrics } = require('../services/pivotCrewMetricsService');
const {
  releaseBatch,
  unreleaseBatch,
} = require('../services/pivotBatchReleaseService');
const { getBatchReadiness } = require('../services/pivotBatchReadinessService');
const {
  listCurationJobs,
  createCurationJob,
  updateCurationJob,
  deleteCurationJob,
} = require('../services/pivotCurationJobService');
const {
  startCurationJobRun,
  getCurationRun,
} = require('../services/pivotCurationRunService');
const {
  startCurationBatch,
  getCurationBatch,
  getLatestCurationBatch,
} = require('../services/pivotCurationBatchService');
const {
  listCitySources,
  startCitySourceDiscovery,
  stopCitySourceDiscoveryRun,
  previewCitySourceDiscovery,
  updateCitySource,
  updateCityDiscoveryConfig,
  getCitySourceDiscoveryRun,
  getLatestCitySourceDiscoveryRun,
} = require('../services/pivotSourceDiscoveryService');
const {
  startCitySourceDiscoveryRehearsal,
} = require('../services/pivotDiscoveryRehearsal');
const {
  getJourneyOverview,
  getJourneyFunnel,
  getJourneyPath,
  searchJourneyUsers,
  getUserJourneyHistory,
  wipeUserWeekIntents,
} = require('../services/pivotTenantJourneyService');
const { getTenantOpsBundle } = require('../services/pivotTenantOpsService');
const { getFleetOpsBundle } = require('../services/pivotFleetOpsService');
const { previewAdminDropDeck } = require('../services/pivotAdminDropDeckService');
const { getPivotExplorePreview } = require('../services/pivotExploreService');
const { getPivotRetention } = require('../services/pivotRetentionService');
const { listPivotLabEvents } = require('../services/pivotLabEventsService');
const {
  getInterviewNotes,
  saveInterviewNotes,
} = require('../services/pivotLabNotesService');
const { previewIngestUrl } = require('../services/pivotIngestPreviewService');
const { annotateImportDuplicates } = require('../services/pivotIngestDuplicateService');
const {
  publishIngestEvent,
  publishBatchIngestEvents,
  updateIngestEvent,
} = require('../services/pivotIngestPublishService');
const {
  listLocationReviewCandidates,
  reviewLocationCandidate,
} = require('../services/pivotLocationReviewService');
const { collapseCatalogEventsToShowtimes } = require('../services/pivotCatalogShowtimeCollapseService');
const {
  purgePivotCatalog,
  deletePivotCatalogEvent,
  purgePivotCatalogOutOfWeek,
} = require('../services/pivotCatalogPurgeService');
const { listPivotTags, seedPivotTagCatalog } = require('../services/pivotTagCatalogService');
const {
  suggestPivotEventTags,
  suggestPivotEventTagsBatch,
  suggestAndApplyPivotEventTags,
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
const { getMergedTenants } = require('../services/tenantConfigService');
const { isPivotTenant } = require('../services/pivotReferralCodeService');
const { resolvePivotDropConfig } = require('../utilities/pivotDropSchedule');
const {
  backfillOrganizers,
} = require('../services/pivotOrganizerBackfillService');
const {
  listOrganizers,
  getOrganizer,
  listUnlinkedOrganizerEvents,
  mergeOrganizers,
  splitOrganizer,
  claimOrganizer,
} = require('../services/pivotOrganizerCatalogService');
const {
  listCreatorGrants,
  grantCreator,
  revokeCreator,
} = require('../services/pivotCreatorGrantService');
const {
  getCopyCatalog,
  getCopyLayers,
  getPlatformCopyLayers,
  patchCopyPack,
  resetCopyPack,
} = require('../services/pivotCopyService');
const {
  getTenantLaunchStats,
  getFleetLaunchStats,
  updateTenantLandingMode,
} = require('../services/pivotLandingService');
const {
  listTenantWaitlist,
  exportTenantWaitlistCsv,
  deleteTenantWaitlistRow,
} = require('../services/pivotLandingWaitlistService');
const {
  listTenantLandingQrs,
  createTenantLandingQr,
  updateLandingQr,
  deactivateLandingQr,
  wipeLandingQrScans,
} = require('../services/pivotLandingQrService');

const router = express.Router();

router.use(pivotRequestLogger);

function sendCopyAdminResult(res, result) {
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
}

function parseCopyPatchBody(body = {}) {
  if (typeof body.key === 'string' && body.value !== undefined) {
    return { entries: { [body.key]: body.value } };
  }
  if (typeof body.token === 'string' && body.value !== undefined) {
    return { tokens: { [body.token]: body.value } };
  }
  return { entries: body.entries, tokens: body.tokens };
}

function asCopyKeyList(value) {
  if (value == null || value === '') {
    return undefined;
  }
  return Array.isArray(value) ? value : [value];
}

function parseCopyResetKeys(req) {
  const body = req.body || {};
  return {
    entries: asCopyKeyList(body.entries ?? body.keys ?? req.query?.key),
    tokens: asCopyKeyList(body.tokens ?? req.query?.token),
  };
}

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

router.get('/copy/catalog', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    return sendCopyAdminResult(res, getCopyCatalog());
  } catch (err) {
    logPivotRouteError('GET /admin/pivot/copy/catalog', err, req);
    return res.status(500).json({
      success: false,
      message: 'Unable to load pivot copy catalog.',
    });
  }
});

router.get('/copy', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await getPlatformCopyLayers(req);
    return sendCopyAdminResult(res, result);
  } catch (err) {
    logPivotRouteError('GET /admin/pivot/copy', err, req);
    return res.status(500).json({
      success: false,
      message: 'Unable to load pivot copy pack.',
    });
  }
});

router.patch('/copy', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const patch = parseCopyPatchBody(req.body);
    const result = await patchCopyPack(req, {
      scope: 'platform',
      entries: patch.entries,
      tokens: patch.tokens,
    });
    return sendCopyAdminResult(res, result);
  } catch (err) {
    logPivotRouteError('PATCH /admin/pivot/copy', err, req);
    return res.status(500).json({
      success: false,
      message: 'Unable to update pivot copy pack.',
    });
  }
});

router.delete('/copy', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const reset = parseCopyResetKeys(req);
    const result = await resetCopyPack(req, {
      scope: 'platform',
      entries: reset.entries,
      tokens: reset.tokens,
    });
    return sendCopyAdminResult(res, result);
  } catch (err) {
    logPivotRouteError('DELETE /admin/pivot/copy', err, req);
    return res.status(500).json({
      success: false,
      message: 'Unable to reset pivot copy key.',
    });
  }
});

router.get(
  '/tenants/:tenantKey/copy',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await getCopyLayers(req, {
        scope: 'tenant',
        tenantKey: req.params.tenantKey,
      });
      return sendCopyAdminResult(res, result);
    } catch (err) {
      logPivotRouteError('GET /admin/pivot/tenants/:tenantKey/copy', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to load tenant copy pack.',
      });
    }
  },
);

router.patch(
  '/tenants/:tenantKey/copy',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const patch = parseCopyPatchBody(req.body);
      const result = await patchCopyPack(req, {
        scope: 'tenant',
        tenantKey: req.params.tenantKey,
        entries: patch.entries,
        tokens: patch.tokens,
      });
      return sendCopyAdminResult(res, result);
    } catch (err) {
      logPivotRouteError('PATCH /admin/pivot/tenants/:tenantKey/copy', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to update tenant copy pack.',
      });
    }
  },
);

router.delete(
  '/tenants/:tenantKey/copy',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const reset = parseCopyResetKeys(req);
      const result = await resetCopyPack(req, {
        scope: 'tenant',
        tenantKey: req.params.tenantKey,
        entries: reset.entries,
        tokens: reset.tokens,
      });
      return sendCopyAdminResult(res, result);
    } catch (err) {
      logPivotRouteError('DELETE /admin/pivot/tenants/:tenantKey/copy', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to reset tenant copy key.',
      });
    }
  },
);

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

router.get('/ops', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await getFleetOpsBundle(req, {
      batchWeek: req.query?.batchWeek,
      include: req.query?.include,
      performanceLimit: req.query?.performanceLimit ?? req.query?.limit,
      retentionWeeks: req.query?.retentionWeeks ?? req.query?.weeks,
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
    logPivotRouteError('GET /admin/pivot/ops', err, req);
    return res.status(500).json({
      success: false,
      message: 'Unable to load fleet ops bundle.',
    });
  }
});

router.get('/launch', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await getFleetLaunchStats(req, {
      from: req.query?.from,
      to: req.query?.to,
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
    logPivotRouteError('GET /admin/pivot/launch', err, req);
    return res.status(500).json({
      success: false,
      message: 'Unable to load fleet launch stats.',
    });
  }
});

router.get(
  '/tenants/:tenantKey/overview',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await getTenantOverview(req, {
        tenantKey: req.params.tenantKey,
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
      logPivotRouteError('GET /admin/pivot/tenants/:tenantKey/overview', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to load tenant pivot overview.',
      });
    }
  },
);

router.get(
  '/tenants/:tenantKey/launch',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await getTenantLaunchStats(req, {
        tenantKey: req.params.tenantKey,
        from: req.query?.from,
        to: req.query?.to,
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
      logPivotRouteError('GET /admin/pivot/tenants/:tenantKey/launch', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to load tenant launch stats.',
      });
    }
  },
);

router.get(
  '/tenants/:tenantKey/waitlist.csv',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await exportTenantWaitlistCsv(req, {
        tenantKey: req.params.tenantKey,
      });
      if (result.error) {
        return res.status(result.status || 400).json({
          success: false,
          message: result.error,
          code: result.code,
        });
      }

      res.set('Content-Type', result.contentType);
      res.set('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.set('Cache-Control', 'no-store');
      return res.status(200).send(result.body);
    } catch (err) {
      logPivotRouteError('GET /admin/pivot/tenants/:tenantKey/waitlist.csv', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to export waitlist.',
      });
    }
  },
);

router.get(
  '/tenants/:tenantKey/waitlist',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await listTenantWaitlist(req, {
        tenantKey: req.params.tenantKey,
        page: req.query?.page,
        limit: req.query?.limit,
      });
      if (result.error) {
        return res.status(result.status || 400).json({
          success: false,
          message: result.error,
          code: result.code,
        });
      }

      res.set('Cache-Control', 'no-store');
      return res.status(200).json({
        success: true,
        data: result.data,
      });
    } catch (err) {
      logPivotRouteError('GET /admin/pivot/tenants/:tenantKey/waitlist', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to load waitlist.',
      });
    }
  },
);

router.delete(
  '/tenants/:tenantKey/waitlist/:id',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await deleteTenantWaitlistRow(req, {
        tenantKey: req.params.tenantKey,
        id: req.params.id,
      });
      if (result.error) {
        return res.status(result.status || 400).json({
          success: false,
          message: result.error,
          code: result.code,
        });
      }

      res.set('Cache-Control', 'no-store');
      return res.status(200).json({
        success: true,
        data: result.data,
      });
    } catch (err) {
      logPivotRouteError('DELETE /admin/pivot/tenants/:tenantKey/waitlist/:id', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to delete waitlist signup.',
      });
    }
  },
);

router.patch(
  '/tenants/:tenantKey/landing-mode',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await updateTenantLandingMode(req, {
        tenantKey: req.params.tenantKey,
        landingMode: req.body?.landingMode,
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
      logPivotRouteError('PATCH /admin/pivot/tenants/:tenantKey/landing-mode', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to update landing mode.',
      });
    }
  },
);

router.get(
  '/tenants/:tenantKey/landing-qrs',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await listTenantLandingQrs(req, {
        tenantKey: req.params.tenantKey,
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
      logPivotRouteError('GET /admin/pivot/tenants/:tenantKey/landing-qrs', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to list landing QRs.',
      });
    }
  },
);

router.post(
  '/tenants/:tenantKey/landing-qrs',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await createTenantLandingQr(req, {
        tenantKey: req.params.tenantKey,
        name: req.body?.name,
        description: req.body?.description,
        fgColor: req.body?.fgColor,
        bgColor: req.body?.bgColor,
        transparentBg: req.body?.transparentBg,
        dotType: req.body?.dotType,
        cornerType: req.body?.cornerType,
        isActive: req.body?.isActive,
      });
      if (result.error) {
        return res.status(result.status || 400).json({
          success: false,
          message: result.error,
          code: result.code,
        });
      }

      return res.status(result.status || 201).json({
        success: true,
        data: result.data,
      });
    } catch (err) {
      logPivotRouteError('POST /admin/pivot/tenants/:tenantKey/landing-qrs', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to create landing QR.',
      });
    }
  },
);

router.patch(
  '/landing-qrs/:name',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await updateLandingQr(req, {
        name: req.params.name,
        description: req.body?.description,
        fgColor: req.body?.fgColor,
        bgColor: req.body?.bgColor,
        transparentBg: req.body?.transparentBg,
        dotType: req.body?.dotType,
        cornerType: req.body?.cornerType,
        isActive: req.body?.isActive,
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
      logPivotRouteError('PATCH /admin/pivot/landing-qrs/:name', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to update landing QR.',
      });
    }
  },
);

router.delete(
  '/landing-qrs/:name',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await deactivateLandingQr(req, {
        name: req.params.name,
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
      logPivotRouteError('DELETE /admin/pivot/landing-qrs/:name', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to deactivate landing QR.',
      });
    }
  },
);

router.post(
  '/landing-qrs/:name/wipe-scans',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await wipeLandingQrScans(req, {
        name: req.params.name,
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
      logPivotRouteError('POST /admin/pivot/landing-qrs/:name/wipe-scans', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to wipe landing QR scans.',
      });
    }
  },
);

router.get(
  '/tenants/:tenantKey/ops',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await getTenantOpsBundle(req, {
        tenantKey: req.params.tenantKey,
        batchWeek: req.query?.batchWeek,
        include: req.query?.include,
        performanceLimit: req.query?.performanceLimit ?? req.query?.limit,
        retentionWeeks: req.query?.retentionWeeks ?? req.query?.weeks,
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
      logPivotRouteError('GET /admin/pivot/tenants/:tenantKey/ops', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to load tenant ops bundle.',
      });
    }
  },
);

router.get(
  '/tenants/:tenantKey/explore',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await getPivotExplorePreview(req, {
        tenantKey: req.params.tenantKey,
        batchWeek: req.query?.batchWeek,
        limit: req.query?.limit,
        offset: req.query?.offset,
        tags: req.query?.tags,
        night: req.query?.night,
        friendsOnly: req.query?.friendsOnly,
        excludePassed: req.query?.excludePassed,
        q: req.query?.q,
        sort: req.query?.sort,
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
      logPivotRouteError('GET /admin/pivot/tenants/:tenantKey/explore', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to load explore preview.',
      });
    }
  },
);

router.get(
  '/tenants/:tenantKey/events/performance',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await getTenantEventPerformance(req, {
        tenantKey: req.params.tenantKey,
        batchWeek: req.query?.batchWeek,
        limit: req.query?.limit,
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
      logPivotRouteError('GET /admin/pivot/tenants/:tenantKey/events/performance', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to load tenant event performance.',
      });
    }
  },
);

router.get(
  '/tenants/:tenantKey/insights',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await getTenantInsights(req, {
        tenantKey: req.params.tenantKey,
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
      logPivotRouteError('GET /admin/pivot/tenants/:tenantKey/insights', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to load tenant pivot insights.',
      });
    }
  },
);

router.get(
  '/tenants/:tenantKey/crew-metrics',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await getTenantCrewMetrics(req, {
        tenantKey: req.params.tenantKey,
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
      logPivotRouteError('GET /admin/pivot/tenants/:tenantKey/crew-metrics', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to load tenant crew metrics.',
      });
    }
  },
);

router.post(
  '/tenants/:tenantKey/batches/:batchWeek/release',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await releaseBatch(req, {
        tenantKey: req.params.tenantKey,
        batchWeek: req.params.batchWeek,
        eventIds: req.body?.eventIds,
        rebuildSnapshot: req.body?.rebuildSnapshot,
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
      logPivotRouteError(
        'POST /admin/pivot/tenants/:tenantKey/batches/:batchWeek/release',
        err,
        req,
      );
      return res.status(500).json({
        success: false,
        message: 'Unable to release pivot batch.',
      });
    }
  },
);

router.post(
  '/tenants/:tenantKey/batches/:batchWeek/unrelease',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await unreleaseBatch(req, {
        tenantKey: req.params.tenantKey,
        batchWeek: req.params.batchWeek,
        confirm: req.body?.confirm,
        eventIds: req.body?.eventIds,
        rebuildSnapshot: req.body?.rebuildSnapshot,
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
      logPivotRouteError(
        'POST /admin/pivot/tenants/:tenantKey/batches/:batchWeek/unrelease',
        err,
        req,
      );
      return res.status(500).json({
        success: false,
        message: 'Unable to unrelease pivot batch.',
      });
    }
  },
);

router.get(
  '/tenants/:tenantKey/batches/:batchWeek/readiness',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await getBatchReadiness(req, {
        tenantKey: req.params.tenantKey,
        batchWeek: req.params.batchWeek,
        benchmarkWeeks: req.query?.benchmarkWeeks,
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
      logPivotRouteError(
        'GET /admin/pivot/tenants/:tenantKey/batches/:batchWeek/readiness',
        err,
        req,
      );
      return res.status(500).json({
        success: false,
        message: 'Unable to load batch readiness.',
      });
    }
  },
);

router.get(
  '/tenants/:tenantKey/sources',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await listCitySources(req, {
        tenantKey: req.params.tenantKey,
        status: req.query?.status,
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
      logPivotRouteError('GET /admin/pivot/tenants/:tenantKey/sources', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to list city sources.',
      });
    }
  },
);

/**
 * Walk the pipeline with no outbound calls, so the console can be reviewed
 * before a Firecrawl key exists and before any credits are at stake.
 */
router.post(
  '/tenants/:tenantKey/sources/rehearse',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await startCitySourceDiscoveryRehearsal(req, {
        tenantKey: req.params.tenantKey,
        tags: req.body?.tags,
        maxQueries: req.body?.maxQueries,
        maxCandidates: req.body?.maxCandidates,
      });
      if (result.error) {
        return res.status(result.status || 400).json({
          success: false,
          message: result.error,
          code: result.code,
        });
      }

      return res.status(202).json({ success: true, data: result.data });
    } catch (err) {
      logPivotRouteError('POST /admin/pivot/tenants/:tenantKey/sources/rehearse', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to start a discovery rehearsal.',
      });
    }
  },
);

// Registered before `/sources/:sourceId` so the literal segments are not
// swallowed by the id parameter.
router.get(
  '/tenants/:tenantKey/discovery-runs/latest',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await getLatestCitySourceDiscoveryRun(req, {
        tenantKey: req.params.tenantKey,
        includeSteps: req.query.includeSteps === 'true',
      });
      if (result.error) {
        return res.status(result.status || 400).json({
          success: false,
          message: result.error,
          code: result.code,
        });
      }

      return res.status(200).json({ success: true, data: result.data });
    } catch (err) {
      logPivotRouteError('GET /admin/pivot/tenants/:tenantKey/discovery-runs/latest', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to load the latest discovery run.',
      });
    }
  },
);

router.get(
  '/tenants/:tenantKey/discovery-runs/:runId',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await getCitySourceDiscoveryRun(req, {
        tenantKey: req.params.tenantKey,
        runId: req.params.runId,
      });
      if (result.error) {
        return res.status(result.status || 400).json({
          success: false,
          message: result.error,
          code: result.code,
        });
      }

      return res.status(200).json({ success: true, data: result.data });
    } catch (err) {
      logPivotRouteError('GET /admin/pivot/tenants/:tenantKey/discovery-runs/:runId', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to load the discovery run.',
      });
    }
  },
);

router.post(
  '/tenants/:tenantKey/discovery-runs/:runId/stop',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await stopCitySourceDiscoveryRun(req, {
        tenantKey: req.params.tenantKey,
        runId: req.params.runId,
      });
      if (result.error) {
        return res.status(result.status || 400).json({
          success: false,
          message: result.error,
          code: result.code,
        });
      }

      return res.status(200).json({ success: true, data: result.data });
    } catch (err) {
      logPivotRouteError(
        'POST /admin/pivot/tenants/:tenantKey/discovery-runs/:runId/stop',
        err,
        req,
      );
      return res.status(500).json({
        success: false,
        message: 'Unable to stop the discovery agent.',
      });
    }
  },
);

router.patch(
  '/tenants/:tenantKey/sources/discovery-config',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await updateCityDiscoveryConfig(req, {
        tenantKey: req.params.tenantKey,
        flow: req.body?.flow,
        lumaSlug: req.body?.lumaSlug,
        partifulSlug: req.body?.partifulSlug,
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
      logPivotRouteError(
        'PATCH /admin/pivot/tenants/:tenantKey/sources/discovery-config',
        err,
        req,
      );
      return res.status(500).json({
        success: false,
        message: 'Unable to save discovery flow.',
      });
    }
  },
);

router.patch(
  '/tenants/:tenantKey/sources/:sourceId',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await updateCitySource(req, {
        tenantKey: req.params.tenantKey,
        sourceId: req.params.sourceId,
        enabled: req.body?.enabled,
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
      logPivotRouteError('PATCH /admin/pivot/tenants/:tenantKey/sources/:sourceId', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to update city source.',
      });
    }
  },
);

router.get(
  '/tenants/:tenantKey/sources/discovery-plan',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await previewCitySourceDiscovery(req, {
        tenantKey: req.params.tenantKey,
        tags: req.query?.tags ? String(req.query.tags).split(',') : undefined,
        maxQueries: req.query?.maxQueries,
        maxCandidates: req.query?.maxCandidates,
        minEvents: req.query?.minEvents,
        flow: req.query?.flow,
        lumaSlug: req.query?.lumaSlug,
        partifulSlug: req.query?.partifulSlug,
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
      logPivotRouteError(
        'GET /admin/pivot/tenants/:tenantKey/sources/discovery-plan',
        err,
        req,
      );
      return res.status(500).json({
        success: false,
        message: 'Unable to build a discovery plan.',
      });
    }
  },
);

router.post(
  '/tenants/:tenantKey/sources/discover',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await startCitySourceDiscovery(req, {
        tenantKey: req.params.tenantKey,
        tags: req.body?.tags,
        maxQueries: req.body?.maxQueries,
        resultsPerQuery: req.body?.resultsPerQuery,
        maxCandidates: req.body?.maxCandidates,
        minEvents: req.body?.minEvents,
        createJobs: req.body?.createJobs,
        recheckRejected: req.body?.recheckRejected,
        flow: req.body?.flow,
        lumaSlug: req.body?.lumaSlug,
        partifulSlug: req.body?.partifulSlug,
      });
      if (result.error) {
        return res.status(result.status || 400).json({
          success: false,
          message: result.error,
          code: result.code,
        });
      }

      // 202: discovery keeps running after this response; poll GET .../sources.
      return res.status(202).json({
        success: true,
        data: result.data,
      });
    } catch (err) {
      logPivotRouteError('POST /admin/pivot/tenants/:tenantKey/sources/discover', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to start source discovery.',
      });
    }
  },
);

router.get(
  '/tenants/:tenantKey/curation-jobs',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await listCurationJobs(req, {
        tenantKey: req.params.tenantKey,
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
      logPivotRouteError('GET /admin/pivot/tenants/:tenantKey/curation-jobs', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to list curation jobs.',
      });
    }
  },
);

router.post(
  '/tenants/:tenantKey/curation-jobs',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await createCurationJob(req, {
        tenantKey: req.params.tenantKey,
        label: req.body?.label,
        url: req.body?.url,
        provider: req.body?.provider,
        defaultBatchWeekStrategy: req.body?.defaultBatchWeekStrategy,
        defaultTags: req.body?.defaultTags,
        enabled: req.body?.enabled,
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
      logPivotRouteError('POST /admin/pivot/tenants/:tenantKey/curation-jobs', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to create curation job.',
      });
    }
  },
);

router.patch(
  '/tenants/:tenantKey/curation-jobs/:jobId',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await updateCurationJob(req, {
        tenantKey: req.params.tenantKey,
        jobId: req.params.jobId,
        label: req.body?.label,
        url: req.body?.url,
        provider: req.body?.provider,
        defaultBatchWeekStrategy: req.body?.defaultBatchWeekStrategy,
        defaultTags: req.body?.defaultTags,
        enabled: req.body?.enabled,
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
      logPivotRouteError(
        'PATCH /admin/pivot/tenants/:tenantKey/curation-jobs/:jobId',
        err,
        req,
      );
      return res.status(500).json({
        success: false,
        message: 'Unable to update curation job.',
      });
    }
  },
);

router.delete(
  '/tenants/:tenantKey/curation-jobs/:jobId',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await deleteCurationJob(req, {
        tenantKey: req.params.tenantKey,
        jobId: req.params.jobId,
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
      logPivotRouteError(
        'DELETE /admin/pivot/tenants/:tenantKey/curation-jobs/:jobId',
        err,
        req,
      );
      return res.status(500).json({
        success: false,
        message: 'Unable to delete curation job.',
      });
    }
  },
);

router.post(
  '/tenants/:tenantKey/curation-jobs/:jobId/run',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await startCurationJobRun(req, {
        tenantKey: req.params.tenantKey,
        jobId: req.params.jobId,
        batchWeek: req.body?.batchWeek,
        forceBatchWeek: req.body?.forceBatchWeek,
        maxEvents: req.body?.maxEvents,
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
      logPivotRouteError(
        'POST /admin/pivot/tenants/:tenantKey/curation-jobs/:jobId/run',
        err,
        req,
      );
      return res.status(500).json({
        success: false,
        message: 'Unable to start curation job run.',
      });
    }
  },
);

router.post(
  '/tenants/:tenantKey/curation-batches',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await startCurationBatch(req, {
        tenantKey: req.params.tenantKey,
        jobIds: req.body?.jobIds,
        batchWeek: req.body?.batchWeek,
        forceBatchWeek: req.body?.forceBatchWeek,
      });
      if (result.error) {
        return res.status(result.status || 400).json({
          success: false,
          message: result.error,
          code: result.code,
        });
      }

      // Accepted: the batch runs well past this response, and the caller watches
      // the returned run id.
      return res.status(202).json({ success: true, data: result.data });
    } catch (err) {
      logPivotRouteError('POST /admin/pivot/tenants/:tenantKey/curation-batches', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to start curation batch.',
      });
    }
  },
);

// Before `/curation-batches/:runId`, so the literal segment is not read as an id.
router.get(
  '/tenants/:tenantKey/curation-batches/latest',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await getLatestCurationBatch(req, {
        tenantKey: req.params.tenantKey,
        includeSteps: req.query.includeSteps === 'true',
      });
      if (result.error) {
        return res.status(result.status || 400).json({
          success: false,
          message: result.error,
          code: result.code,
        });
      }

      return res.status(200).json({ success: true, data: result.data });
    } catch (err) {
      logPivotRouteError('GET /admin/pivot/tenants/:tenantKey/curation-batches/latest', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to load the latest curation batch.',
      });
    }
  },
);

router.get(
  '/tenants/:tenantKey/curation-batches/:runId',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await getCurationBatch(req, {
        tenantKey: req.params.tenantKey,
        runId: req.params.runId,
      });
      if (result.error) {
        return res.status(result.status || 400).json({
          success: false,
          message: result.error,
          code: result.code,
        });
      }

      return res.status(200).json({ success: true, data: result.data });
    } catch (err) {
      logPivotRouteError('GET /admin/pivot/tenants/:tenantKey/curation-batches/:runId', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to load the curation batch.',
      });
    }
  },
);

router.get(
  '/tenants/:tenantKey/curation-runs/:runId',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await getCurationRun(req, {
        tenantKey: req.params.tenantKey,
        runId: req.params.runId,
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
      logPivotRouteError(
        'GET /admin/pivot/tenants/:tenantKey/curation-runs/:runId',
        err,
        req,
      );
      return res.status(500).json({
        success: false,
        message: 'Unable to load curation run.',
      });
    }
  },
);

router.get(
  '/tenants/:tenantKey/journeys/overview',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await getJourneyOverview(req, {
        tenantKey: req.params.tenantKey,
        batchWeek: req.query?.batchWeek,
        range: req.query?.range,
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
      logPivotRouteError(
        'GET /admin/pivot/tenants/:tenantKey/journeys/overview',
        err,
        req,
      );
      return res.status(500).json({
        success: false,
        message: 'Unable to load journey overview.',
      });
    }
  },
);

router.get(
  '/tenants/:tenantKey/journeys/funnel',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await getJourneyFunnel(req, {
        tenantKey: req.params.tenantKey,
        batchWeek: req.query?.batchWeek,
        steps: req.query?.steps,
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
      logPivotRouteError(
        'GET /admin/pivot/tenants/:tenantKey/journeys/funnel',
        err,
        req,
      );
      return res.status(500).json({
        success: false,
        message: 'Unable to load journey funnel.',
      });
    }
  },
);

router.get(
  '/tenants/:tenantKey/journeys/path',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await getJourneyPath(req, {
        tenantKey: req.params.tenantKey,
        batchWeek: req.query?.batchWeek,
        startingPoint: req.query?.startingPoint,
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
      logPivotRouteError(
        'GET /admin/pivot/tenants/:tenantKey/journeys/path',
        err,
        req,
      );
      return res.status(500).json({
        success: false,
        message: 'Unable to load journey path.',
      });
    }
  },
);

router.get(
  '/tenants/:tenantKey/drop-deck/preview',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await previewAdminDropDeck(req, {
        tenantKey: req.params.tenantKey,
        userId: req.query?.userId,
        batchWeek: req.query?.batchWeek,
        rebuild: req.query?.rebuild,
      });
      if (result.error) {
        logPivotServiceReject(
          'GET /admin/pivot/tenants/:tenantKey/drop-deck/preview',
          result,
          req,
          { tenantKey: req.params.tenantKey, userId: req.query?.userId },
        );
        return res.status(result.status || 400).json({
          success: false,
          message: result.error,
          code: result.code,
        });
      }

      logPivotServiceSuccess(
        'GET /admin/pivot/tenants/:tenantKey/drop-deck/preview',
        req,
        {
          tenantKey: result.data?.tenantKey,
          userId: result.data?.user?.userId,
          eventCount: result.data?.events?.length ?? 0,
          frozen: result.data?.frozen,
        },
      );
      return res.status(200).json({
        success: true,
        data: result.data,
      });
    } catch (err) {
      logPivotRouteError(
        'GET /admin/pivot/tenants/:tenantKey/drop-deck/preview',
        err,
        req,
      );
      return res.status(500).json({
        success: false,
        message: 'Unable to preview drop deck.',
      });
    }
  },
);

router.get(
  '/tenants/:tenantKey/journeys/users',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await searchJourneyUsers(req, {
        tenantKey: req.params.tenantKey,
        query: req.query?.query ?? req.query?.q,
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
      logPivotRouteError(
        'GET /admin/pivot/tenants/:tenantKey/journeys/users',
        err,
        req,
      );
      return res.status(500).json({
        success: false,
        message: 'Unable to search journey users.',
      });
    }
  },
);

router.get(
  '/tenants/:tenantKey/journeys/users/:userId/history',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await getUserJourneyHistory(req, {
        tenantKey: req.params.tenantKey,
        userId: req.params.userId,
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
      logPivotRouteError(
        'GET /admin/pivot/tenants/:tenantKey/journeys/users/:userId/history',
        err,
        req,
      );
      return res.status(500).json({
        success: false,
        message: 'Unable to load user journey history.',
      });
    }
  },
);

router.post(
  '/tenants/:tenantKey/users/:userId/wipe-week',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await wipeUserWeekIntents(req, {
        tenantKey: req.params.tenantKey,
        userId: req.params.userId,
        batchWeek: req.body?.batchWeek,
        confirm: req.body?.confirm,
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
      logPivotRouteError(
        'POST /admin/pivot/tenants/:tenantKey/users/:userId/wipe-week',
        err,
        req,
      );
      return res.status(500).json({
        success: false,
        message: 'Unable to wipe user week intents.',
      });
    }
  },
);

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

router.post(
  '/ingest/suggest-and-apply-tags',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await suggestAndApplyPivotEventTags(req, {
        tenantKey: req.body?.tenantKey,
        eventIds: req.body?.eventIds,
        onlyTagless: req.body?.onlyTagless,
        concurrency: req.body?.concurrency,
      });
      if (result.error) {
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
      logPivotRouteError('POST /admin/pivot/ingest/suggest-and-apply-tags', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to suggest and apply pivot tags.',
      });
    }
  },
);

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

router.post('/ingest/annotate-duplicates', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await annotateImportDuplicates(req, {
      tenantKey: req.body?.tenantKey,
      drafts: req.body?.drafts,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    logPivotRouteError('POST /admin/pivot/ingest/annotate-duplicates', err, req);
    return res.status(500).json({
      success: false,
      message: 'Unable to check for duplicate events.',
    });
  }
});

router.get('/ingest/location-reviews', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await listLocationReviewCandidates(req, {
      tenantKey: req.query?.tenantKey,
      status: req.query?.status,
      limit: req.query?.limit,
    });
    if (result.error) {
      return res.status(result.status || 400).json({
        success: false,
        message: result.error,
        code: result.code,
      });
    }
    return res.status(200).json({ success: true, data: result.data });
  } catch (err) {
    logPivotRouteError('GET /admin/pivot/ingest/location-reviews', err, req);
    return res.status(500).json({ success: false, message: 'Unable to load location reviews.' });
  }
});

router.post(
  '/ingest/:eventId/location-review',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await reviewLocationCandidate(req, {
        eventId: req.params.eventId,
        tenantKey: req.body?.tenantKey,
        action: req.body?.action,
        candidateId: req.body?.candidateId,
        richLocation: req.body?.richLocation,
        notes: req.body?.notes,
      });
      if (result.error) {
        return res.status(result.status || 400).json({
          success: false,
          message: result.error,
          code: result.code,
        });
      }
      return res.status(200).json({ success: true, data: result.data });
    } catch (err) {
      logPivotRouteError('POST /admin/pivot/ingest/:eventId/location-review', err, req);
      return res.status(500).json({ success: false, message: 'Unable to review location.' });
    }
  },
);

router.post('/ingest', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await publishIngestEvent(req, {
      tenantKey: req.body?.tenantKey,
      url: req.body?.url,
      batchWeek: req.body?.batchWeek,
      forceBatchWeek: req.body?.forceBatchWeek,
      overrides: req.body?.overrides,
      releaseNow: req.body?.releaseNow,
      confirm: req.body?.confirm,
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
      batchWeek: result.data?.batchWeek || req.body?.batchWeek,
      batchWeekSource: result.data?.batchWeekSource,
      eventId: result.data?.event?._id,
      eventName: result.data?.event?.name,
      ingestStatus: result.data?.ingestStatus,
    });

    return res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    logPivotRouteError('POST /admin/pivot/ingest', err, req);
    return res.status(500).json({
      success: false,
      message: 'Unable to stage pivot catalog event.',
    });
  }
});

router.post('/ingest/collapse-showtimes', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await collapseCatalogEventsToShowtimes(req, {
      tenantKey: req.body?.tenantKey,
      eventIds: req.body?.eventIds,
      keepEventId: req.body?.keepEventId,
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
    logPivotRouteError('POST /admin/pivot/ingest/collapse-showtimes', err, req);
    return res.status(500).json({
      success: false,
      message: 'Unable to collapse events into showtimes.',
    });
  }
});

router.post('/ingest/batch', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await publishBatchIngestEvents(req, {
      tenantKey: req.body?.tenantKey,
      batchWeek: req.body?.batchWeek,
      forceBatchWeek: req.body?.forceBatchWeek,
      events: req.body?.events,
      releaseNow: req.body?.releaseNow,
      confirm: req.body?.confirm,
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
      batchWeekCounts: result.data?.batchWeekCounts,
      forceBatchWeek: result.data?.forceBatchWeek,
      publishedCount: result.data?.publishedCount ?? result.data?.published?.length ?? 0,
      failedCount: result.data?.failedCount ?? result.data?.failures?.length ?? 0,
      ingestStatus: result.data?.ingestStatus,
    });

    return res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    logPivotRouteError('POST /admin/pivot/ingest/batch', err, req);
    return res.status(500).json({
      success: false,
      message: 'Unable to stage pivot catalog events.',
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

router.delete('/ingest/:eventId', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await deletePivotCatalogEvent(
      req.body?.tenantKey || req.query?.tenantKey,
      req.params.eventId,
    );
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
    logPivotRouteError('DELETE /admin/pivot/ingest/:eventId', err, req);
    return res.status(500).json({
      success: false,
      message: 'Unable to delete pivot catalog event.',
    });
  }
});

router.post(
  '/tenants/:tenantKey/catalog/purge-out-of-week',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const tenantKey = req.params.tenantKey?.trim()?.toLowerCase();
      const pivotTenants = (await getMergedTenants(req)).filter(isPivotTenant);
      const tenant = pivotTenants.find((row) => row.tenantKey === tenantKey);
      if (!tenant) {
        return res.status(404).json({
          success: false,
          message: 'Pivot tenant not found.',
          code: 'TENANT_NOT_FOUND',
        });
      }

      const dropConfig = resolvePivotDropConfig(tenant);
      const result = await purgePivotCatalogOutOfWeek(
        tenantKey,
        req.body?.batchWeek,
        dropConfig.dayOfWeek,
      );
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
      logPivotRouteError(
        'POST /admin/pivot/tenants/:tenantKey/catalog/purge-out-of-week',
        err,
        req,
      );
      return res.status(500).json({
        success: false,
        message: 'Unable to purge out-of-range pivot catalog events.',
      });
    }
  },
);

router.post('/dev/purge-catalog', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await purgePivotCatalog(req, {
      tenantKey: req.body?.tenantKey,
      confirm: req.body?.confirm,
      clearSnapshots: req.body?.clearSnapshots,
      batchWeek: req.body?.batchWeek,
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

/** Just Go Creator grants — API-only v0 (Task 1.1). */
router.get(
  '/tenants/:tenantKey/creators',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await listCreatorGrants(req, req.params.tenantKey, {
        status: req.query?.status,
      });
      if (result.error) {
        return res.status(result.status || 400).json({
          success: false,
          message: result.error,
          code: result.code,
        });
      }
      return res.status(200).json({ success: true, data: result.data });
    } catch (err) {
      logPivotRouteError('GET /admin/pivot/tenants/:tenantKey/creators', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to list Just Go creators.',
      });
    }
  },
);

router.post(
  '/tenants/:tenantKey/creators',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await grantCreator(req, req.params.tenantKey, req.body || {});
      if (result.error) {
        return res.status(result.status || 400).json({
          success: false,
          message: result.error,
          code: result.code,
        });
      }
      return res.status(result.reactivated ? 200 : 201).json({
        success: true,
        data: result.data,
      });
    } catch (err) {
      logPivotRouteError('POST /admin/pivot/tenants/:tenantKey/creators', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to grant Just Go creator access.',
      });
    }
  },
);

router.delete(
  '/tenants/:tenantKey/creators/:globalUserId',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await revokeCreator(
        req,
        req.params.tenantKey,
        req.params.globalUserId,
      );
      if (result.error) {
        return res.status(result.status || 400).json({
          success: false,
          message: result.error,
          code: result.code,
        });
      }
      return res.status(200).json({ success: true, data: result.data });
    } catch (err) {
      logPivotRouteError(
        'DELETE /admin/pivot/tenants/:tenantKey/creators/:globalUserId',
        err,
        req,
      );
      return res.status(500).json({
        success: false,
        message: 'Unable to revoke Just Go creator access.',
      });
    }
  },
);

router.get(
  '/tenants/:tenantKey/organizers',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await listOrganizers(req, {
        tenantKey: req.params.tenantKey,
        q: req.query?.q,
        claimStatus: req.query?.claimStatus,
        source: req.query?.source,
        sort: req.query?.sort,
        limit: req.query?.limit,
        offset: req.query?.offset,
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
      logPivotRouteError('GET /admin/pivot/tenants/:tenantKey/organizers', err, req);
      return res.status(500).json({
        success: false,
        message: 'Unable to list organizers.',
      });
    }
  },
);

router.get(
  '/tenants/:tenantKey/organizers/unlinked',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await listUnlinkedOrganizerEvents(req, {
        tenantKey: req.params.tenantKey,
        kind: req.query?.kind,
        limit: req.query?.limit,
        offset: req.query?.offset,
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
      logPivotRouteError(
        'GET /admin/pivot/tenants/:tenantKey/organizers/unlinked',
        err,
        req,
      );
      return res.status(500).json({
        success: false,
        message: 'Unable to list unlinked events.',
      });
    }
  },
);

router.get(
  '/tenants/:tenantKey/organizers/:organizerId',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await getOrganizer(req, {
        tenantKey: req.params.tenantKey,
        organizerId: req.params.organizerId,
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
      logPivotRouteError(
        'GET /admin/pivot/tenants/:tenantKey/organizers/:organizerId',
        err,
        req,
      );
      return res.status(500).json({
        success: false,
        message: 'Unable to load organizer.',
      });
    }
  },
);

router.post(
  '/tenants/:tenantKey/organizers/backfill',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await backfillOrganizers(req, {
        tenantKey: req.params.tenantKey,
        force: req.body?.force === true || req.body?.force === 'true',
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
      logPivotRouteError(
        'POST /admin/pivot/tenants/:tenantKey/organizers/backfill',
        err,
        req,
      );
      return res.status(500).json({
        success: false,
        message: 'Unable to backfill organizers.',
      });
    }
  },
);

router.post(
  '/tenants/:tenantKey/organizers/:organizerId/merge',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await mergeOrganizers(req, {
        tenantKey: req.params.tenantKey,
        organizerId: req.params.organizerId,
        sourceOrganizerId: req.body?.sourceOrganizerId,
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
      logPivotRouteError(
        'POST /admin/pivot/tenants/:tenantKey/organizers/:organizerId/merge',
        err,
        req,
      );
      return res.status(500).json({
        success: false,
        message: 'Unable to merge organizers.',
      });
    }
  },
);

router.post(
  '/tenants/:tenantKey/organizers/:organizerId/split',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await splitOrganizer(req, {
        tenantKey: req.params.tenantKey,
        organizerId: req.params.organizerId,
        eventIds: req.body?.eventIds,
        newCanonicalName: req.body?.newCanonicalName,
        identity: req.body?.identity,
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
      logPivotRouteError(
        'POST /admin/pivot/tenants/:tenantKey/organizers/:organizerId/split',
        err,
        req,
      );
      return res.status(500).json({
        success: false,
        message: 'Unable to split organizer.',
      });
    }
  },
);

router.post(
  '/tenants/:tenantKey/organizers/:organizerId/claim',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await claimOrganizer(req, {
        tenantKey: req.params.tenantKey,
        organizerId: req.params.organizerId,
        globalUserId: req.body?.globalUserId || req.body?.userId,
        unclaim: req.body?.unclaim === true || req.body?.unclaim === 'true',
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
      logPivotRouteError(
        'POST /admin/pivot/tenants/:tenantKey/organizers/:organizerId/claim',
        err,
        req,
      );
      return res.status(500).json({
        success: false,
        message: 'Unable to claim organizer.',
      });
    }
  },
);

module.exports = router;
