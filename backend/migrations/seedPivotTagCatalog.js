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
const pivotTagCatalogSchema = require('../schemas/pivotTagCatalog');
const { getPivotTagCatalogSeedRows } = require('../constants/pivotTagCatalogSeed');

const COLLECTION = 'pivot_tag_catalog';

async function run() {
  const rows = getPivotTagCatalogSeedRows();
  const seedSlugs = new Set(rows.map((row) => row.slug));

  const globalDb = await connectToGlobalDatabase();
  const PivotTagCatalog =
    globalDb.models.PivotTagCatalog ||
    globalDb.model('PivotTagCatalog', pivotTagCatalogSchema, COLLECTION);

  let upserted = 0;
  for (const row of rows) {
    await PivotTagCatalog.findOneAndUpdate(
      { slug: row.slug },
      { $set: row },
      { upsert: true, new: true, runValidators: true }
    );
    upserted += 1;
  }

  const activeCount = await PivotTagCatalog.countDocuments({ active: true });
  const totalCount = await PivotTagCatalog.countDocuments({});
  const staleCount = await PivotTagCatalog.countDocuments({
    slug: { $nin: [...seedSlugs] },
  });

  console.log(
    `[seed:pivot-tag-catalog] upserted=${upserted} active=${activeCount} total=${totalCount} legacy_not_in_seed=${staleCount}`
  );
  console.log(
    '[seed:pivot-tag-catalog] Inactive catalog slugs remain valid on legacy events but are hidden from GET /pivot/tags'
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
