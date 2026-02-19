import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFetch } from '../../../hooks/useFetch';
import { Icon } from '@iconify-icon/react';
import ProportionalBarList from '../../../components/ProportionalBarList/ProportionalBarList';
import '../AnalyticsDashboard/AnalyticsDashboard.scss';

function MobileAnalyticsDashboard() {
    const [timeRange, setTimeRange] = useState('30d');
    const { data: dashboardData, loading, error, refetch } = useFetch(`/dashboard/all?timeRange=${timeRange}&platform=mobile`);

    const formatNumber = (num) => {
        if (num === null || num === undefined) return '0';
        return new Intl.NumberFormat().format(num);
    };

    const formatDuration = (seconds) => {
        if (!seconds) return '0s';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        if (mins > 0) {
            return `${mins}m ${secs}s`;
        }
        return `${secs}s`;
    };

    if (loading) {
        return (
            <div className="analytics-dashboard">
                <div className="loading">Loading mobile analytics...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="analytics-dashboard">
                <div className="error">Error loading analytics: {error}</div>
            </div>
        );
    }

    const data = dashboardData?.data;
    const overview = data?.overview || {};
    const realtime = data?.realtime || {};
    const topPages = data?.topPages?.pages || [];
    const screenViews = data?.screenViews?.pages || [];
    const locations = data?.locations?.locations || [];
    const devices = data?.devicesAndPlatforms || {};
    const events = data?.eventsOverview || {};

    return (
        <div className="analytics-dashboard mobile-analytics">
            <header className="header">
                <div className="header-content">
                    <h1>Mobile App Analytics</h1>
                    <p>Analytics for the Meridian mobile app (iOS & Android)</p>
                    <div className="platform-switcher">
                        <Link to="/analytics-dashboard" className="platform-tab">
                            <Icon icon="mdi:web" /> Web
                        </Link>
                        <span className="platform-tab active">
                            <Icon icon="mdi:cellphone" /> Mobile App
                        </span>
                    </div>
                </div>
                <div className="header-actions">
                    <div className="time-selector">
                        <label>Time Range:</label>
                        <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)}>
                            <option value="1h">Last Hour</option>
                            <option value="24h">Last 24 Hours</option>
                            <option value="7d">Last 7 Days</option>
                            <option value="30d">Last 30 Days</option>
                            <option value="90d">Last 90 Days</option>
                        </select>
                    </div>
                    <button className="refresh-btn" onClick={refetch}>
                        <Icon icon="mdi:refresh" />
                        Refresh
                    </button>
                </div>
            </header>

            <div className="content">
                {/* Overview Metrics */}
                <section className="section">
                    <h2 className="section-title">
                        <Icon icon="mdi:chart-line" />
                        Overview
                    </h2>
                    <div className="metrics-grid">
                        <div className="metric-card">
                            <div className="metric-icon users">
                                <Icon icon="mdi:account-group" />
                            </div>
                            <div className="metric-content">
                                <p>Unique Users</p>
                                <h3>{formatNumber(overview.uniqueUsers)}</h3>
                            </div>
                        </div>

                        <div className="metric-card">
                            <div className="metric-icon sessions">
                                <Icon icon="mdi:cellphone" />
                            </div>
                            <div className="metric-content">
                                <p>Sessions</p>
                                <h3>{formatNumber(overview.sessions)}</h3>
                            </div>
                        </div>

                        <div className="metric-card">
                            <div className="metric-icon views">
                                <Icon icon="mdi:eye" />
                            </div>
                            <div className="metric-content">
                                <p>Screen Views</p>
                                <h3>{formatNumber(overview.pageViews)}</h3>
                            </div>
                        </div>

                        <div className="metric-card">
                            <div className="metric-icon bounce">
                                <Icon icon="mdi:arrow-u-up-right" />
                            </div>
                            <div className="metric-content">
                                <p>Bounce Rate</p>
                                <h3>{overview.bounceRate?.toFixed(1) || '0'}%</h3>
                            </div>
                        </div>

                        <div className="metric-card">
                            <div className="metric-icon duration">
                                <Icon icon="mdi:clock-outline" />
                            </div>
                            <div className="metric-content">
                                <p>Avg Session Duration</p>
                                <h3>{formatDuration(overview.avgSessionDuration)}</h3>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Realtime Metrics */}
                <section className="section">
                    <h2 className="section-title">
                        <Icon icon="mdi:flash" />
                        Realtime (Last 60 Minutes)
                    </h2>
                    <div className="realtime-grid">
                        <div className="realtime-card">
                            <div className="realtime-icon">
                                <Icon icon="mdi:account-multiple" />
                            </div>
                            <div className="realtime-content">
                                <p>Active Users</p>
                                <h3>{formatNumber(realtime.activeUsers)}</h3>
                            </div>
                        </div>

                        <div className="realtime-card">
                            <div className="realtime-icon">
                                <Icon icon="mdi:eye" />
                            </div>
                            <div className="realtime-content">
                                <p>Screen Views</p>
                                <h3>{formatNumber(realtime.pageViews)}</h3>
                            </div>
                        </div>
                    </div>

                    <div className="realtime-sections">
                        <div className="realtime-section">
                            <h3>Top Screens Right Now</h3>
                            <div className="top-pages-list">
                                {realtime.topPages && realtime.topPages.length > 0 ? (
                                    realtime.topPages.map((page, index) => (
                                        <div key={index} className="page-item">
                                            <span className="page-rank">#{index + 1}</span>
                                            <span className="page-path">{page.path}</span>
                                            <span className="page-views">{formatNumber(page.views)} views</span>
                                        </div>
                                    ))
                                ) : (
                                    <div className="empty-state">No recent screen views</div>
                                )}
                            </div>
                        </div>

                        <div className="realtime-section">
                            <h3>Live Events</h3>
                            <div className="live-events-list">
                                {realtime.liveEvents && realtime.liveEvents.length > 0 ? (
                                    realtime.liveEvents.map((event, index) => (
                                        <div key={index} className="event-item">
                                            <span className="event-name">{event.event}</span>
                                            <span className="event-count">{formatNumber(event.count)}</span>
                                        </div>
                                    ))
                                ) : (
                                    <div className="empty-state">No recent events</div>
                                )}
                            </div>
                        </div>
                    </div>
                </section>

                {/* Screen Views - Mobile screens ranked by views */}
                <section className="section">
                    <h2 className="section-title">
                        <Icon icon="mdi:monitor-dashboard" />
                        Screen Views
                    </h2>
                    <p className="section-description">App screens being viewed, ranked from highest to lowest</p>
                    <div className="table-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Screen</th>
                                    <th>Views</th>
                                </tr>
                            </thead>
                            <tbody>
                                {screenViews.length > 0 ? (
                                    screenViews.map((page, index) => (
                                        <tr key={index}>
                                            <td className="rank-cell">{index + 1}</td>
                                            <td className="page-path-cell">{page.screen}</td>
                                            <td>{formatNumber(page.views)}</td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="3" className="empty-state">No screen view data available</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* Top Screens */}
                <section className="section">
                    <h2 className="section-title">
                        <Icon icon="mdi:cellphone" />
                        Top Screens
                    </h2>
                    <div className="table-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Screen</th>
                                    <th>Views</th>
                                    <th>Entrances</th>
                                    <th>Exits</th>
                                    <th>Exit Rate</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topPages.length > 0 ? (
                                    topPages.map((page, index) => (
                                        <tr key={index}>
                                            <td className="page-path-cell">{page.path}</td>
                                            <td>{formatNumber(page.views)}</td>
                                            <td>{formatNumber(page.entrances)}</td>
                                            <td>{formatNumber(page.exits)}</td>
                                            <td>{page.exitRate?.toFixed(1) || '0'}%</td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="5" className="empty-state">No screen data available</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* Devices & Platforms - iOS/Android focused */}
                <section className="section">
                    <h2 className="section-title">
                        <Icon icon="mdi:devices" />
                        Devices & Platforms
                    </h2>
                    <div className="devices-grid proportional-bar-grid">
                        <ProportionalBarList
                            items={(devices.platforms || []).map((p, i) => {
                                const plat = (p.platform || '').toLowerCase();
                                return {
                                    key: p.platform || `platform-${i}`,
                                    label: p.platform || 'Unknown',
                                    icon: plat === 'ios' ? 'mdi:apple' : plat === 'android' ? 'mdi:android' : 'mdi:cellphone',
                                    value: p.users ?? 0
                                };
                            })}
                            header="Platforms (iOS / Android)"
                            icon="mdi:cellphone"
                            classN="proportional-bar-list-container"
                            size="1rem"
                            formatValue={(v) => `${formatNumber(v)} users`}
                            emptyMessage="No platform data"
                        />
                        <ProportionalBarList
                            items={(devices.devices || []).slice(0, 15).map((d, i) => ({
                                key: d.device || `device-${i}`,
                                label: d.device || 'Unknown',
                                icon: 'mdi:cellphone',
                                value: d.users ?? 0
                            }))}
                            header="Device Models"
                            icon="mdi:cellphone-link"
                            classN="proportional-bar-list-container"
                            size="1rem"
                            formatValue={(v) => `${formatNumber(v)} users`}
                            emptyMessage="No device model data"
                        />
                        <ProportionalBarList
                            items={(devices.os || []).slice(0, 15).map((o, i) => {
                                const osStr = (o.os || '').toLowerCase();
                                return {
                                    key: o.os || `os-${i}`,
                                    label: o.os || 'Unknown',
                                    icon: osStr.includes('ios') || osStr.includes('iphone') ? 'mdi:apple' : 'mdi:android',
                                    value: o.users ?? 0
                                };
                            })}
                            header="OS Versions"
                            icon="mdi:android"
                            classN="proportional-bar-list-container"
                            size="1rem"
                            formatValue={(v) => `${formatNumber(v)} users`}
                            emptyMessage="No OS version data"
                        />
                    </div>
                </section>

                {/* Events Overview */}
                <section className="section">
                    <h2 className="section-title">
                        <Icon icon="mdi:chart-box" />
                        Events Overview
                    </h2>
                    <div className="events-summary">
                        <div className="events-stats">
                            <div className="stat-item">
                                <p>Avg Events per Session</p>
                                <h3>{events.eventsPerSession?.avgEventsPerSession?.toFixed(2) || '0'}</h3>
                            </div>
                            <div className="stat-item">
                                <p>Total Sessions</p>
                                <h3>{formatNumber(events.eventsPerSession?.totalSessions)}</h3>
                            </div>
                        </div>
                    </div>
                    <div className="table-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Event</th>
                                    <th>Count</th>
                                    <th>Unique Sessions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {events.topEvents && events.topEvents.length > 0 ? (
                                    events.topEvents.map((event, index) => (
                                        <tr key={index}>
                                            <td className="event-name-cell">{event.event}</td>
                                            <td>{formatNumber(event.count)}</td>
                                            <td>{formatNumber(event.uniqueSessions)}</td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="3" className="empty-state">No event data available</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* Locations */}
                {locations.length > 0 && (
                    <section className="section">
                        <h2 className="section-title">
                            <Icon icon="mdi:map-marker" />
                            Locations
                        </h2>
                        <div className="table-container">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Country</th>
                                        <th>Region</th>
                                        <th>City</th>
                                        <th>Users</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {locations.map((location, index) => (
                                        <tr key={index}>
                                            <td>{location.country}</td>
                                            <td>{location.region}</td>
                                            <td>{location.city}</td>
                                            <td>{formatNumber(location.users)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}

export default MobileAnalyticsDashboard;
