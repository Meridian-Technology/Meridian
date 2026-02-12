import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../hooks/useFetch';
import apiRequest from '../../utils/postRequest';
import { useNotification } from '../../NotificationContext';
import './CheckInConfirmation.scss';

function CheckInConfirmation() {
    const { eventId, token } = useParams();
    const navigate = useNavigate();
    const { addNotification } = useNotification();
    const [checkingIn, setCheckingIn] = useState(false);
    const [checkedIn, setCheckedIn] = useState(false);

    // Fetch event details
    const { data: eventResponse, loading: eventLoading, error: eventError } = useFetch(
        eventId ? `/get-event/${eventId}` : null
    );

    const event = eventResponse?.event;

    useEffect(() => {
        // Validate token matches event
        if (event && event.checkInToken !== token) {
            addNotification({
                title: 'Invalid Check-In Link',
                message: 'This check-in link is invalid or has expired.',
                type: 'error'
            });
            navigate('/');
        }
    }, [event, token, navigate, addNotification]);

    // Auto check-in if enabled (must be unconditional so hooks order is stable)
    useEffect(() => {
        if (!event?.checkInSettings?.autoCheckIn || !eventId || !token || !event || eventLoading || eventError || !event.checkInEnabled || checkingIn || checkedIn) return;
        const now = new Date();
        const startTime = new Date(event.start_time);
        const endTime = new Date(event.end_time);
        if (now < startTime || now > endTime) return;
        let cancelled = false;
        (async () => {
            setCheckingIn(true);
            try {
                const response = await apiRequest(
                    `/events/${eventId}/check-in`,
                    { token },
                    { method: 'POST' }
                );
                if (cancelled) return;
                if (response.success) {
                    setCheckedIn(true);
                    addNotification({
                        title: 'Success',
                        message: 'You have successfully checked in!',
                        type: 'success'
                    });
                    setTimeout(() => navigate(`/event/${eventId}`), 2000);
                } else {
                    addNotification({
                        title: 'Error',
                        message: response.message || 'Failed to check in',
                        type: 'error'
                    });
                }
            } catch (error) {
                if (!cancelled) {
                    addNotification({
                        title: 'Error',
                        message: error.message || 'Failed to check in. Please try again.',
                        type: 'error'
                    });
                }
            } finally {
                if (!cancelled) setCheckingIn(false);
            }
        })();
        return () => { cancelled = true; };
    }, [event, eventId, token, eventLoading, eventError, checkingIn, checkedIn, addNotification, navigate]);

    const handleCheckIn = async () => {
        if (!eventId || !token) {
            addNotification({
                title: 'Error',
                message: 'Missing event information',
                type: 'error'
            });
            return;
        }

        setCheckingIn(true);
        try {
            const response = await apiRequest(
                `/events/${eventId}/check-in`,
                { token },
                { method: 'POST' }
            );

            if (response.success) {
                setCheckedIn(true);
                addNotification({
                    title: 'Success',
                    message: 'You have successfully checked in!',
                    type: 'success'
                });

                // Redirect to event page after 2 seconds
                setTimeout(() => {
                    navigate(`/event/${eventId}`);
                }, 2000);
            } else {
                throw new Error(response.message || 'Failed to check in');
            }
        } catch (error) {
            addNotification({
                title: 'Error',
                message: error.message || 'Failed to check in. Please try again.',
                type: 'error'
            });
        } finally {
            setCheckingIn(false);
        }
    };

    if (eventLoading) {
        return (
            <div className="checkin-confirmation-page">
                <div className="checkin-loading">
                    <Icon icon="mdi:loading" className="spinner" />
                    <p>Loading event details...</p>
                </div>
            </div>
        );
    }

    if (eventError || !event) {
        return (
            <div className="checkin-confirmation-page">
                <div className="checkin-error">
                    <Icon icon="mdi:alert-circle" />
                    <h2>Event Not Found</h2>
                    <p>The event you're trying to check in to could not be found.</p>
                    <button onClick={() => navigate('/')}>Go Home</button>
                </div>
            </div>
        );
    }

    if (!event.checkInEnabled) {
        return (
            <div className="checkin-confirmation-page">
                <div className="checkin-error">
                    <Icon icon="mdi:qrcode-off" />
                    <h2>Check-In Not Enabled</h2>
                    <p>Check-in is not enabled for this event.</p>
                    <button onClick={() => navigate(`/event/${eventId}`)}>View Event</button>
                </div>
            </div>
        );
    }

    // Check if event is currently active
    const now = new Date();
    const startTime = new Date(event.start_time);
    const endTime = new Date(event.end_time);

    if (now < startTime || now > endTime) {
        return (
            <div className="checkin-confirmation-page">
                <div className="checkin-error">
                    <Icon icon="mdi:clock-alert-outline" />
                    <h2>Check-In Not Available</h2>
                    <p>Check-in is only available during the event time.</p>
                    <p className="event-time">
                        Event time: {startTime.toLocaleString()} - {endTime.toLocaleString()}
                    </p>
                    <button onClick={() => navigate(`/event/${eventId}`)}>View Event</button>
                </div>
            </div>
        );
    }

    if (checkedIn) {
        return (
            <div className="checkin-confirmation-page">
                <div className="checkin-success">
                    <Icon icon="mdi:check-circle" className="success-icon" />
                    <h2>Successfully Checked In!</h2>
                    <p>You have been checked in to {event.name}.</p>
                    <p className="redirect-message">Redirecting to event page...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="checkin-confirmation-page">
            <div className="checkin-container">
                <div className="checkin-header">
                    <Icon icon="mdi:qrcode-scan" className="header-icon" />
                    <h1>Check In to Event</h1>
                </div>

                <div className="event-details">
                    <h2>{event.name}</h2>
                    {event.description && (
                        <p className="event-description">{event.description}</p>
                    )}
                    <div className="event-info">
                        <div className="info-item">
                            <Icon icon="mdi:calendar" />
                            <span>
                                {new Date(event.start_time).toLocaleDateString('en-US', {
                                    weekday: 'long',
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric'
                                })}
                            </span>
                        </div>
                        <div className="info-item">
                            <Icon icon="mdi:clock-outline" />
                            <span>
                                {new Date(event.start_time).toLocaleTimeString('en-US', {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                })} - {new Date(event.end_time).toLocaleTimeString('en-US', {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                })}
                            </span>
                        </div>
                        <div className="info-item">
                            <Icon icon="mdi:map-marker" />
                            <span>{event.location}</span>
                        </div>
                    </div>
                </div>

                <div className="checkin-actions">
                    <button
                        className="checkin-button"
                        onClick={handleCheckIn}
                        disabled={checkingIn}
                    >
                        {checkingIn ? (
                            <>
                                <Icon icon="mdi:loading" className="spinner" />
                                Checking In...
                            </>
                        ) : (
                            <>
                                <Icon icon="mdi:check-circle" />
                                Check In
                            </>
                        )}
                    </button>
                    <button
                        className="cancel-button"
                        onClick={() => navigate(`/event/${eventId}`)}
                        disabled={checkingIn}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}

export default CheckInConfirmation;
