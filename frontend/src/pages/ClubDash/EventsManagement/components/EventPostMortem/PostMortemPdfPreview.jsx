import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../../hooks/useFetch';
import { analytics as analyticsService } from '../../../../../services/analytics/analytics';
import PostMortemPdfContent from './PostMortemPdfContent';
import './PostMortemPdfPreview.scss';

/**
 * Standalone page that renders the exact content captured for PDF export.
 * Use this to view and style the PDF layout: /post-mortem-preview/:orgId/:eventId
 */
function PostMortemPdfPreview() {
    const { orgId, eventId } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const timezone = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;

    const dashboardUrl = eventId && orgId ? `/org-event-management/${orgId}/events/${eventId}/dashboard` : null;
    const analyticsUrl = eventId ? `/event-analytics/event/${eventId}?timeRange=90d` : null;
    const rsvpGrowthUrl = eventId && orgId && timezone
        ? `/org-event-management/${orgId}/events/${eventId}/rsvp-growth?timezone=${encodeURIComponent(timezone)}`
        : null;

    const { data: dashboardData } = useFetch(dashboardUrl);
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
            analyticsService.track('post_mortem_view', { event_id: eventId, org_id: orgId, source: 'pdf_preview' });
        }
    }, [loading, error, eventId, orgId]);

    const dashboard = dashboardData?.success ? dashboardData.data : null;
    const analytics = analyticsData?.success ? analyticsData.data : null;
    const rsvpGrowth = rsvpGrowthData?.success ? rsvpGrowthData.data : null;

    const eventData = dashboard?.event || {};
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

    if (loading) {
        return (
            <div className="post-mortem-preview-page post-mortem-preview-loading">
                <div className="post-mortem-preview__loading">
                    <Icon icon="mdi:loading" className="spinner" />
                    <p>Loading...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="post-mortem-preview-page post-mortem-preview-error">
                <div className="post-mortem-preview__error">
                    <Icon icon="mdi:alert-circle" />
                    <p>{error}</p>
                    <button onClick={() => navigate(-1)}>Go back</button>
                </div>
            </div>
        );
    }

    return (
        <div className="post-mortem-preview-page">
            <div className="post-mortem-preview__toolbar">
                <button
                    type="button"
                    className="post-mortem-preview__back"
                    onClick={() => navigate(-1)}
                >
                    <Icon icon="mdi:arrow-left" />
                    Back
                </button>
                <span className="post-mortem-preview__hint">
                    This is the exact content captured for PDF export. Edit PostMortemPdfContent.scss to style it.
                </span>
            </div>
            <div className="post-mortem-preview__content">
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
        </div>
    );
}

export default PostMortemPdfPreview;
