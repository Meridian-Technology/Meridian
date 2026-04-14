import React from 'react';
import { Icon } from '@iconify-icon/react';
import EventCheckInButton from '../../../components/EventCheckInButton/EventCheckInButton';
import EventTimeRemaining from './EventTimeRemaining';
import EventCurrentAgenda from './EventCurrentAgenda';
import EventAnnouncementsFeed from './EventAnnouncementsFeed';
import { useSimulatedTime } from '../../../contexts/SimulatedTimeContext';
import { analytics } from '../../../services/analytics/analytics';
import './EventCheckedInView.scss';

const ONE_HOUR_MS = 60 * 60 * 1000;

function EventCheckedInView({ event, onRefetch, onViewAgenda }) {
    const { now } = useSimulatedTime();
    if (!event) return null;

    const hasAgenda = (event.eventAgenda?.isPublished && (event.eventAgenda?.items?.length ?? 0) > 0) ||
        (event.agenda && event.agenda.length > 0);
    const isOrgHosted = event.hostingType === 'Org';

    const start = new Date(event.start_time);
    const end = new Date(event.end_time || event.start_time);
    const graceStart = new Date(start.getTime() - ONE_HOUR_MS);
    const showAnnouncements = isOrgHosted && now >= graceStart && now <= end;

    return (
        <div className="event-checked-in-view">
            <div className="event-checked-in-view__header">
                <div className="event-checked-in-view__badge">
                    <Icon icon="mdi:check-circle" className="event-checked-in-view__badge-icon" />
                    <span>You&apos;re here</span>
                </div>
                <EventCheckInButton event={event} onCheckedIn={onRefetch} />
            </div>

            <EventTimeRemaining event={event} />

            {hasAgenda && (
                <EventCurrentAgenda
                    event={event}
                    onViewFullAgenda={() => {
                        analytics.track('event_agenda_view', { event_id: event._id });
                        onViewAgenda?.();
                    }}
                />
            )}

            {showAnnouncements && (
                <EventAnnouncementsFeed eventId={event._id} />
            )}
        </div>
    );
}

export default EventCheckedInView;
