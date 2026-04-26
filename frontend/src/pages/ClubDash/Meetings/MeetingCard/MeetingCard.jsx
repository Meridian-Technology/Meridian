import React from 'react';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import './MeetingCard.scss';

function MeetingCard({ meeting, onClick }) {
    const {
        type,
        title,
        time,
        location,
        attending,
        excused,
        noResponse,
        completed,
        hasMinutes,
    } = meeting;

    const tagClass = {
        gbm: 'meeting-tag--gbm',
        officer: 'meeting-tag--officer',
        special: 'meeting-tag--special',
    }[type] || '';

    const tagLabel = {
        gbm: 'General Body',
        officer: 'Officer',
        special: 'Special / Officer',
    }[type] || type;

    return (
        <div className="meeting-card" onClick={onClick} role="button" tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onClick?.()}>
            <div className="meeting-card__top">
                <span className={`meeting-tag ${tagClass}`}>
                    {type === 'gbm' && <Icon icon="mdi:account-group" width={14} />}
                    {tagLabel}
                </span>
                {(completed || hasMinutes) && (
                    <div className="meeting-card__badges">
                        {completed && <span className="badge badge--completed">Completed</span>}
                        {hasMinutes && <span className="badge badge--minutes">Minutes</span>}
                    </div>
                )}
            </div>
            <div className="meeting-card__title">{title}</div>
            <div className="meeting-card__meta">
                {time && <span><Icon icon="mdi:calendar" width={14} /> {time}</span>}
                {location && <span><Icon icon="mdi:map-marker" width={14} /> {location}</span>}
            </div>
            <div className="meeting-card__rsvp">
                <span className="rsvp attending">
                    <Icon icon="mdi:check-circle" width={14} /> {attending} attending
                </span>
                <span className="rsvp excused">
                    <Icon icon="mdi:close-circle" width={14} /> {excused} excused
                </span>
                <span className="rsvp no-response">
                    <Icon icon="mdi:help-circle" width={14} /> {noResponse} no response
                </span>
            </div>
        </div>
    );
}

export default MeetingCard;