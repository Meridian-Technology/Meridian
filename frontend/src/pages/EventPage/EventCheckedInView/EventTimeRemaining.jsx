import React from 'react';
import { Icon } from '@iconify-icon/react';
import { useSimulatedTime } from '../../../contexts/SimulatedTimeContext';

function formatTimeRemaining(endTime, now) {
    const end = new Date(endTime);
    const remainingMs = end - now;
    if (remainingMs <= 0) return 'Event ended';
    const totalMinutes = Math.floor(remainingMs / (1000 * 60));
    if (totalMinutes < 5) return 'Ending soon';
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours >= 1) {
        return `${hours}h ${minutes}m left`;
    }
    return `${minutes}m left`;
}

function EventTimeRemaining({ event }) {
    const { now } = useSimulatedTime();
    if (!event?.end_time) return null;
    const label = formatTimeRemaining(event.end_time, now);
    return (
        <div className="event-checked-in-view__time-remaining">
            <Icon icon="mdi:clock-outline" className="event-checked-in-view__time-icon" />
            <span className="event-checked-in-view__time-label">{label}</span>
        </div>
    );
}

export default EventTimeRemaining;
