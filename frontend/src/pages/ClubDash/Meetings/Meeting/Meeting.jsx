import React, { useState } from 'react';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import TabbedContainer from '../../../../components/TabbedContainer/TabbedContainer';
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

function AttendanceRow({ attendee, isActive, onToggle }) {
    const { name, role, rsvp, present } = attendee;

    const rsvpBadge = {
        yes:           { label: 'Yes',        cls: 'rsvp--yes'  },
        no:            { label: 'No',          cls: 'rsvp--no'   },
        'no-response': { label: 'No response', cls: 'rsvp--none' },
    }[rsvp];

    const getAttendanceStatus = () => {
        if (rsvp === 'no')                      return { label: 'Excused',   cls: 'status--excused',   icon: 'mdi:calendar-minus'  };
        if (rsvp === 'no-response' && !present) return { label: 'Unexcused', cls: 'status--unexcused', icon: 'mdi:calendar-remove' };
        if (present)                            return { label: 'Present',   cls: 'status--present',   icon: null };
        return                                         { label: 'Unexcused', cls: 'status--unexcused', icon: 'mdi:calendar-remove' };
    };

    const status = getAttendanceStatus();
    const isCheckable = rsvp === 'yes';

    return (
        <tr className="attendance-row">
            <td className="col-name">{name}</td>
            <td className="col-role">{role}</td>
            <td className="col-rsvp">
                <span className={`rsvp-badge ${rsvpBadge.cls}`}>
                    {rsvp === 'yes' && <Icon icon="mdi:check" width={11} />}
                    {rsvp === 'no'  && <Icon icon="mdi:close" width={11} />}
                    {rsvpBadge.label}
                </span>
            </td>
            <td className="col-attendance">
                {isCheckable && isActive ? (
                    <button
                        className={`attendance-check ${present ? 'attendance-check--checked' : ''}`}
                        onClick={() => onToggle(attendee.id)}
                        
                        aria-label={present ? 'Mark absent' : 'Mark present'}
                    >
                        <span className="check-box">
                            {present && <Icon icon="mdi:check" width={13} />}
                        </span>
                        <span className={present ? 'status--present' : 'status--unchecked'}>Present</span>
                    </button>
                ) : (
                    <span className={`attendance-status ${status.cls}`}>
                        {status.icon && <Icon icon={status.icon} width={15} />}
                        {status.label}
                    </span>
                )}
            </td>
        </tr>
    );
}

// Separate component so it has its own state and re-renders correctly
function AttendanceTab({ attendees, isActive }) {
    const [localAttendees, setLocalAttendees] = useState(attendees);

    const handleToggle = (id) => {
        setLocalAttendees(prev =>
            prev.map(a => a.id === id ? { ...a, present: !a.present } : a)
        );
    };

    return (
        <div className="detail-tab-content">
            {isActive && (
                <div className="attendance-alert">
                    <span className="status-dot" />
                    Meeting in progress — take attendance now
                </div>
            )}
            <p className="attendance-hint">
                RSVP Yes → check to confirm attendance. RSVP No → mark excused. No response → mark unexcused.
            </p>
            <div className="attendance-table-wrap">
                <table className="attendance-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Role</th>
                            <th>RSVP</th>
                            <th>Attendance</th>
                        </tr>
                    </thead>
                    <tbody>
                        {localAttendees.map(a => (
                            <AttendanceRow
                                key={a.id}
                                attendee={a}
                                isActive={isActive}
                                onToggle={handleToggle}
                            />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

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
            content: (
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
            ),
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