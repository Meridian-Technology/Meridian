import React from 'react';
import { Icon } from '@iconify-icon/react';
import './EventDashboard.scss';

function EventOverview({ event, stats, onRefresh }) {
    const formatDate = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const formatTime = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getDuration = () => {
        if (!event?.start_time || !event?.end_time) return 'N/A';
        const start = new Date(event.start_time);
        const end = new Date(event.end_time);
        const diff = end - start;
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        
        if (hours > 0 && minutes > 0) {
            return `${hours}h ${minutes}m`;
        } else if (hours > 0) {
            return `${hours}h`;
        } else {
            return `${minutes}m`;
        }
    };

    return (
        <div className="event-overview">
            <div className="overview-grid">
                <div className="overview-card timeline-card">
                    <h3>
                        <Icon icon="mdi:timeline" />
                        Event Timeline
                    </h3>
                    <div className="timeline-content">
                        <div className="timeline-item">
                            <div className="timeline-marker start"></div>
                            <div className="timeline-content-item">
                                <span className="timeline-label">Start</span>
                                <span className="timeline-value">
                                    {formatDate(event?.start_time)} at {formatTime(event?.start_time)}
                                </span>
                            </div>
                        </div>
                        <div className="timeline-item">
                            <div className="timeline-marker end"></div>
                            <div className="timeline-content-item">
                                <span className="timeline-label">End</span>
                                <span className="timeline-value">
                                    {formatDate(event?.end_time)} at {formatTime(event?.end_time)}
                                </span>
                            </div>
                        </div>
                        <div className="timeline-item duration">
                            <Icon icon="mdi:clock-outline" />
                            <span>Duration: {getDuration()}</span>
                        </div>
                    </div>
                </div>

                <div className="overview-card stats-card">
                    <h3>
                        <Icon icon="mingcute:chart-bar-fill" />
                        Quick Stats
                    </h3>
                    <div className="stats-grid">
                        <div className="stat-box">
                            <div className="stat-icon-wrapper" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
                                <Icon icon="mingcute:user-group-fill" />
                            </div>
                            <div className="stat-box-content">
                                <span className="stat-box-value">{stats?.rsvps?.going || 0}</span>
                                <span className="stat-box-label">RSVPs</span>
                            </div>
                        </div>
                        <div className="stat-box">
                            <div className="stat-icon-wrapper" style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }}>
                                <Icon icon="mdi:account-check" />
                            </div>
                            <div className="stat-box-content">
                                <span className="stat-box-value">{stats?.volunteers?.confirmed || 0}</span>
                                <span className="stat-box-label">Volunteers</span>
                            </div>
                        </div>
                        <div className="stat-box">
                            <div className="stat-icon-wrapper" style={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' }}>
                                <Icon icon="mdi:account-multiple-check" />
                            </div>
                            <div className="stat-box-content">
                                <span className="stat-box-value">{stats?.volunteers?.checkedIn || 0}</span>
                                <span className="stat-box-label">Checked In</span>
                            </div>
                        </div>
                        <div className="stat-box">
                            <div className="stat-icon-wrapper" style={{ background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' }}>
                                <Icon icon="mdi:account-question" />
                            </div>
                            <div className="stat-box-content">
                                <span className="stat-box-value">{stats?.rsvps?.maybe || 0}</span>
                                <span className="stat-box-label">Maybe</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="overview-card description-card">
                    <h3>
                        <Icon icon="mdi:text" />
                        Description
                    </h3>
                    <p>{event?.description || 'No description provided.'}</p>
                </div>

                <div className="overview-card details-card">
                    <h3>
                        <Icon icon="mdi:information" />
                        Event Details
                    </h3>
                    <div className="details-list">
                        <div className="detail-row">
                            <Icon icon="mdi:tag" />
                            <span className="detail-label">Type:</span>
                            <span className="detail-value">{event?.type || 'N/A'}</span>
                        </div>
                        <div className="detail-row">
                            <Icon icon="mdi:eye" />
                            <span className="detail-label">Visibility:</span>
                            <span className="detail-value">{event?.visibility || 'N/A'}</span>
                        </div>
                        <div className="detail-row">
                            <Icon icon="mingcute:user-group-fill" />
                            <span className="detail-label">Expected Attendance:</span>
                            <span className="detail-value">{event?.expectedAttendance || 0}</span>
                        </div>
                        {event?.contact && (
                            <div className="detail-row">
                                <Icon icon="mdi:email" />
                                <span className="detail-label">Contact:</span>
                                <span className="detail-value">{event.contact}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default EventOverview;
