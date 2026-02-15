import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import useAuth from '../../hooks/useAuth';
import { useNotification } from '../../NotificationContext';
import { useFetch } from '../../hooks/useFetch';
import RSVPButton from '../RSVPButton/RSVPButton';
import { analytics } from '../../services/analytics/analytics';
import Popup from '../Popup/Popup';
import defaultAvatar from '../../assets/defaultAvatar.svg';
import postRequest from '../../utils/postRequest';
import './RSVPSection.scss';

const RSVPSection = ({ event, compact, previewAsUnregistered = false }) => {
    const { user } = useAuth();
    const { addNotification } = useNotification();
    const [registration, setRegistration] = useState(null);
    const [attendees, setAttendees] = useState([]);
    const [registrationCount, setRegistrationCount] = useState(0);
    const [friendsRegistered, setFriendsRegistered] = useState(0);
    const [showAllAttendees, setShowAllAttendees] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [showUserPopup, setShowUserPopup] = useState(false);
    const [withdrawing, setWithdrawing] = useState(false);

    const enabled = event.registrationEnabled ?? event.rsvpEnabled;
    const { data: rsvpData } = useFetch(
        enabled && user && !previewAsUnregistered ? `/my-rsvp/${event._id}` : null
    );
    const { data: attendeesData } = useFetch(
        enabled ? `/attendees/${event._id}` : null
    );

    useEffect(() => {
        if (previewAsUnregistered) {
            setRegistration(null);
        } else if (rsvpData?.success) {
            setRegistration(rsvpData.rsvp);
        }
    }, [rsvpData, previewAsUnregistered]);

    useEffect(() => {
        if (attendeesData?.success) {
            setAttendees(attendeesData.attendees || []);
            setRegistrationCount(attendeesData.registrationCount ?? (attendeesData.attendees || []).length);
            setFriendsRegistered(attendeesData.friendsRegistered ?? attendeesData.friendsGoing ?? 0);
        }
    }, [attendeesData]);

    const handleRegisterUpdate = () => {
        window.location.reload();
    };

    const handleWithdraw = async () => {
        if (!user) {
            addNotification({
                title: 'Login Required',
                message: 'Please log in to withdraw from events',
                type: 'error'
            });
            return;
        }

        setWithdrawing(true);
        try {
            const response = await postRequest(`/rsvp/${event._id}`, null, {
                method: 'DELETE'
            });
            
            if (response?.success) {
                analytics.track('event_registration_withdraw', { event_id: event._id });
                addNotification({
                    title: 'Registration Withdrawn',
                    message: 'You have successfully withdrawn from this event.',
                    type: 'success'
                });
                setRegistration(null);
                handleRegisterUpdate();
            } else {
                addNotification({
                    title: 'Withdrawal Failed',
                    message: response?.message || response?.error || 'Failed to withdraw from event',
                    type: 'error'
                });
            }
        } catch (error) {
            console.error('Error withdrawing registration:', error);
            addNotification({
                title: 'Withdrawal Failed',
                message: error?.message || 'Failed to withdraw from event',
                type: 'error'
            });
        } finally {
            setWithdrawing(false);
        }
    };

    const handleUserClick = (attendee) => {
        setSelectedUser(attendee);
        setShowUserPopup(true);
    };

    const renderAttendeeList = (attendeeList) => {
        if (attendeeList.length === 0) return null;
        const displayCount = showAllAttendees ? attendeeList.length : 6;
        const displayed = attendeeList.slice(0, displayCount);
        return (
            <div className="attendees-section">
                <div className="attendees-list">
                    {displayed.map((attendee) => {
                        const u = attendee.userId;
                        const id = u?._id ?? u;
                        return (
                            <div
                                key={id}
                                className="attendee"
                                onClick={() => handleUserClick(attendee)}
                                title={u?.name || u?.username || ''}
                            >
                                <img
                                    src={u?.picture || defaultAvatar}
                                    alt={u?.name || u?.username || ''}
                                />
                            </div>
                        );
                    })}
                    {!showAllAttendees && attendeeList.length > 6 && (
                        <div className="more-attendees">+{attendeeList.length - 6} more</div>
                    )}
                </div>
            </div>
        );
    };

    if (!enabled) return null;

    const deadline = event.registrationDeadline ?? event.rsvpDeadline;
    const isDeadlinePassed = deadline && new Date() > new Date(deadline);
    const count = event.registrationCount ?? registrationCount;
    const isAtCapacity = event.maxAttendees && count >= event.maxAttendees;

    if (compact) {
        return (
            <div className="rsvp-section rsvp-section--compact">
                <div className="rsvp-compact-line">
                    <span className="rsvp-compact-count">{count} registered</span>
                    <RSVPButton
                        event={event}
                        onRSVPUpdate={handleRegisterUpdate}
                        rsvpStatus={registration}
                        onRSVPStatusUpdate={() => {}}
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="rsvp-section">
            <div className="rsvp-header">
                <h3>Registration</h3>
            </div>

            {registration ? (
                <>
                    {isDeadlinePassed && (
                        <div className="rsvp-deadline-passed">
                            <Icon icon="mdi:clock-alert" />
                            <span>Registration deadline has passed</span>
                        </div>
                    )}

                    {isAtCapacity && !isDeadlinePassed && (
                        <div className="rsvp-capacity-reached">
                            <Icon icon="mdi:account-multiple-remove" />
                            <span>Event is at capacity</span>
                        </div>
                    )}

                    <p className="rsvp-welcome-message">You are registered for this event.</p>
                    
                    {user && (
                        <div className="rsvp-email-field">
                            <img src={user.picture || defaultAvatar} alt={user.name || user.username || ''}className="user-icon"  />
                            <span className="email-text">{user.name || user.username} <br/>{user.email}</span>
                        </div>
                    )}

                    <div className="rsvp-registered-state">
                        <div className="rsvp-registered-badge">
                            <Icon icon="mdi:check-circle" />
                            <span>Registered</span>
                        </div>
                        {!isDeadlinePassed && (
                            <button
                                className="rsvp-withdraw-button"
                                onClick={handleWithdraw}
                                disabled={withdrawing}
                            >
                                {withdrawing ? (
                                    <>
                                        <Icon icon="mdi:loading" className="spinning" />
                                        <span>Withdrawing...</span>
                                    </>
                                ) : (
                                    <>
                                        <Icon icon="mdi:close-circle" />
                                        <span>Withdraw Registration</span>
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                </>
            ) : (
                <>
                    {isDeadlinePassed && (
                        <div className="rsvp-deadline-passed">
                            <Icon icon="mdi:clock-alert" />
                            <span>Registration deadline has passed</span>
                        </div>
                    )}

                    {isAtCapacity && (
                        <div className="rsvp-capacity-reached">
                            <Icon icon="mdi:account-multiple-remove" />
                            <span>Event is at capacity</span>
                        </div>
                    )}

                    {!isDeadlinePassed && !isAtCapacity && (
                        <>
                            <p className="rsvp-welcome-message">Welcome! To join the event, please register below.</p>
                            
                            {user && (
                                <div className="rsvp-email-field">
                                    <img src={user.picture || defaultAvatar} alt={user.name || user.username || ''} className="user-icon" />
                                    <span className="email-text">{user.name || user.username} <br/>{user.email}</span>
                                </div>
                            )}

                            <RSVPButton
                                event={event}
                                onRSVPUpdate={handleRegisterUpdate}
                                rsvpStatus={registration}
                                onRSVPStatusUpdate={() => {}}
                            />
                        </>
                    )}
                </>
            )}

            {attendees.length > 0 && (
                <div className="attendees-category">
                    <h4>Registered ({attendees.length})</h4>
                    {renderAttendeeList(attendees)}
                </div>
            )}

            {attendees.length > 6 && (
                <button
                    className="view-all-attendees-btn"
                    onClick={() => setShowAllAttendees(!showAllAttendees)}
                >
                    {showAllAttendees ? 'View Less' : `View All (${attendees.length})`}
                </button>
            )}

            <Popup
                isOpen={showUserPopup}
                onClose={() => { setShowUserPopup(false); setSelectedUser(null); }}
                customClassName="user-info-popup"
            >
                {selectedUser && (
                    <div className="user-info-content">
                        <div className="user-header">
                            <img
                                src={selectedUser.userId?.picture || defaultAvatar}
                                alt={selectedUser.userId?.name || selectedUser.userId?.username || ''}
                                className="user-avatar"
                            />
                            <div className="user-details">
                                <h3>{selectedUser.userId?.name || selectedUser.userId?.username || '—'}</h3>
                                <p className="user-username">@{selectedUser.userId?.username || ''}</p>
                                {selectedUser.userId?.email && (
                                    <p className="user-email">{selectedUser.userId.email}</p>
                                )}
                            </div>
                        </div>
                        <div className="user-rsvp-status">
                            <span className="status-badge">Registered</span>
                        </div>
                    </div>
                )}
            </Popup>
        </div>
    );
};

export default RSVPSection;
