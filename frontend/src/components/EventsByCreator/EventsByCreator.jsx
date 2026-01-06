import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../hooks/useFetch';
import './EventsByCreator.scss';
import Event from '../EventsViewer/EventsGrid/EventsColumn/Event/Event';
import EventSkeleton from '../EventsList/EventSkeleton';

function EventsByCreator({ eventId, creatorName, creatorType }) {
    const navigate = useNavigate();
    const { data: creatorEvents, loading, error } = useFetch(
        eventId ? `/events-by-creator/${eventId}?limit=3` : null
    );

    if (loading) {
        return (
            <div className="events-by-creator">
                <div className="section-header">
                    <h3>More Events by {creatorName}</h3>
                    <p className="creator-type">{creatorType}</p>
                </div>
                <div className="events-grid">
                    <EventSkeleton count={3} />
                </div>
            </div>
        );
    }

    if (error || !creatorEvents?.events || creatorEvents.events.length === 0) {
        return null; // Don't show section if no events
    }

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });
    };

    const formatTime = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    };

    return (
        <div className="events-by-creator">
            <div className="section-header">
                <h3>More Events by {creatorName}</h3>
                <p className="creator-type">{creatorType}</p>
            </div>
            <div className="events-grid">
                {creatorEvents.events.map((event) => (
                    <Event key={event._id} event={event} />
                ))}
            </div>
        </div>
    );
}

export default EventsByCreator;
