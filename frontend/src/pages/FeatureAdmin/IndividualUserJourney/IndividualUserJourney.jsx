import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useFetch } from '../../../hooks/useFetch';
import { Icon } from '@iconify-icon/react';
import './IndividualUserJourney.scss';

function ManualLookupForm({ onLookup }) {
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
        if (q) onLookup('user', q);
    };

    const handlePickUser = (id) => {
        setUserQuery('');
        setSearchResults([]);
        onLookup('user', id);
    };

    const handleAnonymousLookup = (e) => {
        e.preventDefault();
        const id = anonymousId.trim();
        if (id) onLookup('anonymous', id);
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
    const navigate = useNavigate();
    const location = useLocation();
    const { type, identifier } = useParams();
    const [searchParams, setSearchParams] = useSearchParams();
    const timeRange = searchParams.get('timeRange') || '90d';
    const platform = searchParams.get('platform') || '';
    const isAdminEmbedded = location.pathname.startsWith('/admin');
    const activeType = type || searchParams.get('ijType') || '';
    const activeIdentifier = identifier || searchParams.get('ijIdentifier') || '';

    const navigateToJourney = (nextType, nextIdentifier) => {
        const safeIdentifier = String(nextIdentifier || '').trim();
        if (!nextType || !safeIdentifier) return;
        if (isAdminEmbedded) {
            setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.set('ijType', nextType);
                next.set('ijIdentifier', safeIdentifier);
                next.set('timeRange', timeRange);
                if (platform) next.set('platform', platform);
                else next.delete('platform');
                return next;
            }, { replace: true });
            return;
        }
        navigate(`/user-journey/${nextType}/${encodeURIComponent(safeIdentifier)}?timeRange=${timeRange}${platform ? `&platform=${platform}` : ''}`);
    };

    const backToLookup = () => {
        if (isAdminEmbedded) {
            setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.delete('ijType');
                next.delete('ijIdentifier');
                return next;
            }, { replace: true });
            return;
        }
        navigate(`/user-journey?timeRange=${timeRange}${platform ? `&platform=${platform}` : ''}`);
    };

    const journeyUrl = activeType && activeIdentifier
        ? `/dashboard/individual-journey/${activeType}/${encodeURIComponent(activeIdentifier)}?timeRange=${timeRange}${platform ? `&platform=${platform}` : ''}&includeEvents=false`
        : null;
    const identifiersUrl = `/dashboard/recent-user-identifiers?timeRange=30d${platform ? `&platform=${platform}` : ''}&limit=30`;

    const { data: journeyData, loading: journeyLoading, error: journeyError, refetch: refetchJourney } = useFetch(journeyUrl);
    const { data: identifiersData } = useFetch(activeType && activeIdentifier ? null : identifiersUrl);

    const result = journeyData?.data;
    const identity = result?.identity;
    const userProfile = result?.userProfile;
    const summary = result?.summary;
    const identifiers = identifiersData?.data;

    const sessionGroups = React.useMemo(() => {
        const isMobileWebEvent = (ev) => {
            const ctx = ev?.context || {};
            const props = ev?.properties || {};
            return (
                ctx.device_type === 'mobile' ||
                props.device_type === 'mobile' ||
                props.isMobile === true ||
                props.mobile === true ||
                props.viewport_width < 768
            );
        };

        const classifySessionPlatform = (sessionEvents) => {
            const platforms = new Set(sessionEvents.map((ev) => ev?.platform).filter(Boolean));
            if (platforms.has('ios') || platforms.has('android')) return 'mobile_app';
            if (platforms.has('web') && sessionEvents.some(isMobileWebEvent)) return 'mobile_web';
            if (platforms.has('web')) return 'desktop_web';
            return 'unknown';
        };

        const rawSessions = [...(result?.sessions || [])].sort((a, b) => {
            const endA = a.end ? new Date(a.end).getTime() : 0;
            const endB = b.end ? new Date(b.end).getTime() : 0;
            return endB - endA;
        });
        return rawSessions.map((s) => {
            const sortedEvents = [];
            const platformType = classifySessionPlatform(sortedEvents);
            const screenViews = sortedEvents.filter((ev) => ev.event === 'screen_view').length;
            const firstEvent = sortedEvents[sortedEvents.length - 1];
            const lastEvent = sortedEvents[0];
            const entryPoint = firstEvent
                ? (firstEvent.context?.screen || firstEvent.properties?.path || firstEvent.event)
                : null;

            return {
                ...s,
                events: sortedEvents,
                platformType,
                screenViews,
                firstEventAt: firstEvent?.ts || s.start,
                lastEventAt: lastEvent?.ts || s.end,
                entryPoint,
            };
        });
    }, [result?.sessions]);

    const SESSIONS_BATCH = 5;
    const EVENTS_BATCH = 100;
    const [visibleSessionsCount, setVisibleSessionsCount] = useState(SESSIONS_BATCH);
    const [expandedSessions, setExpandedSessions] = useState(new Set());
    const [sessionEventsById, setSessionEventsById] = useState({});
    const loadMoreRef = useRef(null);

    useEffect(() => {
        setVisibleSessionsCount(SESSIONS_BATCH);
        setExpandedSessions(new Set());
        setSessionEventsById({});
    }, [activeType, activeIdentifier]);

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

    const loadSessionEvents = async (sessionId, append = false, explicitOffset = null) => {
        setSessionEventsById((prev) => {
            const curr = prev[sessionId] || { events: [], offset: 0, total: 0, hasMore: true };
            return {
                ...prev,
                [sessionId]: { ...curr, loading: true, error: null }
            };
        });

        try {
            const curr = sessionEventsById[sessionId] || { events: [], offset: 0 };
            const nextOffset = explicitOffset != null
                ? explicitOffset
                : (append ? curr.offset || curr.events.length || 0 : 0);
            const url = `/dashboard/individual-journey/${activeType}/${encodeURIComponent(activeIdentifier)}/sessions/${encodeURIComponent(sessionId)}/events?timeRange=${timeRange}${platform ? `&platform=${platform}` : ''}&offset=${nextOffset}&limit=${EVENTS_BATCH}`;
            const resp = await fetch(url, { credentials: 'include' });
            const payload = await resp.json();
            if (!resp.ok || !payload?.success) {
                throw new Error(payload?.message || 'Failed to load session events');
            }

            const loaded = payload.data?.events || [];
            const pagination = payload.data?.pagination || {};
            setSessionEventsById((prev) => {
                const existing = prev[sessionId]?.events || [];
                const mergedEvents = append ? [...existing, ...loaded] : loaded;
                return {
                    ...prev,
                    [sessionId]: {
                        events: mergedEvents,
                        offset: (pagination.offset || 0) + loaded.length,
                        total: pagination.total || mergedEvents.length,
                        hasMore: Boolean(pagination.hasMore),
                        loading: false,
                        error: null
                    }
                };
            });
        } catch (err) {
            setSessionEventsById((prev) => ({
                ...prev,
                [sessionId]: {
                    ...(prev[sessionId] || { events: [] }),
                    loading: false,
                    error: err.message || 'Failed to load events'
                }
            }));
        }
    };

    useEffect(() => {
        for (const sessionId of expandedSessions) {
            const state = sessionEventsById[sessionId];
            if (!state || (!state.loading && (!state.events || state.events.length === 0))) {
                loadSessionEvents(sessionId, false);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [expandedSessions, type, identifier, timeRange, platform]);

    useEffect(() => {
        if (sessionGroups.length > 0 && expandedSessions.size === 0) {
            setExpandedSessions(new Set(sessionGroups.map((s) => s.sessionId)));
        }
    }, [sessionGroups, expandedSessions.size]);

    const formatTime = (dt) => {
        if (!dt) return '—';
        const d = new Date(dt);
        return d.toLocaleString();
    };

    const formatCompactTime = (dt) => {
        if (!dt) return null;
        const d = new Date(dt);
        return d.toLocaleString([], { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    };

    const formatDuration = (seconds) => {
        if (seconds == null) return '—';
        if (seconds < 60) return `${seconds}s`;
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return secs ? `${mins}m ${secs}s` : `${mins}m`;
    };

    const formatClockTime = (dt) => {
        if (!dt) return '—';
        const d = new Date(dt);
        return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
    };

    const getEventTimeSpentSeconds = (eventsList, eventIndex) => {
        // eventsList is newest -> oldest. Time spent on this interaction is until the next interaction (the newer item).
        if (!Array.isArray(eventsList) || eventIndex <= 0) return null;
        const currentTs = new Date(eventsList[eventIndex]?.ts || 0).getTime();
        const nextInteractionTs = new Date(eventsList[eventIndex - 1]?.ts || 0).getTime();
        if (!currentTs || !nextInteractionTs) return null;
        const diffMs = Math.max(0, nextInteractionTs - currentTs);
        return Math.round(diffMs / 1000);
    };

    const formatSessionHeading = (start, end) => {
        if (!start && !end) return 'Unknown session time';
        const ref = end || start;
        const d = new Date(ref);
        return d.toLocaleString([], {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
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

    const extractResolvedEntities = (ev) => {
        const resolvedEvents = (ev._resolved?.events || []).filter((r) => r.name);
        const resolvedOrgs = (ev._resolved?.orgs || []).filter((r) => r.name);
        return { resolvedEvents, resolvedOrgs };
    };

    const getContextSignature = (ev, resolvedEntities) => {
        const resolvedEventNames = resolvedEntities.resolvedEvents
            .map((r) => r.name)
            .sort()
            .join('|');
        const resolvedOrgNames = resolvedEntities.resolvedOrgs
            .map((r) => r.name)
            .sort()
            .join('|');
        return [
            ev.user_id ? 'auth' : 'anon',
            ev.platform || 'unknown',
            resolvedEventNames || '-',
            resolvedOrgNames || '-'
        ].join('::');
    };

    const buildContextRuns = (eventsList) => {
        if (!Array.isArray(eventsList) || eventsList.length === 0) return [];
        const runs = [];
        for (let idx = 0; idx < eventsList.length; idx++) {
            const ev = eventsList[idx];
            const resolvedEntities = extractResolvedEntities(ev);
            const shouldGroupByContext = resolvedEntities.resolvedEvents.length > 0 || resolvedEntities.resolvedOrgs.length > 0;
            const signature = shouldGroupByContext
                ? getContextSignature(ev, resolvedEntities)
                : `ungrouped::${idx}`;
            const last = runs[runs.length - 1];
            if (last && last.signature === signature && shouldGroupByContext) {
                last.events.push(ev);
                last.end = ev.ts;
            } else {
                runs.push({
                    signature,
                    events: [ev],
                    start: ev.ts,
                    end: ev.ts,
                    auth: !!ev.user_id,
                    platform: ev.platform || 'unknown',
                    resolvedEvents: resolvedEntities.resolvedEvents,
                    resolvedOrgs: resolvedEntities.resolvedOrgs,
                    showContextGroup: shouldGroupByContext
                });
            }
        }
        return runs;
    };

    const getEventDetails = (ev) => {
        const details = [];
        const context = ev.context || {};
        const properties = ev.properties || {};

        if (context.screen) details.push(`Screen: ${context.screen}`);
        else if (properties.path) details.push(`Path: ${properties.path}`);
        else if (context.route) details.push(`Route: ${context.route}`);

        const candidates = ['tab', 'source', 'action', 'button', 'referrer', 'page'];
        for (const key of candidates) {
            if (properties[key]) details.push(`${key}: ${properties[key]}`);
            else if (context[key]) details.push(`${key}: ${context[key]}`);
        }
        return details.slice(0, 3);
    };

    const getPrimaryResolvedEntity = (ev) => {
        const resolvedEvent = (ev?._resolved?.events || []).find((r) => r?.name);
        if (resolvedEvent) return { kind: 'event', label: resolvedEvent.name };
        const resolvedOrg = (ev?._resolved?.orgs || []).find((r) => r?.name);
        if (resolvedOrg) return { kind: 'org', label: resolvedOrg.name };
        return null;
    };

    const getImplicitTransition = (newerEvent, olderEvent) => {
        if (!newerEvent || !olderEvent) return null;
        const newerAuth = Boolean(newerEvent.user_id);
        const olderAuth = Boolean(olderEvent.user_id);
        if (newerAuth !== olderAuth) {
            return newerAuth
                ? { kind: 'auth', icon: 'mdi:login', label: 'Logged in' }
                : { kind: 'auth', icon: 'mdi:logout', label: 'Logged out' };
        }

        const newerEntity = getPrimaryResolvedEntity(newerEvent);
        const olderEntity = getPrimaryResolvedEntity(olderEvent);
        const newerKey = newerEntity ? `${newerEntity.kind}:${newerEntity.label}` : null;
        const olderKey = olderEntity ? `${olderEntity.kind}:${olderEntity.label}` : null;
        if (newerKey !== olderKey) {
            if (!olderEntity && newerEntity) {
                return { kind: 'context', icon: 'mdi:location-enter', label: `Entered ${newerEntity.label}` };
            }
            if (olderEntity && !newerEntity) {
                return { kind: 'context', icon: 'mdi:location-exit', label: `Exited ${olderEntity.label}` };
            }
            if (olderEntity && newerEntity) {
                return { kind: 'context', icon: 'mdi:transit-connection-horizontal', label: `Moved to ${newerEntity.label}` };
            }
        }
        return null;
    };

    const isBouncedSession = (session, eventsList) => {
        if (!session) return false;
        const eventsCount = Array.isArray(eventsList) ? eventsList.length : 0;
        const duration = Number(session.durationSeconds || 0);
        if (eventsCount <= 1) return true;
        if (duration > 45) return false;
        const meaningfulEvents = new Set([
            'event_registration',
            'event_checkin',
            'org_join',
            'mobile_landing_app_store_click',
            'mobile_landing_play_store_click'
        ]);
        const hasMeaningfulAction = (eventsList || []).some((ev) => meaningfulEvents.has(ev?.event));
        return !hasMeaningfulAction && eventsCount <= 3;
    };

    const getPlatformLabel = (platformType) => {
        if (platformType === 'mobile_app') return 'Mobile App';
        if (platformType === 'mobile_web') return 'Mobile Web';
        if (platformType === 'desktop_web') return 'Desktop Web';
        return 'Unknown';
    };

    const getPlatformIcon = (platformType) => {
        if (platformType === 'mobile_app') return 'mdi:cellphone';
        if (platformType === 'mobile_web') return 'mdi:cellphone-link';
        if (platformType === 'desktop_web') return 'mdi:monitor';
        return 'mdi:help-circle-outline';
    };

    const userInitial = (userProfile?.name || userProfile?.username || activeIdentifier || '?').trim().charAt(0).toUpperCase();
    const sessionPlatformBreakdown = React.useMemo(() => {
        const counts = { desktop_web: 0, mobile_web: 0, mobile_app: 0, unknown: 0 };
        for (const s of sessionGroups) {
            counts[s.platformType] = (counts[s.platformType] || 0) + 1;
        }
        return counts;
    }, [sessionGroups]);

    return (
        <div className="individual-user-journey">
            <header className="ij-header">
                <div className="ij-header-content">
                    <h1>Individual User Journey</h1>
                    <p>View activity for a specific user or anonymous visitor — combines anonymous browsing and authenticated account activity</p>
                </div>
            </header>

            <div className="ij-content">
                {!activeType || !activeIdentifier ? (
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
                                            <button
                                                key={i}
                                                type="button"
                                                className="ij-identifier-item"
                                                onClick={() => navigateToJourney('user', u.userId)}
                                            >
                                                <span className="ij-id">{u.name || u.username ? `${u.name || ''} ${u.username ? `@${u.username}` : ''}`.trim() : `${String(u.userId).slice(-8)}…`}</span>
                                                <span className="ij-meta">{u.eventCount} events · {formatTime(u.lastSeen)}</span>
                                            </button>
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
                                            <button
                                                key={i}
                                                type="button"
                                                className="ij-identifier-item"
                                                onClick={() => navigateToJourney('anonymous', a.anonymousId)}
                                            >
                                                <span className="ij-id">{String(a.anonymousId).slice(0, 8)}…</span>
                                                <span className="ij-meta">{a.eventCount} events · {formatTime(a.lastSeen)}</span>
                                            </button>
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
                            <ManualLookupForm onLookup={navigateToJourney} />
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
                                    <button type="button" className="ij-back-link" onClick={backToLookup}>
                                        <Icon icon="mdi:arrow-left" /> Back to lookup
                                    </button>
                                    <button className="ij-refresh-btn" onClick={refetchJourney}>
                                        <Icon icon="mdi:refresh" /> Refresh
                                    </button>
                                </div>
                                <div className="ij-journey-layout">
                                    <aside className="ij-section ij-left-panel">
                                        <div className="ij-profile-card">
                                            <div className="ij-profile-avatar">{userInitial}</div>
                                            <h2 className="ij-profile-name">
                                                {userProfile?.name || userProfile?.username || (activeType === 'user' ? 'Authenticated User' : 'Anonymous Visitor')}
                                            </h2>
                                            <div className="ij-profile-status">
                                                <span className={`ij-presence-dot ${identity.isAuthenticated ? 'online' : ''}`} />
                                                {identity.isAuthenticated ? 'Authenticated' : 'Anonymous'}
                                            </div>
                                        </div>

                                        <div className="ij-left-metadata">
                                            <div className="ij-meta-row"><span>ID</span><strong>{activeType === 'user' ? String(activeIdentifier) : `${String(activeIdentifier).slice(0, 12)}…`}</strong></div>
                                            {userProfile?.username && <div className="ij-meta-row"><span>Username</span><strong>@{userProfile.username}</strong></div>}
                                            {userProfile?.email && <div className="ij-meta-row"><span>Email</span><strong>{userProfile.email}</strong></div>}
                                            <div className="ij-meta-row"><span>First seen</span><strong>{formatTime(summary?.firstSeen)}</strong></div>
                                            <div className="ij-meta-row"><span>Last seen</span><strong>{formatTime(summary?.lastSeen)}</strong></div>
                                        </div>

                                        <div className="ij-left-stats">
                                            <div className="ij-stat"><span className="ij-stat-value">{summary?.totalEvents ?? 0}</span><span className="ij-stat-label">Events</span></div>
                                            <div className="ij-stat"><span className="ij-stat-value">{summary?.totalSessions ?? 0}</span><span className="ij-stat-label">Sessions</span></div>
                                            <div className="ij-stat"><span className="ij-stat-value">{summary?.screenViews ?? 0}</span><span className="ij-stat-label">Page Views</span></div>
                                            <div className="ij-stat"><span className="ij-stat-value">{identity.linkedAnonymousIds?.length || 0}</span><span className="ij-stat-label">Linked Anonymous IDs</span></div>
                                        </div>

                                        <div className="ij-device-breakdown">
                                            <h3>Session Platforms</h3>
                                            <div className="ij-platform-row"><span><Icon icon="mdi:monitor" /> Desktop Web</span><strong>{sessionPlatformBreakdown.desktop_web}</strong></div>
                                            <div className="ij-platform-row"><span><Icon icon="mdi:cellphone-link" /> Mobile Web</span><strong>{sessionPlatformBreakdown.mobile_web}</strong></div>
                                            <div className="ij-platform-row"><span><Icon icon="mdi:cellphone" /> Mobile App</span><strong>{sessionPlatformBreakdown.mobile_app}</strong></div>
                                        </div>
                                    </aside>

                                    <section className="ij-section ij-right-panel ij-sessions-section">
                                        <h2 className="ij-section-title">
                                            <Icon icon="mdi:web" />
                                            Sessions ({sessionGroups.length})
                                        </h2>
                                        <div className="ij-sessions-list">
                                            {sessionGroups.slice(0, visibleSessionsCount).map((s) => {
                                                const isExpanded = expandedSessions.has(s.sessionId);
                                                const eventsState = sessionEventsById[s.sessionId] || {};
                                                const sessionEvents = eventsState.events || [];
                                                const contextRuns = buildContextRuns(sessionEvents);
                                                const eventIndexMap = new Map(sessionEvents.map((ev, idx) => [ev, idx]));
                                                const bouncedSession = isBouncedSession(s, sessionEvents);
                                                const platformType = (() => {
                                                    const p = new Set(sessionEvents.map((ev) => ev?.platform).filter(Boolean));
                                                    const hasMobileWeb = sessionEvents.some((ev) => {
                                                        const ctx = ev?.context || {};
                                                        const props = ev?.properties || {};
                                                        return (
                                                            ctx.device_type === 'mobile' ||
                                                            props.device_type === 'mobile' ||
                                                            props.isMobile === true ||
                                                            props.mobile === true ||
                                                            props.viewport_width < 768
                                                        );
                                                    });
                                                    if (p.has('ios') || p.has('android')) return 'mobile_app';
                                                    if (p.has('web') && hasMobileWeb) return 'mobile_web';
                                                    if (p.has('web')) return 'desktop_web';
                                                    return 'unknown';
                                                })();
                                                const screenViews = sessionEvents.filter((ev) => ev.event === 'screen_view').length;
                                                const entryPoint = sessionEvents.length
                                                    ? (sessionEvents[sessionEvents.length - 1]?.context?.screen || sessionEvents[sessionEvents.length - 1]?.properties?.path || sessionEvents[sessionEvents.length - 1]?.event)
                                                    : null;
                                                return (
                                                    <article key={s.sessionId} className={`ij-session-group ${isExpanded ? 'expanded' : ''}`}>
                                                        <button className="ij-session-card ij-session-card-v2" onClick={() => toggleSession(s.sessionId)}>
                                                            <Icon icon="mdi:chevron-right" className="ij-session-chevron" />
                                                            <span className="ij-session-id">{formatSessionHeading(s.start, s.end)}</span>
                                                            <span className="ij-session-events">{s.eventCount} events</span>
                                                            <span className="ij-session-duration">{formatDuration(s.durationSeconds)}</span>
                                                            <span className="ij-session-time">{formatTime(s.start)} → {formatTime(s.end)}</span>
                                                        </button>
                                                        {isExpanded && (
                                                            <>
                                                                <div className="ij-session-meta-tags">
                                                                    <span className="ij-tag"><Icon icon={getPlatformIcon(platformType)} /> {getPlatformLabel(platformType)}</span>
                                                                    <span className="ij-tag"><Icon icon="mdi:view-dashboard-outline" /> {screenViews} screen views loaded</span>
                                                                    {entryPoint && <span className="ij-tag"><Icon icon="mdi:login-variant" /> Entry: {entryPoint}</span>}
                                                                </div>
                                                                <div className="ij-session-events-list">
                                                                    {eventsState.loading && sessionEvents.length === 0 && (
                                                                        <div className="ij-session-no-events">Loading events…</div>
                                                                    )}
                                                                    {eventsState.error && (
                                                                        <div className="ij-session-no-events">{eventsState.error}</div>
                                                                    )}
                                                                    {contextRuns.length > 0 ? contextRuns.map((run, runIdx) => (
                                                                        <div key={`${s.sessionId}-run-${runIdx}`} className="ij-context-run">
                                                                            {run.showContextGroup && (
                                                                                <>
                                                                                    <div className="ij-context-header">
                                                                                        <div className="ij-context-badges">
                                                                                            <span className={`ij-badge ${run.auth ? 'auth' : 'anon'}`}>
                                                                                                {run.auth ? 'Authenticated' : 'Anonymous'}
                                                                                            </span>
                                                                                            <span className="ij-badge platform">{run.platform}</span>
                                                                                            {run.resolvedEvents.map((r) => (
                                                                                                <span key={`ctx-event-${r.id}`} className="ij-badge resolved">Event: {r.name}</span>
                                                                                            ))}
                                                                                            {run.resolvedOrgs.map((r) => (
                                                                                                <span key={`ctx-org-${r.id}`} className="ij-badge resolved">Org: {r.name}</span>
                                                                                            ))}
                                                                                        </div>
                                                                                        <div className="ij-context-meta">
                                                                                            <span>{run.events.length} event{run.events.length > 1 ? 's' : ''}</span>
                                                                                            <span className="ij-context-sep">•</span>
                                                                                            <span>{formatTime(run.start)} → {formatTime(run.end)}</span>
                                                                                        </div>
                                                                                    </div>
                                                                                    {run.resolvedEvents.length > 0 && (
                                                                                        <div className="ij-context-entities">
                                                                                            {run.resolvedEvents.slice(0, 2).map((evt) => (
                                                                                                <div key={`evt-card-${evt.id}`} className="ij-entity-card">
                                                                                                    <div className="ij-entity-media">
                                                                                                        {evt.image ? (
                                                                                                            <img src={evt.image} alt={evt.name || 'Event'} />
                                                                                                        ) : (
                                                                                                            <div className="ij-entity-fallback"><Icon icon="mdi:calendar" /></div>
                                                                                                        )}
                                                                                                    </div>
                                                                                                    <div className="ij-entity-content">
                                                                                                        <div className="ij-entity-title">{evt.name || 'Event'}</div>
                                                                                                        <div className="ij-entity-meta">
                                                                                                            {evt.location && <span>{evt.location}</span>}
                                                                                                            {evt.start_time && <span>{formatCompactTime(evt.start_time)}</span>}
                                                                                                            {evt.end_time && <span>→ {formatCompactTime(evt.end_time)}</span>}
                                                                                                        </div>
                                                                                                        <div className="ij-entity-badges">
                                                                                                            {evt.visibility && <span className="ij-entity-badge">{evt.visibility}</span>}
                                                                                                            {evt.status && <span className="ij-entity-badge">{evt.status}</span>}
                                                                                                        </div>
                                                                                                    </div>
                                                                                                </div>
                                                                                            ))}
                                                                                        </div>
                                                                                    )}
                                                                                    {run.resolvedOrgs.length > 0 && (
                                                                                        <div className="ij-context-entities">
                                                                                            {run.resolvedOrgs.slice(0, 2).map((org) => (
                                                                                                <div key={`org-card-${org.id}`} className="ij-entity-card org">
                                                                                                    <div className="ij-entity-media">
                                                                                                        {org.image ? (
                                                                                                            <img src={org.image} alt={org.name || 'Org'} />
                                                                                                        ) : (
                                                                                                            <div className="ij-entity-fallback"><Icon icon="mdi:domain" /></div>
                                                                                                        )}
                                                                                                    </div>
                                                                                                    <div className="ij-entity-content">
                                                                                                        <div className="ij-entity-title">{org.name || 'Organization'}</div>
                                                                                                        <div className="ij-entity-meta">
                                                                                                            <span>Linked organization context</span>
                                                                                                        </div>
                                                                                                    </div>
                                                                                                </div>
                                                                                            ))}
                                                                                        </div>
                                                                                    )}
                                                                                </>
                                                                            )}
                                                                            {run.events.map((ev, i) => (
                                                                                <React.Fragment key={`${runIdx}-${i}`}>
                                                                                    <div className={`ij-timeline-item ${ev.user_id ? 'authenticated' : 'anonymous'}`}>
                                                                                        <div className="ij-timeline-marker">
                                                                                            <Icon icon={getEventIcon(ev)} />
                                                                                        </div>
                                                                                        <div className="ij-timeline-content">
                                                                                            <div className="ij-timeline-header">
                                                                                                <span className="ij-timeline-event">{getEventLabel(ev)}</span>
                                                                                                <span className="ij-timeline-time">
                                                                                                    Entered {formatClockTime(ev.ts)}
                                                                                                    {(() => {
                                                                                                        const globalIndex = eventIndexMap.get(ev) ?? i;
                                                                                                        const spent = getEventTimeSpentSeconds(sessionEvents, globalIndex);
                                                                                                        return spent != null ? ` • ${formatDuration(spent)}` : ' • latest';
                                                                                                    })()}
                                                                                                </span>
                                                                                            </div>
                                                                                            {getEventDetails(ev).length > 0 && (
                                                                                                <div className="ij-event-details">
                                                                                                    {getEventDetails(ev).map((detail, idx) => (
                                                                                                        <span key={idx} className="ij-event-detail">{detail}</span>
                                                                                                    ))}
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                    {(() => {
                                                                                        const globalIndex = eventIndexMap.get(ev);
                                                                                        if (globalIndex == null) return null;
                                                                                        const implicit = getImplicitTransition(ev, sessionEvents[globalIndex + 1]);
                                                                                        if (!implicit) return null;
                                                                                        return (
                                                                                            <div className={`ij-implicit-marker ${implicit.kind}`}>
                                                                                                <Icon icon={implicit.icon} />
                                                                                                <span>{implicit.label}</span>
                                                                                            </div>
                                                                                        );
                                                                                    })()}
                                                                                </React.Fragment>
                                                                            ))}
                                                                        </div>
                                                                    )) : (
                                                                        !eventsState.loading && <div className="ij-session-no-events">No events recorded for this session</div>
                                                                    )}
                                                                    {!eventsState.loading && sessionEvents.length > 0 && bouncedSession && (
                                                                        <div className="ij-implicit-marker bounce">
                                                                            <Icon icon="mdi:exit-run" />
                                                                            <span>Bounced session</span>
                                                                        </div>
                                                                    )}
                                                                    {eventsState.hasMore && (
                                                                        <button
                                                                            type="button"
                                                                            className="ij-load-more-events"
                                                                            onClick={() => loadSessionEvents(s.sessionId, true, eventsState.offset || sessionEvents.length)}
                                                                            disabled={eventsState.loading}
                                                                        >
                                                                            {eventsState.loading ? 'Loading…' : 'Load more events'}
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </>
                                                        )}
                                                    </article>
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
                                </div>
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

export default IndividualUserJourney;
