import React from 'react';
import { Icon } from '@iconify-icon/react';
import './AgendaItemDetailView.scss';

const AGENDA_TYPE_ICONS = {
    Activity: 'mdi:run',
    Break: 'mdi:coffee',
    Setup: 'mdi:wrench',
    Breakdown: 'mdi:package-down',
    Transition: 'mdi:arrow-right',
    Speaker: 'mdi:microphone',
    Custom: 'mdi:star'
};

const AGENDA_TYPE_COLORS = {
    Activity: '#4DAA57',
    Break: '#ffc107',
    Setup: '#6c757d',
    Breakdown: '#6c757d',
    Transition: '#17a2b8',
    Speaker: '#dc3545',
    Custom: '#6D8EFA'
};

function AgendaItemDetailView({ item, onClose }) {
    const formatTime = (date) => {
        if (!date) return 'TBD';
        const d = date instanceof Date ? date : new Date(date);
        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    };
    const startTime = item.startTime ? (typeof item.startTime === 'string' ? new Date(item.startTime) : item.startTime) : null;
    const endTime = item.endTime ? (typeof item.endTime === 'string' ? new Date(item.endTime) : item.endTime) : null;
    const durationMinutes = startTime && endTime ? Math.round((endTime - startTime) / 60000) : null;
    const typeIcon = AGENDA_TYPE_ICONS[item.type] || 'mdi:circle';
    const typeColor = (item.type === 'Custom' && item.customColor) ? item.customColor : (AGENDA_TYPE_COLORS[item.type] || '#6c757d');
    const displayType = (item.type === 'Custom' && item.customTag?.trim()) ? item.customTag.trim() : (item.type || 'Activity');

    return (
        <div className="agenda-item-detail-view">
            <div className="agenda-item-detail-view__header">
                <h3 className="agenda-item-detail-view__title">{item.title || 'Untitled'}</h3>
                <button type="button" className="agenda-item-detail-view__close" onClick={onClose} aria-label="Close">
                    <Icon icon="ep:close-bold" />
                </button>
            </div>
            <div className="agenda-item-detail-view__meta">
                <span className="agenda-item-detail-view__type-badge" style={{ backgroundColor: typeColor }}>
                    <Icon icon={typeIcon} />
                    {displayType}
                </span>
            </div>
            <div className="agenda-item-detail-view__content">
                {startTime && endTime && (
                    <div className="agenda-item-detail-view__row">
                        <Icon icon="mdi:clock-outline" />
                        <span>{formatTime(startTime)} – {formatTime(endTime)}{durationMinutes != null ? ` (${durationMinutes} min)` : ''}</span>
                    </div>
                )}
                {item.location && (
                    <div className="agenda-item-detail-view__row">
                        <Icon icon="fluent:location-28-filled" />
                        <span>{item.location}</span>
                    </div>
                )}
                {item.description && (
                    <div className="agenda-item-detail-view__description">
                        {item.description}
                    </div>
                )}
            </div>
        </div>
    );
}

export default AgendaItemDetailView;
