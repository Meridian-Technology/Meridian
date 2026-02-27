import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../../hooks/useFetch';
import { useNotification } from '../../../../../NotificationContext';
import RSVPGrowthChart from './RSVPGrowthChart';
import AgendaDailyCalendar from './EventAgendaBuilder/AgendaDailyCalendar/AgendaDailyCalendar';
import EventPreview from './EventPreview';
import './EventDashboard.scss';

function EventOverview({ event, stats, agenda, roles: rolesSummary, equipment, orgId, onRefresh, onTabChange }) {
    const { addNotification } = useNotification();
    const [rolesData, setRolesData] = useState([]);
    
    // Fetch full roles data to check job fill status
    const { data: rolesResponse } = useFetch(
        event?._id && orgId ? `/org-event-management/${orgId}/events/${event._id}/roles` : null
    );

    useEffect(() => {
        if (rolesResponse?.success) {
            setRolesData(rolesResponse.data.roles || []);
        }
    }, [rolesResponse]);

    // Calculate jobs filled status
    const calculateJobsFilled = () => {
        if (rolesData.length === 0) return { ready: false, filled: 0, required: 0 };
        
        let totalRequired = 0;
        let totalFilled = 0;
        
        rolesData.forEach(role => {
            const required = role.requiredCount || 0;
            const confirmed = role.assignments?.filter(a => a.status === 'confirmed').length || 0;
            totalRequired += required;
            totalFilled += confirmed;
        });
        
        return {
            ready: totalRequired > 0 && totalFilled >= totalRequired,
            filled: totalFilled,
            required: totalRequired
        };
    };

    const jobsStatus = calculateJobsFilled();
    const jobsPercentage = jobsStatus.required > 0 
        ? Math.round((jobsStatus.filled / jobsStatus.required) * 100) 
        : 0;
    const jobsLowCoverage = jobsPercentage < 50;

    // Readiness checks
    const readinessChecks = [
        {
            id: 'agenda',
            label: 'Agenda Published',
            description: agenda?.isPublished 
                ? 'Agenda is published and ready' 
                : 'Agenda has pending changes - click Publish to make them publicly available',
            ready: agenda?.isPublished || false
        },
        {
            id: 'jobs',
            label: 'Jobs Filled',
            description: jobsStatus.required > 0 
                ? `${jobsStatus.filled} of ${jobsStatus.required} positions filled`
                : 'No jobs defined',
            ready: jobsStatus.ready,
            showProgress: jobsStatus.required > 0,
            progressData: {
                filled: jobsStatus.filled,
                required: jobsStatus.required,
                percentage: jobsPercentage,
                lowCoverage: jobsLowCoverage
            }
        },
        {
            id: 'published',
            label: 'Event Published',
            description: 'Event is publicly visible',
            // ready: event?.status === 'published' || event?.status === 'approved'
            ready: true
        }
    ];

    const readyCount = readinessChecks.filter(check => check.ready).length;
    const totalChecks = readinessChecks.length;

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
                    <button type="button" className="event-preview-action" onClick={() => onTabChange('edit')} title="Edit event details">
                        <Icon icon="mdi:pencil" />
                        <span>Edit event</span>
                    </button>
                    <button type="button" className="event-preview-action" onClick={() => onTabChange('registrations')} title="View registrations">
                        <Icon icon="mdi:clipboard-list-outline" />
                        <span>Registrations</span>
                    </button>
                    <button type="button" className="event-preview-action" onClick={() => onTabChange('checkin')} title="Check-in management">
                        <Icon icon="uil:qrcode-scan" />
                        <span>Check-in</span>
                    </button>
                </>
            )}
        </div>
    );

    return (
        <div className="event-overview">
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
                                            <button type="button" className="event-preview-action" onClick={() => onTabChange('checkin')} title="Check-in management">
                                                <Icon icon="uil:qrcode-scan" />
                                                <span>Check-in</span>
                                            </button>
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
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}
            <div className="overview-layout">
                {/* Left Column: Readiness (1/3 width) */}
                <div className="overview-left-column">
                    <div className="overview-card readiness-card">
                        <h3 className="event-dashboard-card-header">
                            <Icon icon="mdi:clipboard-check-outline" />
                            Event Readiness
                            <span className="readiness-count">{readyCount}/{totalChecks}</span>
                        </h3>
                        <div className="readiness-list">
                            {readinessChecks.map(check => (
                                <div key={check.id} className={`readiness-item ${check.ready ? 'ready' : 'pending'} ${check.progressData?.lowCoverage ? 'low-coverage' : ''}`}>
                                    <Icon icon={check.ready ? 'mdi:check-circle' : 'mdi:alert-circle-outline'} />
                                    <div className="readiness-content">
                                        <div className="readiness-header">
                                            <span className="readiness-label">{check.label}</span>
                                            {check.showProgress && check.progressData && (
                                                <span className="readiness-stats">
                                                    {check.progressData.filled} / {check.progressData.required} ({check.progressData.percentage}%)
                                                </span>
                                            )}
                                        </div>
                                        <span className="readiness-description">{check.description}</span>
                                        {check.showProgress && check.progressData && (
                                            <div className="readiness-progress">
                                                <div className="readiness-progress-bar">
                                                    <div 
                                                        className={`readiness-progress-fill ${check.progressData.lowCoverage ? 'low' : ''}`}
                                                        style={{ width: `${Math.min(check.progressData.percentage, 100)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

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
