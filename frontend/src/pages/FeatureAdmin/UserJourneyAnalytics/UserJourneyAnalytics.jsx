import React, { useState } from 'react';
import { useFetch } from '../../../hooks/useFetch';
import { Icon } from '@iconify-icon/react';
import FunnelChart from '../../ClubDash/EventsManagement/components/EventDashboard/FunnelChart';
import './UserJourneyAnalytics.scss';

const REPORT_TABS = [
    { id: 'overview', label: 'Overview', icon: 'mdi:view-dashboard' },
    { id: 'path', label: 'Path Exploration', icon: 'mdi:graph' },
    { id: 'funnel', label: 'Funnel Analysis', icon: 'mdi:filter-variant' }
];

const DEFAULT_FUNNEL_STEPS = ['Events Dashboard', 'Explore', 'Event Page', 'event_registration'];
const FUNNEL_PRESETS = [
    { id: 'registration', label: 'Registration Flow', steps: ['Events Dashboard', 'Explore', 'Event Page', 'event_registration'] },
    { id: 'engagement', label: 'Engagement Flow', steps: ['Explore', 'Event Page', 'event_view', 'event_agenda_view'] },
    { id: 'mobile-landing', label: 'Mobile Landing Flow', steps: ['Mobile Landing', 'mobile_landing_qr_expanded', 'mobile_landing_app_store_click'] }
];

function UserJourneyAnalytics() {
    const [timeRange, setTimeRange] = useState('30d');
    const [activeTab, setActiveTab] = useState('overview');
    const [platform, setPlatform] = useState('web');
    const [startingPoint, setStartingPoint] = useState('');
    const [funnelStepsState, setFunnelStepsState] = useState(DEFAULT_FUNNEL_STEPS);
    const [newFunnelStep, setNewFunnelStep] = useState('');

    const overviewUrl = `/dashboard/all?timeRange=${timeRange}&platform=${platform}`;
    const pathUrl = startingPoint
        ? `/dashboard/user-journey?timeRange=${timeRange}&platform=${platform}&startingPoint=${encodeURIComponent(startingPoint)}`
        : `/dashboard/user-journey?timeRange=${timeRange}&platform=${platform}`;
    const cleanedFunnelSteps = funnelStepsState.map((s) => s.trim()).filter(Boolean);
    const funnelSteps = cleanedFunnelSteps.length >= 2 ? cleanedFunnelSteps : DEFAULT_FUNNEL_STEPS;
    const funnelUrl = `/dashboard/funnel?timeRange=${timeRange}&platform=${platform}&steps=${encodeURIComponent(funnelSteps.join(','))}`;
    const startingPointsUrl = `/dashboard/path-starting-points?timeRange=${timeRange}&platform=${platform}`;

    const { data: overviewData, loading: overviewLoading, error: overviewError, refetch: refetchOverview } = useFetch(activeTab === 'overview' ? overviewUrl : null);
    const { data: pathData, loading: pathLoading, error: pathError, refetch: refetchPath } = useFetch(activeTab === 'path' ? pathUrl : null);
    const { data: funnelData, loading: funnelLoading, error: funnelError, refetch: refetchFunnel } = useFetch(activeTab === 'funnel' ? funnelUrl : null);
    const { data: startingPointsData } = useFetch(activeTab === 'path' || activeTab === 'funnel' ? startingPointsUrl : null);

    const formatNumber = (num) => {
        if (num === null || num === undefined) return '0';
        return new Intl.NumberFormat().format(num);
    };

    const getTimeRangeLabel = (range) => {
        const labels = { '1h': 'Last Hour', '24h': 'Last 24 Hours', '7d': 'Last 7 Days', '30d': 'Last 30 Days', '90d': 'Last 90 Days' };
        return labels[range] || range;
    };

    const refetch = () => {
        if (activeTab === 'overview') refetchOverview();
        else if (activeTab === 'path') refetchPath();
        else refetchFunnel();
    };

    const loading = activeTab === 'overview' ? overviewLoading : activeTab === 'path' ? pathLoading : funnelLoading;
    const error = activeTab === 'overview' ? overviewError : activeTab === 'path' ? pathError : funnelError;

    const overview = overviewData?.data?.overview || {};
    const pathResult = pathData?.data;
    const funnelResult = funnelData?.data;
    const startingPoints = startingPointsData?.data;
    const allScreens = [...(startingPoints?.screens || []).map(s => ({ ...s, type: 'screen' })), ...(startingPoints?.events || []).map(e => ({ ...e, type: 'event' }))];
    const funnelChartData = (funnelResult?.steps || []).map((step, idx) => ({
        label: `Step ${idx + 1}`,
        value: step.count || 0
    }));
    const suggestedFunnelSteps = allScreens
        .map((item) => item.label)
        .filter(Boolean)
        .filter((value, index, arr) => arr.indexOf(value) === index)
        .sort((a, b) => a.localeCompare(b));

    const applyPreset = (steps) => {
        setFunnelStepsState(steps);
    };

    const updateFunnelStep = (index, value) => {
        setFunnelStepsState((prev) => prev.map((step, i) => (i === index ? value : step)));
    };

    const removeFunnelStep = (index) => {
        setFunnelStepsState((prev) => prev.filter((_, i) => i !== index));
    };

    const moveFunnelStep = (index, direction) => {
        setFunnelStepsState((prev) => {
            const nextIndex = direction === 'up' ? index - 1 : index + 1;
            if (nextIndex < 0 || nextIndex >= prev.length) return prev;
            const next = [...prev];
            [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
            return next;
        });
    };

    const addFunnelStep = () => {
        const value = newFunnelStep.trim();
        if (!value) return;
        setFunnelStepsState((prev) => [...prev, value]);
        setNewFunnelStep('');
    };

    const resetFunnelSteps = () => {
        setFunnelStepsState(DEFAULT_FUNNEL_STEPS);
        setNewFunnelStep('');
    };

    return (
        <div className="user-journey-analytics">
            <header className="uj-header">
                <div className="uj-header-content">
                    <h1>User Journey & Explorations</h1>
                    <p>Path exploration and funnel analysis</p>
                    <div className="uj-tabs">
                        {REPORT_TABS.map((tab) => (
                            <button
                                key={tab.id}
                                className={`uj-tab ${activeTab === tab.id ? 'active' : ''}`}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                <Icon icon={tab.icon} />
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="uj-header-actions">
                    <div className="uj-time-selector">
                        <label>Time Range:</label>
                        <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)}>
                            <option value="1h">Last Hour</option>
                            <option value="24h">Last 24 Hours</option>
                            <option value="7d">Last 7 Days</option>
                            <option value="30d">Last 30 Days</option>
                            <option value="90d">Last 90 Days</option>
                        </select>
                    </div>
                    <div className="uj-platform-selector">
                        <label>Platform:</label>
                        <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
                            <option value="web">Web</option>
                            <option value="mobile">Mobile</option>
                        </select>
                    </div>
                    <button className="uj-refresh-btn" onClick={refetch}>
                        <Icon icon="mdi:refresh" />
                        Refresh
                    </button>
                </div>
            </header>

            <div className="uj-content">
                {loading && (
                    <div className="uj-loading">
                        <Icon icon="mdi:loading" className="spin" />
                        Loading {activeTab}...
                    </div>
                )}

                {error && (
                    <div className="uj-error">
                        Error: {error}
                    </div>
                )}

                {!loading && !error && activeTab === 'overview' && (
                    <section className="uj-section">
                        <h2 className="uj-section-title">
                            <Icon icon="mdi:chart-line" />
                            Key Metrics
                        </h2>
                        <div className="uj-metrics-grid">
                            <div className="uj-metric-card">
                                <div className="uj-metric-icon users"><Icon icon="mdi:account-group" /></div>
                                <div className="uj-metric-content">
                                    <p>Unique Users</p>
                                    <h3>{formatNumber(overview.uniqueUsers)}</h3>
                                </div>
                            </div>
                            <div className="uj-metric-card">
                                <div className="uj-metric-icon sessions"><Icon icon="mdi:web" /></div>
                                <div className="uj-metric-content">
                                    <p>Sessions</p>
                                    <h3>{formatNumber(overview.sessions)}</h3>
                                </div>
                            </div>
                            <div className="uj-metric-card">
                                <div className="uj-metric-icon views"><Icon icon="mdi:eye" /></div>
                                <div className="uj-metric-content">
                                    <p>Page Views</p>
                                    <h3>{formatNumber(overview.pageViews)}</h3>
                                </div>
                            </div>
                            <div className="uj-metric-card">
                                <div className="uj-metric-icon bounce"><Icon icon="mdi:arrow-u-up-right" /></div>
                                <div className="uj-metric-content">
                                    <p>Bounce Rate</p>
                                    <h3>{overview.bounceRate?.toFixed(1) || '0'}%</h3>
                                </div>
                            </div>
                        </div>
                        <p className="uj-hint">Use the tabs above to explore Path Exploration and Funnel Analysis.</p>
                    </section>
                )}

                {!loading && !error && activeTab === 'path' && pathResult && (
                    <section className="uj-section uj-path-section">
                        <h2 className="uj-section-title">
                            <Icon icon="mdi:graph" />
                            Path Exploration
                        </h2>
                        <p className="uj-section-desc">See how users navigate from a starting point. Similar to GA4 Path Exploration.</p>

                        <div className="uj-path-controls">
                            <div className="uj-starting-point-select">
                                <label>Starting point:</label>
                                <select
                                    value={startingPoint}
                                    onChange={(e) => setStartingPoint(e.target.value)}
                                >
                                    <option value="">Auto (top entrance)</option>
                                    {allScreens.map((item, i) => (
                                        <option key={i} value={item.label}>
                                            {item.label} ({item.type}) — {formatNumber(item.count)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="uj-path-visualization">
                            {pathResult.path?.steps?.map((step, stepIdx) => (
                                <div key={stepIdx} className="uj-path-step-column">
                                    <div className="uj-path-step-label">
                                        {stepIdx === 0 ? 'Starting point' : `Step +${stepIdx}`}
                                    </div>
                                    <div className="uj-path-nodes">
                                        {step.nodes.map((node, nodeIdx) => (
                                            <div key={nodeIdx} className="uj-path-node">
                                                <span className="uj-path-node-label">{node.label}</span>
                                                <span className="uj-path-node-count">{formatNumber(node.count)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {!loading && !error && activeTab === 'funnel' && funnelResult && (
                    <section className="uj-section uj-funnel-section">
                        <h2 className="uj-section-title">
                            <Icon icon="mdi:filter-variant" />
                            Funnel Analysis
                        </h2>
                        <p className="uj-section-desc">Build funnel steps in order, then review conversion and drop-off at each stage.</p>

                        <div className="uj-funnel-controls">
                            <div className="uj-funnel-steps-input">
                                <label>Step Builder (ordered):</label>
                                <div className="uj-funnel-preset-row">
                                    {FUNNEL_PRESETS.map((preset) => (
                                        <button
                                            key={preset.id}
                                            type="button"
                                            className="uj-funnel-preset-btn"
                                            onClick={() => applyPreset(preset.steps)}
                                        >
                                            {preset.label}
                                        </button>
                                    ))}
                                    <button type="button" className="uj-funnel-reset-btn" onClick={resetFunnelSteps}>
                                        Reset
                                    </button>
                                </div>
                                <div className="uj-funnel-steps-list">
                                    {funnelStepsState.map((step, index) => (
                                        <div key={`${index}-${step}`} className="uj-funnel-step-row">
                                            <span className="uj-funnel-step-number">Step {index + 1}</span>
                                            <input
                                                type="text"
                                                className="uj-funnel-step-select"
                                                list="funnel-step-suggestions"
                                                value={step}
                                                onChange={(e) => updateFunnelStep(index, e.target.value)}
                                                placeholder="Select or type an event/screen"
                                            />
                                            <button
                                                type="button"
                                                className="uj-funnel-step-move"
                                                onClick={() => moveFunnelStep(index, 'up')}
                                                disabled={index === 0}
                                                aria-label={`Move step ${index + 1} up`}
                                            >
                                                <Icon icon="mdi:arrow-up" />
                                            </button>
                                            <button
                                                type="button"
                                                className="uj-funnel-step-move"
                                                onClick={() => moveFunnelStep(index, 'down')}
                                                disabled={index === funnelStepsState.length - 1}
                                                aria-label={`Move step ${index + 1} down`}
                                            >
                                                <Icon icon="mdi:arrow-down" />
                                            </button>
                                            <button
                                                type="button"
                                                className="uj-funnel-step-remove"
                                                onClick={() => removeFunnelStep(index)}
                                                aria-label={`Remove step ${index + 1}`}
                                            >
                                                <Icon icon="mdi:close" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <datalist id="funnel-step-suggestions">
                                    {suggestedFunnelSteps.map((suggestion) => (
                                        <option key={suggestion} value={suggestion} />
                                    ))}
                                </datalist>
                                <div className="uj-funnel-add-row">
                                    <input
                                        type="text"
                                        list="funnel-step-suggestions"
                                        value={newFunnelStep}
                                        onChange={(e) => setNewFunnelStep(e.target.value)}
                                        placeholder="Add another step"
                                    />
                                    <button type="button" className="uj-funnel-add-step" onClick={addFunnelStep}>
                                        <Icon icon="mdi:plus" />
                                        Add Step
                                    </button>
                                </div>
                                {funnelStepsState.length < 2 && (
                                    <div className="uj-funnel-validation">
                                        Add at least 2 steps to run a funnel. Showing default steps for now.
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="uj-funnel-summary">
                            <div className="uj-funnel-summary-item">
                                <span className="label">Entered funnel</span>
                                <span className="value">{formatNumber(funnelResult.totalEntered)}</span>
                            </div>
                            <div className="uj-funnel-summary-item">
                                <span className="label">Converted</span>
                                <span className="value">{formatNumber(funnelResult.totalConverted)}</span>
                            </div>
                            <div className="uj-funnel-summary-item highlight">
                                <span className="label">Overall conversion</span>
                                <span className="value">{funnelResult.overallConversionRate?.toFixed(1) || '0'}%</span>
                            </div>
                        </div>

                        <div className="uj-funnel-visualization">
                            <div className="uj-funnel-chart-container">
                                <div className="uj-funnel-chart-wrapper">
                                    <FunnelChart data={funnelChartData} />
                                </div>
                            </div>
                            {funnelResult.steps?.map((step, idx) => (
                                <div key={idx} className="uj-funnel-step">
                                    <div className="uj-funnel-step-header">
                                        <span className="uj-funnel-step-number">Step {idx + 1}</span>
                                        <span className="uj-funnel-step-name">{step.step}</span>
                                    </div>
                                    <div className="uj-funnel-step-metrics">
                                        <span className="uj-funnel-step-value">{formatNumber(step.count)} users</span>
                                        <span className="uj-funnel-step-conversion">{step.conversionRate?.toFixed(1)}% reached</span>
                                    </div>
                                    {step.dropOff > 0 && (
                                        <div className="uj-funnel-dropoff">
                                            <Icon icon="mdi:arrow-down" />
                                            {formatNumber(step.dropOff)} dropped off
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}

export default UserJourneyAnalytics;
