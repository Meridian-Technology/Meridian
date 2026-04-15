import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../hooks/useFetch';
import { useDashboardOverlay } from '../../hooks/useDashboardOverlay';
import AdminEventFeedListBody from './AdminEventFeedListBody';
import './AdminEventFeed.scss';
import './AdminEventsListPage.scss';
import './AdminTenantEventsListPanel.scss';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;
const MIN_SEARCH_CHARS = 3;

/**
 * Paginated events list (shared by /operator-events and root dashboards).
 * @param {{
 *   paginationMode?: 'url' | 'local',
 *   feedHeading?: string,
 *   className?: string,
 *   showFullPageLink?: boolean,
 *   customSubline?: string,
 *   fullPageLinkLabel?: string,
 *   pageSize?: number,
 *   showFilters?: boolean,
 *   showPagination?: boolean,
 * }} props
 */
function AdminTenantEventsListPanel({
    paginationMode = 'url',
    feedHeading = 'All matching events',
    className = '',
    showFullPageLink = false,
    customSubline = '',
    fullPageLinkLabel = 'Open full list view',
    pageSize = PAGE_SIZE,
    showFilters = true,
    showPagination = true,
}) {
    const { showAdminEventOperator } = useDashboardOverlay();
    const [searchParams, setSearchParams] = useSearchParams();
    const [localPage, setLocalPage] = useState(1);
    const [searchDraft, setSearchDraft] = useState('');
    const [includePast, setIncludePast] = useState(false);

    const isUrlMode = paginationMode === 'url';

    const pageFromUrl = useMemo(
        () => Math.max(1, parseInt(String(searchParams.get('page') || '1'), 10) || 1),
        [searchParams]
    );
    const page = isUrlMode ? pageFromUrl : localPage;

    const setPage = useCallback(
        (next) => {
            const p = Math.max(1, next);
            if (isUrlMode) {
                const params = new URLSearchParams(searchParams);
                if (p <= 1) {
                    params.delete('page');
                } else {
                    params.set('page', String(p));
                }
                setSearchParams(params, { replace: true });
            } else {
                setLocalPage(p);
            }
        },
        [isUrlMode, searchParams, setSearchParams]
    );

    const [debouncedSearch, setDebouncedSearch] = useState('');
    useEffect(() => {
        const t = window.setTimeout(() => setDebouncedSearch(searchDraft), SEARCH_DEBOUNCE_MS);
        return () => window.clearTimeout(t);
    }, [searchDraft]);

    const apiSearch = useMemo(() => {
        const s = debouncedSearch.trim();
        return s.length >= MIN_SEARCH_CHARS ? s : '';
    }, [debouncedSearch]);

    const apiUrl = useMemo(() => {
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('limit', String(pageSize));
        if (apiSearch) {
            params.set('q', apiSearch);
        }
        if (includePast) {
            params.set('includePast', '1');
        }
        return `/org-management/admin-tenant-events?${params.toString()}`;
    }, [page, pageSize, apiSearch, includePast]);

    const { data, loading, error, refetch } = useFetch(apiUrl);
    const payload = data?.data;
    const events = payload?.events ?? [];
    const pagination = payload?.pagination;

    useEffect(() => {
        if (!isUrlMode || loading || !pagination) return;
        if (pagination.page !== pageFromUrl) {
            setPage(pagination.page);
        }
    }, [isUrlMode, loading, pagination, pageFromUrl, setPage]);

    const filterKey = useRef();
    useEffect(() => {
        const key = `${apiSearch}|${includePast}`;
        if (filterKey.current === undefined) {
            filterKey.current = key;
            return;
        }
        if (filterKey.current === key) return;
        filterKey.current = key;
        if (isUrlMode) {
            const params = new URLSearchParams(searchParams);
            params.delete('page');
            setSearchParams(params, { replace: true });
        } else {
            setLocalPage(1);
        }
    }, [apiSearch, includePast, isUrlMode, searchParams, setSearchParams]);

    const totalItems = pagination?.total ?? 0;
    const totalPages = Math.max(1, pagination?.totalPages ?? 1);
    const limit = pagination?.limit ?? pageSize;

    const openEventDetail = useCallback(
        (ev) => {
            const id = ev?._id ?? ev?.id;
            if (id) showAdminEventOperator(String(id));
        },
        [showAdminEventOperator]
    );

    const rangeStart = totalItems === 0 ? 0 : (page - 1) * limit + 1;
    const rangeEnd = totalItems === 0 ? 0 : Math.min(page * limit, totalItems);

    const computedSubLine = useMemo(() => {
        const scope = includePast ? 'Including past events' : 'Upcoming and live only';
        const sortNote = includePast ? 'Newest start first' : 'Soonest start first';
        return `${scope}. ${sortNote}. ${totalItems.toLocaleString()} matching.`;
    }, [includePast, totalItems]);
    const subLine = customSubline || computedSubLine;

    const emptyHint = useMemo(() => {
        if (apiSearch) {
            return `No events match "${apiSearch}". Try different keywords or include past events.`;
        }
        if (includePast) {
            return 'No events match your filters yet. Try different keywords or turn off past events.';
        }
        return 'No upcoming or live events yet.';
    }, [apiSearch, includePast]);

    const searchChars = searchDraft.trim().length;
    const searchHint =
        searchChars > 0 && searchChars < MIN_SEARCH_CHARS
            ? `Enter at least ${MIN_SEARCH_CHARS} characters to search by name.`
            : null;

    return (
        <div className={`admin-tenant-events-list-panel ${className}`.trim()}>
            <section className="admin-event-feed admin-tenant-events-list-panel__feed" aria-label="Events list">
                <div className="admin-event-feed__head">
                    <div>
                        <h2 className="admin-events-list-page__feed-heading">{feedHeading}</h2>
                        <p className="admin-event-feed__sub">{subLine}</p>
                    </div>
                    <div className="admin-event-feed__tools">
                        <button
                            type="button"
                            className="admin-event-feed__icon-btn"
                            onClick={() => refetch()}
                            disabled={loading}
                            aria-label="Refresh list"
                        >
                            <Icon icon="mdi:refresh" className={loading ? 'spin' : ''} />
                        </button>
                        <Link to="/create-event" className="admin-event-feed__primary-link">
                            <Icon icon="mdi:calendar-plus" />
                            New event
                        </Link>
                    </div>
                </div>

                {showFilters && (
                    <div className="admin-tenant-events-list-panel__filters">
                        <label className="admin-tenant-events-list-panel__search">
                            <Icon icon="mdi:magnify" aria-hidden />
                            <input
                                type="search"
                                value={searchDraft}
                                onChange={(e) => setSearchDraft(e.target.value)}
                                placeholder="Search events by name..."
                                autoComplete="off"
                                aria-describedby={searchHint ? 'admin-events-search-hint' : undefined}
                            />
                        </label>
                        {searchHint ? (
                            <p id="admin-events-search-hint" className="admin-tenant-events-list-panel__hint">
                                {searchHint}
                            </p>
                        ) : null}
                        <label className="admin-tenant-events-list-panel__toggle">
                            <input
                                type="checkbox"
                                checked={includePast}
                                onChange={(e) => setIncludePast(e.target.checked)}
                            />
                            <span>Include past events</span>
                        </label>
                    </div>
                )}

                <AdminEventFeedListBody
                    events={events}
                    loading={loading}
                    error={error || (data && !data.success)}
                    onOpenEvent={openEventDetail}
                    emptyHint={emptyHint}
                />

                {showPagination && pagination && totalItems > 0 && (
                    <div className="admin-events-list-page__pagination">
                        <span className="admin-events-list-page__page-range">
                            Showing {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} of{' '}
                            {totalItems.toLocaleString()}
                        </span>
                        <div className="admin-events-list-page__pagination-controls">
                            <button
                                type="button"
                                className="admin-events-list-page__page-btn"
                                disabled={page <= 1 || loading}
                                onClick={() => setPage(page - 1)}
                            >
                                Previous
                            </button>
                            <span className="admin-events-list-page__page-info">
                                Page {page} of {totalPages}
                            </span>
                            <button
                                type="button"
                                className="admin-events-list-page__page-btn"
                                disabled={page >= totalPages || loading}
                                onClick={() => setPage(page + 1)}
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}

                {showFullPageLink && (
                    <div className="admin-tenant-events-list-panel__full-page">
                        <Link to="/operator-events" className="admin-event-feed__footer-link">
                            {fullPageLinkLabel}
                            <Icon icon="mdi:chevron-right" />
                        </Link>
                    </div>
                )}
            </section>
        </div>
    );
}

export default AdminTenantEventsListPanel;
