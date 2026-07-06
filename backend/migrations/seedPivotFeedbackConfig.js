#!/usr/bin/env node
/**
 * Ensure pivot_event FeedbackConfig exists in each pivot pilot tenant DB.
 *
 * Usage (from Meridian/backend):
 *   npm run seed:pivot-feedback-config
 *
 * Optional env:
 *   PIVOT_TENANT_KEYS=nyc,brooklyn  (default: nyc)
 */
require('./ensureBackendNodeModules');
require('dotenv').config();

const { connectToDatabase } = require('../connectionsManager');
const getModels = require('../services/getModelService');
const FeedbackService = require('../services/feedbackService');
const { PILOT_TENANT_KEY } = require('../constants/pivotPilotReferralCodes');

const SYSTEM_USER_ID = '000000000000000000000001';

function tenantKeysFromEnv() {
  const raw = process.env.PIVOT_TENANT_KEYS || PILOT_TENANT_KEY;
  return raw
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);
}

async function seedTenant(tenantKey) {
  const db = await connectToDatabase(tenantKey);
  const req = { db, school: tenantKey };

  const { User } = getModels(req, 'User');
  const seedUser =
    (await User.findOne().select('_id').lean()) ||
    { _id: SYSTEM_USER_ID };

  const feedbackService = new FeedbackService(req);
  const config = await feedbackService.ensurePivotEventFeedbackConfig(seedUser._id);

  console.log(`[seed:pivot-feedback-config] ${tenantKey}: pivot_event ${config.version} (${config._id})`);
}

async function main() {
  const tenants = tenantKeysFromEnv();
  for (const tenantKey of tenants) {
    await seedTenant(tenantKey);
  }
  console.log('[seed:pivot-feedback-config] done');
}

main().catch((err) => {
  console.error('[seed:pivot-feedback-config] failed:', err);
  process.exit(1);
});
