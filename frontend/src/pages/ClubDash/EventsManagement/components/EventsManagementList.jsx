import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../hooks/useFetch';
import './EventsManagementList.scss';

function EventsList({ orgId, orgName, refreshTrigger, onRefresh, onViewEvent }) {
    const [filters, setFilters] = useState({
        status: 'all',
        type: 'all',
        timeRange: 'all',
        search: ''
    });
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [sortBy, setSortBy] = useState('start_time');
    const [sortOrder, setSortOrder] = useState('asc');
    const [page, setPage] = useState(1);
    const [showFilters, setShowFilters] = useState(false);
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'card'
    const [quickFilter, setQuickFilter] = useState(null); // For quick status filters
    const searchTimeoutRef = useRef(null);
    
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

    // Memoize query params
    const queryParams = useMemo(() => {
        return new URLSearchParams({
            page: page.toString(),
            limit: '20',
            status: filters.status,
            type: filters.type,
            timeRange: filters.timeRange,
            search: debouncedSearch,
            sortBy,
            sortOrder
        });
    }, [page, filters.status, filters.type, filters.timeRange, debouncedSearch, sortBy, sortOrder]);
    
    // Fetch events data
    const { data: eventsData, loading, error, refetch } = useFetch(
        orgId ? `/org-event-management/${orgId}/events?${queryParams}` : null
    );

    // Refetch when refreshTrigger changes
    useEffect(() => {
        if (refreshTrigger > 0) {
            refetch();
        }
    }, [refreshTrigger, refetch]);

    // Reset page when filters change (except search which is debounced)
    useEffect(() => {
        setPage(1);
    }, [filters.status, filters.type, filters.timeRange, debouncedSearch, sortBy, sortOrder]);

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
            'approved': '#28a745',
            'pending': '#ffc107',
            'rejected': '#dc3545',
            'not-applicable': '#6c757d'
        };
        return colors[status] || '#6c757d';
    }, []);

    const getTypeColor = useCallback((type) => {
        const colors = {
            'meeting': '#6D8EFA',
            'campus': '#6D8EFA',
            'study': '#6EB25F',
            'sports': '#6EB25F',
            'alumni': '#5C5C5C',
            'arts': '#FBEBBB'
        };
        return colors[type] || '#6c757d';
    }, []);

    const handleViewEvent = useCallback((event) => {
        if (onViewEvent) {
            onViewEvent(event);
        }
    }, [onViewEvent]);

    const handleFilterChange = useCallback((key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    }, []);

    const handleSort = useCallback((field) => {
        if (sortBy === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setSortOrder('asc');
        }
    }, [sortBy, sortOrder]);

    const clearFilters = useCallback(() => {
        setFilters({
            status: 'all',
            type: 'all',
            timeRange: 'all',
            search: ''
        });
        setQuickFilter(null);
    }, []);

    const handleQuickFilter = useCallback((status) => {
        if (quickFilter === status) {
            setQuickFilter(null);
            handleFilterChange('status', 'all');
        } else {
            setQuickFilter(status);
            handleFilterChange('status', status);
        }
    }, [quickFilter, handleFilterChange]);

    // Memoize computed values
    const events = useMemo(() => eventsData?.data?.events || [], [eventsData?.data?.events]);
    const pagination = useMemo(() => eventsData?.data?.pagination || {}, [eventsData?.data?.pagination]);
    const summary = useMemo(() => eventsData?.data?.summary || {}, [eventsData?.data?.summary]);
    const hasActiveFilters = useMemo(() => 
        filters.status !== 'all' || 
        filters.type !== 'all' || 
        filters.timeRange !== 'all' || 
        filters.search !== ''
    , [filters]);
    // Count events by status for quick filters
    const statusCounts = useMemo(() => {
        const counts = { pending: 0, approved: 0, rejected: 0 };
        events.forEach(event => {
            if (counts.hasOwnProperty(event.status)) {
                counts[event.status]++;
            }
        });
        return counts;
    }, [events]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Focus search on "/"
            if (e.key === '/' && !e.target.matches('input, textarea')) {
                e.preventDefault();
                const searchInput = document.querySelector('.search-input');
                if (searchInput) {
                    searchInput.focus();
                }
            }
            // Clear search on Escape
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
                    <h2>Events Management</h2>
                    <p>Manage and organize your organization's events</p>
                </div>
                <div className="header-actions">
                    <div className="view-toggle">
                        <button 
                            className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
                            onClick={() => setViewMode('list')}
                            title="List View"
                        >
                            <Icon icon="mdi:format-list-bulleted" />
                        </button>
                        <button 
                            className={`view-btn ${viewMode === 'card' ? 'active' : ''}`}
                            onClick={() => setViewMode('card')}
                            title="Card View"
                        >
                            <Icon icon="mdi:view-grid" />
                        </button>
                    </div>
                    <button 
                        className={`filter-btn ${showFilters ? 'active' : ''}`}
                        onClick={() => setShowFilters(!showFilters)}
                    >
                        <Icon icon="mdi:filter" />
                        <span>Filters</span>
                        {hasActiveFilters && <span className="filter-badge"></span>}
                    </button>
                    <button className="create-btn">
                        <Icon icon="mingcute:add-fill" />
                        <span>Create Event</span>
                    </button>
                </div>
            </div>

            {/* Modern Search Bar with Keyboard Shortcut Hint */}
            <div className="search-bar-container">
                <div className="search-bar">
                    <Icon icon="mdi:magnify" className="search-icon" />
                    <input 
                        type="text"
                        placeholder="Search events... (Press / to focus)"
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
                    <div className="search-hint">
                        <kbd>/</kbd>
                    </div>
                </div>
            </div>

            {/* Quick Filter Chips - Stripe/Linear Style */}
            <div className="quick-filters">
                <div className="quick-filters-label">Quick filters:</div>
                <div className="filter-chips">
                    <button 
                        className={`filter-chip ${quickFilter === 'pending' ? 'active' : ''}`}
                        onClick={() => handleQuickFilter('pending')}
                    >
                        <Icon icon="mdi:clock-outline" />
                        <span>Pending</span>
                        {statusCounts.pending > 0 && (
                            <span className="chip-count">{statusCounts.pending}</span>
                        )}
                    </button>
                    <button 
                        className={`filter-chip ${quickFilter === 'approved' ? 'active' : ''}`}
                        onClick={() => handleQuickFilter('approved')}
                    >
                        <Icon icon="mdi:check-circle" />
                        <span>Approved</span>
                        {statusCounts.approved > 0 && (
                            <span className="chip-count">{statusCounts.approved}</span>
                        )}
                    </button>
                    <button 
                        className={`filter-chip ${quickFilter === 'rejected' ? 'active' : ''}`}
                        onClick={() => handleQuickFilter('rejected')}
                    >
                        <Icon icon="mdi:close-circle" />
                        <span>Rejected</span>
                        {statusCounts.rejected > 0 && (
                            <span className="chip-count">{statusCounts.rejected}</span>
                        )}
                    </button>
                    {hasActiveFilters && (
                        <button 
                            className="filter-chip clear-all"
                            onClick={clearFilters}
                        >
                            <Icon icon="mdi:filter-off" />
                            <span>Clear all</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Summary Stats - More Visual */}
            <div className="summary-stats">
                <div className="stat-card">
                    <div className="stat-icon-wrapper" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
                        <Icon icon="mingcute:calendar-fill" className="stat-icon" />
                    </div>
                    <div className="stat-content">
                        <span className="stat-value">{summary.totalEvents || 0}</span>
                        <span className="stat-label">Total Events</span>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon-wrapper" style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }}>
                        <Icon icon="mingcute:user-group-fill" className="stat-icon" />
                    </div>
                    <div className="stat-content">
                        <span className="stat-value">{summary.totalExpectedAttendance || 0}</span>
                        <span className="stat-label">Expected Attendance</span>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon-wrapper" style={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' }}>
                        <Icon icon="mingcute:trending-up-fill" className="stat-icon" />
                    </div>
                    <div className="stat-content">
                        <span className="stat-value">{summary.avgExpectedAttendance || 0}</span>
                        <span className="stat-label">Avg Attendance</span>
                    </div>
                </div>
            </div>

            {/* Filters */}
            {showFilters && (
                <div className="filters-panel">
                    <div className="filters-header">
                        <h3>Filter Events</h3>
                        {hasActiveFilters && (
                            <button className="clear-filters-btn" onClick={clearFilters}>
                                <Icon icon="mdi:close" />
                                <span>Clear All</span>
                            </button>
                        )}
                    </div>
                    <div className="filter-row">
                        <div className="filter-group">
                            <label>
                                <Icon icon="mdi:check-circle" />
                                Status
                            </label>
                            <select 
                                value={filters.status} 
                                onChange={(e) => handleFilterChange('status', e.target.value)}
                            >
                                <option value="all">All Statuses</option>
                                <option value="approved">Approved</option>
                                <option value="pending">Pending</option>
                                <option value="rejected">Rejected</option>
                                <option value="not-applicable">Not Applicable</option>
                            </select>
                        </div>
                        <div className="filter-group">
                            <label>
                                <Icon icon="mdi:tag" />
                                Type
                            </label>
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
                        </div>
                        <div className="filter-group">
                            <label>
                                <Icon icon="mdi:calendar-clock" />
                                Time Range
                            </label>
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
                </div>
            )}

            {/* Events Display - Modern List or Card View */}
            {viewMode === 'list' ? (
            <div className="events-list-view">
                {/* List Header with Sort Options */}
                <div className="list-header">
                    <div className="list-header-left">
                        <div className="sort-options">
                            <button 
                                className={`sort-btn ${sortBy === 'start_time' ? 'active' : ''}`}
                                onClick={() => handleSort('start_time')}
                            >
                                <span>Date</span>
                                {sortBy === 'start_time' && (
                                    <Icon icon={sortOrder === 'asc' ? 'mdi:arrow-up' : 'mdi:arrow-down'} />
                                )}
                            </button>
                            <button 
                                className={`sort-btn ${sortBy === 'name' ? 'active' : ''}`}
                                onClick={() => handleSort('name')}
                            >
                                <span>Name</span>
                                {sortBy === 'name' && (
                                    <Icon icon={sortOrder === 'asc' ? 'mdi:arrow-up' : 'mdi:arrow-down'} />
                                )}
                            </button>
                            <button 
                                className={`sort-btn ${sortBy === 'type' ? 'active' : ''}`}
                                onClick={() => handleSort('type')}
                            >
                                <span>Type</span>
                                {sortBy === 'type' && (
                                    <Icon icon={sortOrder === 'asc' ? 'mdi:arrow-up' : 'mdi:arrow-down'} />
                                )}
                            </button>
                        </div>
                    </div>
                    <div className="list-header-right">
                        <span className="results-count">{events.length} event{events.length !== 1 ? 's' : ''}</span>
                    </div>
                </div>

                {/* Modern List Items */}
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
                                        <span className="meta-separator">•</span>
                                        <span>{formatTime(event.start_time)} - {formatTime(event.end_time)}</span>
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

                            <div className="list-item-actions" onClick={(e) => e.stopPropagation()}>
                                <button 
                                    className="action-btn view" 
                                    title="View Event"
                                    onClick={() => handleViewEvent(event)}
                                >
                                    <Icon icon="mdi:eye" />
                                </button>
                                <button className="action-btn edit" title="Edit Event">
                                    <Icon icon="mdi:pencil" />
                                </button>
                                <button className="action-btn analytics" title="View Analytics">
                                    <Icon icon="mingcute:chart-fill" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            ) : (
            <div className="events-cards">
                <div className="cards-grid">
                    {events.map((event) => (
                        <div 
                            key={event._id} 
                            className="event-card"
                            onClick={() => handleViewEvent(event)}
                        >
                            <div className="card-header">
                                <div className="card-status">
                                    <span 
                                        className="status-badge"
                                        style={{ backgroundColor: getStatusColor(event.status) }}
                                    >
                                        {event.status}
                                    </span>
                                </div>
                            </div>
                            <div className="card-body">
                                <h3 className="card-title">{event.name}</h3>
                                {event.description && (
                                    <p className="card-description">
                                        {event.description.length > 150 
                                            ? `${event.description.substring(0, 150)}...` 
                                            : event.description
                                        }
                                    </p>
                                )}
                                <div className="card-meta">
                                    <div className="meta-item">
                                        <Icon icon="mdi:tag" />
                                        <span 
                                            className="type-badge"
                                            style={{ backgroundColor: getTypeColor(event.type) }}
                                        >
                                            {event.type}
                                        </span>
                                    </div>
                                    <div className="meta-item">
                                        <Icon icon="mdi:calendar-clock" />
                                        <span>{formatDate(event.start_time)}</span>
                                    </div>
                                    <div className="meta-item">
                                        <Icon icon="mdi:clock-outline" />
                                        <span>{formatTime(event.start_time)} - {formatTime(event.end_time)}</span>
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
                            <div className="card-actions">
                                <button 
                                    className="action-btn view" 
                                    title="View Event"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleViewEvent(event);
                                    }}
                                >
                                    <Icon icon="mdi:eye" />
                                    <span>View</span>
                                </button>
                                <button 
                                    className="action-btn edit" 
                                    title="Edit Event"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <Icon icon="mdi:pencil" />
                                    <span>Edit</span>
                                </button>
                                <button 
                                    className="action-btn analytics" 
                                    title="View Analytics"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <Icon icon="mingcute:chart-fill" />
                                    <span>Analytics</span>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            )}

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
                                
                                // Show first page
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
                                
                                // Show ellipsis if needed
                                if (currentPage > 3 && totalPages > 5) {
                                    pages.push(<span key="ellipsis1" className="ellipsis">...</span>);
                                }
                                
                                // Show pages around current page
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
                                
                                // Show ellipsis if needed
                                if (currentPage < totalPages - 2 && totalPages > 5) {
                                    pages.push(<span key="ellipsis2" className="ellipsis">...</span>);
                                }
                                
                                // Show last page
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
                    
                    <h3>No Upcoming Events</h3>
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
                    <button className="create-btn">
                        <Icon icon="mingcute:add-fill" />
                        <span>Create Event</span>
                    </button>
                </div>
            )}
        </div>
    );
}

export default EventsList;
