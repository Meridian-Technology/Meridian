import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import useAuth from '../../hooks/useAuth';
import { useFetch } from '../../hooks/useFetch';
import RSVPButton from '../RSVPButton/RSVPButton';
import Popup from '../Popup/Popup';
import defaultAvatar from '../../assets/defaultAvatar.svg';
import './RSVPSection.scss';

const RSVPSection = ({ event }) => {
    const { user } = useAuth();
    const [rsvpStatus, setRsvpStatus] = useState(null);
    const [attendees, setAttendees] = useState({ going: [], maybe: [], notGoing: [] });
    const [rsvpStats, setRsvpStats] = useState(null);
    const [friendsGoing, setFriendsGoing] = useState(0);
    const [showAllAttendees, setShowAllAttendees] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [showUserPopup, setShowUserPopup] = useState(false);

    // Fetch RSVP data for this specific event
    const { data: rsvpData } = useFetch(
        event.rsvpEnabled && user ? `/my-rsvp/${event._id}` : null
    );

    const { data: attendeesData } = useFetch(
        event.rsvpEnabled ? `/attendees/${event._id}` : null
    );

    useEffect(() => {
        if (rsvpData?.success) {
            setRsvpStatus(rsvpData.rsvp);
        }
    }, [rsvpData]);

    useEffect(() => {
        if (attendeesData?.success) {
            setAttendees(attendeesData.attendees);
            setRsvpStats(attendeesData.rsvpStats);
            // Use friends data from attendees endpoint if available, otherwise use from event data
            setFriendsGoing(attendeesData.friendsGoing || event.friendsGoing || 0);
        }
    }, [attendeesData, event]);

    const handleRSVPUpdate = (rsvpData) => {
        // Refresh attendees data when RSVP is updated
        window.location.reload();
    };

    const handleRSVPStatusUpdate = (eventId, newRSVPStatus) => {
        setRsvpStatus(newRSVPStatus);
    };

    const handleUserClick = (attendee) => {
        setSelectedUser(attendee);
        setShowUserPopup(true);
    };

    const handleCloseUserPopup = () => {
        setShowUserPopup(false);
        setSelectedUser(null);
    };

    const renderAttendeeList = (attendeeList, status) => {
        if (attendeeList.length === 0) return null;

        const displayCount = showAllAttendees ? attendeeList.length : 6;
        const displayedAttendees = attendeeList.slice(0, displayCount);

        return (
            <div className="attendees-section">
                <div className="attendees-list">
                    {displayedAttendees.map((attendee, index) => (
                        <div 
                            key={attendee.userId._id} 
                            className="attendee"
                            onClick={() => handleUserClick(attendee)}
                            title={`${attendee.userId.name || attendee.userId.username} - ${status}`}
                        >
                            <img 
                                src={attendee.userId.picture || defaultAvatar} 
                                alt={attendee.userId.name || attendee.userId.username}
                            />
                        </div>
                    ))}
                    {!showAllAttendees && attendeeList.length > 6 && (
                        <div className="more-attendees">
                            +{attendeeList.length - 6} more
                        </div>
                    )}
                </div>
            </div>
        );
    };

    if (!event.rsvpEnabled) return null;

    const isRSVPDeadlinePassed = event.rsvpDeadline && new Date() > new Date(event.rsvpDeadline);
    const isAtCapacity = event.maxAttendees && rsvpStats && rsvpStats.going >= event.maxAttendees;

    const totalAttendees = attendees.going.length + attendees.maybe.length;

    return (
        <div className="rsvp-section">
            <div className="rsvp-header">
                <h3>Guest List</h3>
                <div className="rsvp-stats-container">
                    {rsvpStats && (
                        <div className="rsvp-stats">
                            <div className="stat">
                                <span className="count">{rsvpStats.going}</span>
                                <span className="label">Going</span>
                            </div>
                            <div className="stat">
                                <span className="count">{rsvpStats.maybe}</span>
                                <span className="label">Maybe</span>
                            </div>
                        </div>
                    )}
                    {friendsGoing > 0 && (
                        <div className="friends-going">
                            <Icon icon="mdi:account-group" />
                            <span>{friendsGoing} friend{friendsGoing !== 1 ? 's' : ''} going</span>
                        </div>
                    )}
                </div>
            </div>

            {isRSVPDeadlinePassed && (
                <div className="rsvp-deadline-passed">
                    <Icon icon="mdi:clock-alert" />
                    <span>RSVP deadline has passed</span>
                </div>
            )}

            {isAtCapacity && (
                <div className="rsvp-capacity-reached">
                    <Icon icon="mdi:account-multiple-remove" />
                    <span>Event is at capacity</span>
                </div>
            )}

            {/* Show Going attendees */}
            {attendees.going.length > 0 && (
                <div className="attendees-category">
                    <h4>Going ({attendees.going.length})</h4>
                    {renderAttendeeList(attendees.going, 'Going')}
                </div>
            )}

            {/* Show Maybe attendees */}
            {attendees.maybe.length > 0 && (
                <div className="attendees-category">
                    <h4>Maybe ({attendees.maybe.length})</h4>
                    {renderAttendeeList(attendees.maybe, 'Maybe')}
                </div>
            )}

            {/* View All/View Less button */}
            {totalAttendees > 6 && (
                <button 
                    className="view-all-attendees-btn"
                    onClick={() => setShowAllAttendees(!showAllAttendees)}
                >
                    {showAllAttendees ? 'View Less' : `View All (${totalAttendees})`}
                </button>
            )}

            {/* Use the RSVPButton component */}
            <RSVPButton 
                event={event} 
                onRSVPUpdate={handleRSVPUpdate} 
                rsvpStatus={rsvpStatus}
                onRSVPStatusUpdate={handleRSVPStatusUpdate}
            />

            {/* User Info Popup */}
            <Popup 
                isOpen={showUserPopup} 
                onClose={handleCloseUserPopup}
                customClassName="user-info-popup"
            >
                {selectedUser && (
                    <div className="user-info-content">
                        <div className="user-header">
                            <img 
                                src={selectedUser.userId.picture || defaultAvatar} 
                                alt={selectedUser.userId.name || selectedUser.userId.username}
                                className="user-avatar"
                            />
                            <div className="user-details">
                                <h3>{selectedUser.userId.name || selectedUser.userId.username}</h3>
                                <p className="user-username">@{selectedUser.userId.username}</p>
                                {selectedUser.userId.email && (
                                    <p className="user-email">{selectedUser.userId.email}</p>
                                )}
                            </div>
                        </div>
                        <div className="user-rsvp-status">
                            <span className={`status-badge ${selectedUser.status}`}>
                                {selectedUser.status === 'going' ? 'Going' : 
                                 selectedUser.status === 'maybe' ? 'Maybe' : 'Not Going'}
                            </span>
                        </div>
                    </div>
                )}
            </Popup>
        </div>
    );
};

export default RSVPSection;
