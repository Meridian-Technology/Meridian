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
const { invalidateTenantConnection } = require('../connectionsManager');
const {
  listReferralCodesForTenant,
  createReferralCode,
  updateReferralCode,
  deleteReferralCode,
} = require('../services/pivotReferralCodeService');

const router = express.Router();

async function listTenantsWithHealth(req) {
  const tenants = await getMergedTenants(req);
  return Promise.all(
    tenants.map(async (tenant) => {
      const health = await pingTenantDatabase(tenant.tenantKey, tenant);
      return serializeTenantForAdmin(tenant, { health });
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
    res.json({ success: true, data: serializeTenantForAdmin(tenant, { health }) });
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
      data: serializeTenantForAdmin(saved, { health, pivotCatalog }),
    });
  } catch (err) {
    console.error('POST /admin/platform/tenants failed:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/admin/platform/tenants/:tenantKey', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const tenantKey = String(req.params.tenantKey || '').trim().toLowerCase();
    const existing = await getTenantByKey(req, tenantKey);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Tenant not found.' });
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

    const updatedBy = req.user.globalUserId || req.user.userId || null;
    invalidateTenantConnection(tenantKey);
    const saved = await upsertStoredTenantRow(req, updated, updatedBy);
    const health = await pingTenantDatabase(tenantKey, saved);

    res.json({ success: true, data: serializeTenantForAdmin(saved, { health }) });
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
    res.json({ success: true, data: serializeTenantForAdmin(tenant, { health }) });
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
        ...serializeTenantForAdmin(saved, { health }),
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

router.post('/admin/platform/tenants/sync-cache', verifyToken, requirePlatformAdmin, async (req, res) => {
  try {
    const cache = await syncTenantUriCache(req);
    res.json({ success: true, data: { tenantKeys: Object.keys(cache) } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
