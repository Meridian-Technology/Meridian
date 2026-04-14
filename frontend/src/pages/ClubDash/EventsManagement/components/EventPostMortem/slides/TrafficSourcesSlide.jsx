import React from 'react';
import ProportionalBarList from '../../../../../../components/ProportionalBarList/ProportionalBarList';
import InsightCallout from './InsightCallout';
import './slides.scss';

function TrafficSourcesSlide({ referrerSources, referrerRegistrations, qrReferrerSources, formatNumber, inlineInsights }) {
    const sourceKeys = [
        { key: 'direct', label: 'Direct', icon: 'mdi:link' },
        { key: 'explore', label: 'Explore', icon: 'mingcute:compass-fill' },
        { key: 'org_page', label: 'Org Page', icon: 'mdi:domain' },
        { key: 'email', label: 'Email', icon: 'mdi:email-open' },
    ];
    const referrerItems = sourceKeys.map(({ key, label, icon }) => {
        const views = referrerSources?.[key] ?? 0;
        const regs = referrerRegistrations?.[key] ?? 0;
        const pct = views > 0 ? ((regs / views) * 100).toFixed(0) : null;
        return {
            key,
            label,
            icon,
            value: views,
            subLabel: pct != null ? `${pct}% → registration` : null,
        };
    });

    const qrItems = (qrReferrerSources || []).map(({ qr_id, name, count, registrations }) => {
        const views = count ?? 0;
        const regs = registrations ?? 0;
        const pct = views > 0 ? ((regs / views) * 100).toFixed(0) : null;
        return {
            key: `qr_${qr_id}`,
            label: name,
            icon: 'mdi:qrcode',
            value: views,
            subLabel: pct != null ? `${pct}% → registration` : null,
        };
    });

    const allItems = [...referrerItems, ...qrItems];
    const hasData = allItems.some((item) => (item.value ?? 0) > 0);

    if (!hasData) {
        return (
            <div className="event-post-mortem-slide">
                <div className="event-post-mortem-slide__section" data-pdf-no-split>
                    <h2 className="event-post-mortem-slide__title">Traffic Sources</h2>
                    <p className="event-post-mortem-slide__subtitle">
                        Where your event viewers came from
                    </p>
                    <div className="event-post-mortem-slide__card traffic-slide__empty">
                        <p>No traffic source data available.</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="event-post-mortem-slide">
            <div className="event-post-mortem-slide__section" data-pdf-no-split>
                <h2 className="event-post-mortem-slide__title">Traffic Sources</h2>
                <p className="event-post-mortem-slide__subtitle">
                    Where your event viewers came from
                </p>
                <ProportionalBarList
                    items={allItems}
                    header="Sources"
                    icon="mdi:source-branch"
                    classN="event-post-mortem-slide__card traffic-slide__sources"
                    size="1rem"
                    formatValue={formatNumber}
                />
                {inlineInsights?.length > 0 && (
                    <InsightCallout insights={inlineInsights} compact={false} />
                )}
            </div>
        </div>
    );
}

export default TrafficSourcesSlide;
