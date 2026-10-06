const { tenantForHost, canOverrideTenant } = require('../../utilities/tenantHostRouting');

describe('tenant host routing', () => {
    test.each(['localhost:5001', '127.0.0.1:5001', '192.0.0.2:5001', '10.0.2.2:5001', '[::1]:5001'])('%s uses the development default', host => {
        expect(tenantForHost(host)).toBe('rpi');
        expect(tenantForHost(host, true)).toBe('www');
    });

    test.each(['test.ngrok-free.app', 'test.devtunnels.ms'])('%s uses the tunnel default', host => {
        expect(tenantForHost(host)).toBe('rpi');
    });

    test('retains explicit tenant and public Just Go routing', () => {
        expect(tenantForHost('sf.meridian.study')).toBe('sf');
        expect(tenantForHost('justgo.lol')).toBe('www');
        expect(tenantForHost('www.meridian.study')).toBe('www');
    });

    test('allows the reserved platform without a catalog row', () => {
        expect(canOverrideTenant('www', ['sf'])).toBe(true);
        expect(canOverrideTenant('SF', ['sf'])).toBe(true);
        expect(canOverrideTenant('unregistered', ['sf'])).toBe(false);
    });
});
