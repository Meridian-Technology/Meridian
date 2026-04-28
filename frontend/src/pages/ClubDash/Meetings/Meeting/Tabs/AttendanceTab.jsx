import React, { useState } from 'react';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';

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

function AttendanceTab({ attendees = [], isActive }) {
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

export default AttendanceTab;