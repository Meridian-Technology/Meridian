import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../../hooks/useFetch';
import { useNotification } from '../../../../../NotificationContext';
import { analytics as analyticsService } from '../../../../../services/analytics/analytics';
import PostMortemPdfContent from './PostMortemPdfContent';
import ExportSlide from './slides/ExportSlide';
import './EventPostMortem.scss';
import './PostMortemPdfContent.scss';

function EventPostMortem({ event, orgId, onClose }) {
    const { addNotification } = useNotification();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const eventId = event?._id;
    const timezone = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;

    const dashboardUrl = eventId && orgId ? `/org-event-management/${orgId}/events/${eventId}/dashboard` : null;
    const analyticsUrl = eventId ? `/event-analytics/event/${eventId}?timeRange=90d` : null;
    const rsvpGrowthUrl = eventId && orgId && timezone
        ? `/org-event-management/${orgId}/events/${eventId}/rsvp-growth?timezone=${encodeURIComponent(timezone)}`
        : null;

    const { data: dashboardData, refetch: refetchDashboard } = useFetch(dashboardUrl);
    const { data: analyticsData } = useFetch(analyticsUrl);
    const { data: rsvpGrowthData } = useFetch(rsvpGrowthUrl);

    const isReady = dashboardData !== undefined && analyticsData !== undefined && rsvpGrowthData !== undefined;

    React.useEffect(() => {
        if (!isReady) return;
        if (dashboardData?.success && (analyticsData?.success !== false) && (rsvpGrowthData?.success !== false)) {
            setLoading(false);
        } else if (dashboardData && !dashboardData.success) {
            setError('Failed to load event data');
            setLoading(false);
        } else if (dashboardData && analyticsData && rsvpGrowthData) {
            setLoading(false);
        }
    }, [isReady, dashboardData, analyticsData, rsvpGrowthData]);

    useEffect(() => {
        if (!loading && !error && eventId && orgId && analyticsService?.track) {
            analyticsService.track('post_mortem_view', { event_id: eventId, org_id: orgId, source: 'overlay' });
        }
    }, [loading, error, eventId, orgId]);

    const dashboard = dashboardData?.success ? dashboardData.data : null;
    const analytics = analyticsData?.success ? analyticsData.data : null;
    const rsvpGrowth = rsvpGrowthData?.success ? rsvpGrowthData.data : null;

    const eventData = dashboard?.event || event;
    const stats = dashboard?.stats || {};
    const platform = analytics?.platform || {};

    const actualRegistrations = stats?.registrationCount ?? platform?.registrations ?? platform?.uniqueRegistrations ?? analytics?.registrations ?? analytics?.uniqueRegistrations ?? 0;
    const actualCheckIns = stats?.checkIn?.totalCheckedIn ?? platform?.checkins ?? platform?.uniqueCheckins ?? 0;
    const uniqueViewsTotal = (analytics?.uniqueViews || 0) + (analytics?.uniqueAnonymousViews || 0);
    const uniqueViewersForConversion = (platform?.uniqueEventViews || 0) > 0 ? platform.uniqueEventViews : uniqueViewsTotal;
    const registrationsForConversion = (platform?.uniqueRegistrations || 0) > 0 ? platform.uniqueRegistrations : actualRegistrations;

    const funnelData = useMemo(() => {
        const uniqueViews = uniqueViewersForConversion;
        const steps = [{ label: 'Unique viewers', value: uniqueViews }];
        if (eventData?.registrationFormId) {
            steps.push({ label: 'Opened form', value: platform?.uniqueFormOpens || 0 });
        }
        steps.push(
            { label: 'Registrations', value: actualRegistrations },
            { label: 'Check-ins', value: actualCheckIns }
        );
        return steps;
    }, [uniqueViewersForConversion, eventData?.registrationFormId, platform?.uniqueFormOpens, actualRegistrations, actualCheckIns]);

    const formatNumber = (n) => new Intl.NumberFormat().format(n);
    const pdfContentRef = useRef(null);

    if (loading) {
        return (
            <div className="event-post-mortem event-post-mortem-loading">
                <button className="event-post-mortem__close" onClick={onClose} aria-label="Close">
                    <Icon icon="mdi:close" />
                </button>
                <div className="event-post-mortem__loading-content">
                    <Icon icon="mdi:loading" className="spinner" />
                    <p>Loading post-mortem...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="event-post-mortem event-post-mortem-error">
                <button className="event-post-mortem__close" onClick={onClose} aria-label="Close">
                    <Icon icon="mdi:close" />
                </button>
                <div className="event-post-mortem__error-content">
                    <Icon icon="mdi:alert-circle" />
                    <p>{error}</p>
                    <button className="event-post-mortem__retry" onClick={() => window.location.reload()}>
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="event-post-mortem">
            <button className="event-post-mortem__close" onClick={onClose} aria-label="Close">
                <Icon icon="mdi:close" />
            </button>
            <div className="event-post-mortem__scroll">
                <div className="event-post-mortem__content">
                    <div className="event-post-mortem__page-breaks" aria-hidden="true" />
                    <div className="event-post-mortem__pdf-content">
                        <PostMortemPdfContent
                            event={eventData}
                            stats={stats}
                            eventId={eventId}
                            orgId={orgId}
                            rsvpGrowth={rsvpGrowth}
                            funnelData={funnelData}
                            platform={platform}
                            actualRegistrations={actualRegistrations}
                            registrationsForConversion={registrationsForConversion}
                            actualCheckIns={actualCheckIns}
                            uniqueViewersForConversion={uniqueViewersForConversion}
                            formatNumber={formatNumber}
                            forExport={false}
                            onRefresh={refetchDashboard}
                        />
                    </div>
                    <div
                        ref={pdfContentRef}
                        className="event-post-mortem__pdf-capture"
                        aria-hidden="true"
                    >
                        <PostMortemPdfContent
                            event={eventData}
                            stats={stats}
                            eventId={eventId}
                            orgId={orgId}
                            rsvpGrowth={rsvpGrowth}
                            funnelData={funnelData}
                            platform={platform}
                            actualRegistrations={actualRegistrations}
                            registrationsForConversion={registrationsForConversion}
                            actualCheckIns={actualCheckIns}
                            uniqueViewersForConversion={uniqueViewersForConversion}
                            formatNumber={formatNumber}
                            forExport={true}
                        />
                    </div>
                    <div className="event-post-mortem__export-section">
                        <ExportSlide
                            event={eventData}
                            stats={stats}
                            analytics={analytics}
                            rsvpGrowth={rsvpGrowth}
                            funnelData={funnelData}
                            platform={platform}
                            eventId={eventId}
                            orgId={orgId}
                            actualRegistrations={actualRegistrations}
                            registrationsForConversion={registrationsForConversion}
                        actualCheckIns={actualCheckIns}
                        uniqueViewersForConversion={uniqueViewersForConversion}
                        onClose={onClose}
                        addNotification={addNotification}
                        formatNumber={formatNumber}
                        pdfContentRef={pdfContentRef}
                    />
                    </div>
                </div>
            </div>
        </div>
    );
}

export default EventPostMortem;
