import React from 'react';
import EventDashboardChart from '../../../ClubDash/EventsManagement/components/EventDashboard/components/EventDashboardChart/EventDashboardChart';
import { formatBucketAxisLabel } from '../../../../utils/analyticsDashboardUtils';
import './AdminPlatformMetricChart.scss';

/**
 * Single metric chart styled like legacy `.visit-chart` (General / Analytics),
 * backed by visx via EventDashboardChart.
 */
function AdminPlatformMetricChart({
    title,
    totalValue,
    series,
    granularity = 'day',
    height = 200,
    emptyMessage = 'No data',
    loadingCompare = false,
    xDomain,
    showEndGlyph = false,
    syncId,
    hoverSyncSignal,
    onHoverSyncChange,
    enableRangeSelection = false,
    onRangeSelect,
    detailedView = false
}) {
    const xTickFormat = React.useCallback((x) => formatBucketAxisLabel(x, granularity), [granularity]);

    const isEmpty = !series?.length || series.every((s) => !s?.data?.length);

    return (
        <div className={`visit-chart admin-platform-trend-chart ${detailedView ? 'admin-platform-trend-chart--detailed' : ''}`}>
            <div className="header">
                <div className="header-content">
                    {totalValue != null ? (
                        <div className="admin-platform-trend-chart__total">{totalValue}</div>
                    ) : null}
                    <h2>{title}</h2>
                </div>
                {loadingCompare ? <span className="admin-platform-trend-chart__loading">Loading comparison…</span> : null}
            </div>
            {isEmpty ? (
                <div className="chart-empty-visx">{emptyMessage}</div>
            ) : (
                <EventDashboardChart
                    series={series}
                    height={height}
                    margin={{ top: 8, right: 8, bottom: 24, left: 40 }}
                    showArea
                    showLine
                    showGlyph={showEndGlyph}
                    showGlyphPrimaryOnly={showEndGlyph}
                    showPointMarkers={detailedView}
                    xDomain={xDomain}
                    emptyMessage={emptyMessage}
                    xTickFormat={xTickFormat}
                    debugInteractions={false}
                    syncId={syncId}
                    hoverSyncSignal={hoverSyncSignal}
                    onHoverSyncChange={onHoverSyncChange}
                    enableRangeSelection={enableRangeSelection}
                    onRangeSelect={onRangeSelect}
                />
            )}
        </div>
    );
}

export default AdminPlatformMetricChart;
