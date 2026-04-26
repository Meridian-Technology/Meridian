import React from 'react';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import './AttendanceCard.scss';

function AttendanceCard({ record, onClick }) {
    const { title, active, attended, excused, unexcused, rate } = record;

    return (
        <div
            className={`attendance-card${active ? ' attendance-card--active' : ''}`}
            onClick={onClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
        >
            <h3>{title}</h3>
            {active && (
                <span className="in-progress-label">
                    <span className="status-dot" /> In progress
                </span>
            )}
            <div className="attendance-stats">
                <div className="stat attended">
                    <Icon icon="mdi:check-circle" width={18} /> {attended} attended
                </div>
                <div className="stat excused">
                    <Icon icon="mdi:calendar-minus" width={18} /> {excused} excused
                </div>
                <div className="stat unexcused">
                    <Icon icon="mdi:calendar-remove" width={18} /> {unexcused} unexcused
                </div>
            </div>
            <div className="attendance-bar">
                <div className="attendance-bar__fill" style={{ width: `${rate}%` }} />
            </div>
            <span className="attendance-rate">{rate}% attendance rate</span>
            <span className="view-details">View details →</span>
        </div>
    );
}

export default AttendanceCard;