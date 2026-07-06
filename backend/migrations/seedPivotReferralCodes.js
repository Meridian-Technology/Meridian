#!/usr/bin/env node
/**
 * Seed Pivot pilot referral codes into the global/platform DB (NYC tenant).
 *
 * Usage (from Meridian/backend):
 *   npm run seed:pivot-referral-codes
 */
require('dotenv').config();

const mongoose = require('mongoose');
const { connectToGlobalDatabase } = require('../connectionsManager');
const pivotReferralCodeSchema = require('../schemas/pivotReferralCode');
const {
  PILOT_TENANT_KEY,
  LEGACY_PILOT_CODE_PREFIXES,
  getPivotPilotReferralSeedRows,
} = require('../constants/pivotPilotReferralCodes');

const COLLECTION = 'pivot_referral_codes';

async function run() {
  const rows = getPivotPilotReferralSeedRows();

  const globalDb = await connectToGlobalDatabase();
  const PivotReferralCode =
    globalDb.models.PivotReferralCode ||
    globalDb.model('PivotReferralCode', pivotReferralCodeSchema, COLLECTION);

  const legacyDelete = await PivotReferralCode.deleteMany({
    $or: LEGACY_PILOT_CODE_PREFIXES.map((prefix) => ({
      code: new RegExp(`^${prefix}`),
    })),
  });

  let upserted = 0;
  for (const row of rows) {
    await PivotReferralCode.findOneAndUpdate(
      { code: row.code },
      { $set: row },
      { upsert: true, new: true, runValidators: true }
    );
    upserted += 1;
  }

  const activeCount = await PivotReferralCode.countDocuments({
    tenantKey: PILOT_TENANT_KEY,
    active: true,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  });

  console.log(
    `[seedPivotReferralCodes] tenantKey=${PILOT_TENANT_KEY} upserted=${upserted} removed_legacy=${legacyDelete.deletedCount} active_redeemable=${activeCount}`
  );
  console.log(
    '[seedPivotReferralCodes] Active pilot codes: NYC-PILOT-A, NYC-PILOT-B, NYC-PILOT-C'
  );
  console.log(
    '[seedPivotReferralCodes] Test-only codes: NYC-PILOT-INACTIVE (active=false), NYC-PILOT-EXPIRED (expiresAt in past)'
  );
}

run()
  .catch((error) => {
    console.error('[seedPivotReferralCodes] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
