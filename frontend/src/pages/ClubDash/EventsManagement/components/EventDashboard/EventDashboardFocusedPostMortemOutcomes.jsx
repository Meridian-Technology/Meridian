import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { Icon } from '@iconify-icon/react';
import { usePostMortemInsights } from '../EventPostMortem/usePostMortemInsights';
import RSVPGrowthChart from './RSVPGrowthChart';
import FunnelChart from './FunnelChart';
import './EventDashboardFocusedPostMortemOutcomes.scss';

function EventDashboardFocusedPostMortemOutcomes({
    event,
    metrics,
    uniqueViewersForConversion,
    registrationsForConversion,
    rsvpGrowth,
    funnelData,
    platform,
    formatNumber
}) {
    const hasCheckInTracking = metrics?.hasCheckInTracking;
    const sectionRefs = useRef({});
    const [visibleSections, setVisibleSections] = useState({});
    const registerSection = useCallback((id) => (node) => {
        if (node) {
            sectionRefs.current[id] = node;
        }
    }, []);

    useEffect(() => {
        const entries = Object.entries(sectionRefs.current);
        if (entries.length === 0) return undefined;

        const observer = new IntersectionObserver(
            (observerEntries) => {
                observerEntries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    const id = entry.target.getAttribute('data-story-section');
                    if (!id) return;
                    setVisibleSections((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
                    observer.unobserve(entry.target);
                });
            },
            { threshold: 0.2, rootMargin: '0px 0px -10% 0px' }
        );

        entries.forEach(([, node]) => observer.observe(node));

        return () => {
            observer.disconnect();
        };
    }, []);
    const insights = usePostMortemInsights({
        registrations: metrics?.registrations || 0,
        checkIns: metrics?.checkIns || 0,
        uniqueViewers: uniqueViewersForConversion,
        rsvpGrowth,
        referrerSources: platform?.referrerSources,
        referrerRegistrations: platform?.referrerRegistrations,
        qrReferrerSources: platform?.qrReferrerSources,
        formOpens: platform?.uniqueFormOpens,
        hasForm: !!event?.registrationFormId,
        hasCheckInTracking,
        formatNumber,
        expectedAttendance: event?.expectedAttendance ?? 0
    });

    const conversionRate = uniqueViewersForConversion > 0 ? (registrationsForConversion / uniqueViewersForConversion) * 100 : null;
    const formCompletionRate = event?.registrationFormId && platform?.uniqueFormOpens > 0
        ? ((metrics?.registrations || 0) / platform.uniqueFormOpens) * 100
        : null;

    const sortedTraffic = useMemo(() => {
        const sources = [
            { key: 'org_page', label: 'Org Page' },
            { key: 'explore', label: 'Explore' },
            { key: 'direct', label: 'Direct' },
            { key: 'email', label: 'Email' }
        ];

        const base = sources.map((source) => {
            const views = platform?.referrerSources?.[source.key] ?? 0;
            const registrations = platform?.referrerRegistrations?.[source.key] ?? 0;
            return {
                id: source.key,
                label: source.label,
                views,
                registrations,
                conversion: views > 0 ? (registrations / views) * 100 : 0
            };
        }).filter((source) => source.views > 0 || source.registrations > 0);

        const qr = (platform?.qrReferrerSources || []).map((source) => ({
            id: `qr-${source.qr_id || source.name}`,
            label: source.name || 'QR Code',
            views: source.count ?? 0,
            registrations: source.registrations ?? 0,
            conversion: (source.count ?? 0) > 0 ? ((source.registrations ?? 0) / source.count) * 100 : 0
        })).filter((source) => source.views > 0 || source.registrations > 0);

        return [...base, ...qr].sort((a, b) => b.views - a.views);
    }, [platform]);

    const topTrafficSource = sortedTraffic[0] || null;
    const learningInsights = useMemo(() => {
        const list = [];
        const add = (item) => {
            if (item) list.push(item);
        };

        add(insights.byCategory.expectedVsActual);
        add(insights.byCategory.conversion);
        add(insights.byCategory.formCompletion);
        add(insights.byCategory.funnelBottleneck);
        if (hasCheckInTracking) {
            add(insights.byCategory.checkIn);
        }
        return list;
    }, [hasCheckInTracking, insights.byCategory]);

    const actionInsights = useMemo(() => {
        const strategic = Array.isArray(insights.byCategory.strategic) ? insights.byCategory.strategic : [];
        const list = [];
        if (insights.byCategory.trafficInvestment) {
            list.push(insights.byCategory.trafficInvestment);
        }
        return [...list, ...strategic];
    }, [insights.byCategory]);

    return (
        <div className="event-dashboard-focused-pm-outcomes">
            <section className="event-dashboard-focused-pm-outcomes__lead">
                <p className="event-dashboard-focused-pm-outcomes__eyebrow">Post-Mortem</p>
                <h2 className="event-dashboard-focused-pm-outcomes__headline">
                    {hasCheckInTracking
                        ? `${formatNumber(metrics?.checkIns || 0)} attendees showed up.`
                        : `${formatNumber(metrics?.registrations || 0)} registrations captured.`}
                </h2>
                <p className="event-dashboard-focused-pm-outcomes__lede">
                    {formatNumber(metrics?.registrations || 0)} registrations
                    {' · '}
                    {conversionRate != null ? `${conversionRate.toFixed(1)}%` : 'n/a'} viewer conversion
                    {hasCheckInTracking && metrics?.showRate != null
                        ? ` · ${metrics.showRate.toFixed(1)}% show rate`
                        : ' · attendance not tracked'}
                    .
                </p>
            </section>

            <section
                ref={registerSection('learnings')}
                data-story-section="learnings"
                className={`event-dashboard-focused-pm-outcomes__story-section${visibleSections.learnings ? ' is-visible' : ''}`}
            >
                <div className="event-dashboard-focused-pm-outcomes__story-grid">
                    <article className="event-dashboard-focused-pm-outcomes__story-card">
                        <h4>Insights</h4>
                        {learningInsights.length > 0 ? (
                            <div className="event-dashboard-focused-pm-outcomes__insights">
                                {learningInsights.map((insight, index) => (
                                    <article key={`${insight.text}-${index}`}>
                                        <Icon icon={insight.icon || 'mdi:lightbulb-on-outline'} />
                                        <div>
                                            <p>{insight.text}</p>
                                            {insight.sub ? <span>{insight.sub}</span> : null}
                                        </div>
                                    </article>
                                ))}
                            </div>
                        ) : (
                            <p className="event-dashboard-focused-pm-outcomes__empty">Not enough data to generate insights.</p>
                        )}
                    </article>
                    <article className="event-dashboard-focused-pm-outcomes__story-card">
                        <h4>Recommendations</h4>
                        {actionInsights.length > 0 ? (
                            <div className="event-dashboard-focused-pm-outcomes__insights">
                                {actionInsights.map((insight, index) => (
                                    <article key={`${insight.text}-${index}`}>
                                        <Icon icon={insight.icon || 'mdi:bullseye-arrow'} />
                                        <div>
                                            <p>{insight.text}</p>
                                            {insight.sub ? <span>{insight.sub}</span> : null}
                                        </div>
                                    </article>
                                ))}
                            </div>
                        ) : (
                            <p className="event-dashboard-focused-pm-outcomes__empty">No additional actions were generated from this dataset.</p>
                        )}
                        {!hasCheckInTracking && (
                            <div className="event-dashboard-focused-pm-outcomes__adoption-nudge">
                                <Icon icon="mdi:clipboard-check-outline" />
                                <div>
                                    <p>Measurement gap</p>
                                    <span>Check-ins were not used for this event.</span>
                                </div>
                            </div>
                        )}
                    </article>
                </div>
            </section>

            <section
                ref={registerSection('result')}
                data-story-section="result"
                className={`event-dashboard-focused-pm-outcomes__story-section${visibleSections.result ? ' is-visible' : ''}`}
            >
                <div className="event-dashboard-focused-pm-outcomes__section event-dashboard-focused-pm-outcomes__section--split">
                    <article className="event-dashboard-focused-pm-outcomes__feature-card">
                        <h3>Snapshot</h3>
                        <div className="event-dashboard-focused-pm-outcomes__feature-metrics">
                            <div>
                                <span>Registrations</span>
                                <strong>{formatNumber(metrics?.registrations || 0)}</strong>
                            </div>
                            <div>
                                <span>Viewer Conversion</span>
                                <strong>{conversionRate != null ? `${conversionRate.toFixed(1)}%` : 'n/a'}</strong>
                            </div>
                            {hasCheckInTracking ? (
                                <div>
                                    <span>Check-Ins</span>
                                    <strong>{formatNumber(metrics?.checkIns || 0)}</strong>
                                </div>
                            ) : (
                                <div>
                                    <span>Attendance Capture</span>
                                    <strong>Not tracked</strong>
                                </div>
                            )}
                        </div>
                    </article>
                    <div className="event-dashboard-focused-pm-outcomes__metrics-column">
                        {hasCheckInTracking ? (
                            <article className="event-dashboard-focused-pm-outcomes__metric-pill">
                                <span>Check-In Rate</span>
                                <strong>{metrics?.showRate != null ? `${metrics.showRate.toFixed(1)}%` : 'n/a'}</strong>
                            </article>
                        ) : (
                            <article className="event-dashboard-focused-pm-outcomes__metric-pill event-dashboard-focused-pm-outcomes__metric-pill--neutral">
                                <span>Attendance Status</span>
                                <strong>Not captured</strong>
                            </article>
                        )}
                        {formCompletionRate != null && (
                            <article className="event-dashboard-focused-pm-outcomes__metric-pill">
                                <span>Form Completion</span>
                                <strong>{formCompletionRate.toFixed(1)}%</strong>
                            </article>
                        )}
                        {metrics?.expectedVariance != null && (
                            <article className="event-dashboard-focused-pm-outcomes__metric-pill">
                                <span>Vs Expected Attendance</span>
                                <strong>{metrics.expectedVariance >= 0 ? '+' : ''}{metrics.expectedVariance.toFixed(0)}%</strong>
                            </article>
                        )}
                    </div>
                </div>
            </section>

            <section
                ref={registerSection('drivers')}
                data-story-section="drivers"
                className={`event-dashboard-focused-pm-outcomes__story-section${visibleSections.drivers ? ' is-visible' : ''}`}
            >
                <div className="event-dashboard-focused-pm-outcomes__section">
                <div className="event-dashboard-focused-pm-outcomes__drivers-grid">
                    <div className="event-dashboard-focused-pm-outcomes__driver-card">
                        <h4>Registration Trends</h4>
                        {rsvpGrowth ? (
                            <div className="event-dashboard-focused-pm-outcomes__chart-shell">
                                <RSVPGrowthChart
                                    eventId={event?._id}
                                    orgId={event?.hostingId?._id}
                                    expectedAttendance={Number(event?.expectedAttendance) || 0}
                                    registrationCount={metrics?.registrations || 0}
                                    rsvpGrowth={rsvpGrowth}
                                />
                            </div>
                        ) : (
                            <p className="event-dashboard-focused-pm-outcomes__empty">No registration trend data available.</p>
                        )}
                    </div>
                    <div className="event-dashboard-focused-pm-outcomes__driver-card">
                        <h4>Audience Funnel</h4>
                        <div className="event-dashboard-focused-pm-outcomes__funnel-shell">
                            <FunnelChart data={funnelData} />
                        </div>
                    </div>
                </div>
                </div>
            </section>

            <section
                ref={registerSection('channels')}
                data-story-section="channels"
                className={`event-dashboard-focused-pm-outcomes__story-section${visibleSections.channels ? ' is-visible' : ''}`}
            >
                <div className="event-dashboard-focused-pm-outcomes__section">
                {topTrafficSource ? (
                    <div className="event-dashboard-focused-pm-outcomes__traffic-lead">
                        <p>{topTrafficSource.label} led discovery.</p>
                        <span>
                            {formatNumber(topTrafficSource.views)} views, {formatNumber(topTrafficSource.registrations)} registrations, {topTrafficSource.conversion.toFixed(1)}% conversion
                        </span>
                    </div>
                ) : null}
                {sortedTraffic.length > 0 ? (
                    <div className="event-dashboard-focused-pm-outcomes__traffic-table">
                        {sortedTraffic.map((source) => (
                            <div key={source.id} className="event-dashboard-focused-pm-outcomes__traffic-row">
                                <span>{source.label}</span>
                                <span>{formatNumber(source.views)} views</span>
                                <span>{formatNumber(source.registrations)} regs</span>
                                <strong>{source.conversion.toFixed(1)}%</strong>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="event-dashboard-focused-pm-outcomes__empty">No traffic source data available.</p>
                )}
                </div>
            </section>
        </div>
    );
}

export default EventDashboardFocusedPostMortemOutcomes;
