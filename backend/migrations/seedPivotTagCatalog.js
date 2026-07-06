#!/usr/bin/env node
/**
 * Seed the global Pivot tag catalog (Task 8.1).
 *
 * Usage (from Meridian/backend):
 *   npm run seed:pivot-tag-catalog
 */
require('dotenv').config();

const mongoose = require('mongoose');
const { connectToGlobalDatabase } = require('../connectionsManager');
const { seedPivotTagCatalog } = require('../services/pivotTagCatalogService');

async function run() {
  const globalDb = await connectToGlobalDatabase();
  const result = await seedPivotTagCatalog({ globalDb });

  if (result.error) {
    throw new Error(result.error);
  }

  const { upserted, activeCount, totalCount, legacyNotInSeed } = result.data;
  console.log(
    `[seed:pivot-tag-catalog] upserted=${upserted} active=${activeCount} total=${totalCount} legacy_not_in_seed=${legacyNotInSeed}`,
  );
  console.log(
    '[seed:pivot-tag-catalog] Inactive catalog slugs remain valid on legacy events but are hidden from GET /pivot/tags',
  );
}

run()
  .catch((error) => {
    console.error('[seed:pivot-tag-catalog] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
