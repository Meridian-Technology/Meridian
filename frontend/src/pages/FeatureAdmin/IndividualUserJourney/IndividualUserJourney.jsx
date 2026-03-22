import React, { useState, useRef, useEffect } from 'react';
import { Link, useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useFetch } from '../../../hooks/useFetch';
import { Icon } from '@iconify-icon/react';
import './IndividualUserJourney.scss';

function ManualLookupForm({ timeRange }) {
    const navigate = useNavigate();
    const [userQuery, setUserQuery] = useState('');
    const [anonymousId, setAnonymousId] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const debounceRef = useRef(null);

    const isObjectId = (str) => /^[a-fA-F0-9]{24}$/.test(str);

    useEffect(() => {
        const q = userQuery.trim();
        if (!q || isObjectId(q)) {
            setSearchResults([]);
            setSearching(false);
            return;
        }
        setSearching(true);
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            try {
                const { default: axios } = await import('axios');
                const res = await axios.get(`/search-users?query=${encodeURIComponent(q)}&limit=8`, { withCredentials: true });
                setSearchResults(res.data?.data || []);
            } catch {
                setSearchResults([]);
            } finally {
                setSearching(false);
            }
        }, 300);
        return () => clearTimeout(debounceRef.current);
    }, [userQuery]);

    const handleUserLookup = (e) => {
        e.preventDefault();
        const q = userQuery.trim();
        if (q) navigate(`/user-journey/user/${q}?timeRange=${timeRange}`);
    };

    const handlePickUser = (id) => {
        setUserQuery('');
        setSearchResults([]);
        navigate(`/user-journey/user/${id}?timeRange=${timeRange}`);
    };

    const handleAnonymousLookup = (e) => {
        e.preventDefault();
        const id = anonymousId.trim();
        if (id) navigate(`/user-journey/anonymous/${encodeURIComponent(id)}?timeRange=${timeRange}`);
    };

    return (
        <div className="ij-manual-forms">
            <form className="ij-lookup-form ij-user-search-form" onSubmit={handleUserLookup}>
                <label>Search by name, username, or ObjectId:</label>
                <div className="ij-search-input-wrap">
                    <input
                        type="text"
                        placeholder="e.g. John, @johndoe, or 507f1f77bcf86cd799439011"
                        value={userQuery}
                        onChange={(e) => setUserQuery(e.target.value)}
                    />
                    {isObjectId(userQuery.trim()) && (
                        <button type="submit">View Journey</button>
                    )}
                </div>
                {searching && <span className="ij-search-hint">Searching…</span>}
                {searchResults.length > 0 && (
                    <div className="ij-search-results">
                        {searchResults.map((u) => (
                            <button
                                key={u._id}
                                type="button"
                                className="ij-search-result-item"
                                onClick={() => handlePickUser(u._id)}
                            >
                                <span className="ij-result-name">
                                    {u.name || u.username || u.email || u._id}
                                </span>
                                <span className="ij-result-meta">
                                    {u.username && `@${u.username}`}
                                    {u.username && u.email && ' · '}
                                    {u.email}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
                {!searching && userQuery.trim() && !isObjectId(userQuery.trim()) && searchResults.length === 0 && (
                    <span className="ij-search-hint">No users found</span>
                )}
            </form>
            <form className="ij-lookup-form" onSubmit={handleAnonymousLookup}>
                <label>Anonymous ID (UUID):</label>
                <input
                    type="text"
                    placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                    value={anonymousId}
                    onChange={(e) => setAnonymousId(e.target.value)}
                />
                <button type="submit" disabled={!anonymousId.trim()}>View Journey</button>
            </form>
        </div>
    );
}

function IndividualUserJourney() {
    const { type, identifier } = useParams();
    const [searchParams] = useSearchParams();
    const timeRange = searchParams.get('timeRange') || '90d';
    const platform = searchParams.get('platform') || '';

    const journeyUrl = type && identifier
        ? `/dashboard/individual-journey/${type}/${encodeURIComponent(identifier)}?timeRange=${timeRange}${platform ? `&platform=${platform}` : ''}`
        : null;
    const identifiersUrl = `/dashboard/recent-user-identifiers?timeRange=30d${platform ? `&platform=${platform}` : ''}&limit=30`;

    const { data: journeyData, loading: journeyLoading, error: journeyError, refetch: refetchJourney } = useFetch(journeyUrl);
    const { data: identifiersData } = useFetch(type && identifier ? null : identifiersUrl);

    const result = journeyData?.data;
    const identity = result?.identity;
    const userProfile = result?.userProfile;
    const events = result?.events || [];
    const summary = result?.summary;
    const identifiers = identifiersData?.data;

    const sessionGroups = React.useMemo(() => {
        const rawSessions = [...(result?.sessions || [])].sort((a, b) => {
            const endA = a.end ? new Date(a.end).getTime() : 0;
            const endB = b.end ? new Date(b.end).getTime() : 0;
            return endB - endA;
        });
        const eventMap = new Map();
        for (const ev of events) {
            const sid = ev.session_id || 'unknown';
            if (!eventMap.has(sid)) eventMap.set(sid, []);
            eventMap.get(sid).push(ev);
        }
        return rawSessions.map((s) => ({
            ...s,
            events: eventMap.get(s.sessionId) || [],
        }));
    }, [result?.sessions, events]);

    const SESSIONS_BATCH = 5;
    const [visibleSessionsCount, setVisibleSessionsCount] = useState(SESSIONS_BATCH);
    const [expandedSessions, setExpandedSessions] = useState(new Set());
    const loadMoreRef = useRef(null);

    useEffect(() => {
        setVisibleSessionsCount(SESSIONS_BATCH);
        setExpandedSessions(new Set());
    }, [type, identifier]);

    useEffect(() => {
        if (!loadMoreRef.current || sessionGroups.length <= visibleSessionsCount) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setVisibleSessionsCount((n) => Math.min(n + SESSIONS_BATCH, sessionGroups.length));
                }
            },
            { rootMargin: '200px', threshold: 0 }
        );
        observer.observe(loadMoreRef.current);
        return () => observer.disconnect();
    }, [sessionGroups.length, visibleSessionsCount]);

    const toggleSession = (sessionId) => {
        setExpandedSessions((prev) => {
            const next = new Set(prev);
            if (next.has(sessionId)) next.delete(sessionId);
            else next.add(sessionId);
            return next;
        });
    };

    const formatTime = (dt) => {
        if (!dt) return '—';
        const d = new Date(dt);
        return d.toLocaleString();
    };

    const formatDuration = (seconds) => {
        if (seconds == null) return '—';
        if (seconds < 60) return `${seconds}s`;
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return secs ? `${mins}m ${secs}s` : `${mins}m`;
    };

    const getEventLabel = (ev) => {
        if (ev.event === 'screen_view') {
            return ev.context?.screen || ev.properties?.screen_name || ev.properties?.path || 'Screen View';
        }
        return ev.event;
    };

    const getEventIcon = (ev) => {
        if (ev.event === 'screen_view') return 'mdi:page-layout-body';
        if (ev.event?.includes('click') || ev.event?.includes('tap')) return 'mdi:cursor-default-click';
        if (ev.event?.includes('rsvp') || ev.event?.includes('registration')) return 'mdi:calendar-check';
        return 'mdi:circle-small';
    };

    return (
        <div className="individual-user-journey">
            <header className="ij-header">
                <div className="ij-header-content">
                    <div className="ij-breadcrumb">
                        <Link to="/analytics-dashboard" className="ij-breadcrumb-link">
                            <Icon icon="mdi:arrow-left" /> Web Analytics
                        </Link>
                        <span className="ij-breadcrumb-sep">/</span>
                        <Link to="/user-journey-analytics" className="ij-breadcrumb-link">
                            User Journey
                        </Link>
                        <span className="ij-breadcrumb-sep">/</span>
                        <span className="ij-breadcrumb-current">Individual Journey</span>
                    </div>
                    <h1>Individual User Journey</h1>
                    <p>View activity for a specific user or anonymous visitor — combines anonymous browsing and authenticated account activity</p>
                </div>
            </header>

            <div className="ij-content">
                {!type || !identifier ? (
                    <section className="ij-section ij-lookup-section">
                        <h2 className="ij-section-title">
                            <Icon icon="mdi:account-search" />
                            Look Up a User or Visitor
                        </h2>
                        <p className="ij-section-desc">
                            Select a user or anonymous visitor below to view their full journey. Authenticated users show both pre-login (anonymous) and post-login activity.
                        </p>

                        <div className="ij-lookup-grid">
                            <div className="ij-lookup-block">
                                <h3><Icon icon="mdi:account" /> Authenticated Users</h3>
                                <div className="ij-identifier-list">
                                    {identifiers?.users?.length ? (
                                        identifiers.users.map((u, i) => (
                                            <Link
                                                key={i}
                                                to={`/user-journey/user/${u.userId}?timeRange=${timeRange}`}
                                                className="ij-identifier-item"
                                            >
                                                <span className="ij-id">{u.name || u.username ? `${u.name || ''} ${u.username ? `@${u.username}` : ''}`.trim() : `${String(u.userId).slice(-8)}…`}</span>
                                                <span className="ij-meta">{u.eventCount} events · {formatTime(u.lastSeen)}</span>
                                            </Link>
                                        ))
                                    ) : (
                                        <div className="ij-empty">No authenticated users in the last 30 days</div>
                                    )}
                                </div>
                            </div>
                            <div className="ij-lookup-block">
                                <h3><Icon icon="mdi:account-question" /> Anonymous Visitors</h3>
                                <div className="ij-identifier-list">
                                    {identifiers?.anonymous?.length ? (
                                        identifiers.anonymous.map((a, i) => (
                                            <Link
                                                key={i}
                                                to={`/user-journey/anonymous/${encodeURIComponent(a.anonymousId)}?timeRange=${timeRange}`}
                                                className="ij-identifier-item"
                                            >
                                                <span className="ij-id">{String(a.anonymousId).slice(0, 8)}…</span>
                                                <span className="ij-meta">{a.eventCount} events · {formatTime(a.lastSeen)}</span>
                                            </Link>
                                        ))
                                    ) : (
                                        <div className="ij-empty">No anonymous visitors in the last 30 days</div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="ij-manual-lookup">
                            <h3>Manual Lookup</h3>
                            <p className="ij-hint">Enter a User ID (MongoDB ObjectId, 24 chars) or Anonymous ID (UUID) to view their journey.</p>
                            <ManualLookupForm timeRange={timeRange} />
                        </div>
                    </section>
                ) : (
                    <>
                        {journeyLoading && (
                            <div className="ij-loading">
                                <Icon icon="mdi:loading" className="spin" />
                                Loading journey...
                            </div>
                        )}

                        {journeyError && (
                            <div className="ij-error">Error: {journeyError}</div>
                        )}

                        {result?.error && (
                            <div className="ij-error">{result.error}</div>
                        )}

                        {!journeyLoading && !journeyError && !result?.error && identity && (
                            <>
                                <div className="ij-detail-actions">
                                    <Link to="/user-journey" className="ij-back-link">
                                        <Icon icon="mdi:arrow-left" /> Back to lookup
                                    </Link>
                                    <button className="ij-refresh-btn" onClick={refetchJourney}>
                                        <Icon icon="mdi:refresh" /> Refresh
                                    </button>
                                </div>
                                <section className="ij-section ij-identity-section">
                                    <h2 className="ij-section-title">
                                        <Icon icon={identity.isAuthenticated ? 'mdi:account-check' : 'mdi:account-question'} />
                                        Identity
                                    </h2>
                                    <div className="ij-identity-cards">
                                        <div className={`ij-identity-card ${identity.isAuthenticated ? 'authenticated' : 'anonymous'}`}>
                                            <div className="ij-identity-badge">
                                                <Icon icon={identity.isAuthenticated ? 'mdi:account-check' : 'mdi:incognito'} />
                                                {identity.isAuthenticated ? 'Authenticated' : 'Anonymous Visitor'}
                                            </div>
                                            <p className="ij-identity-id">
                                                {type === 'user' ? `User ID: ${identifier}` : `Anonymous ID: ${String(identifier).slice(0, 12)}…`}
                                            </p>
                                            {type === 'user' && userProfile && (
                                                <p className="ij-identity-name">
                                                    {userProfile.name && <span className="ij-name">{userProfile.name}</span>}
                                                    {userProfile.username && (
                                                        <span className="ij-username">@{userProfile.username}</span>
                                                    )}
                                                    {!userProfile.name && !userProfile.username && userProfile.email && (
                                                        <span className="ij-email">{userProfile.email}</span>
                                                    )}
                                                </p>
                                            )}
                                            {identity.linkedAnonymousIds?.length > 0 && (
                                                <p className="ij-identity-linked">
                                                    Linked anonymous sessions: {identity.linkedAnonymousIds.length}
                                                </p>
                                            )}
                                        </div>
                                        <div className="ij-identity-stats">
                                            <div className="ij-stat">
                                                <span className="ij-stat-value">{summary?.totalEvents ?? 0}</span>
                                                <span className="ij-stat-label">Events</span>
                                            </div>
                                            <div className="ij-stat">
                                                <span className="ij-stat-value">{summary?.totalSessions ?? 0}</span>
                                                <span className="ij-stat-label">Sessions</span>
                                            </div>
                                            <div className="ij-stat">
                                                <span className="ij-stat-value">{summary?.screenViews ?? 0}</span>
                                                <span className="ij-stat-label">Page Views</span>
                                            </div>
                                            <div className="ij-stat">
                                                <span className="ij-stat-value">{formatTime(summary?.firstSeen)}</span>
                                                <span className="ij-stat-label">First Seen</span>
                                            </div>
                                            <div className="ij-stat">
                                                <span className="ij-stat-value">{formatTime(summary?.lastSeen)}</span>
                                                <span className="ij-stat-label">Last Seen</span>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                <section className="ij-section ij-sessions-section">
                                    <h2 className="ij-section-title">
                                        <Icon icon="mdi:web" />
                                        Sessions ({sessionGroups.length})
                                    </h2>
                                    <div className="ij-sessions-list">
                                        {sessionGroups.slice(0, visibleSessionsCount).map((s) => {
                                            const isExpanded = expandedSessions.has(s.sessionId);
                                            return (
                                                <div key={s.sessionId} className={`ij-session-group ${isExpanded ? 'expanded' : ''}`}>
                                                    <button
                                                        className="ij-session-card"
                                                        onClick={() => toggleSession(s.sessionId)}
                                                    >
                                                        <Icon
                                                            icon="mdi:chevron-right"
                                                            className="ij-session-chevron"
                                                        />
                                                        <span className="ij-session-id">{String(s.sessionId).slice(0, 8)}…</span>
                                                        <span className="ij-session-events">{s.eventCount} events</span>
                                                        <span className="ij-session-duration">{formatDuration(s.durationSeconds)}</span>
                                                        <span className="ij-session-time">{formatTime(s.start)} → {formatTime(s.end)}</span>
                                                    </button>
                                                    {isExpanded && (
                                                        <div className="ij-session-events-list">
                                                            {s.events.length > 0 ? s.events.map((ev, i) => (
                                                                <div key={i} className={`ij-timeline-item ${ev.user_id ? 'authenticated' : 'anonymous'}`}>
                                                                    <div className="ij-timeline-marker">
                                                                        <Icon icon={getEventIcon(ev)} />
                                                                    </div>
                                                                    <div className="ij-timeline-content">
                                                                        <div className="ij-timeline-header">
                                                                            <span className="ij-timeline-event">{getEventLabel(ev)}</span>
                                                                            <span className="ij-timeline-time">{formatTime(ev.ts)}</span>
                                                                        </div>
                                                                        <div className="ij-timeline-badges">
                                                                            {ev.user_id && <span className="ij-badge auth">Authenticated</span>}
                                                                            {!ev.user_id && <span className="ij-badge anon">Anonymous</span>}
                                                                            <span className="ij-badge platform">{ev.platform || 'web'}</span>
                                                                        </div>
                                                                        {ev.properties && Object.keys(ev.properties).length > 0 && (
                                                                            <pre className="ij-timeline-props">
                                                                                {JSON.stringify(ev.properties, null, 2)}
                                                                            </pre>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )) : (
                                                                <div className="ij-session-no-events">No events recorded for this session</div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        {sessionGroups.length > visibleSessionsCount && (
                                            <div ref={loadMoreRef} className="ij-sessions-load-more">
                                                <Icon icon="mdi:loading" className="spin" />
                                                Loading more sessions…
                                            </div>
                                        )}
                                    </div>
                                </section>
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

export default IndividualUserJourney;
