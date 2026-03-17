import React, { useMemo } from 'react';
import { Icon } from '@iconify-icon/react';
import { useSimulatedTime } from '../../../contexts/SimulatedTimeContext';

function getCurrentAgendaItems(agendaItems, eventStartTime, now) {
    if (!agendaItems || agendaItems.length === 0) return [];
    const eventStart = new Date(eventStartTime);
    let currentTime = new Date(eventStart);

    const sorted = [...agendaItems].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const publicItems = sorted.filter(item => item.isPublic !== false);

    const withTimes = publicItems.map((item, index) => {
        let startTime;
        let endTime;
        if (item.startTime && item.endTime) {
            startTime = typeof item.startTime === 'string' ? new Date(item.startTime) : new Date(item.startTime);
            endTime = typeof item.endTime === 'string' ? new Date(item.endTime) : new Date(item.endTime);
        } else {
            const durationMinutes = item.durationMinutes || (item.type === 'Break' ? 15 : 30);
            startTime = new Date(currentTime);
            endTime = new Date(currentTime.getTime() + durationMinutes * 60 * 1000);
            currentTime = new Date(endTime);
        }
        return { ...item, startTime, endTime };
    });

    return withTimes.filter(item => now >= item.startTime && now <= item.endTime);
}

function formatTime(date) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function EventCurrentAgenda({ event, onViewFullAgenda }) {
    const { now } = useSimulatedTime();
    const agendaItems = event?.eventAgenda?.isPublished
        ? (event.eventAgenda?.items || [])
        : (event?.agenda || []);
    const eventStartTime = event?.start_time || new Date().toISOString();

    const currentItems = useMemo(
        () => getCurrentAgendaItems(agendaItems, eventStartTime, now),
        [agendaItems, eventStartTime, now]
    );

    if (currentItems.length === 0) {
        if (agendaItems.length === 0) return null;
        return (
            <div className="event-checked-in-view__agenda-card">
                <h3 className="event-checked-in-view__section-title">
                    <Icon icon="mdi:calendar-clock" />
                    Now happening
                </h3>
                <p className="event-checked-in-view__agenda-empty">No schedule item at this time.</p>
                {onViewFullAgenda && (
                    <button type="button" className="event-checked-in-view__agenda-link" onClick={onViewFullAgenda}>
                        View full agenda
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="event-checked-in-view__agenda-card">
            <h3 className="event-checked-in-view__section-title">
                <Icon icon="mdi:calendar-clock" />
                Now happening
            </h3>
            {currentItems.map((item, index) => (
                <div key={item.id || index} className="event-checked-in-view__agenda-item">
                    <div className="event-checked-in-view__agenda-item-title">{item.title}</div>
                    <div className="event-checked-in-view__agenda-item-time">
                        {formatTime(item.startTime)} – {formatTime(item.endTime)}
                    </div>
                    {item.location && (
                        <div className="event-checked-in-view__agenda-item-location">
                            <Icon icon="mdi:map-marker-outline" />
                            {item.location}
                        </div>
                    )}
                    {item.description && (
                        <div className="event-checked-in-view__agenda-item-desc">
                            {item.description.length > 120 ? `${item.description.slice(0, 120)}…` : item.description}
                        </div>
                    )}
                </div>
            ))}
            {onViewFullAgenda && (
                <button type="button" className="event-checked-in-view__agenda-link" onClick={onViewFullAgenda}>
                    View full agenda
                </button>
            )}
        </div>
    );
}

export default EventCurrentAgenda;
