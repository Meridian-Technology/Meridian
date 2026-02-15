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

function EventPage() {
    const { eventId } = useParams();

    const { data: eventData, loading: eventLoading, refetch: refetchEvent } = useFetch(
        eventId ? `/get-event/${eventId}` : null
    );

    useEventRoom(eventId || null, () => {
        refetchEvent?.();
    });

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

    const event = eventData.event;

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
