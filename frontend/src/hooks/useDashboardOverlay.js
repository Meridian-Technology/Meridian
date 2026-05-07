import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDashboardOptional } from '../contexts/DashboardContext';
import { buildOverlaySearchParams } from '../utils/overlayRegistry';

const EVENT_DASHBOARD_OVERLAY_KEY = 'event-dashboard';
/**
 * Debug/testing switch for which dashboard opens when callers use the default API.
 * Flip to 'classic' to open the legacy dashboard by default.
 */
const DEFAULT_EVENT_DASHBOARD_VARIANT = 'focused';
const EVENT_DASHBOARD_VARIANT_OVERLAY_KEYS = {
    default: EVENT_DASHBOARD_OVERLAY_KEY,
    focused: 'event-dashboard-focused',
    classic: 'event-dashboard-classic'
};

/**
 * Custom hook for easy overlay management in Dashboard components.
 * When outside DashboardProvider (e.g. EventsHub), overlay helpers fall back to navigation.
 * @returns {Object} Overlay helpers including showAdminEventOperator for tenant admin event detail
 */
export const useDashboardOverlay = () => {
    const context = useDashboardOptional();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const hasOverlay = !!context;
    const { showOverlay, hideOverlay } = context || {};

    /**
     * Show an overlay with the provided content
     * @param {React.ReactNode} content - The content to display in the overlay
     */
    const show = (content) => {
        if (hasOverlay && showOverlay) showOverlay(content);
    };

    /**
     * Hide the current overlay
     */
    const hide = () => {
        if (hasOverlay && hideOverlay) hideOverlay();
    };

    /**
     * Show an EventViewer overlay (or navigate to event page when no overlay)
     * @param {Object} event - The event object to display
     * @param {Object} options - Options for the EventViewer
     */
    const showEventViewer = (event, options = {}) => {
        if (!event?._id) return;
        if (hasOverlay && showOverlay) {
            const {
                showBackButton = true,
                showAnalytics = true,
                showEventsByCreator = false,
                className = 'full-width-event-viewer'
            } = options;
            import('../components/EventViewer').then(({ default: EventViewer }) => {
                showOverlay(
                    <EventViewer 
                        event={event}
                        onBack={hide}
                        showBackButton={showBackButton}
                        showAnalytics={showAnalytics}
                        showEventsByCreator={showEventsByCreator}
                        className={className}
                    />
                );
            });
        } else {
            navigate(`/event/${event._id}`);
        }
    };

    /**
     * @deprecated EventWorkspace is legacy. Navigates to event page.
     * @param {string} eventId - The event ID
     */
    const showEventWorkspace = (eventId) => {
        if (!eventId) return;
        navigate(`/event/${eventId}`);
    };

    /**
     * Show an EventDashboard overlay
     * @param {Object} event - The event object to display
     * @param {string} orgId - The organization ID
     * @param {Object} options - Options for the EventDashboard
     */
    const showEventDashboard = (event, orgId, options = {}) => {
        if (!hasOverlay || !showOverlay) return;
        const {
            className = DEFAULT_EVENT_DASHBOARD_VARIANT === 'classic'
                ? 'full-width-event-dashboard'
                : 'full-width-event-dashboard-focused',
            persistInUrl = false
        } = options;

        if (persistInUrl && event?._id && orgId) {
            const next = buildOverlaySearchParams(searchParams, EVENT_DASHBOARD_OVERLAY_KEY, {
                eventId: event._id,
                orgId,
            });
            setSearchParams(next, { replace: false });
        }

        const loadDashboard = DEFAULT_EVENT_DASHBOARD_VARIANT === 'classic'
            ? import('../pages/ClubDash/EventsManagement/components/EventDashboard/EventDashboard')
            : import('../pages/ClubDash/EventsManagement/components/EventDashboard/EventDashboardFocused');

        loadDashboard.then(({ default: EventDashboardComponent }) => {
            showOverlay(
                <EventDashboardComponent
                    event={event}
                    orgId={orgId}
                    onClose={hide}
                    className={className}
                />
            );
        });
    };

    /**
     * Show an EventDashboard overlay variant.
     * @param {Object} event
     * @param {string} orgId
     * @param {Object} options
     * @param {'default'|'focused'|'classic'} options.variant
     * @param {boolean} options.persistInUrl
     * @param {string} options.className
     */
    const showEventDashboardVariant = (event, orgId, options = {}) => {
        if (!hasOverlay || !showOverlay) return;
        const { variant = 'default', persistInUrl = false } = options;
        if (variant === 'default') {
            showEventDashboard(event, orgId, options);
            return;
        }

        if (variant === 'focused') {
            const className = options.className || 'full-width-event-dashboard-focused';
            if (persistInUrl && event?._id && orgId) {
                const next = buildOverlaySearchParams(
                    searchParams,
                    EVENT_DASHBOARD_VARIANT_OVERLAY_KEYS.focused,
                    { eventId: event._id, orgId }
                );
                setSearchParams(next, { replace: false });
            }
            import('../pages/ClubDash/EventsManagement/components/EventDashboard/EventDashboardFocused').then(({ default: EventDashboardFocused }) => {
                showOverlay(
                    <EventDashboardFocused
                        event={event}
                        orgId={orgId}
                        onClose={hide}
                        className={className}
                    />
                );
            });
            return;
        }

        const overlayKey = EVENT_DASHBOARD_VARIANT_OVERLAY_KEYS[variant] || EVENT_DASHBOARD_OVERLAY_KEY;
        const className = options.className || (
            variant === 'classic' ? 'full-width-event-dashboard' : `full-width-event-dashboard-${variant}`
        );

        if (persistInUrl && event?._id && orgId) {
            const next = buildOverlaySearchParams(searchParams, overlayKey, {
                eventId: event._id,
                orgId,
            });
            setSearchParams(next, { replace: false });
        }

        if (variant === 'classic') {
            import('../pages/ClubDash/EventsManagement/components/EventDashboard/EventDashboard').then(({ default: EventDashboard }) => {
                showOverlay(
                    <EventDashboard
                        event={event}
                        orgId={orgId}
                        onClose={hide}
                        className={className}
                    />
                );
            });
            return;
        }

        showEventDashboard(event, orgId, options);
    };

    /**
     * Convenience wrapper for the focused dashboard variant.
     * @param {Object} event
     * @param {string} orgId
     * @param {Object} options
     */
    const showEventDashboardFocused = (event, orgId, options = {}) => {
        showEventDashboardVariant(event, orgId, { ...options, variant: 'focused' });
    };

    /**
     * Show an EventPostMortem overlay (for past events)
     * @param {Object} event - The event object
     * @param {string} orgId - The organization ID
     * @param {Object} options - Options
     * @param {boolean} options.returnToEventDashboard - If true, closing returns to EventDashboard instead of the list
     */
    const showEventPostMortem = (event, orgId, options = {}) => {
        if (!hasOverlay || !showOverlay) return;
        const { returnToEventDashboard = false } = options;
        import('../pages/ClubDash/EventsManagement/components/EventPostMortem/EventPostMortem').then(({ default: EventPostMortem }) => {
            showOverlay(
                <EventPostMortem
                    event={event}
                    orgId={orgId}
                    onClose={returnToEventDashboard ? () => showEventDashboard(event, orgId) : hide}
                />
            );
        });
    };

    /**
     * Tenant admin event panel. Navigates when Dashboard overlay is unavailable.
     * @param {string} eventId
     * @param {{ className?: string }} [options]
     */
    const showAdminEventOperator = (eventId, options = {}) => {
        if (!eventId) return;
        const { className = 'full-width-admin-event-operator' } = options;
        if (!hasOverlay || !showOverlay) {
            navigate(`/operator-event/${eventId}`);
            return;
        }
        import('../pages/RootDash/AdminEventOperatorPage').then(({ AdminEventOperatorContent }) => {
            showOverlay(
                <AdminEventOperatorContent eventId={String(eventId)} onClose={hide} className={className} />
            );
        });
    };

    return {
        showOverlay: show,
        hideOverlay: hide,
        showEventViewer,
        showEventWorkspace,
        showEventDashboard,
        showEventDashboardVariant,
        showEventDashboardFocused,
        showEventPostMortem,
        showAdminEventOperator,
    };
};

/** @deprecated Use useDashboardOverlay - it now handles missing provider with navigate fallback */
export const useDashboardOverlayOptional = useDashboardOverlay;
