import React, { useEffect, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import {
    adminEventLocationLabel,
    formatAdminEventTimeRemaining,
    isAdminEventCurrentlyLive,
} from './adminEventFeedLive';
import './AdminEventFeed.scss';

const LIVE_CLOCK_MS = 30_000;

function useTickingNow(intervalMs = LIVE_CLOCK_MS) {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = window.setInterval(() => setNow(new Date()), intervalMs);
        return () => window.clearInterval(id);
    }, [intervalMs]);
    return now;
}

function humanizeEventStatus(status) {
    if (status == null || status === '') return null;
    return String(status).replace(/_/g, ' ');
}

/** Title-case API tokens (e.g. visibility / type) for readable preview chips. */
function humanizeDisplayLabel(value) {
    if (value == null || value === '') return '';
    return String(value)
        .replace(/_/g, ' ')
        .trim()
        .split(/\s+/)
        .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''))
        .filter(Boolean)
        .join(' ');
}

export function formatAdminEventRange(start, end) {
    const s = start ? new Date(start) : null;
    const e = end ? new Date(end) : null;
    if (!s || Number.isNaN(s.getTime())) return '—';
    const opts = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
    const startStr = s.toLocaleString('en-US', opts);
    if (!e || Number.isNaN(e.getTime())) return startStr;
    const sameDay = s.toDateString() === e.toDateString();
    const endStr = sameDay
        ? e.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        : e.toLocaleString('en-US', opts);
    return `${startStr} – ${endStr}`;
}

export function adminEventHostingLabel(hostingType) {
    if (hostingType === 'Org') return 'Organization';
    if (hostingType === 'User') return 'Member';
    if (hostingType === 'Admin') return 'Admin';
    return hostingType || '—';
}

/**
 * Shared list: loading / error / empty / rows for upcoming/live events.
 */
function AdminEventFeedListBody({ events, loading, error, onOpenEvent, emptyHint }) {
    const now = useTickingNow();

    return (
        <>
            {loading && (
                <div className="admin-event-feed__state">
                    <Icon icon="mdi:loading" className="spin" /> Loading events…
                </div>
            )}
            {error && (
                <div className="admin-event-feed__state admin-event-feed__state--error" role="alert">
                    Could not load events. Try refresh.
                </div>
            )}
            {!loading && !error && events.length === 0 && (
                <div className="admin-event-feed__empty">
                    <Icon icon="mdi:calendar-blank-outline" />
                    <p>{emptyHint || 'No upcoming or live events yet. Create one to get started.'}</p>
                </div>
            )}
            {!loading && !error && events.length > 0 && (
                <ul className="admin-event-feed__list">
                    {events.map((ev) => {
                        const id = ev._id ?? ev.id;
                        const sum = ev.analyticsSummary || {};
                        const regOnFile =
                            ev.registrationCount != null
                                ? ev.registrationCount
                                : (sum.uniqueRegistrations ?? sum.registrations ?? 0);
                        const isLive = isAdminEventCurrentlyLive(ev.start_time, ev.end_time, now);
                        const endsIn = isLive ? formatAdminEventTimeRemaining(ev.end_time, now) : null;
                        const locLabel = adminEventLocationLabel(ev.location);
                        const statusLabel = humanizeEventStatus(ev.status);
                        const expected = ev.expectedAttendance;
                        const rowClass =
                            `admin-event-feed__row${isLive ? ' admin-event-feed__row--live' : ''}`.trim();

                        return (
                            <li
                                key={String(id)}
                                className={rowClass}
                                role="button"
                                tabIndex={0}
                                aria-label={`Open ${ev.name || 'event'} details`}
                                onClick={() => onOpenEvent(ev)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        onOpenEvent(ev);
                                    }
                                }}
                            >
                                <div className="admin-event-feed__title-block">
                                    <div className="admin-event-feed__title-row">
                                        {isLive ? (
                                            <span className="admin-event-feed__live-badge" aria-label="Happening now">
                                                <span className="admin-event-feed__live-dot" aria-hidden />
                                                Live
                                            </span>
                                        ) : null}
                                        <span className="admin-event-feed__title">
                                            {ev.name || 'Untitled event'}
                                        </span>
                                    </div>
                                    <div className="admin-event-feed__meta" aria-label="Schedule and classification">
                                        <span className="admin-event-feed__meta-schedule">
                                            {formatAdminEventRange(ev.start_time, ev.end_time)}
                                        </span>
                                        <div className="admin-event-feed__meta-tags">
                                            <span className="admin-event-feed__meta-pill admin-event-feed__meta-pill--muted">
                                                {adminEventHostingLabel(ev.hostingType)}
                                            </span>
                                            {ev.type ? (
                                                <span className="admin-event-feed__meta-pill">
                                                    {humanizeDisplayLabel(ev.type)}
                                                </span>
                                            ) : null}
                                            {ev.visibility ? (
                                                <span className="admin-event-feed__meta-pill">
                                                    {humanizeDisplayLabel(ev.visibility)}
                                                </span>
                                            ) : null}
                                        </div>
                                    </div>
                                    <div className="admin-event-feed__metrics" aria-label="Engagement summary">
                                        <span title="Total page views">
                                            <Icon icon="mdi:eye-outline" aria-hidden />
                                            {(sum.views ?? 0).toLocaleString()} views
                                        </span>
                                        <span title="Registrations on file">
                                            <Icon icon="mdi:account-group-outline" aria-hidden />
                                            {regOnFile != null ? Number(regOnFile).toLocaleString() : '0'} registered
                                        </span>
                                    </div>
                                    {isLive ? (
                                        <div
                                            className="admin-event-feed__live-details"
                                            aria-label="Live event details"
                                        >
                                            {endsIn ? (
                                                <div className="admin-event-feed__live-detail-line">
                                                    <Icon icon="mdi:broadcast" className="admin-event-feed__live-icon" aria-hidden />
                                                    <span>
                                                        <strong>Now running.</strong> {endsIn}
                                                    </span>
                                                </div>
                                            ) : null}
                                            {locLabel ? (
                                                <div className="admin-event-feed__live-detail-line">
                                                    <Icon
                                                        icon="mdi:map-marker-outline"
                                                        className="admin-event-feed__live-icon"
                                                        aria-hidden
                                                    />
                                                    <span>{locLabel}</span>
                                                </div>
                                            ) : null}
                                            <div className="admin-event-feed__live-detail-line admin-event-feed__live-detail-line--wrap">
                                                {statusLabel ? (
                                                    <span className="admin-event-feed__live-pill">
                                                        Status: {statusLabel}
                                                    </span>
                                                ) : null}
                                                {expected != null ? (
                                                    <span className="admin-event-feed__live-pill">
                                                        Expected: {Number(expected).toLocaleString()}
                                                    </span>
                                                ) : null}
                                                <span className="admin-event-feed__live-pill">
                                                    Registered:{' '}
                                                    {regOnFile != null ? Number(regOnFile).toLocaleString() : '0'}
                                                </span>
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                                <div className="admin-event-feed__actions">
                                    <a
                                        href={`/event/${id}`}
                                        className="admin-event-feed__action-btn admin-event-feed__action-btn--secondary"
                                        target="_blank"
                                        rel="noreferrer"
                                        aria-label="Open public event page in a new tab"
                                        title="Public page"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <Icon icon="mdi:open-in-new" aria-hidden />
                                    </a>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </>
    );
}

export default AdminEventFeedListBody;
