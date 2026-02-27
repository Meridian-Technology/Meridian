import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Icon } from '@iconify-icon/react';
import './StudySessionCallback.scss';
import { useFetch } from '../../hooks/useFetch';
import apiRequest from '../../utils/postRequest';
import { useNotification } from '../../NotificationContext';
import Loader from '../../components/Loader/Loader';
import Logo from '../../assets/Brand Image/BEACON.svg';
import EventsGrad from '../../assets/Gradients/EventsGrad.png';

function StudySessionCallback() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { addNotification } = useNotification();
    const [selectedTimeSlots, setSelectedTimeSlots] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [showShareLink, setShowShareLink] = useState(false);
    const [copied, setCopied] = useState(false);
    
    // Get study session ID from query params (could be 'id' or 'token')
    const sessionId = searchParams.get('id') || searchParams.get('token');
    
    // Fetch study session data - try availability poll endpoint first
    const { data: sessionData, loading, error } = useFetch(
        sessionId ? `/study-sessions/availability-poll/${sessionId}` : null
    );

    const studySession = sessionData?.studySession;

    useEffect(() => {
        if (error) {
            addNotification({
                title: 'Error',
                message: 'Failed to load study session. Please check the link and try again.',
                type: 'error'
            });
            return;
        }
    }, []);

    // Format time for display
    const formatTime = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    };

    // Format time window for display
    const formatTimeWindow = (window) => {
        if (!window.start || !window.end) return '';
        const start = new Date(window.start);
        const end = new Date(window.end);
        
        const startStr = start.toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        
        const endStr = end.toLocaleString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        
        return `${startStr} - ${endStr}`;
    };

    // Handle time slot selection
    const handleTimeSlotToggle = (timeSlot) => {
        setSelectedTimeSlots(prev => {
            const isSelected = prev.some(slot => 
                slot.start === timeSlot.start && slot.end === timeSlot.end
            );
            
            if (isSelected) {
                return prev.filter(slot => 
                    !(slot.start === timeSlot.start && slot.end === timeSlot.end)
                );
            } else {
                return [...prev, timeSlot];
            }
        });
    };

    // Handle form submission
    const handleSubmit = async () => {
        if (selectedTimeSlots.length === 0) {
            addNotification({
                title: 'No Time Slots Selected',
                message: 'Please select at least one time slot you are available for.',
                type: 'warning'
            });
            return;
        }

        setSubmitting(true);
        try {
            const response = await apiRequest(`/study-sessions/availability-poll/${sessionId}/reply`, {
                availableTimeSlots: selectedTimeSlots
            });

            if (response.success) {
                addNotification({
                    title: 'Success',
                    message: 'Your availability has been submitted successfully!',
                    type: 'success'
                });
                // Optionally redirect after a delay
                setTimeout(() => {
                    navigate('/events-dashboard');
                }, 2000);
            } else {
                addNotification({
                    title: 'Error',
                    message: response.message || 'Failed to submit availability. Please try again.',
                    type: 'error'
                });
            }
        } catch (error) {
            console.error('Error submitting availability:', error);
            addNotification({
                title: 'Error',
                message: 'Failed to submit availability. Please try again.',
                type: 'error'
            });
        } finally {
            setSubmitting(false);
        }
    };

    // Show helpful message if no ID provided
    if (!sessionId) {
        return (
            <div className="study-session-callback">
                <div className="header">
                    <img src={Logo} alt="Logo" className="logo" />
                </div>
                <div className="error-container">
                    <Icon icon="mdi:link-off" className="error-icon" />
                    <h2>Study Session Invite Required</h2>
                    <p>To reply to a study session, please use the invite link that was sent to you.</p>
                    <p className="help-text">
                        If you received an email or notification, click the link in that message to access this page.
                    </p>
                    <button onClick={() => navigate('/events-dashboard')} className="back-button">
                        <Icon icon="mdi:arrow-left" />
                        Back to Events
                    </button>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="study-session-callback">
                <div className="header">
                    <img src={Logo} alt="Logo" className="logo" />
                </div>
                <div className="loading-container">
                    <Loader />
                    <p>Loading study session...</p>
                </div>
            </div>
        );
    }

    if (error || !studySession) {
        return (
            <div className="study-session-callback">
                <div className="header">
                    <img src={Logo} alt="Logo" className="logo" />
                </div>
                <div className="error-container">
                    <Icon icon="mdi:alert-circle" className="error-icon" />
                    <h2>Study Session Not Found</h2>
                    <p>The study session you're looking for doesn't exist or the link is invalid.</p>
                    <button onClick={() => navigate('/events-dashboard')} className="back-button">
                        <Icon icon="mdi:arrow-left" />
                        Back to Events
                    </button>
                </div>
            </div>
        );
    }

    const timeWindows = studySession.timeWindows || studySession.availableTimeWindows || [];
    const pollLink = sessionData?.pollLink || sessionData?.shareableLink || 
                     (sessionId ? `${window.location.origin}/study-session-callback?id=${sessionId}` : null);

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
                addNotification({
                    title: 'Copy Failed',
                    message: 'Please copy the link manually',
                    type: 'error'
                });
            }
        }
    };

    return (
        <div className="study-session-callback">
            <div className="header">
                <img src={Logo} alt="Logo" className="logo" />
            </div>
            
            <div className="content">
                <div className="session-header">
                    <img src={EventsGrad} alt="" className="header-gradient" />
                    <h1>{studySession.title || studySession.name}</h1>
                    {studySession.subject && (
                        <div className="subject-badge">
                            <Icon icon="mdi:book-open-variant" />
                            <span>{studySession.subject}</span>
                        </div>
                    )}
                    
                    {/* Share Link Button */}
                    {pollLink && (
                        <div className="share-link-section">
                            <button 
                                className="share-link-button"
                                onClick={() => setShowShareLink(!showShareLink)}
                            >
                                <Icon icon="mdi:share-variant" />
                                <span>Share Poll Link</span>
                            </button>
                            
                            {showShareLink && (
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
                                    <p className="share-help-text">Share this link with others so they can vote on their availability</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {studySession.description && (
                    <div className="description-section">
                        <h3>Description</h3>
                        <p>{studySession.description}</p>
                    </div>
                )}

                <div className="time-slots-section">
                    <h3>Select Your Available Time Slots</h3>
                    <p className="instruction-text">
                        Please select all time slots when you are available for this study session.
                    </p>
                    
                    {timeWindows.length === 0 ? (
                        <div className="no-time-slots">
                            <Icon icon="mdi:clock-alert-outline" />
                            <p>No available time windows have been set for this study session.</p>
                        </div>
                    ) : (
                        <div className="time-slots-grid">
                            {timeWindows.map((window, index) => {
                                const isSelected = selectedTimeSlots.some(slot => 
                                    slot.start === window.start && slot.end === window.end
                                );
                                
                                return (
                                    <div
                                        key={index}
                                        className={`time-slot-card ${isSelected ? 'selected' : ''}`}
                                        onClick={() => handleTimeSlotToggle(window)}
                                    >
                                        <div className="time-slot-checkbox">
                                            {isSelected && <Icon icon="mdi:check" />}
                                        </div>
                                        <div className="time-slot-content">
                                            <div className="time-slot-time">
                                                {formatTimeWindow(window)}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="selected-count">
                    {selectedTimeSlots.length > 0 && (
                        <p>
                            {selectedTimeSlots.length} time slot{selectedTimeSlots.length !== 1 ? 's' : ''} selected
                        </p>
                    )}
                </div>

                <div className="actions">
                    <button
                        className="submit-button"
                        onClick={handleSubmit}
                        disabled={submitting || selectedTimeSlots.length === 0}
                    >
                        {submitting ? (
                            <>
                                <Loader />
                                <span>Submitting...</span>
                            </>
                        ) : (
                            <>
                                <Icon icon="mdi:check-circle" />
                                <span>Submit Availability</span>
                            </>
                        )}
                    </button>
                    <button
                        className="cancel-button"
                        onClick={() => navigate('/events-dashboard')}
                        disabled={submitting}
                    >
                        <Icon icon="mdi:close" />
                        <span>Cancel</span>
                    </button>
                </div>
            </div>
        </div>
    );
}

export default StudySessionCallback;

