import React, { useState, useEffect, useCallback } from 'react';
import { useFetch } from '../../hooks/useFetch';
import EventsList from '../EventsList/EventsList';
import './OrgEvents.scss';

const OrgEvents = ({ orgId }) => {
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [events, setEvents] = useState([]);
    const limit = 15;

    // Fetch events using useFetch
    const { data, loading, error } = useFetch(
        orgId ? `/${orgId}/events?page=${page}&limit=${limit}` : null
    );

    // Update events when new data arrives
    useEffect(() => {
        if (data) {
            if (page === 1) {
                setEvents(data.events);
            } else {
                // Filter out duplicates when adding new events
                setEvents(prevEvents => {
                    const existingIds = new Set(prevEvents.map(event => event._id));
                    const newEvents = data.events.filter(event => !existingIds.has(event._id));
                    return [...prevEvents, ...newEvents];
                });
            }
            setHasMore(data.hasMore);
        }
    }, [data, page]);

    // Reset pagination when orgId changes
    useEffect(() => {
        setPage(1);
        setEvents([]);
        setHasMore(true);
    }, [orgId]);

    // Handle load more for infinite scroll
    const handleLoadMore = useCallback(() => {
        if (!loading && hasMore) {
            setPage(prevPage => prevPage + 1);
        }
    }, [loading, hasMore]);

    // Helper function to format date
    const formatDate = (date) => {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const eventDate = new Date(date);
        const isToday = eventDate.toDateString() === today.toDateString();
        const isTomorrow = eventDate.toDateString() === tomorrow.toDateString();
        
        if (isToday) return 'Today';
        if (isTomorrow) return 'Tomorrow';
        
        return eventDate.toLocaleDateString('en-US', { 
            weekday: 'long', 
            month: 'long', 
            day: 'numeric' 
        });
    };

    // Helper function to group events by date
    const groupEventsByDate = (events) => {
        if (!events) return [];
        
        const groups = new Map();
        events.forEach(event => {
            const date = new Date(event.start_time).toDateString();
            if (!groups.has(date)) {
                groups.set(date, []);
            }
            const existingEvent = groups.get(date).find(e => e._id === event._id);
            if (!existingEvent) {
                groups.get(date).push(event);
            }
        });
        
        return Array.from(groups.entries()).map(([date, events]) => ({
            date: new Date(date),
            events
        })).sort((a, b) => a.date - b.date);
    };

    if (error) {
        return (
            <div className="org-events-error" role="alert">
                Error loading events: {error.message}
            </div>
        );
    }

    return (
        <div className="org-events">
            <EventsList 
                groupedEvents={groupEventsByDate(events)}
                loading={loading}
                page={page}
                hasMore={hasMore}
                onLoadMore={handleLoadMore}
                formatDate={formatDate}
            />
        </div>
    );
};

export default OrgEvents; 