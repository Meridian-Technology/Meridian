import React, { useState, useMemo } from 'react';
import './MyEventsContent.scss';
import { useFetch } from '../../../../hooks/useFetch';
import MyEventCard from '../MyEventCard/MyEventCard';

const MyEventsContent = () => {
    const [selectedFilter, setSelectedFilter] = useState('upcoming');
    const [emptyCase, setEmptyCase] = useState('No Upcoming Events');

    // Fetch events you're attending (going to)
    const { data: goingEventsData, loading: goingLoading, error: goingError } = useFetch('/going-events?limit=100');
    
    // Fetch events you're hosting
    const { data: hostingEventsData, loading: hostingLoading, error: hostingError } = useFetch('/get-my-events?sort=desc&limit=100');

    // Process and filter events based on current date
    const processedEvents = useMemo(() => {
        const currentDate = new Date();
        const goingEvents = goingEventsData?.events || [];
        const hostingEvents = hostingEventsData?.events || [];
        
        // Filter going events by date
        const upcomingGoingEvents = goingEvents.filter(event => 
            new Date(event.start_time) >= currentDate
        );
        const pastGoingEvents = goingEvents.filter(event => 
            new Date(event.end_time) < currentDate
        );
        
        // Filter hosting events by date  
        const upcomingHostingEvents = hostingEvents.filter(event => 
            new Date(event.start_time) >= currentDate
        );
        const pastHostingEvents = hostingEvents.filter(event => 
            new Date(event.end_time) < currentDate
        );
        
        return {
            upcoming: [...upcomingGoingEvents, ...upcomingHostingEvents].sort((a, b) => 
                new Date(a.start_time) - new Date(b.start_time)
            ),
            hosting: hostingEvents.sort((a, b) => 
                new Date(a.start_time) - new Date(b.start_time)
            ),
            past: [...pastGoingEvents, ...pastHostingEvents].sort((a, b) => 
                new Date(b.start_time) - new Date(a.start_time)
            )
        };
    }, [goingEventsData, hostingEventsData]);

    const filterButtons = [
        { key: 'upcoming', label: 'Upcoming', emptyCase: 'No Upcoming Events', count: processedEvents.upcoming.length },
        { key: 'hosting', label: 'Hosting', emptyCase: 'Coming Soon', count: processedEvents.hosting.length },
        { key: 'past', label: 'Past', emptyCase: 'No Past Events', count: processedEvents.past.length }
    ];

    const events = processedEvents[selectedFilter] || [];
    const loading = goingLoading || hostingLoading;
    const error = goingError || hostingError;



    return (
        <div className="my-events-content">
            <div className="content-wrapper">
                
                {/* Filter Buttons */}
                <div className="filter-buttons">
                    {filterButtons.map((filter) => (
                        <button
                            key={filter.key}
                            className={`filter-button ${selectedFilter === filter.key ? 'active' : ''}`}
                            onClick={() => {
                                setSelectedFilter(filter.key);
                                setEmptyCase(filter.emptyCase);
                            }}
                        >
                            {filter.label}
                            {filter.count > 0 && <span className="count">{filter.count}</span>}
                        </button>
                    ))}
                </div>

                {/* Events List */}
                <div className="events-list">
                    {loading ? (
                        <div className="loading-state">Loading events...</div>
                    ) : error ? (
                        <div className="error-state">Error loading events: {error}</div>
                    ) : events.length > 0 ? (
                        <div className="events-grid">
                            {events.map((event) => (
                                <MyEventCard key={event._id || event.id} event={event} />
                            ))}
                        </div>
                    ) : (
                        <div className="empty-state">
                            <p>{emptyCase}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MyEventsContent;
