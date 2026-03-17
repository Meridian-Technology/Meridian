import React from 'react';
import { PdfIcon } from '../../../../../../contexts/PdfExportContext';
import './slides.scss';

/**
 * Inline insight hint - compact, non-intrusive. Only shows the recommendation (sub),
 * not the stat, since stats are already displayed in the section.
 */
function InsightCallout({ insights, compact = true }) {
    if (!insights || (Array.isArray(insights) && insights.length === 0) || (!Array.isArray(insights) && !insights)) {
        return null;
    }
    const items = Array.isArray(insights) ? insights : [insights];
    const withSubs = items.filter((item) => item.sub);
    const toShow = compact ? withSubs : items;
    if (toShow.length === 0) return null;

    if (compact) {
        return (
            <p className="insight-hint">
                {toShow.map((item, i) => (
                    <span key={i} className="insight-hint__item">
                        {i > 0 && ' · '}
                        <PdfIcon icon={item.icon} className="insight-hint__icon" />
                        {item.sub}
                    </span>
                ))}
            </p>
        );
    }

    return (
        <div className="event-post-mortem-slide__card insight-callout">
            {toShow.map((item, i) => (
                <div key={i} className="insight-callout__item">
                    <div className="insight-callout__icon">
                        <PdfIcon icon={item.icon} />
                    </div>
                    <div className="insight-callout__content">
                        <p className="insight-callout__text">{item.text}</p>
                        {item.sub && <p className="insight-callout__sub">{item.sub}</p>}
                    </div>
                </div>
            ))}
        </div>
    );
}

export default InsightCallout;
