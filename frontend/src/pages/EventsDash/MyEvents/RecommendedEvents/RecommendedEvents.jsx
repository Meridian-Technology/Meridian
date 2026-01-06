import React, { useMemo } from "react";
import "./RecommendedEvents.scss";

import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import { useNavigate } from "react-router-dom";
import { useNotification } from "../../../../NotificationContext";
import { useFetch } from "../../../../hooks/useFetch";
import HeaderContainer from "../../../../components/HeaderContainer/HeaderContainer";
import EventCard from "./RecommendedEventPreviewCard/RecommendedEventPreviewCard";
import RecommendedRoomCard from "../../../../components/RecommendedRoomCard/RecommendedRoomCard";

const RecommendedEvents = () => {
    const navigate = useNavigate();
    const { addNotification } = useNotification();
    
    // Memoize the options to prevent infinite loops
    const eventsOptions = useMemo(() => ({
        params: { limit: 5 }
    }), []);
    
    // Use useFetch hook for events data
    const { data: eventsData, loading: eventsLoading, error: eventsError } = useFetch('/event-recommendation', eventsOptions);
    
    // Use useFetch hook for room recommendation
    const { data: roomData, loading: roomLoading, error: roomError } = useFetch('/get-recommendation');
    
    // Handle errors
    React.useEffect(() => {
        if (eventsError) {
            addNotification({
                title: 'Error', 
                message: 'Error fetching events', 
                type: 'error'
            });
        }
    }, [eventsError]);
    
    React.useEffect(() => {
        if (roomError) {
            addNotification({
                title: 'Error', 
                message: 'Error fetching recommended room', 
                type: 'error'
            });
        }
    }, [roomError]);

    const events = Array.isArray(eventsData) ? eventsData : 
                   eventsData?.events ? eventsData.events : 
                   eventsData?.data ? eventsData.data : [];

    const recommendedRoom = roomData?.data || null;

    const exploreButton = (
        <div className="explore-events-button" onClick={() => navigate('/events-dashboard?page=1')}>
            Explore Events <Icon icon="mingcute:arrow-right-line" />
        </div>
    );

    return (
        <div className="recommended-events">
            <div className="content-row">
                <HeaderContainer
                    icon="streamline:target-remix"
                    header="Top Picks for You"
                    right={exploreButton}
                    size="16px"
                    classN="recommended-events-container"
                >
                    <div className="top-picks-content">
                        {eventsLoading ? (
                            <div>Loading events...</div>
                        ) : events && events.length > 0 ? (
                            events.map((event) => (
                                <EventCard key={event.id || event._id} event={event} />
                            ))
                        ) : (
                            <div>No recommended events available</div>
                        )}
                    </div>
                </HeaderContainer>
                <div className="recommended-room"> 
                    <div className="recommended-room-header">
                        <p className="recommended-room-title">Recommended Room</p>
                    </div>
                    <RecommendedRoomCard room={recommendedRoom} loading={roomLoading} />
                </div>
            </div>
        </div>
    );
};

export default RecommendedEvents;
