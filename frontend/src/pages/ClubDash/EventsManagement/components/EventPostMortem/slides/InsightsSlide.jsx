import React from 'react';
import { PdfIcon } from '../../../../../../contexts/PdfExportContext';
import { usePostMortemInsights } from '../usePostMortemInsights';
import './slides.scss';

function InsightsSlide({
    registrations,
    checkIns,
    uniqueViewers,
    rsvpGrowth,
    referrerSources,
    formOpens,
    hasForm,
    formatNumber,
    insights: insightsProp,
}) {
    const computedInsights = usePostMortemInsights({
        registrations,
        checkIns,
        uniqueViewers,
        rsvpGrowth,
        referrerSources,
        formOpens,
        hasForm,
        formatNumber: formatNumber || ((n) => new Intl.NumberFormat().format(n)),
    });
    const insights = insightsProp ?? computedInsights.all;

    if (insights.length === 0) {
        return (
            <div className="event-post-mortem-slide">
                <div className="event-post-mortem-slide__section" data-pdf-no-split>
                    <h2 className="event-post-mortem-slide__title">Key Insights</h2>
                    <p className="event-post-mortem-slide__subtitle">
                        Auto-generated takeaways from your event data
                    </p>
                    <div className="event-post-mortem-slide__card insights-slide__empty">
                        <p>Not enough data to generate insights yet.</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="event-post-mortem-slide">
            <div className="event-post-mortem-slide__section" data-pdf-no-split>
                <h2 className="event-post-mortem-slide__title">Key Insights</h2>
                <p className="event-post-mortem-slide__subtitle">
                    Auto-generated takeaways from your event data
                </p>
                <div className="insights-slide__list">
                {insights.map((item, i) => (
                    <div key={i} className="event-post-mortem-slide__card insights-slide__item">
                        <div className="insights-slide__icon">
                            <PdfIcon icon={item.icon} />
                        </div>
                        <div className="insights-slide__content">
                            <p className="insights-slide__text">{item.text}</p>
                            {item.sub && (
                                <p className="insights-slide__sub">{item.sub}</p>
                            )}
                        </div>
                    </div>
                ))}
                </div>
            </div>
        </div>
    );
}

export default InsightsSlide;
