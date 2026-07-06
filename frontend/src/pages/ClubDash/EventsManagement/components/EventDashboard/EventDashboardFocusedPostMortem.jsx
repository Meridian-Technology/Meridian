import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../../hooks/useFetch';
import TabbedContainer from '../../../../../components/TabbedContainer/TabbedContainer';
import FeedbackSlide from '../EventPostMortem/slides/FeedbackSlide';
import RegistrationsTab from './RegistrationsTab/RegistrationsTab';
import EventDashboardFocusedPostMortemOutcomes from './EventDashboardFocusedPostMortemOutcomes';
import { useGradient } from '../../../../../hooks/useGradient';
import './EventDashboardFocusedPostMortem.scss';

function formatNumber(value) {
    return new Intl.NumberFormat('en-US').format(Number(value) || 0);
}

function formatDateRangeLabel(startAt, endAt) {
    if (!startAt) return 'Date TBD';
    const start = new Date(startAt);
    const end = endAt ? new Date(endAt) : null;
    const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (!end) return startLabel;
    const endLabel = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (startLabel === endLabel) return startLabel;
    return `${startLabel} - ${endLabel}`;
}

function EventDashboardFocusedPostMortem({
    dashboardData,
    fallbackEvent,
    orgId,
    onClose,
    onRefresh,
    isDashboardLoading = false,
    dashboardLoadError = false
}) {
    const { AtlasMain } = useGradient();
    const [headerCondensed, setHeaderCondensed] = useState(false);
    const postMortemRef = useRef(null);
    const heroRef = useRef(null);
    const [tabsStickyTop, setTabsStickyTop] = useState(0);

    const postMortemSummary = useMemo(() => {
        const eventData = dashboardData?.event || fallbackEvent;
        const stats = dashboardData?.stats || {};
        const expectedAttendance = Number(eventData?.expectedAttendance) || 0;

        return {
            eventData,
            stats,
            expectedAttendance,
            uniqueViewers: stats?.views?.unique ?? stats?.analytics?.uniqueViews ?? 0,
            formOpens: stats?.registrations?.formOpens ?? stats?.analytics?.formOpens ?? 0,
            referrerSources: stats?.traffic?.referrerSources || stats?.analytics?.referrerSources,
            referrerRegistrations: stats?.traffic?.referrerRegistrations || stats?.analytics?.referrerRegistrations,
            qrReferrerSources: stats?.traffic?.qrReferrerSources || stats?.analytics?.qrReferrerSources,
            rsvpGrowth: stats?.rsvpGrowth || stats?.analytics?.rsvpGrowth
        };
    }, [dashboardData, fallbackEvent]);
    const eventId = postMortemSummary.eventData?._id;
    const timezone = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;
    const analyticsUrl = eventId ? `/event-analytics/event/${eventId}?timeRange=90d` : null;
    const rsvpGrowthUrl = eventId && orgId && timezone
        ? `/org-event-management/${orgId}/events/${eventId}/rsvp-growth?timezone=${encodeURIComponent(timezone)}`
        : null;
    const registrationResponsesUrl = eventId && orgId
        ? `/org-event-management/${orgId}/events/${eventId}/registration-responses`
        : null;

    const { data: analyticsData } = useFetch(analyticsUrl);
    const { data: rsvpGrowthData } = useFetch(rsvpGrowthUrl);

    const analytics = analyticsData?.success ? analyticsData.data : null;
    const rsvpGrowth = rsvpGrowthData?.success ? rsvpGrowthData.data : null;
    const platform = analytics?.platform || {};

    const actualRegistrations = postMortemSummary.stats?.registrationCount
        ?? platform?.registrations
        ?? platform?.uniqueRegistrations
        ?? analytics?.registrations
        ?? analytics?.uniqueRegistrations
        ?? 0;

    const actualCheckIns = postMortemSummary.stats?.checkIn?.totalCheckedIn
        ?? platform?.checkins
        ?? platform?.uniqueCheckins
        ?? 0;

    const uniqueViewsTotal = (analytics?.uniqueViews || 0) + (analytics?.uniqueAnonymousViews || 0);
    const uniqueViewersForConversion = (platform?.uniqueEventViews || 0) > 0 ? platform.uniqueEventViews : uniqueViewsTotal;
    const registrationsForConversion = (platform?.uniqueRegistrations || 0) > 0 ? platform.uniqueRegistrations : actualRegistrations;
    const hasCheckInTracking = postMortemSummary.stats?.checkIn?.totalCheckedIn != null
        || platform?.checkins != null
        || platform?.uniqueCheckins != null;
    const canonicalMetrics = useMemo(() => {
        const registrations = Number(actualRegistrations) || 0;
        const checkIns = hasCheckInTracking ? (Number(actualCheckIns) || 0) : 0;
        const showRate = hasCheckInTracking && registrations > 0
            ? (checkIns / registrations) * 100
            : null;
        const noShows = hasCheckInTracking
            ? Math.max(registrations - checkIns, 0)
            : null;
        const expectedAttendance = Number(postMortemSummary.expectedAttendance) || 0;
        const expectedVariance = expectedAttendance > 0
            ? (((registrations - expectedAttendance) / expectedAttendance) * 100)
            : null;
        const conversionRate = uniqueViewersForConversion > 0
            ? (registrationsForConversion / uniqueViewersForConversion) * 100
            : null;

        return {
            registrations,
            checkIns,
            showRate,
            noShows,
            expectedAttendance,
            expectedVariance,
            conversionRate,
            hasCheckInTracking
        };
    }, [actualCheckIns, actualRegistrations, hasCheckInTracking, postMortemSummary.expectedAttendance, registrationsForConversion, uniqueViewersForConversion]);

    const funnelData = useMemo(() => {
        const steps = [{ label: 'Unique viewers', value: uniqueViewersForConversion }];
        if (postMortemSummary.eventData?.registrationFormId) {
            steps.push({ label: 'Opened form', value: platform?.uniqueFormOpens || 0 });
        }
        steps.push({ label: 'Registrations', value: canonicalMetrics.registrations });
        if (canonicalMetrics.hasCheckInTracking) {
            steps.push({ label: 'Check-ins', value: canonicalMetrics.checkIns });
        }
        return steps;
    }, [canonicalMetrics.checkIns, canonicalMetrics.hasCheckInTracking, canonicalMetrics.registrations, platform?.uniqueFormOpens, postMortemSummary.eventData?.registrationFormId, uniqueViewersForConversion]);

    const outcomesLoading = analyticsData === undefined || rsvpGrowthData === undefined;
    const outcomesHasError = analyticsData?.success === false || rsvpGrowthData?.success === false;

    const postMortemTabs = useMemo(() => {
        const outcomesContent = (
            <div className="event-dashboard-focused__pm-tab event-dashboard-focused__pm-tab--outcomes">
                {outcomesLoading ? (
                    <div className="event-dashboard-focused__pm-loading">
                        <Icon icon="mdi:loading" className="spinner" />
                        <p>Loading post-mortem analytics...</p>
                    </div>
                ) : outcomesHasError ? (
                    <div className="event-dashboard-focused__pm-error">
                        <Icon icon="mdi:alert-circle-outline" />
                        <p>Unable to load full post-mortem analytics data.</p>
                    </div>
                ) : (
                    <div className="event-dashboard-focused__pm-outcomes-full">
                        <EventDashboardFocusedPostMortemOutcomes
                            event={postMortemSummary.eventData}
                            metrics={canonicalMetrics}
                            registrationsForConversion={registrationsForConversion}
                            uniqueViewersForConversion={uniqueViewersForConversion}
                            rsvpGrowth={rsvpGrowth}
                            funnelData={funnelData}
                            platform={platform}
                            formatNumber={formatNumber}
                        />
                    </div>
                )}
            </div>
        );

        const peopleContent = (
            <div className="event-dashboard-focused__pm-tab event-dashboard-focused__pm-tab--people">
                <section className="event-dashboard-focused__pm-feedback">
                    {postMortemSummary.eventData?.feedbackFormId ? (
                        <FeedbackSlide
                            orgId={orgId}
                            eventId={postMortemSummary.eventData?._id}
                            event={postMortemSummary.eventData}
                            onRefresh={onRefresh}
                            embedded
                            resultsOnly
                        />
                    ) : (
                        <p className="event-dashboard-focused__pm-empty">
                            No attendee feedback form was set up for this event.
                        </p>
                    )}
                </section>
                <section className="event-dashboard-focused__pm-registrants">
                    <RegistrationsTab
                        event={postMortemSummary.eventData}
                        orgId={orgId}
                        onRefresh={onRefresh}
                        color="var(--primary-color)"
                        readOnly
                        registrationResponsesUrl={registrationResponsesUrl}
                    />
                </section>
            </div>
        );

        const detailsContent = (
            <div className="event-dashboard-focused__pm-tab event-dashboard-focused__pm-tab--details">
                <section className="event-dashboard-focused__pm-details-grid">
                    <article className="event-dashboard-focused__pm-detail-card">
                        <h3>Event Details</h3>
                        <p><span>Name</span><strong>{postMortemSummary.eventData?.name || 'Event'}</strong></p>
                        <p><span>Status</span><strong>{postMortemSummary.eventData?.status || 'n/a'}</strong></p>
                        <p><span>Location</span><strong>{postMortemSummary.eventData?.location || 'TBD'}</strong></p>
                    </article>
                    <article className="event-dashboard-focused__pm-detail-card">
                        <h3>Planning Targets</h3>
                        <p><span>Expected Attendance</span><strong>{canonicalMetrics.expectedAttendance ? formatNumber(canonicalMetrics.expectedAttendance) : 'n/a'}</strong></p>
                        <p><span>Variance</span><strong>{canonicalMetrics.expectedVariance != null ? `${canonicalMetrics.expectedVariance >= 0 ? '+' : ''}${canonicalMetrics.expectedVariance.toFixed(0)}%` : 'n/a'}</strong></p>
                        <p><span>Attendance Tracking</span><strong>{canonicalMetrics.hasCheckInTracking ? 'Captured' : 'Not captured'}</strong></p>
                    </article>
                    <article className="event-dashboard-focused__pm-detail-card">
                        <h3>Operational Snapshot</h3>
                        <p><span>Operational Status</span><strong>{postMortemSummary.stats?.operationalStatus || 'n/a'}</strong></p>
                        <p><span>Workflow Phase</span><strong>Post Mortem</strong></p>
                        <p><span>Host</span><strong>{postMortemSummary.eventData?.hostingId?.org_name || 'n/a'}</strong></p>
                    </article>
                </section>
            </div>
        );

        return [
            { id: 'outcomes', label: 'Outcomes', icon: 'mdi:chart-line', content: outcomesContent },
            { id: 'people', label: 'People', icon: 'mdi:account-group-outline', content: peopleContent },
            { id: 'details', label: 'Details', icon: 'mdi:file-document-outline', content: detailsContent }
        ];
    }, [canonicalMetrics, eventId, funnelData, onRefresh, orgId, outcomesHasError, outcomesLoading, platform, postMortemSummary, registrationResponsesUrl, registrationsForConversion, rsvpGrowth, uniqueViewersForConversion]);

    const handlePostMortemScroll = useCallback((e) => {
        const condensed = e.currentTarget.scrollTop > 56;
        setHeaderCondensed((prev) => (prev === condensed ? prev : condensed));
    }, []);

    const handlePostMortemTabChange = useCallback(() => {
        requestAnimationFrame(() => {
            const root = postMortemRef.current;
            if (!root) return;
            root.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }, []);

    const effectiveTabsStickyTop = Math.max(0, tabsStickyTop - 8);

    useEffect(() => {
        const heroElement = heroRef.current;
        if (!heroElement) return undefined;

        const updateStickyTop = () => {
            const next = Math.max(0, Math.ceil(heroElement.getBoundingClientRect().height));
            setTabsStickyTop((prev) => (prev === next ? prev : next));
        };

        updateStickyTop();

        const observer = new ResizeObserver(updateStickyTop);
        observer.observe(heroElement);
        window.addEventListener('resize', updateStickyTop);

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updateStickyTop);
        };
    }, [headerCondensed]);

    return (
        <div
            ref={postMortemRef}
            className={`event-dashboard-focused__post-mortem${headerCondensed ? ' event-dashboard-focused__post-mortem--condensed' : ''}`}
            onScroll={handlePostMortemScroll}
            style={{ '--pm-tabs-sticky-top': `${effectiveTabsStickyTop}px` }}
        >
            <div className="event-dashboard-focused__post-mortem-background">
                <img src={AtlasMain} alt="" />
            </div>
            <div className="event-dashboard-focused__post-mortem-content">
                <div className="event-dashboard-focused__post-mortem-hero" ref={heroRef}>
                    <div className="event-dashboard-focused__post-mortem-hero-main">
                        <header className="event-dashboard-focused__post-mortem-header">
                            <div className="event-dashboard-focused__post-mortem-header-top">
                                <button
                                    type="button"
                                    className="event-dashboard-focused__post-mortem-close"
                                    onClick={onClose}
                                    aria-label="Close post-mortem workspace"
                                >
                                    <Icon icon="mdi:close" />
                                </button>
                            </div>
                            <div className="event-dashboard-focused__post-mortem-heading">
                                <p>Retrospective</p>
                                <h2>{(postMortemSummary.eventData?.name || 'Event').toUpperCase()}</h2>
                                <h1>
                                    {canonicalMetrics.hasCheckInTracking
                                        ? `${formatNumber(canonicalMetrics.checkIns)} attendees showed up.`
                                        : `${formatNumber(canonicalMetrics.registrations)} people registered interest.`}
                                </h1>
                            </div>
                        </header>
                        <div className="event-dashboard-focused__post-mortem-intro">
                            <p>
                                <strong>{postMortemSummary.eventData?.name || 'This event'}</strong> ran with{' '}
                                <strong>{formatNumber(canonicalMetrics.registrations)} registrations</strong>
                                {canonicalMetrics.hasCheckInTracking && canonicalMetrics.showRate != null ? (
                                    <> and a <strong>{canonicalMetrics.showRate.toFixed(1)}% show rate</strong>.</>
                                ) : (
                                    <>. Attendance was not tracked for this event.</>
                                )}
                            </p>
                            <div className="event-dashboard-focused__post-mortem-meta">
                                <span>
                                    <Icon icon="mdi:calendar-blank-outline" />
                                    {formatDateRangeLabel(postMortemSummary.eventData?.start_time, postMortemSummary.eventData?.end_time)}
                                </span>
                                <span>
                                    <Icon icon="fluent:location-28-filled" />
                                    {postMortemSummary.eventData?.location || 'Location TBD'}
                                </span>
                                {canonicalMetrics.expectedVariance != null && (
                                    <span>
                                        <Icon icon="mdi:trending-up" />
                                        {canonicalMetrics.expectedVariance >= 0 ? '+' : ''}
                                        {canonicalMetrics.expectedVariance.toFixed(0)}% vs expected
                                    </span>
                                )}
                                {!canonicalMetrics.hasCheckInTracking && (
                                    <span>
                                        <Icon icon="mdi:information-outline" />
                                        Attendance not captured
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <aside className="event-dashboard-focused__post-mortem-poster">
                        {postMortemSummary.eventData?.image || postMortemSummary.eventData?.previewImage ? (
                            <>
                                <img
                                    src={postMortemSummary.eventData?.image || postMortemSummary.eventData?.previewImage}
                                    alt={postMortemSummary.eventData?.name ? `${postMortemSummary.eventData.name} event poster` : 'Event poster'}
                                />
                                {/* <div className="event-dashboard-focused__post-mortem-poster-caption">
                                    <p>{postMortemSummary.eventData?.name || 'Event'}</p>
                                    <span>{formatDateRangeLabel(postMortemSummary.eventData?.start_time, postMortemSummary.eventData?.end_time)}</span>
                                </div> */}
                            </>
                        ) : (
                            <div className="event-dashboard-focused__post-mortem-poster-fallback">
                                <p>{postMortemSummary.eventData?.name || 'Event'}</p>
                                <span>Poster unavailable</span>
                            </div>
                        )}
                    </aside>
                </div>

                <section className="event-dashboard-focused__post-mortem-main">
                    {isDashboardLoading && (
                        <div className="event-dashboard-focused__post-mortem-inline-loading" role="status" aria-live="polite">
                            <Icon icon="mdi:loading" className="spinner" />
                            <p>Loading post-mortem workspace...</p>
                        </div>
                    )}
                    {dashboardLoadError && (
                        <div className="event-dashboard-focused__post-mortem-inline-error" role="status">
                            <Icon icon="mdi:alert-circle-outline" />
                            <p>Some dashboard data failed to load. Showing available post-mortem data.</p>
                        </div>
                    )}
                    <TabbedContainer
                        tabs={postMortemTabs}
                        defaultTab="outcomes"
                        tabStyle="underline"
                        size="large"
                        className="event-dashboard-focused__post-mortem-tabs"
                        animated={false}
                        keepAlive
                        scrollable={false}
                        onTabChange={handlePostMortemTabChange}
                        stickyTabs
                    />
                </section>
            </div>
        </div>
    );
}

export default EventDashboardFocusedPostMortem;
