import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@iconify-icon/react';
import defaultAvatar from '../../assets/defaultAvatar.svg';
import useAuth from '../../hooks/useAuth';
import { useNotification } from '../../NotificationContext';
import RSVPSection from '../RSVPSection/RSVPSection';
import EventCheckInButton from '../EventCheckInButton/EventCheckInButton';
import EventsByCreator from '../EventsByCreator/EventsByCreator';
import EventAnalytics from '../EventAnalytics/EventAnalytics';
import AgendaEditor from '../AgendaEditor/AgendaEditor';
import './EventViewer.scss';

function EventViewer({ 
    event, 
    showBackButton = true, 
    showAnalytics = true, 
    showEventsByCreator = true,
    onBack,
    className = '' 
}) {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { addNotification } = useNotification();
    const [activeTab, setActiveTab] = useState('details');

    if (!event) {
        return (
            <div className={`event-viewer ${className}`}>
                <div className="loading-container">
                    <Icon icon="mdi:loading" className="spinner" />
                    <p>Loading event...</p>
                </div>
            </div>
        );
    }

    const renderHostingStatus = () => {
        if (!event?.hostingType) return null;

        let hostingImage = '';
        let hostingName = '';
        let level = '';

        if (event.hostingType === "User") {
            hostingImage = event.hostingId?.image ? event.hostingId.image : defaultAvatar;
            hostingName = event.hostingId?.name || 'Unknown User';
            if (event.hostingId?.roles?.includes("developer")) {
                level = "Developer";
            } else if (event.hostingId?.roles?.includes("oie")) {
                level = "Faculty";
            } else {
                level = "Student";
            }
        } else {
            hostingImage = event.hostingId?.org_profile_image || defaultAvatar;
            hostingName = event.hostingId?.org_name || 'Unknown Organization';
            level = "Organization";
        }

        return (
            <div 
                className={`row hosting ${level.toLowerCase()}`} 
                onClick={() => {
                    if (level === "Organization") {
                        navigate(`/org/${hostingName}`);
                    }
                }}
            >
                <p>Hosted by</p>
                <img src={hostingImage} alt="" />
                <p className="user-name">{hostingName}</p>
                <div className={`level ${level.toLowerCase()}`}>
                    {level}
                </div>
            </div>
        );
    };

    const handleBack = () => {
        if (onBack) {
            onBack();
        } else {
            navigate(-1);
        }
    };

    const date = new Date(event.start_time);
    const dateEnd = new Date(event.end_time);

    return (
        <div className={`event-viewer ${className}`}>
            <div className="event-content">
                {event.image && (
                    <div className="image-container">
                        <img src={event.image} alt={`Event image for ${event.name}`} className="event-image" />
                    </div>
                )}
                
                <div className="event-details">
                    {showBackButton && (
                        <div className="back" onClick={handleBack}>
                            <Icon icon="mdi:arrow-left" />
                            <p>Back</p>
                        </div>
                    )}
                    
                    <h1>{event.name}</h1>
                    
                    <div className="col">
                        <div className="row event-detail date">
                            <p>
                                {date.toLocaleString('default', {weekday: 'long'})}, {date.toLocaleString('default', {month: 'long'})} {date.getDate()}
                            </p>
                        </div>
                        <div className="row event-detail time">
                            <p>
                                {date.toLocaleString('default', {hour: 'numeric', minute: 'numeric', hour12: true})} - {dateEnd.toLocaleString('default', {hour: 'numeric', minute: 'numeric', hour12: true})}
                            </p>
                        </div>
                        <div className="row event-detail location">
                            <Icon icon="fluent:location-28-filled" />
                            <p>{event.location}</p>
                        </div>
                    </div>
                    
                    {renderHostingStatus()}

                    <div className="row event-description">
                        <p>{event.description}</p>
                    </div>
                    
                    {event.externalLink && (
                        <div className="row external-link">
                            <a href={event.externalLink} target="_blank" rel="noopener noreferrer">
                                <Icon icon="heroicons:arrow-top-right-on-square-20-solid" />
                                <p>View Event External Link</p>
                            </a>
                        </div>
                    )}
                    
                    <RSVPSection event={event} />
                    <EventCheckInButton event={event} />
                    
                    {/* Agenda Editor */}
                    <AgendaEditor event={event} onUpdate={(updatedEvent) => {
                        // Update event if parent component handles it
                        if (onBack) {
                            // Force refresh by navigating away and back, or parent can handle
                        }
                    }} />
                    
                    {/* Analytics Tab for Admin Users */}
                    {showAnalytics && user && user.roles && user.roles.includes('admin') && (
                        <div className="analytics-tab">
                            <div className="tab-buttons">
                                <button 
                                    className={activeTab === 'details' ? 'active' : ''}
                                    onClick={() => setActiveTab('details')}
                                >
                                    Event Details
                                </button>
                                <button 
                                    className={activeTab === 'analytics' ? 'active' : ''}
                                    onClick={() => setActiveTab('analytics')}
                                >
                                    <Icon icon="mingcute:chart-fill" />
                                    Analytics
                                </button>
                            </div>
                            
                            {activeTab === 'analytics' && (
                                <div className="analytics-content">
                                    <EventAnalytics />
                                </div>
                            )}
                        </div>
                    )}
                    
                    {/* More Events by This Creator Section */}
                    {showEventsByCreator && event && activeTab === 'details' && (
                        <EventsByCreator 
                            eventId={event._id}
                            creatorName={event.hostingType === "User" 
                                ? event.hostingId?.name 
                                : event.hostingId?.org_name
                            }
                            creatorType={event.hostingType === "User" 
                                ? (event.hostingId?.roles?.includes("developer") 
                                    ? "Developer" 
                                    : event.hostingId?.roles?.includes("oie") 
                                        ? "Faculty" 
                                        : "Student")
                                : "Organization"
                            }
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

export default EventViewer;
