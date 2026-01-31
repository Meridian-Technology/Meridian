import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../../hooks/useFetch';
import './StudySessionDrafts.scss';

const StudySessionDrafts = ({ userId }) => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('unfinalized'); // 'unfinalized' or 'finalized'
    
    // Fetch user's study sessions
    const { data: sessionsData, loading, refetch } = useFetch(
        userId ? `/study-sessions?status=all&limit=100` : null
    );

    useEffect(() => {
        console.log(sessionsData);
    }, [sessionsData]);

    const sessions = sessionsData?.sessions || sessionsData?.data || [];
    
    // Separate finalized and unfinalized sessions
    const unfinalizedSessions = sessions.filter(session => {
        // Unfinalized: has availability poll that isn't finalized, or no related event yet
        if (session.availabilityPoll) {
            // Check if poll is finalized
            return !session.availabilityPoll?.isFinalized;
        }
        // If no poll and no event, it's unfinalized
        return !session.relatedEvent;
    });

    const finalizedSessions = sessions.filter(session => {
        // Finalized: has related event, or poll is finalized
        if (session.availabilityPoll) {
            return session.availabilityPoll?.isFinalized;
        }
        return !!session.relatedEvent;
    });

    const formatDate = (dateString) => {
        if (!dateString) return 'No date set';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const formatTime = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    };

    const handleSessionClick = (session) => {
        if (session.availabilityPoll && !session.availabilityPoll?.isFinalized) {
            // Navigate to responses page for unfinalized polls
            navigate(`/study-session/${session._id}/responses`);
        } else if (session.relatedEvent) {
            // Navigate to event page for finalized sessions
            navigate(`/event/${session.relatedEvent._id || session.relatedEvent}`);
        } else {
            // Navigate to session details
            navigate(`/study-session/${session._id}/responses`);
        }
    };

    const displaySessions = activeTab === 'unfinalized' ? unfinalizedSessions : finalizedSessions;

    if (!userId) {
        return null;
    }

    return (
        <div className="study-session-drafts">
            <div className="drafts-header">
                <h3>Your Study Sessions</h3>
                <div className="tabs">
                    <button 
                        className={`tab ${activeTab === 'unfinalized' ? 'active' : ''}`}
                        onClick={() => setActiveTab('unfinalized')}
                    >
                        <Icon icon="mdi:clock-outline" />
                        <span>Unfinalized ({unfinalizedSessions.length})</span>
                    </button>
                    <button 
                        className={`tab ${activeTab === 'finalized' ? 'active' : ''}`}
                        onClick={() => setActiveTab('finalized')}
                    >
                        <Icon icon="mdi:check-circle" />
                        <span>Finalized ({finalizedSessions.length})</span>
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="loading-state">
                    <Icon icon="mdi:loading" className="spinner" />
                    <span>Loading sessions...</span>
                </div>
            ) : displaySessions.length === 0 ? (
                <div className="empty-state">
                    <Icon icon="mdi:inbox-outline" />
                    <p>No {activeTab} study sessions yet.</p>
                </div>
            ) : (
                <div className="sessions-list">
                    {displaySessions.map((session) => (
                        <div 
                            key={session._id} 
                            className="session-card"
                            onClick={() => handleSessionClick(session)}
                        >
                            <div className="session-header">
                                <h4>{session.title}</h4>
                                {session.availabilityPoll && !session.availabilityPoll?.isFinalized && (
                                    <span className="status-badge unfinalized">
                                        <Icon icon="mdi:clock-outline" />
                                        Poll Active
                                    </span>
                                )}
                                {session.availabilityPoll?.isFinalized && (
                                    <span className="status-badge finalized">
                                        <Icon icon="mdi:check-circle" />
                                        Finalized
                                    </span>
                                )}
                                {session.relatedEvent && !session.availabilityPoll && (
                                    <span className="status-badge scheduled">
                                        <Icon icon="mdi:calendar-check" />
                                        Scheduled
                                    </span>
                                )}
                            </div>
                            
                            <div className="session-details">
                                {session.course && (
                                    <div className="detail-item">
                                        <Icon icon="mdi:book-open-variant" />
                                        <span>{session.course}</span>
                                    </div>
                                )}
                                
                                {session.relatedEvent && (
                                    <div className="detail-item">
                                        <Icon icon="mdi:calendar" />
                                        <span>
                                            {formatDate(session.relatedEvent.start_time || session.startTime)}
                                            {session.relatedEvent.start_time && ` at ${formatTime(session.relatedEvent.start_time)}`}
                                        </span>
                                    </div>
                                )}
                                
                                {session.availabilityPoll && !session.availabilityPoll?.isFinalized && (
                                    <div className="detail-item">
                                        <Icon icon="mdi:account-group" />
                                        <span>
                                            {session.availabilityPoll?.responses?.length || 0} response(s)
                                        </span>
                                    </div>
                                )}
                                
                                {session.location && (
                                    <div className="detail-item">
                                        <Icon icon="mdi:map-marker" />
                                        <span>{session.location}</span>
                                    </div>
                                )}
                            </div>
                            
                            <div className="session-actions">
                                {session.availabilityPoll && !session.availabilityPoll?.isFinalized ? (
                                    <span className="action-link">
                                        View Responses <Icon icon="mdi:arrow-right" />
                                    </span>
                                ) : (
                                    <span className="action-link">
                                        View Event <Icon icon="mdi:arrow-right" />
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default StudySessionDrafts;

