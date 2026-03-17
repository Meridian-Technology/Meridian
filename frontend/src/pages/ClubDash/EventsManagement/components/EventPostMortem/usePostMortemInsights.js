import { useMemo } from 'react';

/** Insight categories for placing insights in relevant sections */
export const INSIGHT_CATEGORIES = {
    checkIn: 'checkIn',
    conversion: 'conversion',
    registrationTrends: 'registrationTrends',
    traffic: 'traffic',
    formCompletion: 'formCompletion',
    expectedVsActual: 'expectedVsActual',
    funnelBottleneck: 'funnelBottleneck',
    trafficInvestment: 'trafficInvestment',
    strategic: 'strategic',
};

/**
 * Computes all post-mortem insights and returns them by category for inline placement
 * plus the full list for the Key Insights slide.
 * Includes deeper, cross-metric insights that draw connections between data points.
 */
export function usePostMortemInsights({
    registrations,
    checkIns,
    uniqueViewers,
    rsvpGrowth,
    referrerSources,
    referrerRegistrations,
    qrReferrerSources,
    formOpens,
    hasForm,
    formatNumber,
    expectedAttendance,
}) {
    return useMemo(() => {
        const all = [];
        const byCategory = {
            [INSIGHT_CATEGORIES.checkIn]: null,
            [INSIGHT_CATEGORIES.conversion]: null,
            [INSIGHT_CATEGORIES.registrationTrends]: [],
            [INSIGHT_CATEGORIES.traffic]: null,
            [INSIGHT_CATEGORIES.formCompletion]: null,
            [INSIGHT_CATEGORIES.expectedVsActual]: null,
            [INSIGHT_CATEGORIES.funnelBottleneck]: null,
            [INSIGHT_CATEGORIES.trafficInvestment]: null,
            [INSIGHT_CATEGORIES.strategic]: [],
        };

        if (expectedAttendance > 0 && registrations > 0) {
            const pct = (registrations / expectedAttendance) * 100;
            let sub;
            if (pct >= 150) sub = 'Far exceeded expectations — demand was strong!';
            else if (pct >= 125) sub = 'Strong turnout — your promotion worked.';
            else if (pct >= 110) sub = 'Beat your target — promotion paid off.';
            else if (pct >= 100) sub = 'Met or exceeded your target!';
            else if (pct >= 80) sub = 'Nearly hit your target.';
            else if (pct >= 50) sub = 'Consider promoting earlier next time.';
            else sub = 'Adjust expectations or boost promotion for future events.';
            const item = {
                icon: 'mdi:target',
                text: `${formatNumber(registrations)} registrations vs ${formatNumber(expectedAttendance)} expected`,
                sub,
            };
            all.push(item);
            byCategory[INSIGHT_CATEGORIES.expectedVsActual] = item;
        }

        if (registrations > 0 && checkIns > 0) {
            const rate = ((checkIns / registrations) * 100).toFixed(0);
            const item = {
                icon: 'mdi:check-circle',
                text: `${rate}% of registrants checked in`,
                sub: rate >= 70 ? 'Strong show-up rate!' : rate >= 50 ? 'Solid attendance.' : 'Consider reminders next time.',
            };
            all.push(item);
            byCategory[INSIGHT_CATEGORIES.checkIn] = item;
        }

        if (uniqueViewers > 0 && registrations > 0) {
            const rate = ((registrations / uniqueViewers) * 100).toFixed(0);
            const item = {
                icon: 'mingcute:chart-line-fill',
                text: `${rate}% of viewers converted to registrations`,
                sub: rate >= 20 ? 'Great conversion!' : rate >= 10 ? 'Room to improve.' : 'Focus on compelling event details.',
            };
            all.push(item);
            byCategory[INSIGHT_CATEGORIES.conversion] = item;
        }

        if (rsvpGrowth?.registrations && Object.keys(rsvpGrowth.registrations).length > 0) {
            const entries = Object.entries(rsvpGrowth.registrations)
                .map(([date, count]) => ({ date, count }))
                .sort((a, b) => a.date.localeCompare(b.date));
            if (entries.length > 0) {
                const total = entries.reduce((sum, e) => sum + e.count, 0);
                const peak = entries.reduce((max, e) => (e.count > max.count ? e : max), entries[0]);
                const peakDate = new Date(peak.date + 'T12:00:00');
                const peakLabel = peakDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const peakItem = {
                    icon: 'mdi:calendar-star',
                    text: `Peak registration day: ${peakLabel} (${formatNumber(peak.count)} registrations)`,
                };
                all.push(peakItem);
                byCategory[INSIGHT_CATEGORIES.registrationTrends].push(peakItem);

                if (total > 0) {
                    const last7Count = entries.slice(-7).reduce((s, e) => s + e.count, 0);
                    const pctLast7 = ((last7Count / total) * 100).toFixed(0);
                    if (Number(pctLast7) >= 40) {
                        const last7Item = {
                            icon: 'mdi:calendar-week',
                            text: `${pctLast7}% of registrations came in the final week`,
                            sub: 'Send a reminder 2–3 days before next time to capture early interest.',
                        };
                        all.push(last7Item);
                        byCategory[INSIGHT_CATEGORIES.registrationTrends].push(last7Item);
                    }
                }
            }
        }

        if (referrerSources) {
            const sources = [
                { key: 'org_page', label: 'Org page' },
                { key: 'explore', label: 'Explore' },
                { key: 'direct', label: 'Direct' },
                { key: 'email', label: 'Email' },
            ];
            const withViewsAndRegs = sources.map((s) => ({
                ...s,
                value: referrerSources[s.key] ?? 0,
                regs: referrerRegistrations?.[s.key] ?? 0,
            }));
            const top = [...withViewsAndRegs]
                .filter((s) => s.value > 0)
                .sort((a, b) => b.value - a.value)[0];
            if (top) {
                const conv = top.value > 0 ? ((top.regs / top.value) * 100).toFixed(0) : null;
                const item = {
                    icon: 'mdi:source-branch',
                    text: `Top traffic source: ${top.label} (${formatNumber(top.value)} views${conv != null ? `, ${conv}% conversion` : ''})`,
                    sub: conv != null && top.regs > 0 ? 'Per-source conversion shows which channels drive registrations.' : null,
                };
                all.push(item);
                byCategory[INSIGHT_CATEGORIES.traffic] = item;
            }

            // Conversion-by-source insight when we have the data
            const hasConversionData = referrerRegistrations && Object.keys(referrerRegistrations).some((k) => (referrerRegistrations[k] ?? 0) > 0);
            if (hasConversionData) {
                const convParts = sources
                    .filter((s) => (referrerSources[s.key] ?? 0) > 0)
                    .map((s) => {
                        const v = referrerSources[s.key] ?? 0;
                        const r = referrerRegistrations?.[s.key] ?? 0;
                        const pct = v > 0 ? ((r / v) * 100).toFixed(0) : '0';
                        return `${s.label}: ${pct}%`;
                    });
                if (convParts.length > 0) {
                    const convItem = {
                        icon: 'mdi:chart-line',
                        text: `Conversion by source: ${convParts.join(', ')}`,
                        sub: 'Invest more in channels with higher conversion rates.',
                    };
                    all.push(convItem);
                    byCategory[INSIGHT_CATEGORIES.strategic].push(convItem);
                }
            }
        }

        if (hasForm && formOpens > 0 && registrations > 0) {
            const formRate = ((registrations / formOpens) * 100).toFixed(0);
            const item = {
                icon: 'mdi:form-select',
                text: `${formRate}% form completion rate`,
                sub: formRate >= 60 ? 'Form is working well.' : 'Consider simplifying the form.',
            };
            all.push(item);
            byCategory[INSIGHT_CATEGORIES.formCompletion] = item;
        }

        // --- Deeper insights: funnel bottleneck ---
        if (uniqueViewers > 0 && (hasForm ? formOpens > 0 : true)) {
            const viewToForm = hasForm && formOpens > 0 ? (formOpens / uniqueViewers) * 100 : 0;
            const formToReg = hasForm && formOpens > 0 && registrations > 0 ? (registrations / formOpens) * 100 : 0;
            const regToCheckIn = registrations > 0 ? (checkIns / registrations) * 100 : 0;

            const drops = [];
            if (hasForm && formOpens > 0) drops.push({ stage: 'viewer→form', rate: viewToForm, label: 'Viewers opening form' });
            if (hasForm && formOpens > 0 && registrations > 0) drops.push({ stage: 'form→reg', rate: formToReg, label: 'Form opens → registrations' });
            if (registrations > 0) drops.push({ stage: 'reg→checkin', rate: regToCheckIn, label: 'Registrations → check-ins' });

            const bottleneck = drops.length > 0 ? drops.reduce((min, d) => (d.rate < min.rate ? d : min)) : null;
            if (bottleneck && bottleneck.rate < 70) {
                let sub;
                if (bottleneck.stage === 'viewer→form') sub = 'Improve event page appeal or add a stronger CTA to open the form.';
                else if (bottleneck.stage === 'form→reg') sub = 'Shorten the form or reduce required fields — friction is costing you registrations.';
                else sub = 'Send reminder emails 1–2 days before; many registrants may have forgotten.';
                const item = {
                    icon: 'mdi:filter-variant-remove',
                    text: `Biggest drop-off: ${bottleneck.label} (${bottleneck.rate.toFixed(0)}%)`,
                    sub,
                };
                all.push(item);
                byCategory[INSIGHT_CATEGORIES.funnelBottleneck] = item;
            }
        }

        // --- Traffic source investment recommendations ---
        if (referrerSources) {
            const sources = [
                { key: 'org_page', label: 'Org Page' },
                { key: 'explore', label: 'Explore' },
                { key: 'direct', label: 'Direct' },
                { key: 'email', label: 'Email' },
            ];
            const withValues = sources.map((s) => ({ ...s, value: referrerSources[s.key] ?? 0 }));
            const totalViews = withValues.reduce((sum, s) => sum + s.value, 0);
            const qrTotal = (qrReferrerSources || []).reduce((sum, q) => sum + (q.count ?? 0), 0);
            const grandTotal = totalViews + qrTotal;

            if (grandTotal > 0) {
                const sorted = [...withValues].filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
                const top = sorted[0];
                const topPct = top ? (top.value / grandTotal) * 100 : 0;

                if (top && topPct >= 60) {
                    const item = {
                        icon: 'mdi:chart-pie',
                        text: `${top.label} drove ${topPct.toFixed(0)}% of traffic`,
                        sub: `Double down on ${top.label.toLowerCase()} for your next event — it's your strongest channel.`,
                    };
                    all.push(item);
                    byCategory[INSIGHT_CATEGORIES.trafficInvestment] = item;
                } else if (top && topPct < 40 && sorted.length >= 2) {
                    const item = {
                        icon: 'mdi:chart-pie',
                        text: 'Traffic is spread across multiple sources',
                        sub: 'Diversified promotion — consider investing more in your top source to scale.',
                    };
                    all.push(item);
                    byCategory[INSIGHT_CATEGORIES.trafficInvestment] = item;
                }

                if (qrTotal > 0 && (qrTotal / grandTotal) * 100 >= 15) {
                    const qrPct = ((qrTotal / grandTotal) * 100).toFixed(0);
                    const qrRegs = (qrReferrerSources || []).reduce((s, q) => s + (q.registrations ?? 0), 0);
                    const qrConversion = qrTotal > 0 ? ((qrRegs / qrTotal) * 100).toFixed(0) : null;
                    const qrItem = {
                        icon: 'mdi:qrcode',
                        text: `QR codes drove ${qrPct}% of traffic${qrConversion != null ? ` (${qrConversion}% conversion)` : ''}`,
                        sub: 'Consider more QR placement (flyers, signage, table tents) for walk-in traffic.',
                    };
                    all.push(qrItem);
                    byCategory[INSIGHT_CATEGORIES.strategic].push(qrItem);
                }

                // Best-converting source insight (includes platform + individual QR sources)
                const sourceTypeLabels = {
                    org_page: 'your org page',
                    explore: 'your explore page',
                    direct: 'your direct link',
                    email: 'your email link',
                };
                const allSourcesWithConversion = [
                    ...withValues.map((s) => ({
                        key: s.key,
                        typeLabel: sourceTypeLabels[s.key] || s.label,
                        value: s.value,
                        regs: referrerRegistrations?.[s.key] ?? 0,
                    })),
                    ...(qrReferrerSources || []).map((q) => ({
                        key: `qr_${q.qr_id}`,
                        typeLabel: `your QR code '${q.name || 'unnamed'}'`,
                        value: q.count ?? 0,
                        regs: q.registrations ?? 0,
                    })),
                ].filter((s) => s.value > 0);

                let bestSource = null;
                let bestRate = 0;
                allSourcesWithConversion.forEach((s) => {
                    const views = s.value;
                    const regs = s.regs;
                    if (views >= 5 && regs > 0) {
                        const rate = (regs / views) * 100;
                        if (rate > bestRate) {
                            bestRate = rate;
                            bestSource = s;
                        }
                    }
                });

                const sortedAll = [...allSourcesWithConversion].sort((a, b) => b.value - a.value);
                const topByViews = sortedAll[0];
                const topConversion = topByViews && topByViews.value > 0 ? (topByViews.regs / topByViews.value) * 100 : 0;
                const bestIsNotTop = bestSource && topByViews && bestSource.key !== topByViews.key;
                const bestOutperformsTop = bestIsNotTop && bestRate > topConversion && bestRate - topConversion >= 5;

                if (bestOutperformsTop) {
                    const investItem = {
                        icon: 'mdi:chart-line',
                        text: `${bestSource.typeLabel} had ${bestRate.toFixed(0)}% conversion vs ${topByViews.typeLabel}'s ${topConversion.toFixed(0)}%`,
                        sub: `Consider investing more in ${bestSource.typeLabel} — it converts better than your top traffic source.`,
                    };
                    all.push(investItem);
                    byCategory[INSIGHT_CATEGORIES.strategic].push(investItem);
                } else if (bestSource && bestRate >= 25 && !bestIsNotTop) {
                    const convItem = {
                        icon: 'mdi:chart-line',
                        text: `${bestSource.typeLabel} had ${bestRate.toFixed(0)}% conversion`,
                        sub: `Your strongest channel — consider investing more in ${bestSource.typeLabel} for future events.`,
                    };
                    all.push(convItem);
                    byCategory[INSIGHT_CATEGORIES.strategic].push(convItem);
                }

                const emailPct = totalViews > 0 ? ((referrerSources.email ?? 0) / totalViews) * 100 : 0;
                if (emailPct > 0 && emailPct < 10 && (referrerSources.direct ?? 0) + (referrerSources.explore ?? 0) > 0) {
                    const emailItem = {
                        icon: 'mdi:email-open',
                        text: `Email drove only ${emailPct.toFixed(0)}% of traffic`,
                        sub: 'Build your email list — email typically converts better than cold traffic.',
                    };
                    all.push(emailItem);
                    byCategory[INSIGHT_CATEGORIES.strategic].push(emailItem);
                }
            }
        }

        // --- Form friction (high opens, low completions) ---
        if (hasForm && formOpens > 0 && registrations > 0) {
            const formRate = (registrations / formOpens) * 100;
            const bounces = formOpens - registrations;
            if (formRate < 40 && bounces >= 5) {
                const item = {
                    icon: 'mdi:form-select',
                    text: `${formatNumber(bounces)} opened the form but didn't complete`,
                    sub: 'Reduce form length or make optional fields optional — each abandoned form is a lost attendee.',
                };
                all.push(item);
                byCategory[INSIGHT_CATEGORIES.strategic].push(item);
            }
        }

        // --- Registration timing: last-week surge ---
        if (rsvpGrowth?.registrations && Object.keys(rsvpGrowth.registrations).length > 0) {
            const entries = Object.entries(rsvpGrowth.registrations)
                .map(([date, count]) => ({ date, count }))
                .sort((a, b) => a.date.localeCompare(b.date));
            const total = entries.reduce((sum, e) => sum + e.count, 0);
            if (total > 0) {
                const last7Count = entries.slice(-7).reduce((s, e) => s + e.count, 0);
                const pctLast7 = (last7Count / total) * 100;
                if (pctLast7 >= 50 && entries.length >= 3) {
                    const timingItem = {
                        icon: 'mdi:clock-outline',
                        text: `${pctLast7.toFixed(0)}% of registrations came in the final week`,
                        sub: 'Last-minute push worked — try a reminder 2–3 days before next time to capture early interest too.',
                    };
                    all.push(timingItem);
                    byCategory[INSIGHT_CATEGORIES.strategic].push(timingItem);
                }
            }
        }

        return { all, byCategory };
    }, [registrations, checkIns, uniqueViewers, rsvpGrowth, referrerSources, referrerRegistrations, qrReferrerSources, formOpens, hasForm, formatNumber, expectedAttendance]);
}
