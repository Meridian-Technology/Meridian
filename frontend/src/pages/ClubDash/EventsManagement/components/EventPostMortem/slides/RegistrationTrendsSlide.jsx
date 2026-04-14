import React, { useMemo } from 'react';
import { PdfIcon } from '../../../../../../contexts/PdfExportContext';
import RSVPGrowthChart from '../../EventDashboard/RSVPGrowthChart';
import InsightCallout from './InsightCallout';
import './slides.scss';

function RegistrationTrendsSlide({ eventId, orgId, rsvpGrowth, registrationCount, expectedAttendance, eventStartTime, formatNumber = (n) => new Intl.NumberFormat().format(n), inlineInsights }) {
    const summary = useMemo(() => {
        const entries = rsvpGrowth?.registrations
            ? Object.entries(rsvpGrowth.registrations)
                  .map(([date, count]) => ({ date, count }))
                  .sort((a, b) => a.date.localeCompare(b.date))
            : [];
        const total = entries.reduce((sum, e) => sum + e.count, 0);
        if (entries.length === 0 || total === 0) return null;

        const eventStart = eventStartTime ? new Date(eventStartTime) : null;
        const last7Days = eventStart ? new Date(eventStart.getTime() - 7 * 24 * 60 * 60 * 1000) : null;
        const last7Count = last7Days ? entries.filter((e) => new Date(e.date) >= last7Days).reduce((s, e) => s + e.count, 0) : 0;
        const pctLast7 = total > 0 ? ((last7Count / total) * 100).toFixed(0) : 0;

        const peak = entries.reduce((max, e) => (e.count > max.count ? e : max), entries[0]);
        const peakDate = new Date(peak.date + 'T12:00:00');

        return { pctLast7, last7Count, total, peakDate: peakDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), peakCount: peak.count };
    }, [rsvpGrowth, eventStartTime]);

    return (
        <div className="event-post-mortem-slide">
            <h2 className="event-post-mortem-slide__title">Registration Trends</h2>
            <p className="event-post-mortem-slide__subtitle">
                How registrations grew from event creation to event start
            </p>

            {summary && (
                <div className="event-post-mortem-slide__card trends-slide__summary">
                    <div className="trends-summary__item">
                        <PdfIcon icon="mdi:calendar-week" />
                        <span>{summary.pctLast7}% of registrations came in the last 7 days</span>
                    </div>
                    <div className="trends-summary__item">
                        <PdfIcon icon="mdi:chart-line" />
                        <span>Peak day: {summary.peakDate} ({formatNumber(summary.peakCount)} registrations)</span>
                    </div>
                </div>
            )}
            {inlineInsights?.length > 0 && (
                <InsightCallout insights={inlineInsights} />
            )}

            <div className="event-post-mortem-slide__card trends-slide__chart">
                <RSVPGrowthChart
                    eventId={eventId}
                    orgId={orgId}
                    expectedAttendance={expectedAttendance}
                    registrationCount={registrationCount}
                    rsvpGrowth={rsvpGrowth}
                    report
                />
            </div>
        </div>
    );
}

export default RegistrationTrendsSlide;
