import React, { useCallback, useRef, useEffect } from 'react';
import Event from '../EventsViewer/EventsGrid/EventsColumn/Event/Event';
import Loader from '../Loader/Loader';
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
  {/* I'm not sure why we added this i ndicator, i'm removing it for now but leaving as a comment encase the format was wanted elsewhere -Raven */}
            {/* {hasFriendsFilter && (
                <div className="friends-filter-indicator">
                    <div className="indicator-content">
                        <span className="text">Showing events where your friends are going</span>
                    </div>
                </div>
            )} */}
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
                                className="event-item-wrapper"
                            >
                                <Event 
                                    event={event} 
                                    hasFriendsFilter={hasFriendsFilter}
                                    showRSVP={false}
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