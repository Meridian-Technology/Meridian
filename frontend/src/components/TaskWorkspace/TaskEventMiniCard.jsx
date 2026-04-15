import React, { useCallback } from 'react';
import { Icon } from '@iconify-icon/react';
import { useDashboardOverlay } from '../../hooks/useDashboardOverlay';
import './TaskWorkspace.scss';

function formatEventWhen(start, end) {
    if (!start) return 'Date TBD';
    const s = new Date(start);
    const e = end ? new Date(end) : null;
    if (Number.isNaN(s.getTime())) return 'Date TBD';
    const dOpts = { weekday: 'short', month: 'short', day: 'numeric' };
    const tOpts = { hour: 'numeric', minute: '2-digit' };
    if (e && !Number.isNaN(e.getTime())) {
        const sameDay =
            s.getDate() === e.getDate() &&
            s.getMonth() === e.getMonth() &&
            s.getFullYear() === e.getFullYear();
        if (sameDay) {
            return `${s.toLocaleString(undefined, dOpts)} · ${s.toLocaleString(undefined, tOpts)} – ${e.toLocaleString(undefined, tOpts)}`;
        }
        return `${s.toLocaleString(undefined, dOpts)} – ${e.toLocaleString(undefined, dOpts)}`;
    }
    return s.toLocaleString(undefined, { ...dOpts, ...tOpts });
}

export default function TaskEventMiniCard({ task, orgId, currentEventId = null }) {
    const { showEventDashboard } = useDashboardOverlay();
    const ev = task?.eventId;
    const eventObj = ev && typeof ev === 'object' && ev._id ? ev : null;
    const isCurrent = Boolean(
        currentEventId && eventObj && String(eventObj._id) === String(currentEventId)
    );

    const onOpen = useCallback(() => {
        if (isCurrent || !eventObj || !orgId) return;
        showEventDashboard(
            {
                _id: eventObj._id,
                name: eventObj.name,
                start_time: eventObj.start_time,
                end_time: eventObj.end_time
            },
            orgId,
            { persistInUrl: true, className: 'full-width-event-dashboard' }
        );
    }, [eventObj, orgId, isCurrent, showEventDashboard]);

    if (!eventObj || !orgId) return null;

    return (
        <button
            type="button"
            className="task-workspace-event-card"
            onClick={onOpen}
            disabled={isCurrent}
        >
            <Icon icon="mdi:calendar-star" className="task-workspace-event-card__icon" />
            <div className="task-workspace-event-card__body">
                <h3 className="task-workspace-event-card__title">{eventObj.name || 'Event'}</h3>
                <p className="task-workspace-event-card__meta">
                    {formatEventWhen(eventObj.start_time, eventObj.end_time)}
                </p>
                {isCurrent && <span className="task-workspace-event-card__badge">Current event</span>}
            </div>
        </button>
    );
}
