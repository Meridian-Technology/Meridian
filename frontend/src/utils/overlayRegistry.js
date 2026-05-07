import React from 'react';
import axios from 'axios';

const PERSISTABLE_OVERLAYS = {};
const OVERLAY_URL_PARAM = 'overlay';

/**
 * All overlay param keys that may appear in the URL (used when clearing on close).
 * Add keys here when you register a new persistable overlay.
 */
export const OVERLAY_PARAM_KEYS = [OVERLAY_URL_PARAM];
/**
 * Debug/testing switch for which dashboard 'event-dashboard' restores to.
 * Flip to 'classic' to make URL restore open the legacy dashboard.
 */
const DEFAULT_EVENT_DASHBOARD_VARIANT = 'focused';

/**
 * Register a persistable overlay type so it can be restored from the URL.
 * @param {string} key - Unique key for the overlay (e.g. 'event-dashboard')
 * @param {Object} config
 * @param {string[]} config.paramKeys - URL search param names required to restore (e.g. ['eventId', 'orgId'])
 * @param {Function} config.restore - async (params, { onClose, setOverlayContent }) => Promise<void>
 *   Called with params object (e.g. { eventId, orgId }) and context. Should fetch any data
 *   then call setOverlayContent(reactElement).
 */
export function registerPersistableOverlay(key, config) {
    const { paramKeys, restore } = config;
    PERSISTABLE_OVERLAYS[key] = { paramKeys: [OVERLAY_URL_PARAM, ...paramKeys], restore };
    paramKeys.forEach(k => {
        if (!OVERLAY_PARAM_KEYS.includes(k)) OVERLAY_PARAM_KEYS.push(k);
    });
}

/**
 * Get config for a persistable overlay by key.
 */
export function getPersistableOverlay(key) {
    return PERSISTABLE_OVERLAYS[key] || null;
}

/**
 * Check if the current URL has overlay params that can be restored.
 * @param {URLSearchParams} searchParams
 * @returns {{ key: string, params: Object } | null}
 */
export function getOverlayStateFromParams(searchParams) {
    const overlayKey = searchParams.get(OVERLAY_URL_PARAM);
    if (!overlayKey) return null;
    const config = PERSISTABLE_OVERLAYS[overlayKey];
    if (!config) return null;
    const params = {};
    for (const k of config.paramKeys) {
        if (k === OVERLAY_URL_PARAM) continue;
        const v = searchParams.get(k);
        if (v == null || v === '') return null;
        params[k] = v;
    }
    return { key: overlayKey, params };
}

/**
 * Restore overlay content from URL state. Calls the overlay's restore function.
 * @param {string} key - Overlay key
 * @param {Object} params - Params from URL
 * @param {Object} context - { onClose, setOverlayContent }
 * @returns {Promise<void>}
 */
export async function restoreOverlay(key, params, context) {
    const config = PERSISTABLE_OVERLAYS[key];
    if (!config) return;
    await config.restore(params, context);
}

/**
 * Build URL search params for opening a persistable overlay (merge with existing).
 * @param {URLSearchParams} currentParams
 * @param {string} overlayKey
 * @param {Object} paramValues - e.g. { eventId: '...', orgId: '...' }
 * @returns {URLSearchParams}
 */
export function buildOverlaySearchParams(currentParams, overlayKey, paramValues) {
    const next = new URLSearchParams(currentParams);
    next.set(OVERLAY_URL_PARAM, overlayKey);
    const config = PERSISTABLE_OVERLAYS[overlayKey];
    if (config) {
        config.paramKeys.forEach(k => {
            if (k === OVERLAY_URL_PARAM) return;
            if (paramValues[k] != null) next.set(k, String(paramValues[k]));
        });
    }
    return next;
}

/**
 * Remove overlay-related params from search params.
 * @param {URLSearchParams} currentParams
 * @returns {URLSearchParams}
 */
export function clearOverlaySearchParams(currentParams) {
    const next = new URLSearchParams(currentParams);
    OVERLAY_PARAM_KEYS.forEach(k => next.delete(k));
    return next;
}

const EVENT_DASHBOARD_OVERLAY_VARIANTS = {
    default: 'event-dashboard',
    focused: 'event-dashboard-focused',
    classic: 'event-dashboard-classic'
};

function registerEventDashboardOverlayVariant(variantKey, loadComponent, className) {
    registerPersistableOverlay(variantKey, {
        paramKeys: ['eventId', 'orgId'],
        async restore(params, { onClose, setOverlayContent }) {
            const { eventId, orgId } = params;
            if (!eventId || !orgId) return;
            try {
                const response = await axios.get(`/get-event/${eventId}`, { withCredentials: true });
                const event = response?.data?.event ?? response?.data;
                if (!event) return;
                const EventDashboardComponent = await loadComponent();
                setOverlayContent(
                    React.createElement(EventDashboardComponent, {
                        event,
                        orgId,
                        onClose,
                        className,
                    })
                );
            } catch (err) {
                console.error(`Failed to restore ${variantKey} overlay:`, err);
            }
        },
    });
}

// --- Built-in registration: event-dashboard variants ---
if (DEFAULT_EVENT_DASHBOARD_VARIANT === 'classic') {
    registerEventDashboardOverlayVariant(
        EVENT_DASHBOARD_OVERLAY_VARIANTS.default,
        async () => {
            const { default: EventDashboard } = await import(
                '../pages/ClubDash/EventsManagement/components/EventDashboard/EventDashboard'
            );
            return EventDashboard;
        },
        'full-width-event-dashboard'
    );
} else {
    registerEventDashboardOverlayVariant(
        EVENT_DASHBOARD_OVERLAY_VARIANTS.default,
        async () => {
            const { default: EventDashboardFocused } = await import(
                '../pages/ClubDash/EventsManagement/components/EventDashboard/EventDashboardFocused'
            );
            return EventDashboardFocused;
        },
        'full-width-event-dashboard-focused'
    );
}

registerEventDashboardOverlayVariant(
    EVENT_DASHBOARD_OVERLAY_VARIANTS.focused,
    async () => {
        const { default: EventDashboardFocused } = await import(
            '../pages/ClubDash/EventsManagement/components/EventDashboard/EventDashboardFocused'
        );
        return EventDashboardFocused;
    },
    'full-width-event-dashboard-focused'
);

registerEventDashboardOverlayVariant(
    EVENT_DASHBOARD_OVERLAY_VARIANTS.classic,
    async () => {
        const { default: EventDashboard } = await import(
            '../pages/ClubDash/EventsManagement/components/EventDashboard/EventDashboard'
        );
        return EventDashboard;
    },
    'full-width-event-dashboard'
);