import React from 'react';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import TabbedContainer from '../../../../components/TabbedContainer/TabbedContainer';
import AttendanceTab from './Tabs/AttendanceTab';
import RemindersTab from './Tabs/RemindersTab';
import './Meeting.scss';

const defaultAttendees = [
    { id: 1, name: 'Alex Chen',     role: 'Officer', rsvp: 'yes',         present: true  },
    { id: 2, name: 'Jordan Smith',  role: 'Member',  rsvp: 'yes',         present: true  },
    { id: 3, name: 'Sam Williams',  role: 'Member',  rsvp: 'yes',         present: false },
    { id: 4, name: 'Taylor Brown',  role: 'Member',  rsvp: 'no',          present: false },
    { id: 5, name: 'Morgan Davis',  role: 'Officer', rsvp: 'no',          present: false },
    { id: 6, name: 'Casey Lee',     role: 'Member',  rsvp: 'no-response', present: false },
    { id: 7, name: 'Riley Johnson', role: 'Member',  rsvp: 'no-response', present: false },
];

function Meeting({ meeting, attendees = defaultAttendees, onBack }) {
    if (!meeting) return null;

    const isActive = meeting.completed === false;

    const tabs = [
        {
            id: 'attendance',
            label: 'Attendance',
            icon: 'mdi:checkbox-marked-outline',
            content: <AttendanceTab attendees={attendees} isActive={isActive} />,
        },
        {
            id: 'meeting-minutes',
            label: 'Meeting Minutes',
            icon: 'mdi:file-document-outline',
            content: (
                <div className="detail-tab-content">
                    <div className="empty-state">
                        <Icon icon="mdi:file-document-outline" width={40} />
                        <p>No meeting minutes yet.</p>
                    </div>
                </div>
            ),
        },
        {
            id: 'reminders',
            label: 'Reminders',
            icon: 'mdi:bell-outline',
            content: <RemindersTab />,
        },
    ];

    return (
        <div className="meeting-detail">
            <button className="detail-back" onClick={onBack}>
                <Icon icon="mdi:arrow-left" width={16} /> Back
            </button>

            <div className="detail-header">
                <div className="detail-header__title-row">
                    <h1>{meeting.title}</h1>
                    {isActive && (
                        <span className="in-progress-badge">
                            <span className="status-dot" /> In progress
                        </span>
                    )}
                    {meeting.completed && (
                        <span className="completed-badge">Completed</span>
                    )}
                </div>
                <div className="detail-header__meta">
                    {meeting.time && (
                        <span><Icon icon="mdi:calendar-outline" width={15} /> {meeting.time}</span>
                    )}
                    {meeting.location && (
                        <span><Icon icon="mdi:map-marker-outline" width={15} /> {meeting.location}</span>
                    )}
                    <span><Icon icon="mdi:account-multiple-outline" width={15} /> Required: members, officers</span>
                </div>
            </div>

            <TabbedContainer
                tabs={tabs}
                defaultTab="attendance"
                tabPosition="top"
                tabStyle="underline"
            />
        </div>
    );
}

export default Meeting;