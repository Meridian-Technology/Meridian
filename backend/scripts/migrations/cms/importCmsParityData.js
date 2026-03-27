/*
 * CMS -> Atlas parity migration entry point.
 * This script is intentionally idempotent-friendly and can be run in dry-run mode.
 */

const path = require('path');

async function run() {
    const dryRun = process.argv.includes('--dry-run');
    const source = process.env.CMS_EXPORT_PATH || '<set CMS_EXPORT_PATH>';
    const tenant = process.env.CMS_TARGET_TENANT || 'rpi';

    console.log('[cms-migration] starting');
    console.log(`[cms-migration] source=${source}`);
    console.log(`[cms-migration] tenant=${tenant}`);
    console.log(`[cms-migration] dryRun=${dryRun}`);

    if (source.startsWith('<set')) {
        throw new Error('CMS_EXPORT_PATH is required');
    }

    // Placeholder orchestration points. Dedicated scripts handle each domain.
    // eslint-disable-next-line global-require
    const { migrateOrganizationsAndMembers } = require('./migrateOrganizationsAndMembers');
    // eslint-disable-next-line global-require
    const { reconcileCmsParity } = require('./reconcileCmsParity');

    const migrationSummary = await migrateOrganizationsAndMembers({ sourcePath: path.resolve(source), tenant, dryRun });
    console.log('[cms-migration] migration summary:', migrationSummary);
    const reconciliationSummary = await reconcileCmsParity({ sourcePath: path.resolve(source), tenant, dryRun });
    console.log('[cms-migration] reconciliation summary:', reconciliationSummary);

    console.log('[cms-migration] completed');
}

run().catch((error) => {
    console.error('[cms-migration] failed:', error.message);
    process.exit(1);
});
