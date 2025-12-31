import React, { useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../hooks/useFetch';
import { useParams } from 'react-router-dom';
import KpiCard from '../Analytics/Dashboard/KpiCard';
import './EventAnalytics.scss';

function EventAnalytics() {
    const { eventId } = useParams();
    const [timeRange, setTimeRange] = useState('30d');
    const { data: analytics, loading, error } = useFetch(`/event-analytics/event/${eventId}?timeRange=${timeRange}`);

    const formatNumber = (num) => {
        return new Intl.NumberFormat().format(num);
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getTimeRangeLabel = (range) => {
        const labels = {
            '7d': 'Last 7 Days',
            '30d': 'Last 30 Days',
            '90d': 'Last 90 Days'
        };
        return labels[range] || range;
    };

    if (loading) {
        return (
            <div className="event-analytics">
                <div className="loading">Loading event analytics...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="event-analytics">
                <div className="error">Error loading analytics: {error}</div>
            </div>
        );
    }

    const data = analytics?.data;

    return (
        <div className="event-analytics">
            <div className="analytics-header">
                <div className="header-content">
                    <h1>Event Analytics</h1>
                    <h2>{data?.event?.name}</h2>
                    <p className="event-dates">
                        {data?.event?.start_time && formatDate(data.event.start_time)} - 
                        {data?.event?.end_time && formatDate(data.event.end_time)}
                    </p>
                </div>
                <div className="time-range-selector">
                    <button 
                        className={timeRange === '7d' ? 'active' : ''} 
                        onClick={() => setTimeRange('7d')}
                    >
                        7 Days
                    </button>
                    <button 
                        className={timeRange === '30d' ? 'active' : ''} 
                        onClick={() => setTimeRange('30d')}
                    >
                        30 Days
                    </button>
                    <button 
                        className={timeRange === '90d' ? 'active' : ''} 
                        onClick={() => setTimeRange('90d')}
                    >
                        90 Days
                    </button>
                </div>
            </div>

            <div className="analytics-overview">
                <KpiCard
                    icon="mingcute:eye-fill"
                    title="Logged-in Views"
                    value={formatNumber(data?.views || 0)}
                    subtitle={`${formatNumber(data?.uniqueViews || 0)} unique logged-in`}
                />

                <KpiCard
                    icon="mdi:anonymous"
                    title="Anonymous Views"
                    value={formatNumber(data?.anonymousViews || 0)}
                    subtitle={`${formatNumber(data?.uniqueAnonymousViews || 0)} unique anonymous`}
                />

                <KpiCard
                    icon="mingcute:user-add-fill"
                    title="Total RSVPs"
                    value={formatNumber(data?.rsvps || 0)}
                    subtitle={`${formatNumber(data?.uniqueRsvps || 0)} unique RSVPs`}
                />

                <KpiCard
                    icon="mingcute:trending-up-fill"
                    title="Engagement Rate"
                    value={`${data?.engagementRate || 0}%`}
                    subtitle="RSVPs per view"
                />
            </div>

            <div className="analytics-sections">
                <div className="section">
                    <h3>Recent Views ({getTimeRangeLabel(timeRange)})</h3>
                    <div className="history-list">
                        {data?.viewHistory?.length > 0 ? (
                            data.viewHistory.slice(0, 10).map((view, index) => (
                                <div key={index} className="history-item">
                                    <div className="history-icon">
                                        <Icon icon="mingcute:eye-fill" />
                                    </div>
                                    <div className="history-content">
                                        <p className="history-time">{formatDate(view.timestamp)}</p>
                                        <p className="history-detail">User viewed this event</p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="no-data">No views recorded in this time period</div>
                        )}
                    </div>
                </div>

                <div className="section">
                    <h3>Recent RSVPs ({getTimeRangeLabel(timeRange)})</h3>
                    <div className="history-list">
                        {data?.rsvpHistory?.length > 0 ? (
                            data.rsvpHistory.slice(0, 10).map((rsvp, index) => (
                                <div key={index} className="history-item">
                                    <div className={`history-icon ${rsvp.status}`}>
                                        <Icon icon="mingcute:user-add-fill" />
                                    </div>
                                    <div className="history-content">
                                        <p className="history-time">{formatDate(rsvp.timestamp)}</p>
                                        <p className="history-detail">
                                            User RSVP'd as <span className={`status ${rsvp.status}`}>{rsvp.status}</span>
                                        </p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="no-data">No RSVPs recorded in this time period</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default EventAnalytics;
