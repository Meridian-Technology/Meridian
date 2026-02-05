import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Icon } from '@iconify-icon/react';
import { useNavigate } from 'react-router-dom';
import { useCache } from '../../../../CacheContext';
import './EventsManagementList.scss';

function EventsList({ orgId, orgName, refreshTrigger, onRefresh, onViewEvent, onCreateEvent }) {
    const navigate = useNavigate();
    const { getOrgEvents, refreshOrgEvents } = useCache();
    const [allEvents, setAllEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    
    const [filters, setFilters] = useState({
        status: 'all',
        type: 'all',
        timeRange: 'upcoming', // Default to upcoming events
        search: ''
    });
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [sortBy, setSortBy] = useState('start_time');
    const [sortOrder, setSortOrder] = useState('asc');
    const [page, setPage] = useState(1);
    const [quickFilter, setQuickFilter] = useState('upcoming'); // Default to upcoming filter active
    const searchTimeoutRef = useRef(null);
    const ITEMS_PER_PAGE = 20;

    // Fetch all events once using CacheContext
    useEffect(() => {
        const fetchEvents = async () => {
            if (!orgId) {
                setLoading(false);
                return;
            }

            setLoading(true);
            setError(null);
            
            try {
                const response = refreshTrigger > 0 
                    ? await refreshOrgEvents(orgId)
                    : await getOrgEvents(orgId);
                
                if (response?.success && response?.data?.events) {
                    setAllEvents(response.data.events);
                } else {
                    setError('Failed to load events');
                    setAllEvents([]);
                }
            } catch (err) {
                console.error('Error fetching events:', err);
                setError(err.message || 'Error loading events');
                setAllEvents([]);
            } finally {
                setLoading(false);
            }
        };

        fetchEvents();
    }, [orgId, refreshTrigger, getOrgEvents, refreshOrgEvents]);

    // Debounce search input
    useEffect(() => {
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }

        searchTimeoutRef.current = setTimeout(() => {
            setDebouncedSearch(filters.search);
        }, 300);

        return () => {
            if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current);
            }
        };
    }, [filters.search]);

    // Reset page when filters change
    useEffect(() => {
        setPage(1);
    }, [filters.status, filters.type, filters.timeRange, debouncedSearch, sortBy, sortOrder]);

    // Client-side filtering, sorting, and pagination
    const filteredAndSortedEvents = useMemo(() => {
        let filtered = [...allEvents];

        // Apply status filter
        if (filters.status !== 'all') {
            filtered = filtered.filter(event => event.status === filters.status);
        }

        // Apply type filter
        if (filters.type !== 'all') {
            filtered = filtered.filter(event => event.type === filters.type);
        }

        // Apply time range filter
        if (filters.timeRange !== 'all') {
            const now = new Date();
            filtered = filtered.filter(event => {
                const startTime = new Date(event.start_time);
                const endTime = new Date(event.end_time);
                
                switch (filters.timeRange) {
                    case 'upcoming':
                        return now < startTime;
                    case 'past':
                        return endTime < now;
                    case 'live':
                        return now >= startTime && now <= endTime;
                    case 'this_week':
                        const weekStart = new Date(now);
                        weekStart.setDate(now.getDate() - now.getDay());
                        weekStart.setHours(0, 0, 0, 0);
                        const weekEnd = new Date(weekStart);
                        weekEnd.setDate(weekStart.getDate() + 7);
                        return startTime >= weekStart && startTime < weekEnd;
                    case 'this_month':
                        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                        return startTime >= monthStart && startTime < monthEnd;
                    default:
                        return true;
                }
            });
        }

        // Apply search filter
        if (debouncedSearch) {
            const searchLower = debouncedSearch.toLowerCase();
            filtered = filtered.filter(event => 
                event.name?.toLowerCase().includes(searchLower) ||
                event.description?.toLowerCase().includes(searchLower) ||
                event.location?.toLowerCase().includes(searchLower)
            );
        }

        // Apply sorting
        filtered.sort((a, b) => {
            let aValue = a[sortBy];
            let bValue = b[sortBy];

            // Handle date fields
            if (sortBy === 'start_time' || sortBy === 'end_time' || sortBy === 'createdAt') {
                aValue = new Date(aValue).getTime();
                bValue = new Date(bValue).getTime();
            }

            // Handle string fields
            if (typeof aValue === 'string') {
                aValue = aValue.toLowerCase();
                bValue = bValue.toLowerCase();
            }

            if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        return filtered;
    }, [allEvents, filters, debouncedSearch, sortBy, sortOrder]);

    // Paginate filtered events
    const paginatedEvents = useMemo(() => {
        const startIndex = (page - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        return filteredAndSortedEvents.slice(startIndex, endIndex);
    }, [filteredAndSortedEvents, page]);

    // Calculate pagination info
    const pagination = useMemo(() => {
        const total = filteredAndSortedEvents.length;
        const totalPages = Math.ceil(total / ITEMS_PER_PAGE);
        return {
            total,
            page,
            limit: ITEMS_PER_PAGE,
            totalPages
        };
    }, [filteredAndSortedEvents.length, page]);

    // Memoized utility functions
    const formatDate = useCallback((dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }, []);

    const formatTime = useCallback((dateString) => {
        return new Date(dateString).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }, []);

    const getStatusColor = useCallback((status) => {
        const colors = {
            'approved': 'var(--green)',
            'pending': 'var(--yellow)',
            'rejected': 'var(--red)',
            'not-applicable': 'var(--light-text)'
        };
        return colors[status] || 'var(--light-text)';
    }, []);

    const getTypeColor = useCallback((type) => {
        const colors = {
            'meeting': 'var(--dark-blue)',
            'campus': 'var(--dark-blue)',
            'study': 'var(--green)',
            'sports': 'var(--green)',
            'alumni': 'var(--lighter-text)',
            'arts': 'var(--yellow)'
        };
        return colors[type] || 'var(--light-text)';
    }, []);

    const handleViewEvent = useCallback((event) => {
        if (onViewEvent) {
            onViewEvent(event);
        }
    }, [onViewEvent]);

    const handleCreateEvent = useCallback(() => {
        if (onCreateEvent) {
            navigate('/create-event', { state: { origin: onCreateEvent } });
        } else {
            navigate('/create-event');
        }
    }, [navigate, onCreateEvent]);

    const handleFilterChange = useCallback((key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    }, []);

    const clearFilters = useCallback(() => {
        setFilters({
            status: 'all',
            type: 'all',
            timeRange: 'all',
            search: ''
        });
        setQuickFilter(null);
    }, []);

    const handleQuickFilter = useCallback((timeFilter) => {
        if (quickFilter === timeFilter) {
            setQuickFilter(null);
            handleFilterChange('timeRange', 'all');
        } else {
            setQuickFilter(timeFilter);
            handleFilterChange('timeRange', timeFilter);
        }
    }, [quickFilter, handleFilterChange]);

    // Memoize computed values
    const events = paginatedEvents;
    const hasActiveFilters = useMemo(() =>
        filters.status !== 'all' ||
        filters.type !== 'all' ||
        filters.timeRange !== 'all' ||
        filters.search !== ''
    , [filters]);

    // Count events by time status for quick filters - NOW USING ALL EVENTS
    const timeCounts = useMemo(() => {
        const now = new Date();
        const counts = { upcoming: 0, live: 0, past: 0 };
        allEvents.forEach(event => {
            const startTime = new Date(event.start_time);
            const endTime = new Date(event.end_time);
            if (now < startTime) {
                counts.upcoming++;
            } else if (now >= startTime && now <= endTime) {
                counts.live++;
            } else {
                counts.past++;
            }
        });
        return counts;
    }, [allEvents]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === '/' && !e.target.matches('input, textarea')) {
                e.preventDefault();
                const searchInput = document.querySelector('.search-input');
                if (searchInput) {
                    searchInput.focus();
                }
            }
            if (e.key === 'Escape' && e.target.matches('.search-input')) {
                handleFilterChange('search', '');
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleFilterChange]);

    if (loading && page === 1) {
        return (
            <div className="events-list loading">
                <div className="loading-spinner">
                    <Icon icon="mdi:loading" className="spinner" />
                    <p>Loading events...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="events-list error">
                <Icon icon="mdi:alert-circle" />
                <p>Error loading events: {error}</p>
            </div>
        );
    }

    return (
        <div className="events-management-list">
            <div className="events-header">
                <div className="header-content">
                    <h2>Events</h2>
                    <p>Manage your organization's events</p>
                </div>
                <div className="header-actions">
                    <button className="create-btn" onClick={handleCreateEvent}>
                        <Icon icon="mingcute:add-fill" />
                        <span>Create Event</span>
                    </button>
                </div>
            </div>

            {/* Search and Filter Row */}
            <div className="search-filter-row">
                {/* Quick Filter Chips - Left */}
                <div className="quick-filters">
                    <button
                        className={`filter-chip ${quickFilter === 'upcoming' ? 'active' : ''}`}
                        onClick={() => handleQuickFilter('upcoming')}
                    >
                        <Icon icon="mdi:calendar-arrow-right" />
                        <span>Upcoming</span>
                        {timeCounts.upcoming > 0 && (
                            <span className="chip-count">{timeCounts.upcoming}</span>
                        )}
                    </button>
                    <button
                        className={`filter-chip live ${quickFilter === 'live' ? 'active' : ''}`}
                        onClick={() => handleQuickFilter('live')}
                    >
                        <Icon icon="mdi:broadcast" />
                        <span>Live</span>
                        {timeCounts.live > 0 && (
                            <span className="chip-count">{timeCounts.live}</span>
                        )}
                    </button>
                    <button
                        className={`filter-chip ${quickFilter === 'past' ? 'active' : ''}`}
                        onClick={() => handleQuickFilter('past')}
                    >
                        <Icon icon="mdi:history" />
                        <span>Past</span>
                        {timeCounts.past > 0 && (
                            <span className="chip-count">{timeCounts.past}</span>
                        )}
                    </button>
                    {hasActiveFilters && (
                        <button
                            className="filter-chip clear-all"
                            onClick={clearFilters}
                        >
                            <Icon icon="mdi:filter-off" />
                            <span>Clear</span>
                        </button>
                    )}
                </div>

                {/* Search Bar - Center */}
                <div className="search-bar">
                    <Icon icon="mdi:magnify" className="search-icon" />
                    <input
                        type="text"
                        placeholder="Search events..."
                        value={filters.search}
                        onChange={(e) => handleFilterChange('search', e.target.value)}
                        className="search-input"
                    />
                    {filters.search && (
                        <button
                            className="clear-search"
                            onClick={() => handleFilterChange('search', '')}
                            title="Clear search (Esc)"
                        >
                            <Icon icon="mdi:close" />
                        </button>
                    )}
                </div>

                {/* Filter Dropdowns - Right */}
                <div className="filter-dropdowns">
                    <select
                        value={filters.type}
                        onChange={(e) => handleFilterChange('type', e.target.value)}
                    >
                        <option value="all">All Types</option>
                        <option value="meeting">Meeting</option>
                        <option value="campus">Campus</option>
                        <option value="study">Study</option>
                        <option value="sports">Sports</option>
                        <option value="alumni">Alumni</option>
                        <option value="arts">Arts</option>
                    </select>
                    <select
                        value={filters.timeRange}
                        onChange={(e) => handleFilterChange('timeRange', e.target.value)}
                    >
                        <option value="all">All Time</option>
                        <option value="upcoming">Upcoming</option>
                        <option value="past">Past</option>
                        <option value="this_week">This Week</option>
                        <option value="this_month">This Month</option>
                    </select>
                </div>
            </div>

            {/* Events List View */}
            <div className="events-list-view">
                <div className="list-header">
                    <div className="list-header-left">
                        <span className="results-count">{pagination.total} event{pagination.total !== 1 ? 's' : ''}</span>
                    </div>
                </div>

                <div className="list-items">
                    {events.map((event) => (
                        <div
                            key={event._id}
                            className="list-item"
                            onClick={() => handleViewEvent(event)}
                        >
                            <div className="list-item-content">
                                <div className="list-item-header">
                                    <div className="list-item-title-row">
                                        <h3 className="list-item-title">{event.name}</h3>
                                        <div className="list-item-badges">
                                            <span
                                                className="status-badge"
                                                style={{ backgroundColor: getStatusColor(event.status) }}
                                            >
                                                {event.status}
                                            </span>
                                            <span
                                                className="type-badge"
                                                style={{ backgroundColor: getTypeColor(event.type) }}
                                            >
                                                {event.type}
                                            </span>
                                        </div>
                                    </div>
                                    {event.description && (
                                        <p className="list-item-description">
                                            {event.description.length > 120
                                                ? `${event.description.substring(0, 120)}...`
                                                : event.description
                                            }
                                        </p>
                                    )}
                                </div>

                                <div className="list-item-meta">
                                    <div className="meta-item">
                                        <Icon icon="mdi:calendar-clock" />
                                        <span>{formatDate(event.start_time)}</span>
                                        <span className="meta-separator">-</span>
                                        <span>{formatTime(event.end_time)}</span>
                                    </div>
                                    <div className="meta-item">
                                        <Icon icon="fluent:location-28-filled" />
                                        <span>{event.location}</span>
                                    </div>
                                    <div className="meta-item">
                                        <Icon icon="mingcute:user-group-fill" />
                                        <span>{event.expectedAttendance || 0} expected</span>
                                    </div>
                                </div>
                            </div>

        
                        </div>
                    ))}
                </div>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
                <div className="pagination">
                    <div className="pagination-info">
                        <span>
                            Showing {((page - 1) * (pagination.limit || 20)) + 1} - {Math.min(page * (pagination.limit || 20), pagination.total || 0)} of {pagination.total || 0} events
                        </span>
                    </div>
                    <div className="pagination-controls">
                        <button
                            className="page-btn"
                            disabled={page === 1 || loading}
                            onClick={() => setPage(page - 1)}
                            title="Previous page"
                        >
                            <Icon icon="mdi:chevron-left" />
                            <span>Previous</span>
                        </button>

                        <div className="page-numbers">
                            {(() => {
                                const pages = [];
                                const totalPages = pagination.totalPages;
                                const currentPage = page;

                                if (totalPages > 0) {
                                    pages.push(
                                        <button
                                            key={1}
                                            className={`page-number ${currentPage === 1 ? 'active' : ''}`}
                                            onClick={() => setPage(1)}
                                        >
                                            1
                                        </button>
                                    );
                                }

                                if (currentPage > 3 && totalPages > 5) {
                                    pages.push(<span key="ellipsis1" className="ellipsis">...</span>);
                                }

                                const start = Math.max(2, currentPage - 1);
                                const end = Math.min(totalPages - 1, currentPage + 1);

                                for (let i = start; i <= end; i++) {
                                    if (i !== 1 && i !== totalPages) {
                                        pages.push(
                                            <button
                                                key={i}
                                                className={`page-number ${currentPage === i ? 'active' : ''}`}
                                                onClick={() => setPage(i)}
                                            >
                                                {i}
                                            </button>
                                        );
                                    }
                                }

                                if (currentPage < totalPages - 2 && totalPages > 5) {
                                    pages.push(<span key="ellipsis2" className="ellipsis">...</span>);
                                }

                                if (totalPages > 1) {
                                    pages.push(
                                        <button
                                            key={totalPages}
                                            className={`page-number ${currentPage === totalPages ? 'active' : ''}`}
                                            onClick={() => setPage(totalPages)}
                                        >
                                            {totalPages}
                                        </button>
                                    );
                                }

                                return pages;
                            })()}
                        </div>

                        <button
                            className="page-btn"
                            disabled={page === pagination.totalPages || loading}
                            onClick={() => setPage(page + 1)}
                            title="Next page"
                        >
                            <span>Next</span>
                            <Icon icon="mdi:chevron-right" />
                        </button>
                    </div>
                </div>
            )}

            {/* Empty State */}
            {events.length === 0 && !loading && (
                <div className="empty-state">
                    <h3>No Events Found</h3>
                    <p>
                        {hasActiveFilters
                            ? "No events match your current filters. Try adjusting your search criteria."
                            : "You haven't created any events yet. Get started by creating your first event!"
                        }
                    </p>
                    {hasActiveFilters && (
                        <button className="clear-filters-btn" onClick={clearFilters}>
                            <Icon icon="mdi:filter-off" />
                            <span>Clear Filters</span>
                        </button>
                    )}
                    <button className="create-btn" onClick={handleCreateEvent}>
                        <Icon icon="mingcute:add-fill" />
                        <span>Create Event</span>
                    </button>
                </div>
            )}
        </div>
    );
}

export default EventsList;
