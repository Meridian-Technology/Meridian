import React from 'react';
import './SystemSettings.scss';
import SlideSwitch from '../../../../../components/SlideSwitch/SlideSwitch';
import SettingsList from '../../../../../components/SettingsList/SettingsList';

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

    const defaultEventSettingsItems = [
        {
            title: 'RSVP Enabled by Default',
            subtitle: 'Enable RSVP functionality for all events by default',
            action:
                <SlideSwitch
                    checked={config.defaultEventSettings.rsvpEnabled}
                    onChange={(e) => handleChange('defaultEventSettings', 'rsvpEnabled', e.target.checked)}
                />
            
        },
        {
            title: "RSVP Required by Default",
            subtitle: "Require RSVP for all events by default",
            action:
                <SlideSwitch
                    checked={config.defaultEventSettings.rsvpRequired}
                    onChange={(e) => handleChange('defaultEventSettings', 'rsvpRequired', e.target.checked)}
                />
        },
        {
            title: "Approval Required by Default",
            subtitle: "Require approval for all events by default",
            action:
                <SlideSwitch
                    checked={config.defaultEventSettings.approvalRequired}
                    onChange={(e) => handleChange('defaultEventSettings', 'approvalRequired', e.target.checked)}
                />
        },
        {
            title: "Default Visibility",
            subtitle: "Set the default visibility level for new events",
            action:
                <select
                value={config.defaultEventSettings.visibility}
                onChange={(e) => handleChange('defaultEventSettings', 'visibility', e.target.value)}
                >
                    <option value="public">Public</option>
                    <option value="campus">Campus Only</option>
                    <option value="private">Private</option>
                </select>
        },
        {
            title: "Default Max Attendees",
            subtitle: "Set the default maximum number of attendees for events",
            action:
                <input
                    type="number"
                    value={config.defaultEventSettings.maxAttendees || ''}
                    onChange={(e) => handleChange('defaultEventSettings', 'maxAttendees', e.target.value ? parseInt(e.target.value) : null)}
                    placeholder="No limit"
                />
        },
    ]

    const notificationSettingsItems = [
        {
            title: 'Default Notification Channels',
            subtitle: 'Select which channels to use for notifications by default',
            action:
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
        },
        {
            title: 'Reminder Intervals',
            subtitle: 'Set reminder intervals in hours before an event',
            action:
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
        },
        {
            title: 'Escalation Timeout',
            subtitle: 'Hours before escalating notifications',
            action:
                <input
                    type="number"
                    value={config.notificationSettings.escalationTimeouts}
                    onChange={(e) => handleChange('notificationSettings', 'escalationTimeouts', parseInt(e.target.value))}
                />
        },
        {
            title: 'Batch Notification Limit',
            subtitle: 'Maximum number of notifications to send in a batch',
            action:
                <input
                    type="number"
                    value={config.notificationSettings.batchNotificationLimit}
                    onChange={(e) => handleChange('notificationSettings', 'batchNotificationLimit', parseInt(e.target.value))}
                />
        }
    ];

    const systemRestrictionsItems = [
        {
            title: 'Max Events Per User',
            subtitle: 'Maximum number of events a single user can create',
            action:
                <input
                    type="number"
                    value={config.systemRestrictions.maxEventsPerUser}
                    onChange={(e) => handleChange('systemRestrictions', 'maxEventsPerUser', parseInt(e.target.value))}
                />
        },
        {
            title: 'Max Events Per Organization',
            subtitle: 'Maximum number of events an organization can create',
            action:
                <input
                    type="number"
                    value={config.systemRestrictions.maxEventsPerOrg}
                    onChange={(e) => handleChange('systemRestrictions', 'maxEventsPerOrg', parseInt(e.target.value))}
                />
        },
        {
            title: 'Advance Booking Limit',
            subtitle: 'Maximum days in advance events can be booked',
            action:
                <input
                    type="number"
                    value={config.systemRestrictions.advanceBookingLimit}
                    onChange={(e) => handleChange('systemRestrictions', 'advanceBookingLimit', parseInt(e.target.value))}
                />
        },
        {
            title: 'Minimum Booking Advance',
            subtitle: 'Minimum hours in advance events must be booked',
            action:
                <input
                    type="number"
                    value={config.systemRestrictions.minBookingAdvance}
                    onChange={(e) => handleChange('systemRestrictions', 'minBookingAdvance', parseInt(e.target.value))}
                />
        },
        {
            title: 'Blackout Dates',
            subtitle: 'Dates when events cannot be created',
            action:
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
        }
    ];

    return (
        <div className="system-settings">
            <div className="settings-container">
                <h1>Default Event Settings</h1>
                <SettingsList items={defaultEventSettingsItems}/>
            </div>

            <div className="settings-container">
                <h1>Notification Settings</h1>
                <SettingsList items={notificationSettingsItems}/>
            </div>

            <div className="settings-container">
                <h1>System Restrictions</h1>
                <SettingsList items={systemRestrictionsItems}/>
            </div>
        </div>
    );
};

export default SystemSettings;
