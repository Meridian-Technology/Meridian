/**
 * SPA referrer tracking for analytics.
 *
 * document.referrer does not update on client-side navigation, so we track
 * the previous pathname on every route change. This provides accurate referrers
 * for any page view or event, not just event discovery.
 *
 * Overlay content (e.g. org profile shown over /events-dashboard) can call
 * setReferrerOverride() so navigations from the overlay get the correct referrer.
 *
 * The analytics SDK automatically includes this in context.referrer when available.
 */
const LAST_PATH_KEY = 'referrer_last_path';
const REFERRER_KEY = 'referrer_path';
const OVERRIDE_KEY = 'referrer_override';

/**
 * Call on every route change. Updates the stored referrer (where we came from)
 * and current path (where we are now). Uses override if set (e.g. from overlay).
 */
export function updateReferrerOnNavigation(pathname) {
    if (!pathname) return;
    try {
        const override = sessionStorage.getItem(OVERRIDE_KEY);
        const lastPath = sessionStorage.getItem(LAST_PATH_KEY);
        const referrer = override || lastPath || '';
        sessionStorage.removeItem(OVERRIDE_KEY);
        sessionStorage.setItem(REFERRER_KEY, referrer);
        sessionStorage.setItem(LAST_PATH_KEY, pathname);
    } catch (_) {}
}

/**
 * Set referrer override for the next navigation. Use when content is shown in an
 * overlay (URL doesn't change) but the user is effectively "on" a different page.
 * E.g. org profile overlay on /events-dashboard?page=3 — setOverride('/org/OrgName').
 * Call clearReferrerOverride when the overlay closes without navigating.
 */
export function setReferrerOverride(pathname) {
    if (!pathname) return;
    try {
        sessionStorage.setItem(OVERRIDE_KEY, pathname);
    } catch (_) {}
}

/** Clear the referrer override (e.g. when overlay closes without navigation). */
export function clearReferrerOverride() {
    try {
        sessionStorage.removeItem(OVERRIDE_KEY);
    } catch (_) {}
}

/**
 * Returns the pathname we navigated from (internal SPA referrer).
 * Used by the analytics SDK for every track/screen call.
 * Returns null if no internal referrer (e.g. first load, external link, new tab).
 */
export function getReferrerPath() {
    try {
        const ref = sessionStorage.getItem(REFERRER_KEY);
        return ref || null;
    } catch (_) {
        return null;
    }
}
