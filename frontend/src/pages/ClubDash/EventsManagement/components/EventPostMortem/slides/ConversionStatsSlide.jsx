import React from 'react';
import InsightCallout from './InsightCallout';
import './slides.scss';

function ConversionStatsSlide({
    uniqueViewers,
    registrations,
    checkIns,
    formOpens,
    hasForm,
    formatNumber,
    inlineInsights = [],
}) {
    const viewToReg = uniqueViewers > 0
        ? ((registrations / uniqueViewers) * 100).toFixed(1)
        : '0';
    const formToReg = hasForm && formOpens > 0
        ? ((registrations / formOpens) * 100).toFixed(1)
        : null;
    const regToCheckIn = registrations > 0
        ? ((checkIns / registrations) * 100).toFixed(1)
        : '0';

    return (
        <div className="event-post-mortem-slide">
            <h2 className="event-post-mortem-slide__title">Conversion Stats</h2>
            <p className="event-post-mortem-slide__subtitle">
                Conversion rates at each stage of the funnel
            </p>

            <div className="conversion-stats__grid">
                <div className="event-post-mortem-slide__card conversion-stat">
                    <span className="conversion-stat__value">{viewToReg}%</span>
                    <span className="conversion-stat__label">View → Registration</span>
                    <span className="conversion-stat__detail">
                        {formatNumber(registrations)} of {formatNumber(uniqueViewers)} viewers registered
                    </span>
                </div>
                {formToReg !== null && (
                    <div className="event-post-mortem-slide__card conversion-stat">
                        <span className="conversion-stat__value">{formToReg}%</span>
                        <span className="conversion-stat__label">Form open → Registration</span>
                        <span className="conversion-stat__detail">
                            {formatNumber(registrations)} of {formatNumber(formOpens)} form openers completed
                        </span>
                    </div>
                )}
                <div className="event-post-mortem-slide__card conversion-stat">
                    <span className="conversion-stat__value">{regToCheckIn}%</span>
                    <span className="conversion-stat__label">Registration → Check-in</span>
                    <span className="conversion-stat__detail">
                        {formatNumber(checkIns)} of {formatNumber(registrations)} registrants checked in
                    </span>
                </div>
            </div>
            {inlineInsights?.length > 0 && (
                <InsightCallout insights={inlineInsights} />
            )}
        </div>
    );
}

export default ConversionStatsSlide;
