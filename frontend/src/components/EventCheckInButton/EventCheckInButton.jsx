import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@iconify-icon/react';
import useAuth from '../../hooks/useAuth';
import { useNotification } from '../../NotificationContext';
import apiRequest from '../../utils/postRequest';
import { analytics } from '../../services/analytics/analytics';
import './EventCheckInButton.scss';

const ANON_EVENT_CHECKIN_KEY_PREFIX = 'meridian_anon_event_checked_in_';

function getAnonEventCheckInKey(eventId) {
    return `${ANON_EVENT_CHECKIN_KEY_PREFIX}${eventId}`;
}

/**
 * Check-in button for the event page. Shown when:
 * - Event has check-in enabled
 * - On-page check-in is allowed (checkInSettings.allowOnPageCheckIn !== false)
 * - Current time allows check-in (during event, or before if allowEarlyCheckIn)
 * Logged-in users: can check in/out on page or via confirmation.
 * Anonymous users: button navigates to check-in page (log in or use token link).
 */
function EventCheckInButton({ event, onCheckedIn }) {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { addNotification } = useNotification();
    const [loading, setLoading] = useState(false);
    const [checkedIn, setCheckedIn] = useState(false);

    useEffect(() => {
        const loggedInCheckedIn = !!event?.currentUserCheckedIn;
        if (loggedInCheckedIn) {
            setCheckedIn(true);
            return;
        }
        if (!user && event?._id && event?.checkInSettings?.fullyAnonymousCheckIn) {
            const anonCheckedIn = localStorage.getItem(getAnonEventCheckInKey(event._id)) === '1';
            setCheckedIn(anonCheckedIn);
            return;
        }
        setCheckedIn(false);
    }, [event?.currentUserCheckedIn, event?._id, event?.checkInSettings?.fullyAnonymousCheckIn, user]);

    if (!event) return null;
    if (!event.checkInEnabled) return null;
    if (event.checkInSettings?.allowOnPageCheckIn === false) return null;

    const now = new Date();
    const start = new Date(event.start_time);
    const end = new Date(event.end_time);
    const allowEarly = event.checkInSettings?.allowEarlyCheckIn;
    if (!allowEarly && now < start) return null;
    if (now > end) return null;

    const handleCheckIn = () => {
        // Anonymous users need the token to access the pick-your-registration flow
        if (!user && event.checkInToken) {
            navigate(`/check-in/${event._id}/${event.checkInToken}`);
        } else {
            navigate(`/check-in/${event._id}`);
        }
    };

    const handleCheckOut = async () => {
        setLoading(true);
        try {
            const response = await apiRequest(
                `/events/${event._id}/check-out`,
                {},
                { method: 'POST' }
            );
            if (response?.success) {
                analytics.track('event_checkout', { event_id: event._id });
                setCheckedIn(false);
                addNotification?.("You've checked out.", 'success');
                onCheckedIn?.();
            } else {
                addNotification?.(response?.message || 'Check-out failed', 'error');
            }
        } catch (err) {
            const msg = err.response?.data?.message || err.message || 'Check-out failed';
            addNotification?.(msg, 'error');
        } finally {
            setLoading(false);
        }
    };

    if (checkedIn) {
        const showCheckOut = !!user;
        return (
            <div className="event-check-in-button checked-in">
                <Icon icon="mdi:check-circle" />
                <span>You're checked in</span>
                {showCheckOut && (
                    <button
                        type="button"
                        className="check-out-btn"
                        onClick={handleCheckOut}
                        disabled={loading}
                    >
                        {loading ? (
                            <Icon icon="mdi:loading" className="spinner" />
                        ) : (
                            'Check out'
                        )}
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="event-check-in-button">
            <button
                type="button"
                className="check-in-btn"
                onClick={handleCheckIn}
                disabled={loading}
            >
                {loading ? (
                    <>
                        <Icon icon="mdi:loading" className="spinner" />
                        <span>Checking in...</span>
                    </>
                ) : (
                    <>
                        <Icon icon="mdi:check-decagram" />
                        <span>Check in</span>
                    </>
                )}
            </button>
        </div>
    );
}

export default EventCheckInButton;
