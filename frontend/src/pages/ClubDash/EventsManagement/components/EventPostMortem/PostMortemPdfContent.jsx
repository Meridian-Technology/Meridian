import React from 'react';
import { PdfExportProvider } from '../../../../../contexts/PdfExportContext';
import OverviewSlide from './slides/OverviewSlide';
import RegistrationTrendsSlide from './slides/RegistrationTrendsSlide';
import FunnelSlide from './slides/FunnelSlide';
import ConversionStatsSlide from './slides/ConversionStatsSlide';
import TrafficSourcesSlide from './slides/TrafficSourcesSlide';
import InsightsSlide from './slides/InsightsSlide';
import FeedbackSlide from './slides/FeedbackSlide';
import { usePostMortemInsights, INSIGHT_CATEGORIES } from './usePostMortemInsights';
import AtlasLogo from '../../../../../assets/Brand Image/ATLAS.svg';
import './EventPostMortem.scss';
import './PostMortemPdfContent.scss';

/**
 * Renders post-mortem content.
 * When forExport=true: report-style layout with Meridian Atlas branding (for PDF capture).
 * When forExport=false: original UI styling (what the user sees on screen).
 */
function PostMortemPdfContent({
    event,
    stats,
    eventId,
    orgId,
    rsvpGrowth,
    funnelData,
    platform,
    actualRegistrations,
    registrationsForConversion,
    actualCheckIns,
    uniqueViewersForConversion,
    formatNumber,
    forExport = false,
    onRefresh
}) {
    const eventData = event;
    const formatDate = (d) => (d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '');

    const { all: allInsights, byCategory: insightsByCategory } = usePostMortemInsights({
        registrations: actualRegistrations,
        checkIns: actualCheckIns,
        uniqueViewers: uniqueViewersForConversion,
        rsvpGrowth,
        referrerSources: platform?.referrerSources,
        referrerRegistrations: platform?.referrerRegistrations,
        qrReferrerSources: platform?.qrReferrerSources,
        formOpens: platform?.uniqueFormOpens,
        hasForm: !!eventData?.registrationFormId,
        formatNumber,
        expectedAttendance: eventData?.expectedAttendance ?? 0,
    });

    return (
        <PdfExportProvider forExport={forExport}>
        <div className={`post-mortem-pdf-export${forExport ? ' pdf-report' : ''}`}>
            {forExport && (
                <header className="pdf-report__header" data-pdf-no-split>
                    <img src={AtlasLogo} alt="Meridian Atlas" className="pdf-report__logo" />
                    <div className="pdf-report__header-text">
                        <h1 className="pdf-report__title">Event Performance Report</h1>
                        <p className="pdf-report__subtitle">
                            {eventData?.name || 'Event'}
                            {eventData?.hostingId?.org_name && ` · ${eventData.hostingId.org_name}`}
                            {formatDate(eventData?.startTime || eventData?.start_time || eventData?.start) && ` · ${formatDate(eventData.startTime || eventData.start_time || eventData.start)}`}
                        </p>
                    </div>
                </header>
            )}
            <div className="pdf-page" data-pdf-no-split>
                <OverviewSlide
                    event={eventData}
                    stats={stats}
                    orgId={orgId}
                    formatNumber={formatNumber}
                    forExport={forExport}
                    inlineInsights={[
                        insightsByCategory[INSIGHT_CATEGORIES.expectedVsActual],
                        insightsByCategory[INSIGHT_CATEGORIES.checkIn],
                    ].filter(Boolean)}
                />
            </div>
            <div className="pdf-page" data-pdf-no-split>
                <RegistrationTrendsSlide
                    eventId={eventId}
                    orgId={orgId}
                    rsvpGrowth={rsvpGrowth}
                    registrationCount={actualRegistrations}
                    expectedAttendance={eventData?.expectedAttendance}
                    eventStartTime={eventData?.startTime || eventData?.start_time || eventData?.start}
                    formatNumber={formatNumber}
                    inlineInsights={insightsByCategory[INSIGHT_CATEGORIES.registrationTrends]}
                />
            </div>
            <div className="pdf-page" data-pdf-no-split>
                <FunnelSlide funnelData={funnelData} />
            </div>
            <div className="pdf-page" data-pdf-no-split>
                <ConversionStatsSlide
                    uniqueViewers={uniqueViewersForConversion}
                    registrations={registrationsForConversion}
                    checkIns={actualCheckIns}
                    formOpens={platform?.uniqueFormOpens}
                    hasForm={!!eventData?.registrationFormId}
                    formatNumber={formatNumber}
                    inlineInsights={[
                        insightsByCategory[INSIGHT_CATEGORIES.conversion],
                        insightsByCategory[INSIGHT_CATEGORIES.formCompletion],
                        insightsByCategory[INSIGHT_CATEGORIES.funnelBottleneck],
                    ].filter(Boolean)}
                />
            </div>
            <div className="pdf-page" data-pdf-no-split>
                <TrafficSourcesSlide
                    referrerSources={platform?.referrerSources}
                    referrerRegistrations={platform?.referrerRegistrations}
                    qrReferrerSources={platform?.qrReferrerSources}
                    formatNumber={formatNumber}
                    inlineInsights={[
                        insightsByCategory[INSIGHT_CATEGORIES.traffic],
                        insightsByCategory[INSIGHT_CATEGORIES.trafficInvestment],
                        ...(insightsByCategory[INSIGHT_CATEGORIES.strategic] || []),
                    ].filter(Boolean)}
                />
            </div>
            <div className="pdf-page" data-pdf-no-split>
                <FeedbackSlide
                    orgId={orgId}
                    eventId={eventId}
                    event={eventData}
                    forExport={forExport}
                    onRefresh={onRefresh}
                />
            </div>
            <div className="pdf-page" data-pdf-no-split>
                <InsightsSlide
                    registrations={actualRegistrations}
                    checkIns={actualCheckIns}
                    uniqueViewers={uniqueViewersForConversion}
                    rsvpGrowth={rsvpGrowth}
                    referrerSources={platform?.referrerSources}
                    formOpens={platform?.uniqueFormOpens}
                    hasForm={!!eventData?.registrationFormId}
                    formatNumber={formatNumber}
                    insights={allInsights}
                />
            </div>
            {forExport && (
                <footer className="pdf-report__footer" data-pdf-no-split>
                    Generated by Meridian Atlas · {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </footer>
            )}
        </div>
        </PdfExportProvider>
    );
}

export default PostMortemPdfContent;
