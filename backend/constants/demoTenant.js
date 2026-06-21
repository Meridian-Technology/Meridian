/**
 * Demo tenant is hardcoded to `demo` subdomain only.
 * Routes and features under DEMO_ROUTE_PREFIX must not be registered on other tenants.
 */

const DEMO_TENANT_KEY = 'demo';
const DEMO_ROUTE_PREFIX = '/events-demo';

function isDemoTenant(tenantKey) {
    return String(tenantKey || '').toLowerCase() === DEMO_TENANT_KEY;
}

function assertDemoTenant(tenantKey) {
    if (!isDemoTenant(tenantKey)) {
        const err = new Error('Demo features are only available on the demo tenant');
        err.code = 'DEMO_TENANT_ONLY';
        throw err;
    }
}

module.exports = {
    DEMO_TENANT_KEY,
    DEMO_ROUTE_PREFIX,
    isDemoTenant,
    assertDemoTenant,
};
