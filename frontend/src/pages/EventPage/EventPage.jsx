/**
 * EventPage - Full event view for attendees.
 *
 * NOTE: This page delegates its content to EventPageContent.jsx, which is also
 * used for the Event Overview preview. Any changes to the event layout, UI
 * components, or styling must be made in EventPageContent.jsx as well.
 */
import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import './EventPage.scss';
import { Icon } from '@iconify-icon/react';
import Logo from '../../assets/Brand Image/BEACON.svg';
import { useFetch } from '../../hooks/useFetch';
import { useEventRoom } from '../../WebSocketContext';
import { SimulatedTimeProvider } from '../../contexts/SimulatedTimeContext';
import EventPageContent from './EventPageContent';
import DevSimulatedTimePanel from '../../components/DevSimulatedTimePanel/DevSimulatedTimePanel';
import { analytics } from '../../services/analytics/analytics';

const IOS_BANNER_STORAGE_KEY = 'meridian-ios-banner-dismissed';

function EventPage() {
    const { eventId } = useParams();
    const [searchParams] = useSearchParams();
    const source = searchParams.get('source');
    const qrId = searchParams.get('qr_id');
    const announcementId = searchParams.get('announcement');
    const [bannerDismissed, setBannerDismissed] = useState(() => {
        try {
            return localStorage.getItem(IOS_BANNER_STORAGE_KEY) === 'true';
        } catch {
            return false;
        }
    });

    const handleDismissBanner = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setBannerDismissed(true);
        try {
            localStorage.setItem(IOS_BANNER_STORAGE_KEY, 'true');
        } catch {
            // ignore
        }
    };

    const { data: eventData, loading: eventLoading, refetch: refetchEvent } = useFetch(
        eventId ? `/get-event/${eventId}` : null
    );

    useEventRoom(eventId || null, () => {
        refetchEvent?.();
    });

    const event = eventData?.event;
    const simulateCheckedIn = process.env.NODE_ENV === 'development' && searchParams.get('simulate_checked_in') === '1';
    const checkedIn = simulateCheckedIn || event?.currentUserCheckedIn === true;

    useEffect(() => {
        if (event?._id) {
            analytics.screen('Event Page', { event_id: event._id, event_name: event.name });
            analytics.track('event_view', {
                event_id: event._id,
                ...(source === 'qr' && qrId && { source: 'qr', qr_id: qrId }),
                ...(source === 'email' && { source: 'email', ...(announcementId && { announcement_id: announcementId }) })
            });
        }
    }, [event?._id, source, qrId, announcementId]);

    if (eventLoading || !eventData) {
        return (
            <div className="event-page">
                <div className="header">
                    <img src={Logo} alt="Logo" className="logo" />
                </div>
                <div className="loading-container" />
            </div>
        );
    }

    const isDev = process.env.NODE_ENV === 'development';

    return (
        <SimulatedTimeProvider>
            <div className={`event-page ${!bannerDismissed ? 'event-page--banner-visible' : ''}`}>
                {!bannerDismissed && (
                    <div className="event-page__mobile-banner-wrapper">
                        <div className="event-page__mobile-banner-bg" aria-hidden="true" />
                        <div className="event-page__mobile-banner">
                        <Link to="/mobile" className="event-page__mobile-banner__link">
                            <Icon icon="mdi:apple" />
                            <span>
                                {checkedIn
                                    ? "Get push notifications for this event's announcements — download the app"
                                    : 'Meridian is now on iOS — download the app'}
                            </span>
                            <Icon icon="mdi:chevron-right" />
                        </Link>
                        <button
                            type="button"
                            className="event-page__mobile-banner__close"
                            onClick={handleDismissBanner}
                            aria-label="Dismiss banner"
                        >
                            <Icon icon="mdi:close" />
                        </button>
                        </div>
                    </div>
                )}
                {isDev && (
                    <div className="event-page__dev-banner">
                        <span>Dev: Use the panel (bottom-right) to simulate time and preview the checked-in view</span>
                    </div>
                )}
                <div className="header">
                    <img src={Logo} alt="Logo" className="logo" />
                </div>
                <EventPageContent
                    event={event}
                    onRefetch={refetchEvent}
                    previewMode={false}
                    showAnalytics={true}
                />
                <DevSimulatedTimePanel event={event} />
            </div>
        </SimulatedTimeProvider>
    );
}

export default EventPage;
