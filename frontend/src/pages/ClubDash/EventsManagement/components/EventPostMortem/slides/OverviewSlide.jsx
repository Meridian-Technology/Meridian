import React from 'react';
import { PdfIcon } from '../../../../../../contexts/PdfExportContext';
import InsightCallout from './InsightCallout';
import './slides.scss';

function isExternalImageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
        const u = new URL(url, window.location.origin);
        return u.origin !== window.location.origin;
    } catch {
        return false;
    }
}

function getProxyImageUrl(url) {
    if (!url) return url;
    return `/proxy-image?url=${encodeURIComponent(url)}`;
}

function OverviewSlide({ event, stats, orgId, formatNumber, forExport = false, inlineInsights }) {
    const formatDate = (dateString) => {
        if (!dateString) return '';
        return new Date(dateString).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const formatTime = (dateString) => {
        if (!dateString) return '';
        return new Date(dateString).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const registrations = stats?.registrationCount ?? 0;
    const checkIns = stats?.checkIn?.totalCheckedIn ?? 0;
    const checkInRate = stats?.checkIn?.checkInRate ?? (registrations > 0 ? ((checkIns / registrations) * 100).toFixed(1) : '0');
    const org = event?.hostingId;

    return (
        <div className="event-post-mortem-slide">
            <h2 className="event-post-mortem-slide__title">Event Post-Mortem</h2>
            <p className="event-post-mortem-slide__subtitle">Summary of your event performance</p>

            <div className="event-post-mortem-slide__card overview-slide__header">
                {(event?.image || event?.previewImage) ? (
                    <img
                        src={forExport && isExternalImageUrl(event.image || event.previewImage)
                            ? getProxyImageUrl(event.image || event.previewImage)
                            : (event.image || event.previewImage)}
                        alt=""
                        className="overview-slide__event-image"
                        loading="eager"
                    />
                ) : org?.org_profile_image ? (
                    <img
                        src={forExport && isExternalImageUrl(org.org_profile_image)
                            ? getProxyImageUrl(org.org_profile_image)
                            : org.org_profile_image}
                        alt=""
                        className="overview-slide__org-logo"
                        loading="eager"
                    />
                ) : null}
                <div className="overview-slide__header-content">
                    <h3 className="overview-slide__event-name">{event?.name || 'Event'}</h3>
                    <p className="overview-slide__org-name">{org?.org_name || ''}</p>
                    <p className="overview-slide__date">
                        {formatDate(event?.start_time || event?.startTime || event?.start)}
                        {(event?.start_time || event?.startTime || event?.start) && (event?.end_time || event?.endTime || event?.end) && (
                            <> · {formatTime(event.start_time || event.startTime || event.start)} – {formatTime(event.end_time || event.endTime || event.end)}</>
                        )}
                    </p>
                    {forExport && (
                        <div className="overview-slide__header-stats">
                            <div className="overview-slide__stat">
                                <span className="overview-slide__stat-value">{formatNumber(registrations)}</span>
                                <span className="overview-slide__stat-label">Registrations</span>
                            </div>
                            <div className="overview-slide__stat">
                                <span className="overview-slide__stat-value">{formatNumber(checkIns)}</span>
                                <span className="overview-slide__stat-label">Check Ins</span>
                            </div>
                            <div className="overview-slide__stat">
                                <span className="overview-slide__stat-value">{checkInRate}%</span>
                                <span className="overview-slide__stat-label">Check-in Rate</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {!forExport && (
            <div className="overview-slide__stats">
                <div className="overview-slide__stat">
                    <span className="overview-slide__stat-value">{formatNumber(registrations)}</span>
                    <span className="overview-slide__stat-label">Registrations</span>
                </div>
                <div className="overview-slide__stat">
                    <span className="overview-slide__stat-value">{formatNumber(checkIns)}</span>
                    <span className="overview-slide__stat-label">Check-ins</span>
                </div>
                <div className="overview-slide__stat">
                    <span className="overview-slide__stat-value">{checkInRate}%</span>
                    <span className="overview-slide__stat-label">Check-in rate</span>
                </div>
            </div>
            )}
            {inlineInsights?.length > 0 && (
                <InsightCallout insights={inlineInsights} />
            )}

            {event?.expectedAttendance > 0 && (
                <div className="event-post-mortem-slide__card overview-slide__expected">
                    <PdfIcon icon="mdi:target" />
                    <span>Expected attendance: {formatNumber(event.expectedAttendance)}</span>
                </div>
            )}
        </div>
    );
}

export default OverviewSlide;
