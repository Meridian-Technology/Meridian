const express = require('express');
const { verifyToken } = require('../middlewares/verifyToken');
const { requirePlatformAdmin } = require('../middlewares/requirePlatformAdmin');
const {
  getMergedTenants,
  getTenantByKey,
  pingTenantDatabase,
  provisionPivotCatalogOrg,
  serializeTenantForAdmin,
  validateNewTenantPayload,
  validateTenantMetadataUpdate,
  upsertStoredTenantRow,
  syncTenantUriCache,
} = require('../services/tenantConfigService');
const { buildDropSchedulePayload } = require('../services/pivotConfigService');
const { toIsoWeek } = require('../utilities/pivotIsoWeek');
const { isPivotTenant } = require('../utilities/pivotDropSchedule');
const {
  normalizePivotDropFields,
  normalizePivotDropOverrides,
} = require('../constants/defaultTenants');
const { invalidateTenantConnection } = require('../connectionsManager');
const { renameTenantKey } = require('../services/tenantKeyRenameService');
const {
  listReferralCodesForTenant,
  createReferralCode,
  updateReferralCode,
  deleteReferralCode,
} = require('../services/pivotReferralCodeService');
const {
  listPosterTemplates,
  createPosterTemplate,
  updatePosterTemplate,
  deletePosterTemplate,
  renderPoster,
} = require('../services/pivotPosterTemplateService');
const { upload } = require('../services/imageUploadService');

const router = express.Router();

function enrichTenantForAdmin(tenant, extras = {}) {
  const serialized = serializeTenantForAdmin(tenant, extras);
  if (isPivotTenant(tenant)) {
    const batchWeek = extras.batchWeek || toIsoWeek();
    serialized.dropSchedule = buildDropSchedulePayload(tenant, batchWeek);
  }
  return serialized;
}

async function listTenantsWithHealth(req) {
  const tenants = await getMergedTenants(req);
  return Promise.all(
    tenants.map(async (tenant) => {
      const health = await pingTenantDatabase(tenant.tenantKey, tenant);
      return enrichTenantForAdmin(tenant, { health });
    })
  );
}

router.get('/admin/platform/tenants', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const tenants = await listTenantsWithHealth(req);
    res.json({ success: true, data: { tenants } });
  } catch (err) {
    console.error('GET /admin/platform/tenants failed:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/admin/platform/tenants/:tenantKey', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const tenantKey = String(req.params.tenantKey || '').trim().toLowerCase();
    const tenant = await getTenantByKey(req, tenantKey);
    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Tenant not found.' });
    }
    const health = await pingTenantDatabase(tenantKey, tenant);
    res.json({ success: true, data: enrichTenantForAdmin(tenant, { health }) });
  } catch (err) {
    console.error('GET /admin/platform/tenants/:tenantKey failed:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/admin/platform/tenants', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const validation = validateNewTenantPayload(req.body);
    if (validation.error) {
      return res.status(400).json({ success: false, message: validation.error });
    }

    const existing = await getTenantByKey(req, validation.row.tenantKey);
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Tenant "${validation.row.tenantKey}" already exists.`,
        code: 'TENANT_EXISTS',
      });
    }

    const updatedBy = req.user.globalUserId || req.user.userId || null;
    invalidateTenantConnection(validation.row.tenantKey);

    let saved = await upsertStoredTenantRow(req, validation.row, updatedBy);
    let health = await pingTenantDatabase(saved.tenantKey, saved);
    let pivotCatalog = null;

    if (saved.pivotPilot && health.ok) {
      try {
        pivotCatalog = await provisionPivotCatalogOrg(req, saved.tenantKey, saved);
        saved = await upsertStoredTenantRow(
          req,
          { ...saved, pivotCatalogOrgId: pivotCatalog.orgId },
          updatedBy
        );
      } catch (catalogErr) {
        console.warn('Pivot catalog auto-provision failed:', catalogErr.message);
      }
    }

    health = await pingTenantDatabase(saved.tenantKey, saved);
    res.status(201).json({
      success: true,
      data: enrichTenantForAdmin(saved, { health, pivotCatalog }),
    });
  } catch (err) {
    console.error('POST /admin/platform/tenants failed:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/admin/platform/tenants/:tenantKey', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    let tenantKey = String(req.params.tenantKey || '').trim().toLowerCase();
    let existing = await getTenantByKey(req, tenantKey);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Tenant not found.' });
    }

    const updatedBy = req.user.globalUserId || req.user.userId || null;
    const requestedTenantKey = req.body.newTenantKey ?? req.body.tenantKey;
    if (requestedTenantKey !== undefined) {
      const nextTenantKey = String(requestedTenantKey).trim().toLowerCase();
      if (nextTenantKey !== tenantKey) {
        const renameResult = await renameTenantKey(req, tenantKey, nextTenantKey, updatedBy);
        if (renameResult.error) {
          return res.status(renameResult.status || 400).json({
            success: false,
            message: renameResult.error,
            code: renameResult.code,
            data: renameResult.updates,
          });
        }
        tenantKey = renameResult.tenantKey;
        existing = await getTenantByKey(req, tenantKey);
      }
    }

    const metadataValidation = validateTenantMetadataUpdate(req.body);
    if (metadataValidation.error) {
      return res.status(400).json({ success: false, message: metadataValidation.error });
    }

    const confirmations = {
      ...(existing.provisioningConfirmations || {}),
      ...(req.body.provisioningConfirmations || {}),
    };

    const updated = {
      ...existing,
      ...(req.body.name !== undefined ? { name: req.body.name } : {}),
      ...(req.body.subdomain !== undefined ? { subdomain: req.body.subdomain } : {}),
      ...(req.body.location !== undefined ? { location: req.body.location } : {}),
      ...(req.body.status !== undefined ? { status: req.body.status } : {}),
      ...(req.body.statusMessage !== undefined ? { statusMessage: req.body.statusMessage } : {}),
      ...(req.body.tenantType !== undefined ? { tenantType: req.body.tenantType } : {}),
      ...(req.body.pivotPilot !== undefined ? { pivotPilot: req.body.pivotPilot } : {}),
      ...(req.body.mongoUri !== undefined ? { mongoUri: req.body.mongoUri } : {}),
      ...(req.body.mongoDatabaseName !== undefined ? { mongoDatabaseName: req.body.mongoDatabaseName } : {}),
      provisioningConfirmations: confirmations,
    };

    const dropPatch = {};
    normalizePivotDropFields(req.body, dropPatch);
    if (req.body.pivotDropOverrides !== undefined) {
      dropPatch.pivotDropOverrides = normalizePivotDropOverrides(req.body.pivotDropOverrides) || [];
    }
    Object.assign(updated, dropPatch);

    const mergedPreview = (await getMergedTenants(req)).map((row) =>
      row.tenantKey === tenantKey ? updated : row
    );
    const activeCount = mergedPreview.filter((t) => t.status === 'active').length;
    if (activeCount < 1) {
      return res.status(400).json({
        success: false,
        message: 'At least one tenant must remain active.',
        code: 'AT_LEAST_ONE_ACTIVE_TENANT_REQUIRED',
      });
    }

    invalidateTenantConnection(tenantKey);
    if (updated.subdomain && updated.subdomain !== tenantKey) {
      invalidateTenantConnection(updated.subdomain);
    }
    const saved = await upsertStoredTenantRow(req, updated, updatedBy);
    const health = await pingTenantDatabase(tenantKey, saved);

    res.json({
      success: true,
      data: enrichTenantForAdmin(saved, { health }),
      renamedFrom: req.params.tenantKey !== tenantKey ? req.params.tenantKey : undefined,
    });
  } catch (err) {
    console.error('PUT /admin/platform/tenants/:tenantKey failed:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/admin/platform/tenants/:tenantKey/health-check', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const tenantKey = String(req.params.tenantKey || '').trim().toLowerCase();
    const tenant = await getTenantByKey(req, tenantKey);
    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Tenant not found.' });
    }
    const health = await pingTenantDatabase(tenantKey, tenant);
    res.json({ success: true, data: enrichTenantForAdmin(tenant, { health }) });
  } catch (err) {
    console.error('POST health-check failed:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/admin/platform/tenants/:tenantKey/provision-pivot-catalog', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const tenantKey = String(req.params.tenantKey || '').trim().toLowerCase();
    const tenant = await getTenantByKey(req, tenantKey);
    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Tenant not found.' });
    }

    const health = await pingTenantDatabase(tenantKey, tenant);
    if (!health.ok) {
      return res.status(400).json({
        success: false,
        message: 'Database connection must be healthy before provisioning Pivot Catalog org.',
        data: { health },
      });
    }

    const pivotCatalog = await provisionPivotCatalogOrg(req, tenantKey, tenant);
    const updatedBy = req.user.globalUserId || req.user.userId || null;
    const saved = await upsertStoredTenantRow(
      req,
      { ...tenant, pivotCatalogOrgId: pivotCatalog.orgId },
      updatedBy
    );

    res.json({
      success: true,
      data: {
        ...enrichTenantForAdmin(saved, { health }),
        pivotCatalog,
      },
    });
  } catch (err) {
    console.error('POST provision-pivot-catalog failed:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get(
  '/admin/platform/tenants/:tenantKey/pivot-referral-codes',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const tenantKey = String(req.params.tenantKey || '').trim().toLowerCase();
      const result = await listReferralCodesForTenant(req, tenantKey);
      if (result.error) {
        return res.status(result.status || 400).json({ success: false, message: result.error });
      }
      res.json({ success: true, data: result });
    } catch (err) {
      console.error('GET pivot-referral-codes failed:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

router.post(
  '/admin/platform/tenants/:tenantKey/pivot-referral-codes',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const tenantKey = String(req.params.tenantKey || '').trim().toLowerCase();
      const result = await createReferralCode(req, tenantKey, req.body);
      if (result.error) {
        return res.status(result.status || 400).json({ success: false, message: result.error });
      }
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      console.error('POST pivot-referral-codes failed:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

router.put(
  '/admin/platform/tenants/:tenantKey/pivot-referral-codes/:codeId',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const tenantKey = String(req.params.tenantKey || '').trim().toLowerCase();
      const codeId = String(req.params.codeId || '').trim();
      const result = await updateReferralCode(req, tenantKey, codeId, req.body);
      if (result.error) {
        return res.status(result.status || 400).json({ success: false, message: result.error });
      }
      res.json({ success: true, data: result });
    } catch (err) {
      console.error('PUT pivot-referral-codes failed:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

router.delete(
  '/admin/platform/tenants/:tenantKey/pivot-referral-codes/:codeId',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const tenantKey = String(req.params.tenantKey || '').trim().toLowerCase();
      const codeId = String(req.params.codeId || '').trim();
      const result = await deleteReferralCode(req, tenantKey, codeId);
      if (result.error) {
        return res.status(result.status || 400).json({ success: false, message: result.error });
      }
      res.json({ success: true, data: result });
    } catch (err) {
      console.error('DELETE pivot-referral-codes failed:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

router.get(
  '/admin/platform/tenants/:tenantKey/pivot-poster-templates',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const tenantKey = String(req.params.tenantKey || '').trim().toLowerCase();
      const result = await listPosterTemplates(req, tenantKey);
      if (result.error) {
        return res.status(result.status || 400).json({ success: false, message: result.error });
      }
      res.json({ success: true, data: result });
    } catch (err) {
      console.error('GET pivot-poster-templates failed:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

router.post(
  '/admin/platform/tenants/:tenantKey/pivot-poster-templates',
  verifyToken,
  requirePlatformAdmin,
  upload.single('poster'),
  async (req, res) => {
    try {
      const tenantKey = String(req.params.tenantKey || '').trim().toLowerCase();
      const result = await createPosterTemplate(req, tenantKey, req.file, req.body);
      if (result.error) {
        return res.status(result.status || 400).json({ success: false, message: result.error });
      }
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      console.error('POST pivot-poster-templates failed:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

router.put(
  '/admin/platform/tenants/:tenantKey/pivot-poster-templates/:id',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const tenantKey = String(req.params.tenantKey || '').trim().toLowerCase();
      const id = String(req.params.id || '').trim();
      const result = await updatePosterTemplate(req, tenantKey, id, req.body);
      if (result.error) {
        return res.status(result.status || 400).json({ success: false, message: result.error });
      }
      res.json({ success: true, data: result });
    } catch (err) {
      console.error('PUT pivot-poster-templates failed:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

router.delete(
  '/admin/platform/tenants/:tenantKey/pivot-poster-templates/:id',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const tenantKey = String(req.params.tenantKey || '').trim().toLowerCase();
      const id = String(req.params.id || '').trim();
      const result = await deletePosterTemplate(req, tenantKey, id);
      if (result.error) {
        return res.status(result.status || 400).json({ success: false, message: result.error });
      }
      res.json({ success: true, data: result });
    } catch (err) {
      console.error('DELETE pivot-poster-templates failed:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

router.get(
  '/admin/platform/tenants/:tenantKey/pivot-poster-templates/:id/render',
  verifyToken,
  requirePlatformAdmin,
  async (req, res) => {
    try {
      const tenantKey = String(req.params.tenantKey || '').trim().toLowerCase();
      const id = String(req.params.id || '').trim();
      const code = String(req.query.code || '').trim();
      const origin = String(req.query.origin || '').trim();
      const result = await renderPoster(req, tenantKey, id, code, origin);
      if (result.error) {
        return res.status(result.status || 400).json({ success: false, message: result.error });
      }
      res.set('Content-Type', 'image/png');
      res.set('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.set('Cache-Control', 'no-store');
      res.send(result.buffer);
    } catch (err) {
      console.error('GET pivot-poster-templates render failed:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

router.post('/admin/platform/tenants/sync-cache', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const cache = await syncTenantUriCache(req);
    res.json({ success: true, data: { tenantKeys: Object.keys(cache) } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
