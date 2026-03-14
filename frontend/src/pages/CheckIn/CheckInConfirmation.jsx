import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../hooks/useFetch';
import apiRequest from '../../utils/postRequest';
import { useNotification } from '../../NotificationContext';
import useAuth from '../../hooks/useAuth';
import { parseMarkdownDescription } from '../../utils/markdownUtils';
import backgroundImage from '../../assets/LandingBackground.png';
import './CheckInConfirmation.scss';

function CheckInConfirmation() {
    const { eventId, token } = useParams();
    const { user } = useAuth();
    const navigate = useNavigate();
    const { addNotification } = useNotification();
    const [checkingIn, setCheckingIn] = useState(false);
    const [checkedIn, setCheckedIn] = useState(false);
    const [tokenInvalid, setTokenInvalid] = useState(false);

    // Fetch event details
    const { data: eventResponse, loading: eventLoading, error: eventError } = useFetch(
        eventId ? `/get-event/${eventId}` : null
    );

    const event = eventResponse?.event;
    const useSelfCheckIn = !token && user;

    // Initialize checkedIn from event when using self check-in (logged-in user, no token)
    useEffect(() => {
        if (useSelfCheckIn && event?.currentUserCheckedIn) {
            setCheckedIn(true);
        }
    }, [useSelfCheckIn, event?.currentUserCheckedIn]);

    // Only validate token when we have it from the API (may be omitted for security).
    // If checkInToken is present and doesn't match, show error state with View Event option.
    useEffect(() => {
        if (!event || !token) return;
        if (event.checkInToken !== undefined && event.checkInToken !== token) {
            setTokenInvalid(true);
        }
    }, [event, token]);

    // Auto check-in if enabled (must be unconditional so hooks order is stable)
    useEffect(() => {
        if (!event?.checkInSettings?.autoCheckIn || !eventId || !event || eventLoading || eventError || !event.checkInEnabled || checkingIn || checkedIn || tokenInvalid) return;
        if (token && !user) return; // token flow but not logged in - skip (token flow uses verifyTokenOptional)
        if (!token && !user) return; // no token, not logged in
        const now = new Date();
        const startTime = new Date(event.start_time);
        const endTime = new Date(event.end_time);
        const allowEarly = event.checkInSettings?.allowEarlyCheckIn;
        if (!allowEarly && now < startTime) return;
        if (now > endTime) return;
        let cancelled = false;
        (async () => {
            setCheckingIn(true);
            try {
                const response = useSelfCheckIn
                    ? await apiRequest(`/events/${eventId}/check-in/self`, {}, { method: 'POST' })
                    : await apiRequest(`/events/${eventId}/check-in`, { token }, { method: 'POST' });
                if (cancelled) return;
                if (response.success) {
                    setCheckedIn(true);
                    addNotification({
                        title: 'Success',
                        message: 'You have successfully checked in!',
                        type: 'success'
                    });
                    setTimeout(() => navigate(`/event/${eventId}`, { replace: true }), 2000);
                } else {
                    const msg = response.error || response.message || 'Failed to check in';
                    addNotification({
                        title: 'Error',
                        message: msg,
                        type: 'error'
                    });
                    if (/invalid|expired|not valid/i.test(msg)) setTokenInvalid(true);
                }
            } catch (error) {
                if (!cancelled) {
                    const msg = error.message || 'Failed to check in. Please try again.';
                    addNotification({
                        title: 'Error',
                        message: msg,
                        type: 'error'
                    });
                    if (/invalid|expired|not valid/i.test(msg)) setTokenInvalid(true);
                }
            } finally {
                if (!cancelled) setCheckingIn(false);
            }
        })();
        return () => { cancelled = true; };
    }, [event, eventId, token, useSelfCheckIn, eventLoading, eventError, checkingIn, checkedIn, tokenInvalid, addNotification, navigate]);

    const handleCheckIn = async () => {
        if (!eventId) {
            addNotification({
                title: 'Error',
                message: 'Missing event information',
                type: 'error'
            });
            return;
        }
        if (!useSelfCheckIn && !token) {
            addNotification({
                title: 'Error',
                message: 'Please use the check-in link you received, or log in to check in from the event page.',
                type: 'error'
            });
            return;
        }

        setCheckingIn(true);
        try {
            const response = useSelfCheckIn
                ? await apiRequest(`/events/${eventId}/check-in/self`, {}, { method: 'POST' })
                : await apiRequest(`/events/${eventId}/check-in`, { token }, { method: 'POST' });

            if (response.success) {
                setCheckedIn(true);
                addNotification({
                    title: 'Success',
                    message: 'You have successfully checked in!',
                    type: 'success'
                });
                setTimeout(() => navigate(`/event/${eventId}`, { replace: true }), 2000);
            } else {
                const msg = response.error || response.message || 'Failed to check in';
                setTokenInvalid(/invalid|expired|not valid/i.test(msg));
                throw new Error(msg);
            }
        } catch (error) {
            const msg = error.message || 'Failed to check in. Please try again.';
            addNotification({
                title: 'Error',
                message: msg,
                type: 'error'
            });
            if (/invalid|expired|not valid/i.test(msg)) setTokenInvalid(true);
        } finally {
            setCheckingIn(false);
        }
    };

    const pageWrapper = (content) => (
        <div className="checkin-confirmation-page" style={{ backgroundImage: `url(${backgroundImage})` }}>
            {content}
        </div>
    );

    if (eventLoading) {
        return pageWrapper(
            <div className="checkin-loading">
                <Icon icon="mdi:loading" className="spinner" />
                <p>Loading event details...</p>
            </div>
        );
    }

    if (eventError || !event) {
        return pageWrapper(
            <div className="checkin-error">
                <Icon icon="mdi:alert-circle" />
                <h2>Event Not Found</h2>
                <p>The event you're trying to check in to could not be found.</p>
                <button onClick={() => navigate('/')}>Go Home</button>
            </div>
        );
    }

    if (!event.checkInEnabled) {
        return pageWrapper(
            <div className="checkin-error">
                <Icon icon="mdi:qrcode-off" />
                <h2>Check-In Not Enabled</h2>
                <p>Check-in is not enabled for this event.</p>
                <button onClick={() => navigate(`/event/${eventId}`, { replace: true })}>View Event</button>
            </div>
        );
    }

    // No token and not logged in: must log in to check in from event page
    if (!token && !user) {
        return pageWrapper(
            <div className="checkin-error">
                <Icon icon="mdi:account" />
                <h2>Log In to Check In</h2>
                <p>Please log in to check in to this event from the event page.</p>
                <div className="checkin-error__actions">
                    <button onClick={() => navigate(`/login?redirect=${encodeURIComponent(`/check-in/${eventId}`)}`)}>Log In</button>
                    <button className="checkin-error__secondary" onClick={() => navigate(`/event/${eventId}`, { replace: true })}>View Event</button>
                </div>
            </div>
        );
    }

    // Token invalid: show friendly error with View Event option (don't redirect to home)
    if (tokenInvalid) {
        return pageWrapper(
            <div className="checkin-error">
                <Icon icon="mdi:link-off" />
                <h2>Check-In Link Invalid</h2>
                <p>This check-in link may have expired or is no longer valid. You can still view the event details.</p>
                <div className="checkin-error__actions">
                    <button onClick={() => navigate(`/event/${eventId}`, { replace: true })}>View Event</button>
                    <button className="checkin-error__secondary" onClick={() => navigate('/', { replace: true })}>Go Home</button>
                </div>
            </div>
        );
    }

    // Check if event allows check-in (time window)
    const now = new Date();
    const startTime = new Date(event.start_time);
    const endTime = new Date(event.end_time);
    const allowEarly = event.checkInSettings?.allowEarlyCheckIn;
    const tooEarly = !allowEarly && now < startTime;
    const tooLate = now > endTime;

    if (tooEarly || tooLate) {
        const message = tooLate
            ? 'Check-in is no longer available. The event has ended.'
            : 'Check-in is only available during the event time.';
        return pageWrapper(
            <div className="checkin-error">
                <Icon icon="mdi:clock-alert-outline" />
                <h2>Check-In Not Available</h2>
                <p>{message}</p>
                <p className="event-time">
                    Event time: {startTime.toLocaleString()} - {endTime.toLocaleString()}
                </p>
                <button onClick={() => navigate(`/event/${eventId}`, { replace: true })}>View Event</button>
            </div>
        );
    }

    if (checkedIn) {
        return pageWrapper(
            <div className="checkin-success">
                <Icon icon="mdi:check-circle" className="success-icon" />
                <h2>Successfully Checked In!</h2>
                <p>You have been checked in to {event.name}.</p>
                <p className="redirect-message">Redirecting to event page...</p>
            </div>
        );
    }

    const eventImage = event.image || event.previewImage;

    return pageWrapper(
        <div className="checkin-container">
            <article className="checkin-card">
                {eventImage && (
                    <div className="checkin-card__image">
                        <img src={eventImage} alt="" />
                    </div>
                )}
                <div className="checkin-card__body">
                    <h1 className="checkin-card__title">{event.name}</h1>
                    {event.description && (
                        <div
                            className="checkin-card__description"
                            dangerouslySetInnerHTML={{ __html: parseMarkdownDescription(event.description) }}
                        />
                    )}
                    <div className="checkin-card__meta">
                        <div className="checkin-card__meta-item">
                            <Icon icon="mdi:calendar-outline" />
                            <span>
                                {new Date(event.start_time).toLocaleDateString('en-US', {
                                    weekday: 'long',
                                    month: 'long',
                                    day: 'numeric',
                                    year: 'numeric'
                                })}
                            </span>
                        </div>
                        <div className="checkin-card__meta-item">
                            <Icon icon="mdi:clock-outline" />
                            <span>
                                {new Date(event.start_time).toLocaleTimeString('en-US', {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                })} – {new Date(event.end_time).toLocaleTimeString('en-US', {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                })}
                            </span>
                        </div>
                        {event.location && (
                            <div className="checkin-card__meta-item">
                                <Icon icon="mdi:map-marker-outline" />
                                <span>{event.location}</span>
                            </div>
                        )}
                    </div>
                    <div className="checkin-card__actions">
                        <button
                            className="checkin-card__btn checkin-card__btn--primary"
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
                                    <Icon icon="mdi:check-circle-outline" />
                                    Check In
                                </>
                            )}
                        </button>
                        <button
                            className="checkin-card__btn checkin-card__btn--secondary"
                            onClick={() => navigate(`/event/${eventId}`, { replace: true })}
                            disabled={checkingIn}
                        >
                            View Event
                        </button>
                    </div>
                </div>
            </article>
        </div>
    );
}

export default CheckInConfirmation;
