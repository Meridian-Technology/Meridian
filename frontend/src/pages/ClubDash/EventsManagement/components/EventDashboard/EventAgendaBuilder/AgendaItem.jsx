import React from 'react';
import { Icon } from '@iconify-icon/react';
import './AgendaBuilder.scss';

function AgendaItem({ item, onEdit, onDelete }) {
    const formatTime = (date) => {
        if (!date) return 'TBD';
        const time = date instanceof Date ? date : new Date(date);
        return time.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getDurationMinutes = () => {
        if (!item.startTime || !item.endTime) return null;
        const start = item.startTime instanceof Date ? item.startTime : new Date(item.startTime);
        const end = item.endTime instanceof Date ? item.endTime : new Date(item.endTime);
        return Math.round((end - start) / 60000);
    };

    const getTypeIcon = (type) => {
        const icons = {
            Activity: 'mdi:run',
            Break: 'mdi:coffee',
            Setup: 'mdi:wrench',
            Breakdown: 'mdi:package-down',
            Transition: 'mdi:arrow-right',
            Speaker: 'mdi:microphone',
            Custom: 'mdi:star'
        };
        return icons[type] || 'mdi:circle';
    };

    const getTypeColor = (type) => {
        const colors = {
            Activity: '#4DAA57',
            Break: '#ffc107',
            Setup: '#6c757d',
            Breakdown: '#6c757d',
            Transition: '#17a2b8',
            Speaker: '#dc3545',
            Custom: '#6D8EFA'
        };
        return colors[type] || '#6c757d';
    };

    const startTime = item.startTime ? (typeof item.startTime === 'string' ? new Date(item.startTime) : item.startTime) : null;
    const endTime = item.endTime ? (typeof item.endTime === 'string' ? new Date(item.endTime) : item.endTime) : null;
    const durationMinutes = getDurationMinutes();

    return (
        <div className="agenda-item">
            <div className="item-content">
                <div className="item-header">
                    <div className="item-type-badge" style={{ backgroundColor: getTypeColor(item.type) }}>
                        <Icon icon={getTypeIcon(item.type)} />
                        <span>{item.type}</span>
                    </div>
                    {!item.isPublic && (
                        <span className="item-visibility">
                            <Icon icon="mdi:lock" />
                            <span>Internal</span>
                        </span>
                    )}
                </div>
                <h4 className="item-title">{item.title}</h4>
                {item.description && (
                    <p className="item-description">{item.description}</p>
                )}
                <div className="item-meta">
                    {startTime && endTime && (
                        <span className="meta-item">
                            <Icon icon="mdi:clock-outline" />
                            {formatTime(startTime)} - {formatTime(endTime)}
                        </span>
                    )}
                    {durationMinutes != null && (
                        <span className="meta-item">
                            <Icon icon="mdi:timer-outline" />
                            {durationMinutes} min
                        </span>
                    )}
                    {item.location && (
                        <span className="meta-item">
                            <Icon icon="fluent:location-28-filled" />
                            {item.location}
                        </span>
                    )}
                </div>
            </div>
            <div className="item-actions">
                <button className="action-btn edit" onClick={onEdit} title="Edit">
                    <Icon icon="mdi:pencil" />
                </button>
                <button className="action-btn delete" onClick={onDelete} title="Delete">
                    <Icon icon="mdi:delete" />
                </button>
            </div>
        </div>
    );
}

export default AgendaItem;
