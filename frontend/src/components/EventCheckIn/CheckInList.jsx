import React, { useState, useMemo } from 'react';
import { Icon } from '@iconify-icon/react';
import { formatDistanceToNow } from 'date-fns';
import './EventCheckIn.scss';

function getAttendeeDisplayName(attendee) {
    if (attendee.anonymousBrowserCheckIn) {
        return attendee.guestName || 'Anonymous user';
    }
    if (attendee.formResponseId && (attendee.guestName || attendee.guestEmail)) {
        return attendee.guestName && String(attendee.guestName).trim()
            ? String(attendee.guestName).trim()
            : attendee.guestEmail || 'Guest';
    }
    const user = attendee.userId;
    return user?.name || user?.username || 'Unknown User';
}

function CheckInList({ attendees, onManualCheckIn, onRemoveCheckIn, onOpenManualCheckInModal }) {
    const [searchQuery, setSearchQuery] = useState('');
    const [filterMethod, setFilterMethod] = useState('all'); // 'all', 'self', 'manual'

    const filteredAttendees = useMemo(() => {
        let filtered = attendees;

        // Filter by search query
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(attendee => {
                const name = getAttendeeDisplayName(attendee);
                return name.toLowerCase().includes(query);
            });
        }

        // Filter by method
        if (filterMethod === 'self') {
            filtered = filtered.filter(a => !a.checkedInBy);
        } else if (filterMethod === 'manual') {
            filtered = filtered.filter(a => a.checkedInBy);
        }

        return filtered;
    }, [attendees, searchQuery, filterMethod]);

    const formatCheckInTime = (date) => {
        if (!date) return 'Unknown';
        try {
            return formatDistanceToNow(new Date(date), { addSuffix: true });
        } catch (error) {
            return 'Unknown';
        }
    };

    const getUserPicture = (attendee) => {
        if (attendee.anonymousBrowserCheckIn) return null;
        if (attendee.formResponseId) return null;
        const user = attendee.userId;
        return user?.picture || null;
    };

    const getAttendeeRemoveId = (attendee) => {
        if (attendee.anonymousBrowserCheckIn) return null;
        if (attendee.formResponseId) return { formResponseId: attendee.formResponseId };
        const uid = attendee.userId && (attendee.userId._id || attendee.userId.id || attendee.userId);
        return uid ? { userId: uid } : null;
    };

    if (attendees.length === 0) {
        return (
            <div className="checkin-list-empty">
                <Icon icon="mdi:account-off" />
                <p>No attendees have checked in yet.</p>
            </div>
        );
    }

    return (
        <div className="checkin-list">
            {/* Search and Filter */}
            <div className="checkin-list-controls">
                <div className="search-input-wrapper">
                    <Icon icon="mdi:magnify" className="search-icon" />
                    <input
                        type="text"
                        placeholder="Search attendees..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="search-input"
                    />
                </div>
                <div className="filter-buttons">
                    <button
                        className={`filter-button ${filterMethod === 'all' ? 'active' : ''}`}
                        onClick={() => setFilterMethod('all')}
                    >
                        All
                    </button>
                    <button
                        className={`filter-button ${filterMethod === 'self' ? 'active' : ''}`}
                        onClick={() => setFilterMethod('self')}
                    >
                        Self Check-In
                    </button>
                    <button
                        className={`filter-button ${filterMethod === 'manual' ? 'active' : ''}`}
                        onClick={() => setFilterMethod('manual')}
                    >
                        Manual
                    </button>
                </div>
            </div>

            {/* Attendees List */}
            <div className="attendees-list">
                {filteredAttendees.length === 0 ? (
                    <div className="checkin-list-empty">
                        <Icon icon="mdi:magnify" />
                        <p>No attendees match your search.</p>
                    </div>
                ) : (
                    filteredAttendees.map((attendee, index) => {
                        const user = attendee.userId;
                        const checkedInBy = attendee.checkedInBy;
                        const isManual = !!checkedInBy;
                        const isAnonymousBrowser = !!attendee.anonymousBrowserCheckIn;
                        const removeId = getAttendeeRemoveId(attendee);
                        return (
                            <div key={attendee.formResponseId ? `anon-${attendee.formResponseId}` : (isAnonymousBrowser ? `browser-${attendee.browserIndex || index}` : (user?._id || user?.id || index))} className="attendee-item">
                                <div className="attendee-info">
                                    <div className="attendee-avatar">
                                        {getUserPicture(attendee) ? (
                                            <img 
                                                src={getUserPicture(attendee)} 
                                                alt={getAttendeeDisplayName(attendee)}
                                            />
                                        ) : (
                                            <Icon icon="mdi:account-circle" />
                                        )}
                                    </div>
                                    <div className="attendee-details">
                                        <div className="attendee-name">
                                            {getAttendeeDisplayName(attendee)}
                                        </div>
                                        <div className="attendee-meta">
                                            <span className="checkin-time">
                                                <Icon icon="mdi:clock-outline" />
                                                {formatCheckInTime(attendee.checkedInAt)}
                                            </span>
                                            <span className={`checkin-method ${isAnonymousBrowser ? 'self' : (isManual ? 'manual' : 'self')}`}>
                                                <Icon icon={isAnonymousBrowser ? 'mdi:incognito' : (isManual ? 'mdi:account-check' : 'mdi:qrcode-scan')} />
                                                {isAnonymousBrowser ? 'Anonymous User' : (isManual ? 'Manual' : 'Self Check-In')}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="attendee-actions">
                                    {isManual && checkedInBy && (
                                        <div className="checked-in-by">
                                            Checked in by {checkedInBy?.name || checkedInBy?.username || 'Organizer'}
                                        </div>
                                    )}
                                    {onRemoveCheckIn && removeId && (
                                        <button
                                            type="button"
                                            className="remove-checkin-btn"
                                            onClick={() => onRemoveCheckIn(attendee)}
                                            title="Remove check-in"
                                        >
                                            <Icon icon="mdi:logout" />
                                            Remove
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Manual Check-In Button (if onManualCheckIn provided) */}
            {onManualCheckIn && onOpenManualCheckInModal && (
                <div className="manual-checkin-section">
                    <button type="button" className="manual-checkin-button" onClick={onOpenManualCheckInModal}>
                        <Icon icon="mdi:account-plus" />
                        Manually Check In Attendee
                    </button>
                </div>
            )}
        </div>
    );
}

export default CheckInList;
