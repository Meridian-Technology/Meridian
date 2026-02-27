import React, { useCallback, useRef, useEffect, useState } from 'react';
import Event from '../EventsViewer/EventsGrid/EventsColumn/Event/Event';
import Loader from '../Loader/Loader';
import Switch from '../Switch/Switch';
import EmptyState from '../EmptyState/EmptyState';
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
    
    // Load view preference from localStorage
    const [viewType, setViewType] = useState(() => {
        const saved = localStorage.getItem('eventsListViewType');
        return saved === 'compact' ? 1 : 0; // 0 = regular, 1 = compact
    });
    
    // Save preference to localStorage when it changes
    useEffect(() => {
        localStorage.setItem('eventsListViewType', viewType === 1 ? 'compact' : 'regular');
    }, [viewType]);

    // Handle intersection observer for infinite scroll
    useEffect(() => {
        if (loading) return;

        // Use document as root for normal page scrolling
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore) {
                    setTimeout(() => {
                        onLoadMore();
                    }, 500);
                }
            },
            {
                root: null, // null means viewport/document
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
            <div className="empty-state-center">
                <EmptyState
                    icon="proicons:calendar"
                    title={hasFriendsFilter ? 'No events where friends are going' : 'No events found'}
                    description={hasFriendsFilter ? 'When your friends RSVP to events, they’ll show up here.' : 'Try adjusting your filters or check back later for new events.'}
                />
            </div>
        );
    }

    return (
        <div className={`events-list ${viewType === 1 ? 'compact' : 'regular'}`} role="list" aria-label="Events list">
  {/* I'm not sure why we added this i ndicator, i'm removing it for now but leaving as a comment encase the format was wanted elsewhere -Raven */}
            {/* {hasFriendsFilter && (
                <div className="friends-filter-indicator">
                    <div className="indicator-content">
                        <span className="text">Showing events where your friends are going</span>
                    </div>
                </div>
            )} */}
            <div className="timeline-container">
                <div className="timeline-line"></div>
                {groupedEvents.map(({ date, events }, groupIndex) => {
                    const isLastGroup = groupIndex === groupedEvents.length - 1;
                    const isLastElement = isLastGroup && events.length > 0;
                    return (
                        <div key={date.toISOString()} className="date-group" role="group" aria-label={`Events on ${formatDate(date)}`}>
                            <div className={`date-separator ${viewType === 1 ? 'compact' : 'regular'}`} role="heading" aria-level="2">
                                <div className="timeline-dot"></div>
                                <span className="date-text">{formatDate(date)}</span>
                                {groupIndex === 0 && (
                                    <div className="view-toggle">
                                        <Switch
                                            options={['regular', 'compact']}
                                            selectedPass={viewType}
                                            setSelectedPass={setViewType}
                                            onChange={setViewType}
                                            ariaLabel="View type selection"
                                        />
                                    </div>
                                )}
                            </div>
                            {events.map((event, eventIndex) => {
                                const isLastEvent = isLastGroup && eventIndex === events.length - 1;
                                return (
                                    <div 
                                        key={`${event._id}-${eventIndex}`}
                                        ref={isLastEvent ? setLastEventElementRef : null}
                                        role="listitem"
                                        className="event-item-wrapper"
                                    >
                                        <Event 
                                            event={event} 
                                            hasFriendsFilter={hasFriendsFilter}
                                            showRSVP={false}
                                            variant={viewType === 1 ? 'compact' : 'regular'}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default EventsList; 