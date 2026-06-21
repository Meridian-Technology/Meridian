import { getCurrentTenantKey, DEMO_TENANT_KEY, getTenantRedirectUrl } from '../config/tenantRedirect';

export { DEMO_TENANT_KEY };
export const DEMO_ROUTE_PREFIX = '/events-demo';

export const DEMO_PHASES = [
    { id: 'planning', label: 'Pre-event' },
    { id: 'runOfShow', label: 'During event' },
    { id: 'postMortem', label: 'Post-event' },
];

/** Public URL for the events-demo login portal (demo tenant subdomain in production). */
export function getDemoEventsPortalUrl(pathname = DEMO_ROUTE_PREFIX) {
    if (typeof window === 'undefined') {
        return `https://demo.meridian.study${pathname}`;
    }
    return getTenantRedirectUrl(DEMO_TENANT_KEY, pathname);
}

export function isDemoTenantClient() {
    return getCurrentTenantKey() === DEMO_TENANT_KEY;
}

export function isDemoAllowedPath(pathname = '') {
    const path = String(pathname || '').split('?')[0];
    return path === DEMO_ROUTE_PREFIX || path.startsWith(`${DEMO_ROUTE_PREFIX}/`);
}

/** Paths allowed on demo.meridian.study besides the events-demo sandbox. */
export function isDemoTenantAllowedPath(pathname = '') {
    const path = String(pathname || '').split('?')[0];
    if (isDemoAllowedPath(path)) return true;
    if (path === '/login') return true;
    if (path === '/admin' || path.startsWith('/admin/')) return true;
    if (path === '/tenant-status' || path.startsWith('/tenant-status/')) return true;
    return false;
}
