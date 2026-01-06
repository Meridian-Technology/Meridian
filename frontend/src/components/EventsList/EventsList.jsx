import React, { useCallback, useRef, useEffect } from 'react';
import Event from '../EventsViewer/EventsGrid/EventsColumn/Event/Event';
import Loader from '../Loader/Loader';
import useBulkRSVP from '../../hooks/useBulkRSVP';
import './EventsList.scss';

const EventsList = ({ 
    groupedEvents, 
    loading, 
    page, 
    hasMore, 
    onLoadMore, 
    formatDate,
    hasFriendsFilter = false
}) => {
    const observerRef = useRef();
    const lastEventElementRef = useRef();

    // Extract all events from grouped events for bulk RSVP fetching
    const allEvents = groupedEvents.flatMap(group => group.events);

    // Use bulk RSVP hook to fetch RSVP data for all events at once
    const { getRSVPStatus, updateRSVPStatus } = useBulkRSVP(allEvents);

    // Handle intersection observer for infinite scroll
    useEffect(() => {
        if (loading) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore) {
                    setTimeout(() => {
                        onLoadMore();
                    }, 500);
                }
            },
            {
                root: null,
                rootMargin: '100px', // Start loading 100px before reaching the bottom
                threshold: 0.1
            }
        );

        observerRef.current = observer;

        if (lastEventElementRef.current) {
            observer.observe(lastEventElementRef.current);
        }

        console.log(groupedEvents);

        return () => {
            if (observerRef.current) {
                observerRef.current.disconnect();
            }
        };
    }, [loading, hasMore, onLoadMore, groupedEvents.length]);

    const setLastEventElementRef = useCallback((node) => {
        if (observerRef.current) {
            observerRef.current.disconnect();
        }
        
        lastEventElementRef.current = node;
        
        if (node && observerRef.current) {
            observerRef.current.observe(node);
        }
    }, []);

    if (groupedEvents.length === 0) {

        
        return (
            <div className="no-events" role="status">
                {hasFriendsFilter ? 'No events where friends are going' : 'No events found'}
            </div>
        );
    }

    return (
        <div className="events-list" role="list" aria-label="Events list">
            {hasFriendsFilter && (
                <div className="friends-filter-indicator">
                    <div className="indicator-content">
                        <span className="icon">👥</span>
                        <span className="text">Showing events where your friends are going</span>
                    </div>
                </div>
            )}
            {groupedEvents.map(({ date, events }, groupIndex) => (
                <div key={date.toISOString()} className="date-group" role="group" aria-label={`Events on ${formatDate(date)}`}>
                    <div className="date-separator" role="heading" aria-level="2">{formatDate(date)}</div>
                    {events.map((event, eventIndex) => {
                        const isLastElement = groupIndex === groupedEvents.length - 1 && 
                                           eventIndex === events.length - 1;
                        return (
                            <div 
                                key={`${event._id}-${eventIndex}`}
                                ref={isLastElement ? setLastEventElementRef : null}
                                role="listitem"
                            >
                                <Event 
                                    event={event} 
                                    hasFriendsFilter={hasFriendsFilter}
                                    rsvpStatus={getRSVPStatus(event._id)}
                                    onRSVPStatusUpdate={updateRSVPStatus}
                                />
                            </div>
                        );
                    })}
                </div>
            ))}

        </div>
    );
};

export default EventsList; 