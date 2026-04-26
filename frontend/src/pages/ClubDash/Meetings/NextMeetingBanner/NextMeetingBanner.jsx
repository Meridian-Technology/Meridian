import React from 'react';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import './NextMeetingBanner.scss';

function NextMeetingBanner({ meeting, onTakeAttendance, onClick }) {
    if (!meeting) return null;

    const { tag, title, location } = meeting;

    return (
        <div className="next-meeting" onClick={onClick} role="button" tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onClick?.()}>
            <div className="meeting-status">
                <span className="status-dot" />
                <span className="status-label">Meeting in progress</span>
            </div>
            <div className="meeting-info">
                <div className="meeting-info-top">
                    <span className="meeting-tag">{tag}</span>
                    <span
                        className="take-attendance"
                        onClick={(e) => { e.stopPropagation(); onTakeAttendance?.(); }}
                    >
                        Take attendance
                    </span>
                </div>
                <div className="meeting-title">{title}</div>
                <div className="meeting-location">
                    <Icon icon="mdi:map-marker" width={16} color="#6b7280" />
                    {location}
                </div>
            </div>
        </div>
    );
}

export default NextMeetingBanner;