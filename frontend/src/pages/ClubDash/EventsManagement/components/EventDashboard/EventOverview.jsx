import React, { useState, useMemo } from 'react';
import { Icon } from '@iconify-icon/react';
import { useNotification } from '../../../../../NotificationContext';
import RSVPGrowthChart from './RSVPGrowthChart';
import AgendaDailyCalendar from './EventAgendaBuilder/AgendaDailyCalendar/AgendaDailyCalendar';
import EventPreview from './EventPreview';
import FeedbackFormConfig from '../EventPostMortem/FeedbackFormConfig';
import FeedbackSlide from '../EventPostMortem/slides/FeedbackSlide';
import './EventDashboard.scss';

function EventOverview({
    event,
    stats,
    agenda,
    orgId,
    onRefresh,
    onTabChange,
    operatorOrganizerMode = false,
    rsvpGrowthUrlOverride,
}) {
    const { addNotification } = useNotification();

    const agendaItemsWithTimes = useMemo(() => {
        const items = agenda?.items || [];
        return items
            .filter((item) => item.startTime && item.endTime)
            .map((item) => ({
                ...item,
                startTime: typeof item.startTime === 'string' ? new Date(item.startTime) : item.startTime,
                endTime: typeof item.endTime === 'string' ? new Date(item.endTime) : item.endTime
            }));
    }, [agenda?.items]);

    const showScheduleCalendar = agendaItemsWithTimes.length > 0 && event;

    const isEventPassed = stats?.operationalStatus === 'completed';
    const [showFeedbackFormConfig, setShowFeedbackFormConfig] = useState(false);

    const eventWithAgenda = event
        ? {
              ...event,
              eventAgenda: {
                  items: agenda?.items || [],
                  isPublished: agenda?.isPublished
              }
          }
        : null;

    const handleCopyLink = async () => {
        if (!event?._id) return;
        const eventUrl = `${window.location.origin}/event/${event._id}`;
        try {
            await navigator.clipboard.writeText(eventUrl);
            addNotification({ title: 'Copied', message: 'Event link copied to clipboard', type: 'success' });
        } catch {
            addNotification({ title: 'Error', message: 'Failed to copy link', type: 'error' });
        }
    };

    const handlePreview = () => {
        if (!event?._id) return;
        window.open(`${window.location.origin}/event/${event._id}`, '_blank', 'noopener,noreferrer');
    };

    const registrationCount = stats?.registrationCount ?? event?.registrationCount ?? 0;
    const expectedAttendance = event?.expectedAttendance ?? 0;

    const actionsColumn = (
        <div className="overview-actions-column">
            <button type="button" className="event-preview-action" onClick={handlePreview} title="Open full event">
                <Icon icon="mdi:open-in-new" />
                <span>View full event</span>
            </button>
            <button type="button" className="event-preview-action" onClick={handleCopyLink} title="Copy event link">
                <Icon icon="mdi:link" />
                <span>Copy link</span>
            </button>
            {onTabChange && (
                <>
                    {!operatorOrganizerMode && (
                        <button type="button" className="event-preview-action" onClick={() => onTabChange('edit')} title="Edit event details">
                            <Icon icon="mdi:pencil" />
                            <span>Edit event</span>
                        </button>
                    )}
                    <button type="button" className="event-preview-action" onClick={() => onTabChange('registrations')} title="View registrations">
                        <Icon icon="mdi:clipboard-list-outline" />
                        <span>Registrations</span>
                    </button>
                    {!operatorOrganizerMode && (
                        <button type="button" className="event-preview-action" onClick={() => onTabChange('checkin')} title="Check-in management">
                            <Icon icon="uil:qrcode-scan" />
                            <span>Check-in</span>
                        </button>
                    )}
                </>
            )}
        </div>
    );

    return (
        <div className="event-overview">
            {showFeedbackFormConfig && (
                <FeedbackFormConfig
                    orgId={orgId}
                    eventId={event?._id}
                    onSaved={() => {
                        setShowFeedbackFormConfig(false);
                        onRefresh?.();
                        onTabChange?.('communications');
                    }}
                    onClose={() => setShowFeedbackFormConfig(false)}
                />
            )}
            {(eventWithAgenda || event) && (
                <div className="overview-preview-chart-row">
                    {eventWithAgenda && (
                        <div className="overview-preview-box">
                            <div className="overview-preview-box-header">
                                <h3 className="event-dashboard-card-header">
                                    <Icon icon="iconoir:eye-solid" />
                                    Event Preview
                                </h3>
                            </div>
                            <div className="overview-preview-box-body">
                                <EventPreview event={eventWithAgenda} onRefetch={onRefresh} />
                                <div className="overview-preview-actions">
                                    <button type="button" className="event-preview-action" onClick={handleCopyLink} title="Copy event link">
                                        <Icon icon="mdi:link" />
                                        <span>Copy link</span>
                                    </button>
                                    {onTabChange && (
                                        <>
                                            <button type="button" className="event-preview-action" onClick={() => onTabChange('registrations')} title="View registrations">
                                                <Icon icon="mdi:clipboard-list-outline" />
                                                <span>Registrations</span>
                                            </button>
                                            {!operatorOrganizerMode && (
                                                <button type="button" className="event-preview-action" onClick={() => onTabChange('checkin')} title="Check-in management">
                                                    <Icon icon="uil:qrcode-scan" />
                                                    <span>Check-in</span>
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                    {event && (
                        <div className="overview-chart-box">
                            <div className="overview-chart-box-header">
                                <h3 className="event-dashboard-card-header">
                                    <Icon icon="mdi:chart-line" />
                                    Registration Chart
                                </h3>
                            </div>
                            <div className="overview-chart-box-body">
                                <RSVPGrowthChart
                                    eventId={event._id}
                                    orgId={orgId}
                                    expectedAttendance={expectedAttendance}
                                    registrationCount={registrationCount}
                                    rsvpGrowthUrlOverride={rsvpGrowthUrlOverride}
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}
            {isEventPassed && (!operatorOrganizerMode || orgId) && (
                <div className="overview-layout">
                    <div className="overview-left-column">
                        {event?.feedbackFormId ? (
                            <div className="overview-card">
                                <h3 className="event-dashboard-card-header">
                                    <Icon icon="mdi:message-star-outline" />
                                    Attendee Feedback
                                </h3>
                                <FeedbackSlide
                                    orgId={orgId}
                                    eventId={event?._id}
                                    event={event}
                                    onRefresh={onRefresh}
                                    embedded={true}
                                    resultsOnly={true}
                                />
                            </div>
                        ) : !operatorOrganizerMode ? (
                            <div className="overview-feedback-prompt">
                                <div className="overview-feedback-prompt__content">
                                    <Icon icon="mdi:message-star-outline" className="overview-feedback-prompt__icon" />
                                    <div className="overview-feedback-prompt__text">
                                        <h3>Collect attendee feedback</h3>
                                        <p>Create a customizable form to collect ratings and feedback from your attendees. You can send it via email or share a link.</p>
                                    </div>
                                    <button
                                        type="button"
                                        className="overview-feedback-prompt__btn"
                                        onClick={() => setShowFeedbackFormConfig(true)}
                                    >
                                        <Icon icon="mdi:plus" />
                                        Set up feedback form
                                    </button>
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            )}

            {showScheduleCalendar && (
                <div className="overview-schedule-section">
                    <h3 className="event-dashboard-card-header">
                        <Icon icon="mdi:calendar-clock" />
                        Schedule
                    </h3>
                    <AgendaDailyCalendar
                        agendaItems={agendaItemsWithTimes}
                        event={event}
                        minuteHeight={2}
                    />
                </div>
            )}

        </div>
    );
}

export default EventOverview;
