import React from 'react';
import './SystemSettings.scss';
import SlideSwitch from '../../../../../components/SlideSwitch/SlideSwitch';

const SystemSettings = ({ config, onChange }) => {

    const handleChange = (section, field, value) => {
        onChange({
            ...config,
            [section]: {
                ...config[section],
                [field]: value
            }
        });
    };

    const handleArrayChange = (section, field, value) => {
        const currentArray = config[section][field] || [];
        const newArray = currentArray.includes(value)
            ? currentArray.filter(item => item !== value)
            : [...currentArray, value];
        
        handleChange(section, field, newArray);
    };

    const handleBlackoutDateAdd = () => {
        const newDate = {
            start: new Date().toISOString().split('T')[0],
            end: new Date().toISOString().split('T')[0],
            reason: ''
        };
        
        const currentDates = config.systemRestrictions.blackoutDates || [];
        handleChange('systemRestrictions', 'blackoutDates', [...currentDates, newDate]);
    };

    const handleBlackoutDateRemove = (index) => {
        const currentDates = config.systemRestrictions.blackoutDates || [];
        const newDates = currentDates.filter((_, i) => i !== index);
        handleChange('systemRestrictions', 'blackoutDates', newDates);
    };

    const handleBlackoutDateChange = (index, field, value) => {
        const currentDates = config.systemRestrictions.blackoutDates || [];
        const newDates = currentDates.map((date, i) => 
            i === index ? { ...date, [field]: value } : date
        );
        handleChange('systemRestrictions', 'blackoutDates', newDates);
    };

    return (
        <div className="system-settings">
            <div className="settings-container">
                <h1>Default Event Settings</h1>
                <div className="settings-list">
                    <div className="setting-child">
                        <div className="content">
                            <h4>RSVP Enabled by Default</h4>
                            <p>Enable RSVP functionality for all events by default</p>
                        </div>
                        <div className="action">
                            <SlideSwitch
                                checked={config.defaultEventSettings.rsvpEnabled}
                                onChange={(e) => handleChange('defaultEventSettings', 'rsvpEnabled', e.target.checked)}
                            />
                        </div>
                    </div>

                    <div className="setting-child">
                        <div className="content">
                            <h4>RSVP Required by Default</h4>
                            <p>Require RSVP for all events by default</p>
                        </div>
                        <div className="action">
                            <SlideSwitch
                                checked={config.defaultEventSettings.rsvpRequired}
                                onChange={(e) => handleChange('defaultEventSettings', 'rsvpRequired', e.target.checked)}
                            />
                        </div>
                    </div>

                    <div className="setting-child">
                        <div className="content">
                            <h4>Approval Required by Default</h4>
                            <p>Require approval for all events by default</p>
                        </div>
                        <div className="action">
                            <SlideSwitch
                                checked={config.defaultEventSettings.approvalRequired}
                                onChange={(e) => handleChange('defaultEventSettings', 'approvalRequired', e.target.checked)}
                            />
                        </div>
                    </div>

                    <div className="setting-child">
                        <div className="content">
                            <h4>Default Visibility</h4>
                            <p>Set the default visibility level for new events</p>
                        </div>
                        <div className="action">
                            <select
                                value={config.defaultEventSettings.visibility}
                                onChange={(e) => handleChange('defaultEventSettings', 'visibility', e.target.value)}
                            >
                                <option value="public">Public</option>
                                <option value="campus">Campus Only</option>
                                <option value="private">Private</option>
                            </select>
                        </div>
                    </div>

                    <div className="setting-child">
                        <div className="content">
                            <h4>Default Max Attendees</h4>
                            <p>Set the default maximum number of attendees for events</p>
                        </div>
                        <div className="action">
                            <input
                                type="number"
                                value={config.defaultEventSettings.maxAttendees || ''}
                                onChange={(e) => handleChange('defaultEventSettings', 'maxAttendees', e.target.value ? parseInt(e.target.value) : null)}
                                placeholder="No limit"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="settings-container">
                <h1>Notification Settings</h1>
                <div className="settings-list">
                    <div className="setting-child">
                        <div className="content">
                            <h4>Default Notification Channels</h4>
                            <p>Select which channels to use for notifications by default</p>
                        </div>
                        <div className="action">
                            <div className="checkbox-group">
                                {['email', 'push', 'sms', 'in_app'].map(channel => (
                                    <label key={channel} className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={config.notificationSettings.defaultChannels?.includes(channel) || false}
                                            onChange={() => handleArrayChange('notificationSettings', 'defaultChannels', channel)}
                                        />
                                        <span className="checkmark"></span>
                                        {channel.charAt(0).toUpperCase() + channel.slice(1).replace('_', ' ')}
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="setting-child">
                        <div className="content">
                            <h4>Reminder Intervals</h4>
                            <p>Set reminder intervals in hours before an event</p>
                        </div>
                        <div className="action">
                            <div className="array-input">
                                {config.notificationSettings.reminderIntervals?.map((interval, index) => (
                                    <div key={index} className="array-item">
                                        <input
                                            type="number"
                                            value={interval}
                                            onChange={(e) => {
                                                const newIntervals = [...config.notificationSettings.reminderIntervals];
                                                newIntervals[index] = parseInt(e.target.value);
                                                handleChange('notificationSettings', 'reminderIntervals', newIntervals);
                                            }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const newIntervals = config.notificationSettings.reminderIntervals.filter((_, i) => i !== index);
                                                handleChange('notificationSettings', 'reminderIntervals', newIntervals);
                                            }}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => {
                                        const newIntervals = [...(config.notificationSettings.reminderIntervals || []), 24];
                                        handleChange('notificationSettings', 'reminderIntervals', newIntervals);
                                    }}
                                >
                                    Add Interval
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="setting-child">
                        <div className="content">
                            <h4>Escalation Timeout</h4>
                            <p>Hours before escalating notifications</p>
                        </div>
                        <div className="action">
                            <input
                                type="number"
                                value={config.notificationSettings.escalationTimeouts}
                                onChange={(e) => handleChange('notificationSettings', 'escalationTimeouts', parseInt(e.target.value))}
                            />
                        </div>
                    </div>

                    <div className="setting-child">
                        <div className="content">
                            <h4>Batch Notification Limit</h4>
                            <p>Maximum number of notifications to send in a batch</p>
                        </div>
                        <div className="action">
                            <input
                                type="number"
                                value={config.notificationSettings.batchNotificationLimit}
                                onChange={(e) => handleChange('notificationSettings', 'batchNotificationLimit', parseInt(e.target.value))}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="settings-container">
                <h1>System Restrictions</h1>
                <div className="settings-list">
                    <div className="setting-child">
                        <div className="content">
                            <h4>Max Events Per User</h4>
                            <p>Maximum number of events a single user can create</p>
                        </div>
                        <div className="action">
                            <input
                                type="number"
                                value={config.systemRestrictions.maxEventsPerUser}
                                onChange={(e) => handleChange('systemRestrictions', 'maxEventsPerUser', parseInt(e.target.value))}
                            />
                        </div>
                    </div>

                    <div className="setting-child">
                        <div className="content">
                            <h4>Max Events Per Organization</h4>
                            <p>Maximum number of events an organization can create</p>
                        </div>
                        <div className="action">
                            <input
                                type="number"
                                value={config.systemRestrictions.maxEventsPerOrg}
                                onChange={(e) => handleChange('systemRestrictions', 'maxEventsPerOrg', parseInt(e.target.value))}
                            />
                        </div>
                    </div>

                    <div className="setting-child">
                        <div className="content">
                            <h4>Advance Booking Limit</h4>
                            <p>Maximum days in advance events can be booked</p>
                        </div>
                        <div className="action">
                            <input
                                type="number"
                                value={config.systemRestrictions.advanceBookingLimit}
                                onChange={(e) => handleChange('systemRestrictions', 'advanceBookingLimit', parseInt(e.target.value))}
                            />
                        </div>
                    </div>

                    <div className="setting-child">
                        <div className="content">
                            <h4>Minimum Booking Advance</h4>
                            <p>Minimum hours in advance events must be booked</p>
                        </div>
                        <div className="action">
                            <input
                                type="number"
                                value={config.systemRestrictions.minBookingAdvance}
                                onChange={(e) => handleChange('systemRestrictions', 'minBookingAdvance', parseInt(e.target.value))}
                            />
                        </div>
                    </div>

                    <div className="setting-child">
                        <div className="content">
                            <h4>Blackout Dates</h4>
                            <p>Dates when events cannot be created</p>
                        </div>
                        <div className="action">
                            <div className="blackout-dates">
                                {config.systemRestrictions.blackoutDates?.map((date, index) => (
                                    <div key={index} className="blackout-date-item">
                                        <input
                                            type="date"
                                            value={date.start}
                                            onChange={(e) => handleBlackoutDateChange(index, 'start', e.target.value)}
                                        />
                                        <span>to</span>
                                        <input
                                            type="date"
                                            value={date.end}
                                            onChange={(e) => handleBlackoutDateChange(index, 'end', e.target.value)}
                                        />
                                        <input
                                            type="text"
                                            placeholder="Reason"
                                            value={date.reason}
                                            onChange={(e) => handleBlackoutDateChange(index, 'reason', e.target.value)}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => handleBlackoutDateRemove(index)}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ))}
                                <button
                                    type="button"
                                    onClick={handleBlackoutDateAdd}
                                    className="add-blackout-btn"
                                >
                                    Add Blackout Date
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SystemSettings;
