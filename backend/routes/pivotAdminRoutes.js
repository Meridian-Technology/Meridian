const { studioUpload, listAssets, uploadAsset } = require('../services/pivotCarouselAssetService');
const express = require('express');
const { verifyToken } = require('../middlewares/verifyToken');
const {
  listCarouselDecks,
  getCarouselDeck,
  createCarouselDeck,
  updateCarouselDeck,
  deleteCarouselDeck,
} = require('../services/pivotCarouselDeckService');
const {
  voiceCatalog,
  getCarouselVoiceLayers,
  patchCarouselVoice,
} = require('../services/pivotCarouselVoiceService');
const { searchCarouselCatalog } = require('../services/pivotCarouselCatalogService');
const { setSlideImage } = require('../services/pivotCarouselDeckService');
const { upload } = require('../services/imageUploadService');
const {
  mintExportToken,
  readDeckForExport,
} = require('../services/pivotCarouselExportService');
const {
  createCarouselAccount,
  getCarouselAccount,
  listCarouselAccounts,
  listCarouselIssues,
  createCarouselIssue,
  getCarouselIssue,
  renameCarouselIssue,
  updateCarouselIssue,
  archiveCarouselIssue,
  restoreCarouselIssue,
  duplicateCarouselIssue,
  createEditableCopy,
} = require('../services/pivotCarouselIssueService');
const {
  migrateCarouselDecksToAccounts,
  rollbackCarouselAccountMigration,
} = require('../services/pivotCarouselMigrationService');
const {
  searchCurationCandidates,
  curationQuerySpec,
  listSavedCurationSearches,
  saveCurationSearch,
  deleteSavedCurationSearch,
} = require('../services/pivotCarouselCurationQueryService');
const {
  createCurationDraft,
  getCurationDraft,
  updateCurationDraft,
  revalidateCurationDraft,
  createIssueFromCurationDraft,
  applyCurationDraftToIssue,
} = require('../services/pivotCarouselCurationDraftService');
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
const { updateBatchSelectionPolicy } = require('../services/pivotEditorialPolicyService');
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
const { getAcquisitionFunnel } = require('../services/pivotAcquisitionFunnelService');
const { getUserDeckReplay } = require('../services/pivotDeckReplayService');
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
const {
  collapseCatalogEventsToShowtimes,
  previewCatalogShowtimeCollapse,
} = require('../services/pivotCatalogShowtimeCollapseService');
const { enrichPivotEventRichData } = require('../services/pivotRichDataEnrichmentService');
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
const { updateCityComputeApplyConfig } = require('../utilities/pivotComputeApplyPolicy');
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

/* ------------------------------------------------------- carousel decks */

/**
 * One handler shape for all five: the service returns { data } or
 * { error, status, code }, exactly as the copy pack routes above do.
 */
function sendDeckResult(res, result, okStatus = 200) {
  if (result.error) {
    return res.status(result.status || 400).json({
      success: false,
      message: result.error,
      code: result.code,
      ...(result.limits ? { limits: result.limits } : {}),
      ...(result.storedRevision !== undefined ? {
        storedRevision: result.storedRevision,
        presentedRevision: result.presentedRevision,
      } : {}),
      ...(result.details ? { details: result.details } : {}),
    });
  }
  return res.status(okStatus).json({ success: true, data: result.data });
}

router.get(
  '/tenants/:tenantKey/carousels',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      return sendDeckResult(res, await listCarouselDecks(req, req.params.tenantKey));
    } catch (err) {
      logPivotRouteError('GET /admin/pivot/tenants/:tenantKey/carousels', err, req);
      return res.status(500).json({ success: false, message: 'Unable to load carousel decks.' });
    }
  },
);

router.post(
  '/tenants/:tenantKey/carousels',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await createCarouselDeck(req, req.params.tenantKey, req.body);
      return sendDeckResult(res, result, 201);
    } catch (err) {
      logPivotRouteError('POST /admin/pivot/tenants/:tenantKey/carousels', err, req);
      return res.status(500).json({ success: false, message: 'Unable to create the deck.' });
    }
  },
);

router.get(
  '/tenants/:tenantKey/carousels/:deckId',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await getCarouselDeck(req, req.params.tenantKey, req.params.deckId);
      return sendDeckResult(res, result);
    } catch (err) {
      logPivotRouteError('GET /admin/pivot/tenants/:tenantKey/carousels/:deckId', err, req);
      return res.status(500).json({ success: false, message: 'Unable to load the deck.' });
    }
  },
);

router.patch(
  '/tenants/:tenantKey/carousels/:deckId',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await updateCarouselDeck(
        req,
        req.params.tenantKey,
        req.params.deckId,
        req.body,
      );
      return sendDeckResult(res, result);
    } catch (err) {
      logPivotRouteError('PATCH /admin/pivot/tenants/:tenantKey/carousels/:deckId', err, req);
      return res.status(500).json({ success: false, message: 'Unable to save the deck.' });
    }
  },
);

router.delete(
  '/tenants/:tenantKey/carousels/:deckId',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await deleteCarouselDeck(req, req.params.tenantKey, req.params.deckId);
      return sendDeckResult(res, result);
    } catch (err) {
      logPivotRouteError('DELETE /admin/pivot/tenants/:tenantKey/carousels/:deckId', err, req);
      return res.status(500).json({ success: false, message: 'Unable to delete the deck.' });
    }
  },
);

/** Mint a short-lived, deck-scoped token for the local render script. */
router.post(
  '/tenants/:tenantKey/carousels/:deckId/export-token',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await mintExportToken(req, req.params.tenantKey, req.params.deckId);
      return sendDeckResult(res, result, 201);
    } catch (err) {
      logPivotRouteError('POST carousel export-token', err, req);
      return res.status(500).json({ success: false, message: 'Unable to start an export.' });
    }
  },
);

/*
 * Deliberately not behind verifyToken: a headless Chrome started from a
 * terminal has no session cookie, and a navigation cannot carry a header. The
 * token in the query is the credential, and it is worth one deck for ten
 * minutes.
 */
router.get('/carousel-export', async (req, res) => {
  try {
    const result = await readDeckForExport(req, req.query?.token, req.query?.deckId);
    return sendDeckResult(res, result);
  } catch (err) {
    logPivotRouteError('GET /admin/pivot/carousel-export', err, req);
    return res.status(500).json({ success: false, message: 'Unable to load the deck.' });
  }
});

/**
 * Slot picker search. Published events only, newest first, paged — a deck
 * reports on nights that already happened.
 */
router.get(
  '/tenants/:tenantKey/carousel-catalog',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await searchCarouselCatalog(req, req.params.tenantKey, {
        batchWeek: req.query?.batchWeek,
        from: req.query?.from,
        to: req.query?.to,
        q: req.query?.q,
        limit: req.query?.limit,
        skip: req.query?.skip,
      });
      return sendDeckResult(res, result);
    } catch (err) {
      logPivotRouteError('GET /admin/pivot/tenants/:tenantKey/carousel-catalog', err, req);
      return res.status(500).json({ success: false, message: 'Unable to search the catalog.' });
    }
  },
);

/** Replace or clear one event slot's photograph. No file is a clear. */
router.post(
  '/tenants/:tenantKey/carousels/:deckId/slides/:slideId/image',
  verifyToken,
  requirePlatformAdmin,
  upload.single('image'),
  async (req, res) => {
    try {
      const result = await setSlideImage(
        req,
        req.params.tenantKey,
        req.params.deckId,
        req.params.slideId,
        req.body?.slotIndex,
        req.file,
      );
      return sendDeckResult(res, result);
    } catch (err) {
      logPivotRouteError('POST carousel slide image', err, req);
      return res.status(500).json({ success: false, message: 'Unable to set the image.' });
    }
  },
);

/* ------------------------------------------------- carousel static voice */

/*
 * Served in the copy pack's own payload shapes, because the carousel reuses
 * PivotVoicePage as its editor. The catalog is derived from the slide manifest,
 * so a field declaring a voice key needs nothing else to appear in the panel.
 */
router.get(
  '/carousel-voice/catalog',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    return res.status(200).json({ success: true, data: voiceCatalog() });
  },
);

router.get(
  '/tenants/:tenantKey/carousel-voice',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await getCarouselVoiceLayers(req, req.params.tenantKey, req.query?.deckId);
      return sendDeckResult(res, result);
    } catch (err) {
      logPivotRouteError('GET /admin/pivot/tenants/:tenantKey/carousel-voice', err, req);
      return res.status(500).json({ success: false, message: 'Unable to load carousel voice.' });
    }
  },
);

router.patch(
  '/tenants/:tenantKey/carousel-voice',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      // The editor sends { key, value } or { keys: [...] } and knows nothing
      // about which layer it is writing, so scope and deck ride on the query.
      const scope = (req.query?.scope || req.body?.scope) === 'deck' ? 'deck' : 'city';
      const result = await patchCarouselVoice(req, req.params.tenantKey, {
        scope,
        deckId: req.query?.deckId || req.body?.deckId,
        key: req.body?.key,
        value: req.body?.value,
        reset: req.body?.keys || req.body?.reset,
      });
      return sendDeckResult(res, result);
    } catch (err) {
      logPivotRouteError('PATCH /admin/pivot/tenants/:tenantKey/carousel-voice', err, req);
      return res.status(500).json({ success: false, message: 'Unable to save carousel voice.' });
    }
  },
);

/* ------------------------------------------------- carousel accounts */

router.post(
  '/carousel-accounts',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      return sendDeckResult(res, await createCarouselAccount(req, req.body), 201);
    } catch (err) {
      logPivotRouteError('POST /admin/pivot/carousel-accounts', err, req);
      return res.status(500).json({ success: false, message: 'Unable to create the account.' });
    }
  },
);

router.get(
  '/carousel-accounts',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      return sendDeckResult(res, await listCarouselAccounts(req, req.query));
    } catch (err) {
      logPivotRouteError('GET /admin/pivot/carousel-accounts', err, req);
      return res.status(500).json({ success: false, message: 'Unable to load accounts.' });
    }
  },
);

router.post(
  '/carousel-accounts/migrate',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      return sendDeckResult(res, await migrateCarouselDecksToAccounts(req, {
        dryRun: req.body?.dryRun !== false,
        tenantKey: req.body?.tenantKey || null,
      }));
    } catch (err) {
      logPivotRouteError('POST carousel account migrate', err, req);
      return res.status(500).json({ success: false, message: 'Unable to migrate decks.' });
    }
  },
);

router.post(
  '/carousel-accounts/migrate/rollback',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      return sendDeckResult(res, await rollbackCarouselAccountMigration(req, req.body?.rollback || []));
    } catch (err) {
      logPivotRouteError('POST carousel account migrate rollback', err, req);
      return res.status(500).json({ success: false, message: 'Unable to roll back the migration.' });
    }
  },
);

router.get('/carousel-accounts/:accountId/unsplash', verifyToken, requirePlatformAdmin, async (req, res) => {
  return sendDeckResult(res, await require('../services/pivotCarouselUnsplashService').searchPhotos(req, req.params.accountId, req.query));
});
router.post('/carousel-accounts/:accountId/unsplash/select', verifyToken, requirePlatformAdmin, async (req, res) => {
  return sendDeckResult(res, await require('../services/pivotCarouselUnsplashService').selectPhoto(req, req.params.accountId, req.body.photoId));
});
router.get('/carousel-accounts/:accountId/assets', verifyToken, requirePlatformAdmin, async (req, res) => {
  try { return sendDeckResult(res, await listAssets(req, req.params.accountId)); }
  catch (error) { logPivotRouteError('GET carousel assets', error, req); return res.status(500).json({ success: false, message: 'Could not load images.' }); }
});
router.post('/carousel-accounts/:accountId/assets', verifyToken, requirePlatformAdmin, studioUpload, async (req, res) => {
  try { return sendDeckResult(res, await uploadAsset(req, req.params.accountId, req.file)); }
  catch (error) { logPivotRouteError('POST carousel assets', error, req); return res.status(500).json({ success: false, message: 'Image upload failed. Try again.' }); }
});
router.post('/carousel-accounts/:accountId/curation/drafts/:draftId/preview', verifyToken, requirePlatformAdmin, async (req, res) => {
  try { return sendDeckResult(res, await require('../services/pivotCarouselCurationDraftService').previewCurationDraft(req, req.params.accountId, req.params.draftId, req.body)); }
  catch (error) { logPivotRouteError('POST curation preview', error, req); return res.status(500).json({ success: false, message: 'Could not preview the selection.' }); }
});

router.get(
  '/carousel-accounts/:accountId',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      return sendDeckResult(res, await getCarouselAccount(req, req.params.accountId));
    } catch (err) {
      logPivotRouteError('GET /admin/pivot/carousel-accounts/:accountId', err, req);
      return res.status(500).json({ success: false, message: 'Unable to load the account.' });
    }
  },
);

router.get(
  '/carousel-accounts/:accountId/issues',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      return sendDeckResult(res, await listCarouselIssues(req, req.params.accountId, req.query));
    } catch (err) {
      logPivotRouteError('GET carousel issues', err, req);
      return res.status(500).json({ success: false, message: 'Unable to load issues.' });
    }
  },
);

router.post(
  '/carousel-accounts/:accountId/issues',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      return sendDeckResult(res, await createCarouselIssue(req, req.params.accountId, req.body), 201);
    } catch (err) {
      logPivotRouteError('POST carousel issues', err, req);
      return res.status(500).json({ success: false, message: 'Unable to create the issue.' });
    }
  },
);

router.get(
  '/carousel-accounts/:accountId/issues/:issueId',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      return sendDeckResult(res, await getCarouselIssue(req, req.params.accountId, req.params.issueId));
    } catch (err) {
      logPivotRouteError('GET carousel issue', err, req);
      return res.status(500).json({ success: false, message: 'Unable to load the issue.' });
    }
  },
);

router.patch(
  '/carousel-accounts/:accountId/issues/:issueId',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = req.body?.name !== undefined && Object.keys(req.body).every((key) => ['name', 'revision'].includes(key))
        ? await renameCarouselIssue(req, req.params.accountId, req.params.issueId, req.body)
        : await updateCarouselIssue(req, req.params.accountId, req.params.issueId, req.body);
      return sendDeckResult(res, result);
    } catch (err) {
      logPivotRouteError('PATCH carousel issue', err, req);
      return res.status(500).json({ success: false, message: 'Unable to save the issue.' });
    }
  },
);

router.post(
  '/carousel-accounts/:accountId/issues/:issueId/editable-copy',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      return sendDeckResult(res, await createEditableCopy(req, req.params.accountId, req.params.issueId), 201);
    } catch (err) {
      logPivotRouteError('POST carousel editable copy', err, req);
      return res.status(500).json({ success: false, message: 'Unable to copy the issue.' });
    }
  },
);

router.post(
  '/carousel-accounts/:accountId/issues/:issueId/duplicate',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      return sendDeckResult(res, await duplicateCarouselIssue(req, req.params.accountId, req.params.issueId), 201);
    } catch (err) {
      logPivotRouteError('POST carousel issue duplicate', err, req);
      return res.status(500).json({ success: false, message: 'Unable to duplicate the issue.' });
    }
  },
);

router.post(
  '/carousel-accounts/:accountId/issues/:issueId/archive',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      return sendDeckResult(res, await archiveCarouselIssue(req, req.params.accountId, req.params.issueId, req.body));
    } catch (err) {
      logPivotRouteError('POST carousel issue archive', err, req);
      return res.status(500).json({ success: false, message: 'Unable to archive the issue.' });
    }
  },
);

router.post(
  '/carousel-accounts/:accountId/issues/:issueId/restore',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      return sendDeckResult(res, await restoreCarouselIssue(req, req.params.accountId, req.params.issueId, req.body));
    } catch (err) {
      logPivotRouteError('POST carousel issue restore', err, req);
      return res.status(500).json({ success: false, message: 'Unable to restore the issue.' });
    }
  },
);

router.get(
  '/carousel-accounts/:accountId/curation/query-spec',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      return sendDeckResult(res, await curationQuerySpec(req, req.params.accountId));
    } catch (err) {
      logPivotRouteError('GET carousel curation query spec', err, req);
      return res.status(500).json({ success: false, message: 'Unable to load the search contract.' });
    }
  },
);

router.post(
  '/carousel-accounts/:accountId/curation/search',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      return sendDeckResult(res, await searchCurationCandidates(req, req.params.accountId, req.body || {}));
    } catch (err) {
      logPivotRouteError('POST carousel curation search', err, req);
      return res.status(500).json({ success: false, message: 'Unable to search the catalog.' });
    }
  },
);

router.get(
  '/carousel-accounts/:accountId/curation/saved-searches',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      return sendDeckResult(res, await listSavedCurationSearches(req, req.params.accountId));
    } catch (err) {
      logPivotRouteError('GET carousel saved searches', err, req);
      return res.status(500).json({ success: false, message: 'Unable to load saved searches.' });
    }
  },
);

router.post(
  '/carousel-accounts/:accountId/curation/saved-searches',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      return sendDeckResult(res, await saveCurationSearch(req, req.params.accountId, req.body || {}), 201);
    } catch (err) {
      logPivotRouteError('POST carousel saved search', err, req);
      return res.status(500).json({ success: false, message: 'Unable to save the search.' });
    }
  },
);

router.delete(
  '/carousel-accounts/:accountId/curation/saved-searches/:searchId',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      return sendDeckResult(res, await deleteSavedCurationSearch(
        req,
        req.params.accountId,
        req.params.searchId,
      ));
    } catch (err) {
      logPivotRouteError('DELETE carousel saved search', err, req);
      return res.status(500).json({ success: false, message: 'Unable to delete the saved search.' });
    }
  },
);

router.post(
  '/carousel-accounts/:accountId/curation/drafts',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      return sendDeckResult(res, await createCurationDraft(req, req.params.accountId, req.body || {}), 201);
    } catch (err) {
      logPivotRouteError('POST carousel curation draft', err, req);
      return res.status(500).json({ success: false, message: 'Unable to save the curation draft.' });
    }
  },
);

router.get(
  '/carousel-accounts/:accountId/curation/drafts/:draftId',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      return sendDeckResult(res, await getCurationDraft(req, req.params.accountId, req.params.draftId));
    } catch (err) {
      logPivotRouteError('GET carousel curation draft', err, req);
      return res.status(500).json({ success: false, message: 'Unable to load the curation draft.' });
    }
  },
);

router.patch(
  '/carousel-accounts/:accountId/curation/drafts/:draftId',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      return sendDeckResult(res, await updateCurationDraft(
        req,
        req.params.accountId,
        req.params.draftId,
        req.body || {},
      ));
    } catch (err) {
      logPivotRouteError('PATCH carousel curation draft', err, req);
      return res.status(500).json({ success: false, message: 'Unable to save the curation draft.' });
    }
  },
);

router.post(
  '/carousel-accounts/:accountId/curation/drafts/:draftId/revalidate',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      return sendDeckResult(res, await revalidateCurationDraft(
        req,
        req.params.accountId,
        req.params.draftId,
        req.body || {},
      ));
    } catch (err) {
      logPivotRouteError('POST carousel curation revalidate', err, req);
      return res.status(500).json({ success: false, message: 'Unable to revalidate the selection.' });
    }
  },
);

router.post(
  '/carousel-accounts/:accountId/curation/drafts/:draftId/create',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      return sendDeckResult(res, await createIssueFromCurationDraft(
        req,
        req.params.accountId,
        req.params.draftId,
        req.body || {},
      ), 201);
    } catch (err) {
      logPivotRouteError('POST carousel curation create', err, req);
      return res.status(500).json({ success: false, message: 'Unable to create the issue.' });
    }
  },
);

router.post(
  '/carousel-accounts/:accountId/curation/drafts/:draftId/apply',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      return sendDeckResult(res, await applyCurationDraftToIssue(
        req,
        req.params.accountId,
        req.params.draftId,
        req.body || {},
      ));
    } catch (err) {
      logPivotRouteError('POST carousel curation apply', err, req);
      return res.status(500).json({ success: false, message: 'Unable to update the issue selection.' });
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

router.post(
  '/tenants/:tenantKey/catalog/enrich-rich-data',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await enrichPivotEventRichData(req, {
        tenantKey: req.params.tenantKey,
        eventIds: req.body?.eventIds,
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
        'POST /admin/pivot/tenants/:tenantKey/catalog/enrich-rich-data',
        err,
        req,
      );
      return res.status(500).json({
        success: false,
        message: 'Unable to enrich selected catalog events.',
      });
    }
  },
);

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

router.get('/analytics/acquisition', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await getAcquisitionFunnel(req, {
      scope: 'fleet',
      month: req.query?.month,
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
    logPivotRouteError('GET /admin/pivot/analytics/acquisition', err, req);
    return res.status(500).json({
      success: false,
      message: 'Unable to load acquisition funnel.',
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
        horizonDays: req.query?.horizonDays,
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

router.put(
  '/tenants/:tenantKey/batches/:batchWeek/selection-policy',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await updateBatchSelectionPolicy(req, {
        tenantKey: req.params.tenantKey,
        batchWeek: req.params.batchWeek,
        mode: req.body?.mode,
        eventIds: req.body?.eventIds,
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
        'PUT /admin/pivot/tenants/:tenantKey/batches/:batchWeek/selection-policy',
        err,
        req,
      );
      return res.status(500).json({
        success: false,
        message: 'Unable to update batch selection policy.',
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
  '/tenants/:tenantKey/compute-apply-config',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await updateCityComputeApplyConfig(req, {
        tenantKey: req.params.tenantKey,
        patch: req.body,
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
        'PATCH /admin/pivot/tenants/:tenantKey/compute-apply-config',
        err,
        req,
      );
      return res.status(500).json({
        success: false,
        message: 'Unable to save compute-apply policy.',
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
  '/tenants/:tenantKey/analytics/acquisition',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await getAcquisitionFunnel(req, {
        tenantKey: req.params.tenantKey,
        month: req.query?.month,
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
        'GET /admin/pivot/tenants/:tenantKey/analytics/acquisition',
        err,
        req,
      );
      return res.status(500).json({
        success: false,
        message: 'Unable to load acquisition funnel.',
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

router.get(
  '/tenants/:tenantKey/journeys/users/:userId/deck-replay',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const result = await getUserDeckReplay(req, {
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
        'GET /admin/pivot/tenants/:tenantKey/journeys/users/:userId/deck-replay',
        err,
        req,
      );
      return res.status(500).json({
        success: false,
        message: 'Unable to load deck replay.',
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

/** Read-only: what a collapse would produce, so it can be reviewed first. */
router.post('/ingest/collapse-showtimes/preview', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await previewCatalogShowtimeCollapse(req, {
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
    return res.status(200).json({ success: true, data: result.data });
  } catch (err) {
    logPivotRouteError('POST /admin/pivot/ingest/collapse-showtimes/preview', err, req);
    return res.status(500).json({
      success: false,
      message: 'Unable to preview the roll-up.',
    });
  }
});

router.post('/ingest/collapse-showtimes', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const result = await collapseCatalogEventsToShowtimes(req, {
      tenantKey: req.body?.tenantKey,
      eventIds: req.body?.eventIds,
      keepEventId: req.body?.keepEventId,
      acknowledgedWarnings: req.body?.acknowledgedWarnings,
    });
    if (result.error) {
      return res.status(result.status || 400).json({
        success: false,
        message: result.error,
        code: result.code,
        // A refusal over unreviewed warnings carries the plan back, so the
        // caller can show what changed rather than just failing.
        ...(result.data ? { data: result.data } : {}),
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
