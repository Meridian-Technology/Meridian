import React from 'react';
import { Icon } from '@iconify-icon/react';
import './EventDashboard.scss';

function ComingSoon({ feature = 'Feature', description }) {
    const defaultDescriptions = {
        'Communications': 'Send messages and reminders to volunteers and attendees. Manage all event communications from one place.',
        'Outreach': 'Send messages and reminders to volunteers and attendees. Manage all event communications from one place.',
        'Equipment': 'Track equipment checkout, returns, and inventory for your event. Manage all equipment needs from one place.',
    };

    const displayDescription = description || defaultDescriptions[feature] || 'This feature is currently under development.';

    return (
        <div className="coming-soon-container">
            <div className="coming-soon-content">
                <div className="coming-soon-icon">
                    <Icon icon="mdi:rocket-launch-outline" />
                </div>
                <h3>Coming Soon</h3>
                <h4>{feature}</h4>
                <p>{displayDescription}</p>
                <div className="coming-soon-badge">
                    <Icon icon="mdi:clock-outline" />
                    <span>In Development</span>
                </div>
            </div>
        </div>
    );
}

export default ComingSoon;
