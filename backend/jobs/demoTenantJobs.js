const cron = require('node-cron');
const { connectToDatabase } = require('../connectionsManager');
const { DEMO_TENANT_KEY } = require('../constants/demoTenant');
const { expireDemoCredentials } = require('../services/demoCredentialService');

const DEFAULT_CRON = '15 * * * *'; // hourly at :15

async function runExpireDemoCredentialsJob() {
    if (!process.env.MONGO_URI_DEMO) {
        return { skipped: true, reason: 'MONGO_URI_DEMO not configured' };
    }
    const db = await connectToDatabase(DEMO_TENANT_KEY);
    const result = await expireDemoCredentials(db);
    if (result.expiredCount > 0) {
        console.log(`[demo-cron] expired ${result.expiredCount} demo credential(s)`);
    }
    return result;
}

function startDemoTenantJobs() {
    if (process.env.DISABLE_DEMO_CRON === 'true') {
        console.log('[demo-cron] disabled via DISABLE_DEMO_CRON');
        return null;
    }
    if (!process.env.MONGO_URI_DEMO) {
        console.log('[demo-cron] skipped — MONGO_URI_DEMO not set');
        return null;
    }

    const schedule = process.env.DEMO_CREDENTIAL_EXPIRY_CRON || DEFAULT_CRON;
    const task = cron.schedule(schedule, () => {
        runExpireDemoCredentialsJob().catch((err) => {
            console.error('[demo-cron] expire demo credentials failed:', err);
        });
    });

    console.log(`[demo-cron] credential expiry scheduled (${schedule})`);
    return task;
}

module.exports = {
    startDemoTenantJobs,
    runExpireDemoCredentialsJob,
};
