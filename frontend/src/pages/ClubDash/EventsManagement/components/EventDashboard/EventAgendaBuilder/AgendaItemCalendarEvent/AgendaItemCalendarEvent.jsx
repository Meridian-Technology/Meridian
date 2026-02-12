import React from 'react';
import './AgendaItemCalendarEvent.scss';

const AGENDA_TYPE_COLORS = {
    Activity: { background: '#D3E8CF', border: '#4DAA57' },
    Break: { background: '#FFF3CD', border: '#ffc107' },
    Setup: { background: '#E9ECEF', border: '#6c757d' },
    Breakdown: { background: '#E9ECEF', border: '#6c757d' },
    Transition: { background: '#CCE5FF', border: '#17a2b8' },
    Speaker: { background: '#F8D7DA', border: '#dc3545' },
    Custom: { background: '#D3DDFD', border: '#6D8EFA' }
};

function getAgendaTypeColors(item) {
    const type = item?.type || 'Activity';
    return AGENDA_TYPE_COLORS[type] || AGENDA_TYPE_COLORS.Activity;
}

function AgendaItemCalendarEvent({ item, onEdit, event }) {
    const formatTime = (date) => {
        if (!date) return '';
        const d = date instanceof Date ? date : new Date(date);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const colors = getAgendaTypeColors(item);
    const startTime = item.startTime ? (typeof item.startTime === 'string' ? new Date(item.startTime) : item.startTime) : null;
    const endTime = item.endTime ? (typeof item.endTime === 'string' ? new Date(item.endTime) : item.endTime) : null;

    const handleClick = () => {
        if (onEdit) {
            onEdit(item);
        }
    };

    return (
        <div
            className={`agenda-item-calendar-event ${onEdit ? 'editable' : ''}`}
            style={{
                backgroundColor: colors.background,
                borderLeft: `4px solid ${colors.border}`,
                '--event-accent': colors.border
            }}
            onClick={handleClick}
            role={onEdit ? 'button' : undefined}
        >
            <div className="event-time">
                {startTime && endTime
                    ? `${formatTime(startTime)} - ${formatTime(endTime)}`
                    : ''}
            </div>
            <div className="event-content">
                <div className="event-name">{item.title || 'Untitled'}</div>
                <div className="event-details">
                    <span className="event-type">{item.type || 'Activity'}</span>
                    {item.location && (
                        <span className="event-location">{item.location}</span>
                    )}
                </div>
            </div>
        </div>
    );
}

export default AgendaItemCalendarEvent;
