import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import useAuth from '../../hooks/useAuth';
import { useNotification } from '../../NotificationContext';
import apiRequest from '../../utils/postRequest';
import './EventCheckInButton.scss';

/**
 * Check-in button for the event page. Shown when:
 * - Event has check-in enabled
 * - On-page check-in is allowed (checkInSettings.allowOnPageCheckIn !== false)
 * - User is logged in
 * - Current time is within event start_time and end_time
 * Calls POST /events/:eventId/check-in/self (no token required).
 */
function EventCheckInButton({ event, onCheckedIn }) {
    const { user } = useAuth();
    const { addNotification } = useNotification();
    const [loading, setLoading] = useState(false);
    const [checkedIn, setCheckedIn] = useState(!!event?.currentUserCheckedIn);

    useEffect(() => {
        setCheckedIn(!!event?.currentUserCheckedIn);
    }, [event?.currentUserCheckedIn, event?._id]);

    if (!event || !user) return null;
    if (!event.checkInEnabled) return null;
    if (event.checkInSettings?.allowOnPageCheckIn === false) return null;

    const now = new Date();
    const start = new Date(event.start_time);
    const end = new Date(event.end_time);
    if (now < start || now > end) return null;

    const handleCheckIn = async () => {
        setLoading(true);
        try {
            const response = await apiRequest(
                `/events/${event._id}/check-in/self`,
                {},
                { method: 'POST' }
            );
            if (response?.success) {
                setCheckedIn(true);
                addNotification?.('You’re checked in!', 'success');
                onCheckedIn?.();
            } else {
                addNotification?.(response?.message || 'Check-in failed', 'error');
            }
        } catch (err) {
            const msg = err.response?.data?.message || err.message || 'Check-in failed';
            addNotification?.(msg, 'error');
        } finally {
            setLoading(false);
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
                setCheckedIn(false);
                addNotification?.('You’ve checked out.', 'success');
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
        return (
            <div className="event-check-in-button checked-in">
                <Icon icon="mdi:check-circle" />
                <span>You're checked in</span>
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
