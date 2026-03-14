import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Icon } from '@iconify-icon/react';
import { QRCodeSVG } from 'qrcode.react';
import { useFetch } from '../../hooks/useFetch';
import apiRequest from '../../utils/postRequest';
import { useNotification } from '../../NotificationContext';
import useAuth from '../../hooks/useAuth';
import { parseMarkdownDescription } from '../../utils/markdownUtils';
import backgroundImage from '../../assets/LandingBackground.png';
import loginMockup from '../../assets/Mockups/LoginMobile.png';
import Popup from '../../components/Popup/Popup';
import './CheckInConfirmation.scss';

/** Wraps matching substrings in <mark> for search highlight */
function HighlightMatch({ text, query }) {
    if (!query || !text) return text;
    const q = query.trim().toLowerCase();
    if (!q) return text;
    const str = String(text);
    const lower = str.toLowerCase();
    const parts = [];
    let lastEnd = 0;
    let idx = lower.indexOf(q);
    while (idx !== -1) {
        parts.push(str.slice(lastEnd, idx));
        parts.push(<mark key={idx} className="checkin-pick__highlight">{str.slice(idx, idx + q.length)}</mark>);
        lastEnd = idx + q.length;
        idx = lower.indexOf(q, lastEnd);
    }
    parts.push(str.slice(lastEnd));
    return <>{parts}</>;
}

const APP_STORE_URL = 'https://apps.apple.com/us/app/meridian-go/id6755217537';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.meridian.mobile';

function useDeviceDetection() {
    return useMemo(() => {
        if (typeof window === 'undefined') return { isMobile: false, isIOS: false, isAndroid: false };
        const ua = navigator.userAgent || navigator.vendor || '';
        const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const isAndroid = /android/i.test(ua);
        const isMobile = isIOS || isAndroid || /Mobi|Android/i.test(ua);
        return { isMobile, isIOS, isAndroid };
    }, []);
}

function CheckInConfirmation() {
    const { eventId, token } = useParams();
    const { user } = useAuth();
    const navigate = useNavigate();
    const { addNotification } = useNotification();
    const { isMobile, isIOS, isAndroid } = useDeviceDetection();
    const [checkingIn, setCheckingIn] = useState(false);
    const [checkedIn, setCheckedIn] = useState(false);
    const [tokenInvalid, setTokenInvalid] = useState(false);
    const [anonymousSearchQuery, setAnonymousSearchQuery] = useState('');
    const [viewingFormResponseId, setViewingFormResponseId] = useState(null);

    // Fetch event details
    const { data: eventResponse, loading: eventLoading, error: eventError } = useFetch(
        eventId ? `/get-event/${eventId}` : null
    );

    const event = eventResponse?.event;
    const useSelfCheckIn = !token && user;
    const useAnonymousPick = token && !user;

    // Registrations for anonymous pick (token flow, no login)
    const { data: registrationsResponse, loading: loadingRegistrations, refetch: refetchRegistrations } = useFetch(
        useAnonymousPick && eventId && token
            ? `/events/${eventId}/check-in/self-registrations?token=${encodeURIComponent(token)}`
            : null
    );
    const registrations = registrationsResponse?.success ? (registrationsResponse.data?.registrations || []) : [];
    const formResponseIdStr = viewingFormResponseId != null ? String(viewingFormResponseId) : null;
    const { data: formDetailsResponse, loading: loadingFormDetails } = useFetch(
        formResponseIdStr && eventId && token
            ? `/events/${eventId}/check-in/registration/${formResponseIdStr}?token=${encodeURIComponent(token)}`
            : null
    );
    const formDetails = formDetailsResponse?.success ? formDetailsResponse.data : null;
    const filteredRegistrations = useMemo(() => {
        if (!anonymousSearchQuery.trim()) return registrations;
        const q = anonymousSearchQuery.trim().toLowerCase();
        return registrations.filter((reg) => {
            const name = (reg.displayName || reg.guestName || '').toLowerCase();
            const email = (reg.email || '').toLowerCase();
            return name.includes(q) || email.includes(q);
        });
    }, [registrations, anonymousSearchQuery]);

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

    // Auto-redirect to event page after successful check-in
    useEffect(() => {
        if (!checkedIn || !eventId) return;
        const timer = setTimeout(() => {
            navigate(`/event/${eventId}`, { replace: true });
        }, 5000);
        return () => clearTimeout(timer);
    }, [checkedIn, eventId, navigate]);

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

    const handleAnonymousCheckIn = async (reg) => {
        if (!eventId || !token) return;
        setCheckingIn(true);
        try {
            const body = reg.formResponseId
                ? { token, formResponseId: reg.formResponseId }
                : { token, userId: reg.userId };
            const response = await apiRequest(`/events/${eventId}/check-in/anonymous`, body, { method: 'POST' });
            if (response.success) {
                setCheckedIn(true);
                addNotification({
                    title: 'Success',
                    message: 'You have successfully checked in!',
                    type: 'success'
                });
                refetchRegistrations?.({ silent: true });
            } else {
                const msg = response.error || response.message || 'Failed to check in';
                addNotification({ title: 'Error', message: msg, type: 'error' });
                if (/invalid|expired|not valid/i.test(msg)) setTokenInvalid(true);
            }
        } catch (error) {
            const msg = error.message || 'Failed to check in. Please try again.';
            addNotification({ title: 'Error', message: msg, type: 'error' });
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

    // Check if event allows check-in (time window) - applies to both logged-in and anonymous flows
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

    // Token but not logged in: anonymous pick-your-registration flow
    if (useAnonymousPick) {
        const loading = loadingRegistrations;
        const hasSearchQuery = Boolean(anonymousSearchQuery.trim());
        const noResults = filteredRegistrations.length === 0;
        const showRegisterPrompt = noResults;

        return pageWrapper(
            <div className="checkin-container">
                <article className="checkin-card checkin-pick">
                    {event?.image && (
                        <div className="checkin-card__image">
                            <img src={event.image || event.previewImage} alt="" />
                        </div>
                    )}
                    <div className="checkin-card__body">
                        <h1 className="checkin-card__title">{event?.name}</h1>
                        <p className="checkin-pick__intro">Find your registration to check in.</p>
                        <div className="checkin-pick__search-wrap">
                            <Icon icon="mdi:magnify" className="checkin-pick__search-icon" />
                            <input
                                type="text"
                                className="checkin-pick__search"
                                placeholder="Search by name or email..."
                                value={anonymousSearchQuery}
                                onChange={(e) => setAnonymousSearchQuery(e.target.value)}
                                autoFocus
                            />
                        </div>
                        {loading ? (
                            <p className="checkin-pick__loading">
                                <Icon icon="mdi:loading" className="spinner" />
                                Loading registrations...
                            </p>
                        ) : noResults ? (
                            <div className="checkin-pick__empty">
                                <p className="checkin-pick__empty-msg">
                                    {hasSearchQuery ? 'No matches for your search.' : 'No registrations found.'}
                                </p>
                                {showRegisterPrompt && (
                                    <div className="checkin-pick__register-prompt">
                                        <Icon icon="mdi:account-plus-outline" />
                                        <p>You may need to register for this event first.</p>
                                        <button
                                            type="button"
                                            className="checkin-card__btn checkin-card__btn--primary"
                                            onClick={() => navigate(`/event/${eventId}`, { replace: true })}
                                        >
                                            Register for Event
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <>
                                <ul className="checkin-pick__list">
                                    {filteredRegistrations.map((reg) => {
                                        const key = reg.formResponseId ? `anon-${reg.formResponseId}` : `user-${reg.userId}`;
                                        const displayName = reg.displayName || reg.guestName || 'Unknown';
                                        const email = reg.email && String(reg.email).trim().toLowerCase() !== String(displayName).trim().toLowerCase()
                                            ? reg.email
                                            : null;
                                        const isCheckedIn = reg.checkedIn === true;
                                        const isAnonymous = reg.formResponseId != null;
                                        return (
                                            <li key={key} className="checkin-pick__item">
                                                <span className="checkin-pick__name">
                                                    <HighlightMatch text={displayName} query={anonymousSearchQuery} />
                                                    {email && (
                                                        <>
                                                            {' ('}
                                                            <HighlightMatch text={email} query={anonymousSearchQuery} />
                                                            {')'}
                                                        </>
                                                    )}
                                                    {isCheckedIn && (
                                                        <span className="checkin-pick__badge checkin-pick__badge--checked-in">
                                                            Already checked in
                                                        </span>
                                                    )}
                                                </span>
                                                <div className="checkin-pick__item-actions">
                                                    {isAnonymous && (
                                                        <button
                                                            type="button"
                                                            className="checkin-pick__view-details-btn"
                                                            onClick={() => setViewingFormResponseId(reg.formResponseId)}
                                                            title="View registration details"
                                                        >
                                                            <Icon icon="mdi:file-document-outline" />
                                                            View details
                                                        </button>
                                                    )}
                                                    {!isCheckedIn && (
                                                        <button
                                                            type="button"
                                                            className="checkin-card__btn checkin-card__btn--primary checkin-pick__btn"
                                                            onClick={() => handleAnonymousCheckIn(reg)}
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
                                                    )}
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                                <Popup
                                    isOpen={!!viewingFormResponseId}
                                    onClose={() => setViewingFormResponseId(null)}
                                    defaultStyling={true}
                                    customClassName="checkin-registration-details-popup"
                                >
                                    {formDetails && (
                                        <div className="checkin-registration-details">
                                            <h3 className="checkin-registration-details__title">
                                                <Icon icon="mdi:file-document-outline" />
                                                Registration Details
                                            </h3>
                                            <div className="checkin-registration-details__form">
                                                {formDetails.formSnapshot?.title && (
                                                    <h4 className="checkin-registration-details__form-title">{formDetails.formSnapshot.title}</h4>
                                                )}
                                                {formDetails.submittedAt && (
                                                    <p className="checkin-registration-details__meta">
                                                        Submitted: {new Date(formDetails.submittedAt).toLocaleDateString()}
                                                    </p>
                                                )}
                                                {(formDetails.formSnapshot?.questions || []).map((q, idx) => (
                                                    <div key={q._id || idx} className="checkin-registration-details__qa">
                                                        <div className="checkin-registration-details__question">{q.question}</div>
                                                        <div className="checkin-registration-details__answer">
                                                            {formDetails.answers?.[idx] != null ? (
                                                                Array.isArray(formDetails.answers[idx])
                                                                    ? formDetails.answers[idx].join(', ')
                                                                    : String(formDetails.answers[idx])
                                                            ) : (
                                                                <span className="checkin-registration-details__no-answer">No answer provided</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                            <button
                                                type="button"
                                                className="checkin-card__btn checkin-card__btn--secondary"
                                                onClick={() => setViewingFormResponseId(null)}
                                            >
                                                Close
                                            </button>
                                        </div>
                                    )}
                                    {viewingFormResponseId && loadingFormDetails && (
                                        <p className="checkin-pick__loading">
                                            <Icon icon="mdi:loading" className="spinner" />
                                            Loading...
                                        </p>
                                    )}
                                    {viewingFormResponseId && !loadingFormDetails && !formDetails && (
                                        <p className="checkin-pick__empty-msg">Unable to load registration details.</p>
                                    )}
                                </Popup>
                            </>
                        )}
                        <button
                            className="checkin-card__btn checkin-card__btn--secondary"
                            onClick={() => navigate(`/event/${eventId}`, { replace: true })}
                            disabled={checkingIn}
                        >
                            View Event
                        </button>
                    </div>
                </article>
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

    if (checkedIn) {
        const mobileUrl = typeof window !== 'undefined' ? `${window.location.origin}/mobile` : 'https://meridian.study/mobile';
        const eventName = event.name || 'this event';
        return pageWrapper(
            <div className="checkin-success">
                <Icon icon="mdi:check-circle" className="success-icon" />
                <h2>You're in!</h2>
                <p>You're checked in to <strong>{eventName}</strong>.</p>
                <div
                    className={`checkin-success__mobile-ad ${!isMobile ? 'checkin-success__mobile-ad--with-mockup' : ''}`}
                    style={{ backgroundImage: `url(${backgroundImage})` }}
                >
                    <div className="checkin-success__mobile-ad-bg" aria-hidden />
                    {!isMobile && (
                        <div className="checkin-success__mobile-ad-mockup">
                            <img src={loginMockup} alt="Meridian app on mobile" />
                        </div>
                    )}
                    <div className="checkin-success__mobile-ad-promo">
                        <span className="checkin-success__mobile-ad-eyebrow">Download the app</span>
                        <h3 className="checkin-success__mobile-ad-title">Meridian Go</h3>
                        <p className="checkin-success__mobile-ad-blurb">
                            Take {eventName} with you — live updates, rooms, and everything happening at this event.
                        </p>
                        {isMobile ? (
                            <div className="checkin-success__store-badges">
                                {isIOS && (
                                    <a
                                        href={APP_STORE_URL}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="checkin-success__store-badge checkin-success__store-badge--ios"
                                        aria-label="Download on the App Store"
                                    >
                                        <img
                                            src="https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg"
                                            alt="Download on the App Store"
                                            height="40"
                                        />
                                    </a>
                                )}
                                {isAndroid && (
                                    <a
                                        href={PLAY_STORE_URL}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="checkin-success__store-badge checkin-success__store-badge--android"
                                        aria-label="Get it on Google Play"
                                    >
                                        <img
                                            src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png"
                                            alt="Get it on Google Play"
                                            height="60"
                                        />
                                    </a>
                                )}
                            </div>
                        ) : (
                            <>
                                <div className="checkin-success__qr-wrap">
                                    <QRCodeSVG
                                        value={mobileUrl}
                                        size={120}
                                        level="M"
                                        fgColor="#ffffff"
                                        bgColor="transparent"
                                    />
                                    <span className="checkin-success__qr-hint">Scan to download</span>
                                </div>
                                <a
                                    href="/mobile"
                                    className="checkin-success__mobile-link"
                                    onClick={(e) => { e.preventDefault(); navigate('/mobile'); }}
                                >
                                    meridian.study/mobile
                                </a>
                            </>
                        )}
                    </div>
                </div>
                <button
                    className="checkin-success__view-event"
                    onClick={() => navigate(`/event/${eventId}`, { replace: true })}
                >
                    View Event
                </button>
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
