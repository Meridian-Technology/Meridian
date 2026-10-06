const { isIP } = require('net');
const { isJustGoPublicHost } = require('./corsOrigins');

function tenantForHost(host, production = false) {
    const hostname = String(host || '').toLowerCase().replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
    if (isJustGoPublicHost(host)) return 'www';
    if (
        isIP(hostname) ||
        hostname.includes('localhost') ||
        hostname.includes('devtunnels.ms') ||
        hostname.includes('ngrok') ||
        !hostname.includes('.')
    ) return production ? 'www' : 'rpi';
    return hostname.split('.')[0];
}

function canOverrideTenant(tenantKey, tenantKeys) {
    const key = String(tenantKey || '').toLowerCase();
    // The platform is reserved and may not have a tenant catalog row.
    return key === 'www' || tenantKeys.includes(key);
}

module.exports = { tenantForHost, canOverrideTenant };
