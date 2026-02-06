import React, { useState, useMemo } from 'react';
import { Icon } from '@iconify-icon/react';
import { formatDistanceToNow } from 'date-fns';
import './EventCheckIn.scss';

function CheckInList({ attendees, onManualCheckIn, onRemoveCheckIn }) {
    const [searchQuery, setSearchQuery] = useState('');
    const [filterMethod, setFilterMethod] = useState('all'); // 'all', 'self', 'manual'

    const filteredAttendees = useMemo(() => {
        let filtered = attendees;

        // Filter by search query
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(attendee => {
                const user = attendee.userId;
                const name = user?.name || user?.username || 'Unknown';
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

    const getUserDisplayName = (attendee) => {
        const user = attendee.userId;
        return user?.name || user?.username || 'Unknown User';
    };

    const getUserPicture = (attendee) => {
        const user = attendee.userId;
        return user?.picture || null;
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
                        const attendeeUserId = (user && (user._id || user.id)) ? String(user._id || user.id) : null;
                        return (
                            <div key={index} className="attendee-item">
                                <div className="attendee-info">
                                    <div className="attendee-avatar">
                                        {getUserPicture(attendee) ? (
                                            <img 
                                                src={getUserPicture(attendee)} 
                                                alt={getUserDisplayName(attendee)}
                                            />
                                        ) : (
                                            <Icon icon="mdi:account-circle" />
                                        )}
                                    </div>
                                    <div className="attendee-details">
                                        <div className="attendee-name">
                                            {getUserDisplayName(attendee)}
                                        </div>
                                        <div className="attendee-meta">
                                            <span className="checkin-time">
                                                <Icon icon="mdi:clock-outline" />
                                                {formatCheckInTime(attendee.checkedInAt)}
                                            </span>
                                            <span className={`checkin-method ${isManual ? 'manual' : 'self'}`}>
                                                <Icon icon={isManual ? 'mdi:account-check' : 'mdi:qrcode-scan'} />
                                                {isManual ? 'Manual' : 'Self Check-In'}
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
                                    {onRemoveCheckIn && attendeeUserId && (
                                        <button
                                            type="button"
                                            className="remove-checkin-btn"
                                            onClick={() => onRemoveCheckIn(attendeeUserId)}
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
            {onManualCheckIn && (
                <div className="manual-checkin-section">
                    <button className="manual-checkin-button" onClick={() => {
                        // This would typically open a modal to select a user
                        // For now, we'll just show a placeholder
                        alert('Manual check-in feature - select user from modal');
                    }}>
                        <Icon icon="mdi:account-plus" />
                        Manually Check In Attendee
                    </button>
                </div>
            )}
        </div>
    );
}

export default CheckInList;
