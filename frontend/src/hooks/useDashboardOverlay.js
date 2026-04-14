import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDashboardOptional } from '../contexts/DashboardContext';
import { buildOverlaySearchParams } from '../utils/overlayRegistry';

const EVENT_DASHBOARD_OVERLAY_KEY = 'event-dashboard';

/**
 * Custom hook for easy overlay management in Dashboard components.
 * When outside DashboardProvider (e.g. EventsHub), overlay helpers fall back to navigation.
 * @returns {Object} Object containing showOverlay, hideOverlay, showEventViewer, showEventWorkspace, showEventDashboard
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
     * Show an EventWorkspace overlay (or navigate to workspace page when no overlay)
     * @param {string} eventId - The event ID to display workspace for
     */
    const showEventWorkspace = (eventId) => {
        if (!eventId) return;
        if (hasOverlay && showOverlay) {
            import('../pages/EventWorkspace/EventWorkspace').then(({ default: EventWorkspace }) => {
                showOverlay(
                    <EventWorkspace eventId={eventId} onClose={hide} />
                );
            });
        } else {
            navigate(`/event/${eventId}/workspace`);
        }
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
            className = 'full-width-event-dashboard',
            persistInUrl = false
        } = options;

        if (persistInUrl && event?._id && orgId) {
            const next = buildOverlaySearchParams(searchParams, EVENT_DASHBOARD_OVERLAY_KEY, {
                eventId: event._id,
                orgId,
            });
            setSearchParams(next, { replace: false });
        }

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
    };

    return {
        showOverlay: show,
        hideOverlay: hide,
        showEventViewer,
        showEventWorkspace,
        showEventDashboard
    };
};

/** @deprecated Use useDashboardOverlay - it now handles missing provider with navigate fallback */
export const useDashboardOverlayOptional = useDashboardOverlay;
