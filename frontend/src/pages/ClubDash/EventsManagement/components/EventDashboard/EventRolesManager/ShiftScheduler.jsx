import React from 'react';
import { Icon } from '@iconify-icon/react';
import './RolesManager.scss';

function ShiftScheduler({ roles, event }) {
    if (!roles || roles.length === 0 || !event) return null;

    const formatTime = (date) => {
        if (!date) return 'TBD';
        return new Date(date).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const rolesWithShifts = roles.filter(role => role.shiftStart && role.shiftEnd);

    if (rolesWithShifts.length === 0) {
        return (
            <div className="shift-scheduler">
                <h4>
                    <Icon icon="mdi:calendar-clock" />
                    Shift Schedule
                </h4>
                <p className="no-shifts">No shifts scheduled yet. Add shift times to jobs to see the schedule.</p>
            </div>
        );
    }

    return (
        <div className="shift-scheduler">
            <h4>
                <Icon icon="mdi:calendar-clock" />
                Shift Schedule
            </h4>
            <div className="shifts-timeline">
                {rolesWithShifts.map(role => (
                    <div key={role._id} className="shift-item">
                        <div className="shift-role">
                            <strong>{role.name}</strong>
                            <span className="shift-time">
                                {formatTime(role.shiftStart)} - {formatTime(role.shiftEnd)}
                            </span>
                        </div>
                        <div className="shift-coverage">
                            <span>
                                {role.assignments?.filter(a => a.status === 'confirmed').length || 0} / {role.requiredCount}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default ShiftScheduler;
