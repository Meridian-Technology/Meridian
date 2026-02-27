import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Icon } from '@iconify-icon/react';
import './StudySessionResponses.scss';
import { useFetch } from '../../hooks/useFetch';
import apiRequest from '../../utils/postRequest';
import { useNotification } from '../../NotificationContext';
import useAuth from '../../hooks/useAuth';
import Loader from '../../components/Loader/Loader';
import Logo from '../../assets/Brand Image/BEACON.svg';
import EventsGrad from '../../assets/Gradients/EventsGrad.png';
import defaultAvatar from '../../assets/defaultAvatar.svg';

function StudySessionResponses() {
    const { sessionId } = useParams();
    const navigate = useNavigate();
    const { addNotification } = useNotification();
    const { user } = useAuth();
    const [finalizing, setFinalizing] = useState(false);
    const [selectedFinalTime, setSelectedFinalTime] = useState(null);
    const [copied, setCopied] = useState(false);

    // Fetch study session and poll responses
    const { data: sessionData, loading, error, refetch } = useFetch(
        sessionId ? `/study-sessions/${sessionId}` : null
    );

    const { data: pollData, loading: pollLoading } = useFetch(
        sessionId ? `/study-sessions/${sessionId}/availability-poll/responses` : null
    );

    const studySession = sessionData?.data;
    const poll = pollData?.poll;
    const responses = pollData?.responses || [];
    const timeWindows = poll?.timeSlotOptions || [];

    useEffect(() => {
        if (error) {
            addNotification({
                title: 'Error',
                message: 'Failed to load study session. Please check the link and try again.',
                type: 'error'
            });
        }
    }, [error]);

    // Check if user is creator
    const isCreator = user && studySession && studySession.creator?._id === user._id;

    useEffect(() => {
        if (studySession && !isCreator) {
            addNotification({
                title: 'Access Denied',
                message: 'Only the creator can view poll responses.',
                type: 'error'
            });
            navigate('/events-dashboard');
        }
    }, [studySession, isCreator, navigate]);

    // Format time window for display
    const formatTimeWindow = (window) => {
        if (!window.startTime || !window.endTime) return '';
        const start = new Date(window.startTime);
        const end = new Date(window.endTime);
        
        const startStr = start.toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        
        const endStr = end.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        
        return `${startStr} - ${endStr}`;
    };

    // Count how many users selected each time window
    const getTimeWindowCounts = () => {
        const counts = {};
        
        timeWindows.forEach((window, index) => {
            counts[index] = {
                window,
                count: 0,
                users: []
            };
        });

        responses.forEach(response => {
            response.selectedBlocks.forEach(block => {
                timeWindows.forEach((window, index) => {
                    const blockStart = new Date(block.startTime);
                    const blockEnd = new Date(block.endTime);
                    const windowStart = new Date(window.startTime);
                    const windowEnd = new Date(window.endTime);
                    
                    // Check if block overlaps with window
                    if (blockStart <= windowEnd && blockEnd >= windowStart) {
                        counts[index].count++;
                        if (!counts[index].users.find(u => u._id === response.user?._id)) {
                            counts[index].users.push(response.user);
                        }
                    }
                });
            });
        });

        return Object.values(counts).sort((a, b) => b.count - a.count);
    };

    const timeWindowCounts = getTimeWindowCounts();
    const pollLink = poll?._id ? `${window.location.origin}/study-session-callback?id=${poll._id}` : null;

    const handleCopyLink = async () => {
        if (pollLink) {
            try {
                await navigator.clipboard.writeText(pollLink);
                setCopied(true);
                addNotification({
                    title: 'Link Copied!',
                    message: 'Poll link copied to clipboard',
                    type: 'success'
                });
                setTimeout(() => setCopied(false), 2000);
            } catch (error) {
                console.error('Failed to copy link:', error);
            }
        }
    };

    const handleFinalizeTime = async () => {
        if (!selectedFinalTime) {
            addNotification({
                title: 'No Time Selected',
                message: 'Please select a time slot to finalize.',
                type: 'warning'
            });
            return;
        }

        setFinalizing(true);
        try {
            const response = await apiRequest(`/study-sessions/availability-poll/${poll._id}/finalize`, {
                startTime: selectedFinalTime.startTime,
                endTime: selectedFinalTime.endTime
            });

            if (response.success) {
                addNotification({
                    title: 'Time Finalized',
                    message: 'Study session time has been finalized! An event will be created and all participants will be notified.',
                    type: 'success'
                });
                refetch();
            } else {
                throw new Error(response.message || 'Failed to finalize time');
            }
        } catch (error) {
            console.error('Error finalizing time:', error);
            addNotification({
                title: 'Error',
                message: 'Failed to finalize time. Please try again.',
                type: 'error'
            });
        } finally {
            setFinalizing(false);
        }
    };

    if (loading || pollLoading) {
        return (
            <div className="study-session-responses">
                <div className="header">
                    <img src={Logo} alt="Logo" className="logo" />
                </div>
                <div className="loading-container">
                    <Loader />
                    <p>Loading responses...</p>
                </div>
            </div>
        );
    }

    if (error || !studySession) {
        return (
            <div className="study-session-responses">
                <div className="header">
                    <img src={Logo} alt="Logo" className="logo" />
                </div>
                <div className="error-container">
                    <Icon icon="mdi:alert-circle" className="error-icon" />
                    <h2>Study Session Not Found</h2>
                    <p>The study session you're looking for doesn't exist.</p>
                    <button onClick={() => navigate('/events-dashboard')} className="back-button">
                        <Icon icon="mdi:arrow-left" />
                        Back to Events
                    </button>
                </div>
            </div>
        );
    }

    if (!isCreator) {
        return null; // Will redirect in useEffect
    }

    return (
        <div className="study-session-responses">
            <div className="header">
                <img src={Logo} alt="Logo" className="logo" />
            </div>
            
            <div className="content">
                <div className="session-header">
                    <img src={EventsGrad} alt="" className="header-gradient" />
                    <h1>{studySession.title}</h1>
                    {studySession.course && (
                        <div className="subject-badge">
                            <Icon icon="mdi:book-open-variant" />
                            <span>{studySession.course}</span>
                        </div>
                    )}
                </div>

                {studySession.description && (
                    <div className="description-section">
                        <h3>Description</h3>
                        <p>{studySession.description}</p>
                    </div>
                )}

                {/* Share Link Section */}
                {pollLink && (
                    <div className="share-link-section">
                        <h3>Share Poll Link</h3>
                        <div className="share-link-container">
                            <div className="share-link-input-group">
                                <input 
                                    type="text" 
                                    value={pollLink} 
                                    readOnly 
                                    onClick={(e) => e.target.select()}
                                />
                                <button 
                                    className="copy-button"
                                    onClick={handleCopyLink}
                                >
                                    <Icon icon={copied ? "mdi:check" : "mdi:content-copy"} />
                                    <span>{copied ? 'Copied!' : 'Copy'}</span>
                                </button>
                            </div>
                            <p className="share-help-text">Share this link so others can vote on their availability</p>
                        </div>
                    </div>
                )}

                {/* Responses Summary */}
                <div className="responses-summary">
                    <h3>Availability Responses</h3>
                    <div className="summary-stats">
                        <div className="stat-card">
                            <Icon icon="mdi:account-group" />
                            <div>
                                <span className="stat-value">{responses.length}</span>
                                <span className="stat-label">Responses</span>
                            </div>
                        </div>
                        <div className="stat-card">
                            <Icon icon="mdi:clock-outline" />
                            <div>
                                <span className="stat-value">{timeWindows.length}</span>
                                <span className="stat-label">Time Options</span>
                            </div>
                        </div>
                        {poll?.expiresAt && (
                            <div className="stat-card">
                                <Icon icon="mdi:calendar-clock" />
                                <div>
                                    <span className="stat-value">
                                        {new Date(poll.expiresAt) > new Date() ? 'Active' : 'Expired'}
                                    </span>
                                    <span className="stat-label">Poll Status</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Time Window Popularity */}
                {timeWindowCounts.length > 0 && (
                    <div className="time-popularity-section">
                        <h3>Time Slot Popularity</h3>
                        <p className="section-description">See which time slots have the most availability</p>
                        
                        <div className="time-windows-list">
                            {timeWindowCounts.map((item, index) => (
                                <div 
                                    key={index}
                                    className={`time-window-card ${selectedFinalTime?.index === index ? 'selected' : ''}`}
                                    onClick={() => setSelectedFinalTime({
                                        index,
                                        startTime: item.window.startTime,
                                        endTime: item.window.endTime
                                    })}
                                >
                                    <div className="time-window-header">
                                        <div className="time-window-time">
                                            {formatTimeWindow(item.window)}
                                        </div>
                                        <div className="time-window-count">
                                            <Icon icon="mdi:account-check" />
                                            <span>{item.count} {item.count === 1 ? 'person' : 'people'} available</span>
                                        </div>
                                    </div>
                                    
                                    {item.users.length > 0 && (
                                        <div className="available-users">
                                            <div className="users-list">
                                                {item.users.map((user, idx) => (
                                                    <div key={idx} className="user-avatar-small">
                                                        <img 
                                                            src={user?.picture || defaultAvatar} 
                                                            alt={user?.name || 'User'}
                                                            onError={(e) => {
                                                                e.target.src = defaultAvatar;
                                                            }}
                                                        />
                                                        <span>{user?.name || user?.username || 'User'}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    
                                    {selectedFinalTime?.index === index && (
                                        <div className="selected-indicator">
                                            <Icon icon="mdi:check-circle" />
                                            <span>Selected for finalization</span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Individual Responses */}
                <div className="individual-responses-section">
                    <h3>Individual Responses</h3>
                    {responses.length === 0 ? (
                        <div className="no-responses">
                            <Icon icon="mdi:inbox-outline" />
                            <p>No responses yet. Share the poll link to get started!</p>
                        </div>
                    ) : (
                        <div className="responses-list">
                            {responses.map((response, index) => (
                                <div key={index} className="response-card">
                                    <div className="response-header">
                                        <div className="user-info">
                                            <img 
                                                src={response.user?.picture || defaultAvatar} 
                                                alt={response.user?.name || 'User'}
                                                className="user-avatar"
                                                onError={(e) => {
                                                    e.target.src = defaultAvatar;
                                                }}
                                            />
                                            <div>
                                                <h4>{response.user?.name || response.user?.username || 'Anonymous'}</h4>
                                                <p className="response-date">
                                                    Responded {new Date(response.submittedAt).toLocaleString()}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="response-times">
                                        <h5>Available Times:</h5>
                                        <div className="time-blocks">
                                            {response.selectedBlocks.map((block, blockIndex) => (
                                                <div key={blockIndex} className="time-block">
                                                    {formatTimeWindow({
                                                        startTime: block.startTime,
                                                        endTime: block.endTime
                                                    })}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Finalize Section */}
                {!poll?.isFinalized && selectedFinalTime && (
                    <div className="finalize-section">
                        <h3>Finalize Study Session Time</h3>
                        <div className="finalize-content">
                            <div className="selected-time-display">
                                <Icon icon="mdi:calendar-check" />
                                <div>
                                    <strong>Selected Time:</strong>
                                    <p>{formatTimeWindow(selectedFinalTime)}</p>
                                </div>
                            </div>
                            <p className="finalize-warning">
                                Finalizing will create an event for this time and notify all participants who haven't declined.
                            </p>
                            <button 
                                className="finalize-button"
                                onClick={handleFinalizeTime}
                                disabled={finalizing}
                            >
                                {finalizing ? (
                                    <>
                                        <Loader />
                                        <span>Finalizing...</span>
                                    </>
                                ) : (
                                    <>
                                        <Icon icon="mdi:check-circle" />
                                        <span>Finalize This Time</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {poll?.isFinalized && poll?.finalizedChoice && (
                    <div className="finalized-section">
                        <div className="finalized-badge">
                            <Icon icon="mdi:check-circle" />
                            <span>Time Finalized</span>
                        </div>
                        <div className="finalized-time">
                            <strong>Final Time:</strong>
                            <p>{formatTimeWindow({
                                startTime: poll.finalizedChoice.startTime,
                                endTime: poll.finalizedChoice.endTime
                            })}</p>
                        </div>
                    </div>
                )}

                <div className="actions">
                    <button
                        className="back-button"
                        onClick={() => navigate('/events-dashboard')}
                    >
                        <Icon icon="mdi:arrow-left" />
                        <span>Back to Events</span>
                    </button>
                </div>
            </div>
        </div>
    );
}

export default StudySessionResponses;

