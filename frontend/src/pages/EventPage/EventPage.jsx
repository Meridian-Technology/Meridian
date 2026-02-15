/**
 * EventPage - Full event view for attendees.
 *
 * NOTE: This page delegates its content to EventPageContent.jsx, which is also
 * used for the Event Overview preview. Any changes to the event layout, UI
 * components, or styling must be made in EventPageContent.jsx as well.
 */
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import './EventPage.scss';
import { Icon } from '@iconify-icon/react';
import Logo from '../../assets/Brand Image/BEACON.svg';
import { useFetch } from '../../hooks/useFetch';
import { useEventRoom } from '../../WebSocketContext';
import EventPageContent from './EventPageContent';
import { analytics } from '../../services/analytics/analytics';

function EventPage() {
    const { eventId } = useParams();

    const { data: eventData, loading: eventLoading, refetch: refetchEvent } = useFetch(
        eventId ? `/get-event/${eventId}` : null
    );

    useEventRoom(eventId || null, () => {
        refetchEvent?.();
    });

    const event = eventData?.event;

    useEffect(() => {
        if (event?._id) {
            analytics.screen('Event Page', { event_id: event._id, event_name: event.name });
            analytics.track('event_view', { event_id: event._id });
        }
    }, [event?._id]);

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

    return (
        <div className="event-page">
            <div className="header">
                <img src={Logo} alt="Logo" className="logo" />
            </div>
            <EventPageContent
                event={event}
                onRefetch={refetchEvent}
                previewMode={false}
                showAnalytics={true}
            />
        </div>
    );
}

export default EventPage;
