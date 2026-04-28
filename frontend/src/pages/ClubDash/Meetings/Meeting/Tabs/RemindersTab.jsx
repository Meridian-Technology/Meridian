import React from 'react';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';

function RemindersTab() {
    return (
        <div className="detail-tab-content">
            <p className="reminders-description">
                Reminders are sent to required attendees (Members/Officers) before the meeting.
            </p>
            <div className="reminders-list">
                <div className="reminder-card">
                    <div className="reminder-card__left">
                        <Icon icon="mdi:email-outline" width={20} className="reminder-icon reminder-icon--email" />
                        <div>
                            <div className="reminder-card__title">Email reminder</div>
                            <div className="reminder-card__sub">Sent 24 hours before meeting</div>
                        </div>
                    </div>
                    <span className="reminder-badge">Configured</span>
                </div>
                <div className="reminder-card">
                    <div className="reminder-card__left">
                        <Icon icon="mdi:bell-outline" width={20} className="reminder-icon reminder-icon--app" />
                        <div>
                            <div className="reminder-card__title">In-app notification</div>
                            <div className="reminder-card__sub">Sent 2 hours before meeting</div>
                        </div>
                    </div>
                    <span className="reminder-badge">Configured</span>
                </div>
            </div>
            <button className="reminders-edit">Edit reminder settings (mock)</button>
        </div>
    );
}

export default RemindersTab;