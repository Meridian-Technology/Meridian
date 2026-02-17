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

function hexToRgba(hex, alpha) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return hex;
    const r = parseInt(result[1], 16);
    const g = parseInt(result[2], 16);
    const b = parseInt(result[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getAgendaTypeColors(item) {
    const type = item?.type || 'Activity';
    if (type === 'Custom' && item?.customColor) {
        return { background: hexToRgba(item.customColor, 0.2), border: item.customColor };
    }
    return AGENDA_TYPE_COLORS[type] || AGENDA_TYPE_COLORS.Activity;
}

function getDisplayType(item) {
    if (item?.type === 'Custom' && item?.customTag?.trim()) return item.customTag.trim();
    return item?.type || 'Activity';
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
                border: `1px solid ${colors.border}`,
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
                    <span className="event-type">{getDisplayType(item)}</span>
                    {item.location && (
                        <span className="event-location">{item.location}</span>
                    )}
                </div>
            </div>
        </div>
    );
}

export default AgendaItemCalendarEvent;
