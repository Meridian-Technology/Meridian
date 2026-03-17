import React from 'react';
import FunnelChart from '../../EventDashboard/FunnelChart';
import './slides.scss';

function FunnelSlide({ funnelData }) {
    const hasData = funnelData?.some((d) => (d.value ?? 0) > 0);

    if (!hasData) {
        return (
            <div className="event-post-mortem-slide">
                <div className="event-post-mortem-slide__section" data-pdf-no-split>
                    <h2 className="event-post-mortem-slide__title">Engagement Funnel</h2>
                    <p className="event-post-mortem-slide__subtitle">
                        Unique users at each step of the journey
                    </p>
                    <div className="event-post-mortem-slide__card funnel-slide__empty">
                        <p>No funnel data available for this event.</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="event-post-mortem-slide">
            <div className="event-post-mortem-slide__section" data-pdf-no-split>
                <h2 className="event-post-mortem-slide__title">Engagement Funnel</h2>
                <p className="event-post-mortem-slide__subtitle">
                    Unique users at each step of the journey
                </p>
                <div className="event-post-mortem-slide__card funnel-slide__chart">
                    <div className="funnel-slide__chart-inner">
                        <FunnelChart data={funnelData} />
                    </div>
                </div>
            </div>
        </div>
    );
}

export default FunnelSlide;
