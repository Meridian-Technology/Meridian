#!/usr/bin/env node
/**
 * Make the carousel editorial lifecycle fields explicit on existing issues.
 *
 * Every field this writes is additive and already has a schema default, so the
 * application reads correctly before, during and after the migration. Running
 * it twice changes nothing the second time.
 *
 * What it deliberately does not do:
 *
 * - It does not infer that any existing issue was ever posted. A deck with a
 *   `lastExportedAt`, an archived status or a finished-looking document is not
 *   evidence that it went on Instagram, and guessing would corrupt the posted
 *   history the editorial pipeline reads for cadence and diversity.
 * - It does not read Instagram. Public grids are partial and are not an
 *   authoritative record of what this system published.
 * - It does not mark anything generated. Every pre-existing issue is human
 *   work, and `origin: 'manual'` is the truthful value for all of them.
 *
 * Usage (from Meridian/backend):
 *   node migrations/backfillPivotCarouselEditorialFields.js           # dry run
 *   node migrations/backfillPivotCarouselEditorialFields.js --apply
 */
require('./ensureBackendNodeModules');
require('dotenv').config();

const LOG_PREFIX = '[backfill:pivot-carousel-editorial]';

/**
 * @param {{ globalDb: import('mongoose').Connection }} req
 * @param {{ apply?: boolean }} options
 */
async function backfillCarouselEditorialFields(req, { apply = false } = {}) {
  const getGlobalModels = require('../services/getGlobalModelService');
  const { PivotCarouselDeck } = getGlobalModels(req, 'PivotCarouselDeck');

  const steps = [
    {
      name: 'origin',
      filter: { origin: { $exists: false } },
      update: { $set: { origin: 'manual' } },
    },
    {
      name: 'socialCaption',
      filter: { socialCaption: { $exists: false } },
      update: { $set: { socialCaption: '' } },
    },
    {
      name: 'reviewState',
      // Explicitly null: a manual issue has no review state, and leaving the
      // key absent would make "never reviewed" and "field not migrated"
      // indistinguishable later.
      filter: { reviewState: { $exists: false } },
      update: { $set: { reviewState: null } },
    },
  ];

  const report = { apply, steps: [], captionRevision: { matched: 0, modified: 0 }, indexes: false };

  for (const step of steps) {
    const matched = await PivotCarouselDeck.countDocuments(step.filter);
    let modified = 0;
    if (apply && matched) {
      const result = await PivotCarouselDeck.updateMany(step.filter, step.update);
      modified = result.modifiedCount ?? 0;
    }
    report.steps.push({ name: step.name, matched, modified });
  }

  // captionRevision starts level with the issue's own revision: the caption has
  // been empty for its whole life, so it last "changed" when the issue did.
  const captionFilter = { captionRevision: { $exists: false } };
  report.captionRevision.matched = await PivotCarouselDeck.countDocuments(captionFilter);
  if (apply && report.captionRevision.matched) {
    const result = await PivotCarouselDeck.updateMany(captionFilter, [
      { $set: { captionRevision: { $ifNull: ['$revision', 1] } } },
    ]);
    report.captionRevision.modified = result.modifiedCount ?? 0;
  }

  if (apply) {
    await PivotCarouselDeck.syncIndexes();
    report.indexes = true;
  }

  return report;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const { connectToGlobalDatabase } = require('../connectionsManager');
  const globalDb = await connectToGlobalDatabase();
  if (!globalDb) throw new Error('global database is not configured');

  const report = await backfillCarouselEditorialFields({ globalDb }, { apply });
  for (const step of report.steps) {
    console.log(`${LOG_PREFIX} ${step.name}: ${step.matched} to change, ${step.modified} changed`);
  }
  console.log(
    `${LOG_PREFIX} captionRevision: ${report.captionRevision.matched} to change,`,
    `${report.captionRevision.modified} changed`,
  );
  console.log(`${LOG_PREFIX} ${apply ? 'applied' : 'dry run only; pass --apply to write'}`);
  process.exit(0);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`${LOG_PREFIX} failed:`, error);
    process.exit(1);
  });
}

module.exports = { backfillCarouselEditorialFields };
