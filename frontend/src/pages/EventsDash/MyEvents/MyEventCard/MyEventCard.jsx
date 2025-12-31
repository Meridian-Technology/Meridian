import React from 'react';
import './MyEventCard.scss';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import { useNavigate } from 'react-router-dom';
import useAuth from '../../../../hooks/useAuth';
import { useDashboardOverlay } from '../../../../hooks/useDashboardOverlay';

const MyEventCard = ({ event }) => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { showEventWorkspace } = useDashboardOverlay();
    const date = new Date(event?.start_time || Date.now());
    
    // Check if user is hosting this event
    const isHosting = user && event && (
        (event.hostingType === 'User' && (
            event.hostingId?._id?.toString() === user._id?.toString() ||
            event.hostingId?.toString() === user._id?.toString() ||
            (typeof event.hostingId === 'string' && event.hostingId === user._id?.toString())
        )) ||
        (event.hostingType === 'Org' && user.roles?.includes('admin'))
    );

    // Color mapping based on event type to wo
    const getEventTypeColor = (eventType) => {
        const colorMap = {
            'campus': 'rgba(250, 117, 109, 1)',
            'alumni': '#5C5C5C',
            'sports': '#6EB25F', // athletics in legend
            'arts': '#FBEBBB',   // arts/EMPAC in legend
            'study': 'rgba(250, 117, 109, 1)', // default to campus color
            'meeting': 'rgba(250, 117, 109, 1)' // default to campus color
        };
        return colorMap[eventType] || 'rgba(250, 117, 109, 1)'; // default to campus color
    };

    const eventTypeColor = getEventTypeColor(event?.type);
    const hasPreviewImage = event?.image || event?.previewImage;

    const handleCardClick = () => {
        if (event?._id) {
            navigate(`/event/${event._id}`);
        }
    };

    const handleWorkspaceClick = (e) => {
        e.stopPropagation(); // Prevent card click
        if (event?._id) {
            showEventWorkspace(event._id);
        }
    };



    return (
        <div className="my-event-card" onClick={handleCardClick}>
            {isHosting && (
                <button 
                    className="workspace-button"
                    onClick={handleWorkspaceClick}
                    title="Open Event Workspace"
                >
                    <Icon icon="mdi:briefcase-edit" />
                </button>
            )}
            {/* Event Image or Gradient */}
            <div 
                className={`event-image ${!hasPreviewImage ? 'gradient-background' : ''}`}
                style={!hasPreviewImage ? {
                    background: `linear-gradient(135deg, ${eventTypeColor} 0%, white 100%)`
                } : {}}
            >
                {hasPreviewImage && (
                    <img 
                        src={event.image || event.previewImage} 
                        alt={event?.name || "Event"} 
                        className="actual-image"
                    />
                )}
            </div>

            <div className="info">
                <h2>{event?.name || "Event Title"}</h2>
                
                {/* Date Row */}
                <div className="row">
                    <Icon icon="heroicons:calendar-16-solid" />
                    <p>{date.toLocaleString('default', {weekday: 'long'})} {date.toLocaleString('default', {month: 'numeric'})}/{date.getDate()}</p>
                </div>

                {/* Location Row */}
                <div className="row">
                    <Icon icon="fluent:location-28-filled" />
                    <p className="location">{event?.location || "Location TBD"}</p>
                </div>
            </div>
        </div>
    );
};

export default MyEventCard;
