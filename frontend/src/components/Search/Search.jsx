import React, { useState, useEffect, useMemo } from 'react';
import './Search.scss';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import { useNavigate } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import apiRequest from '../../utils/postRequest';
import Loader from '../Loader/Loader';

// Default search types configuration
const DEFAULT_SEARCH_TYPES = [
    { key: 'events', label: 'Events', icon: 'mingcute:calendar-fill', enabled: true },
    { key: 'organizations', label: 'Organizations', icon: 'mingcute:group-2-fill', enabled: true },
    { key: 'rooms', label: 'Rooms', icon: 'mingcute:building-fill', enabled: true },
    { key: 'users', label: 'Users', icon: 'mingcute:user-fill', enabled: true }
];

/**
 * Configurable Search Component
 * 
 * @param {Object} props - Component props
 * @param {string} [props.variant='default'] - Search variant: 'default' | 'compact'
 * @param {Function} [props.onSearchFocus] - Callback when search input is focused
 * @param {Function} [props.onSearchBlur] - Callback when search input loses focus
 * @param {boolean} [props.isSearchFocused] - Whether search is currently focused
 * @param {string} [props.placeholder] - Placeholder text for search input
 * @param {string} [props.className] - Additional CSS classes
 * @param {Array} [props.searchTypes] - Array of search type configurations
 * @param {boolean} [props.showAllTab=true] - Whether to show the "All" tab
 * @param {Object} [props.navigationHandlers] - Custom navigation handlers for different result types
 * 
 * @example
 * // Basic usage with default search types
 * <Search variant="compact" />
 * 
 * @example
 * // Custom search types - only events and rooms
 * const customSearchTypes = [
 *   { key: 'events', label: 'Events', icon: 'mingcute:calendar-fill', enabled: true },
 *   { key: 'rooms', label: 'Rooms', icon: 'mingcute:building-fill', enabled: true }
 * ];
 * <Search searchTypes={customSearchTypes} showAllTab={false} />
 * 
 * @example
 * // Events-only search
 * const eventsOnly = [
 *   { key: 'events', label: 'Events', icon: 'mingcute:calendar-fill', enabled: true }
 * ];
 * <Search searchTypes={eventsOnly} showAllTab={false} />
 * 
 * @example
 * // Custom navigation handlers
 * const navigationHandlers = {
 *   rooms: (room) => navigateToRoomsTab(room),
 *   events: (event) => navigateToEventPage(event)
 * };
 * <Search 
 *   searchTypes={customSearchTypes} 
 *   navigationHandlers={navigationHandlers}
 * />
 */
function Search({ 
    variant = 'default', // 'default' | 'compact'
    onSearchFocus,
    onSearchBlur,
    isSearchFocused,
    placeholder = "Search for events, organizations, users, or rooms...",
    className = '',
    searchTypes = DEFAULT_SEARCH_TYPES, // Configurable search types
    showAllTab = true, // Whether to show the "All" tab
    navigationHandlers = {}, // Custom navigation handlers
    setSearching = () => {}
}) {
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [activeTab, setActiveTab] = useState('all');
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState(null);
    const navigate = useNavigate();
    const { user } = useAuth();

    // Filter enabled search types and add users conditionally
    const enabledSearchTypes = useMemo(() => {
        return searchTypes
            .filter(type => type.enabled)
            .map(type => {
                // Special handling for users - only show if authenticated
                if (type.key === 'users' && !user) {
                    return { ...type, enabled: false };
                }
                return type;
            })
            .filter(type => type.enabled);
    }, [searchTypes, user]);

    // Search results state - dynamically create based on enabled types
    const [results, setResults] = useState(() => {
        const initialResults = {};
        enabledSearchTypes.forEach(type => {
            initialResults[type.key] = [];
        });
        return initialResults;
    });

    useEffect(() => {
        if (debouncedSearch) {
            setSearching(true);
        } else {
            setSearching(false);
        }
    }, [debouncedSearch]);

    // Debounce search input
    useEffect(() => {
        if (search !== debouncedSearch) {
            setIsSearching(true);
        }
        const timeoutId = setTimeout(() => {
            setDebouncedSearch(search);
            setIsSearching(false);
        }, 300);
        return () => clearTimeout(timeoutId);
    }, [search, debouncedSearch]);

    // Reset results when search types change
    useEffect(() => {
        const newResults = {};
        enabledSearchTypes.forEach(type => {
            newResults[type.key] = [];
        });
        setResults(newResults);
    }, [enabledSearchTypes]);

    // Fetch search results
    useEffect(() => {
        if (!debouncedSearch || debouncedSearch.length < 2) {
            const emptyResults = {};
            enabledSearchTypes.forEach(type => {
                emptyResults[type.key] = [];
            });
            setResults(emptyResults);
            return;
        }

        const performSearch = async () => {
            setIsSearching(true);

            setError(null);

            try {
                const newResults = {};

                // Search for events if enabled
                if (enabledSearchTypes.some(type => type.key === 'events')) {
                    try {
                        const eventsResponse = await apiRequest('/get-future-events', {}, {
                            method: 'GET',
                            params: {
                                page: 1,
                                limit: 100
                            }
                        });
                        
                        if (eventsResponse.success) {
                            const filteredEvents = (eventsResponse.events || []).filter(event => 
                                event.name?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
                                event.description?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
                                event.type?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
                                event.classroom_id?.name?.toLowerCase().includes(debouncedSearch.toLowerCase())
                            ).slice(0, 20);
                            newResults.events = filteredEvents;
                        } else {
                            newResults.events = [];
                        }
                    } catch (err) {
                        console.error('Events search failed:', err);
                        newResults.events = [];
                    }
                }

                // Search for organizations if enabled
                if (enabledSearchTypes.some(type => type.key === 'organizations')) {
                    try {
                        const orgsResponse = await apiRequest('/get-orgs', {}, {
                            method: 'GET'
                        });
                        
                        if (orgsResponse.success) {
                            const filteredOrgs = (orgsResponse.orgs || []).filter(org => 
                                org.org_name?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
                                org.org_description?.toLowerCase().includes(debouncedSearch.toLowerCase())
                            ).slice(0, 20);
                            newResults.organizations = filteredOrgs;
                        } else {
                            newResults.organizations = [];
                        }
                    } catch (err) {
                        console.error('Organizations search failed:', err);
                        newResults.organizations = [];
                    }
                }

                // Search for users if enabled and authenticated
                if (enabledSearchTypes.some(type => type.key === 'users') && user) {
                    try {
                        const usersResponse = await apiRequest('/search-users', {}, {
                            method: 'GET',
                            params: {
                                query: debouncedSearch,
                                limit: 20
                            }
                        });
                        newResults.users = usersResponse.success ? (usersResponse.data || []) : [];
                    } catch (err) {
                        console.error('Users search failed:', err);
                        newResults.users = [];
                    }
                }

                // Search for rooms if enabled
                if (enabledSearchTypes.some(type => type.key === 'rooms')) {
                    try {
                        const roomsResponse = await apiRequest('/search-rooms', {}, {
                            method: 'GET',
                            params: {
                                query: debouncedSearch,
                                limit: 20,
                                page: 1
                            }
                        });
                        
                        if (roomsResponse.success) {
                            newResults.rooms = roomsResponse.rooms || [];
                        } else if (roomsResponse.error) {
                            console.log('Room search error:', roomsResponse.error);
                            newResults.rooms = [];
                        } else {
                            newResults.rooms = [];
                        }
                    } catch (err) {
                        console.error('Room search failed:', err);
                        newResults.rooms = [];
                    }
                }

                setResults(newResults);
            } catch (err) {
                setError(err.message || 'Search failed');
                const emptyResults = {};
                enabledSearchTypes.forEach(type => {
                    emptyResults[type.key] = [];
                });
                setResults(emptyResults);
            } finally {
                setIsSearching(false);

            }
        };

        performSearch();
    }, [debouncedSearch, enabledSearchTypes, user]);

    // Helper function to highlight search matches
    const highlightMatch = (text, searchTerm) => {
        if (!searchTerm || !text) return text;
        const regex = new RegExp(`(${searchTerm})`, 'gi');
        const parts = text.split(regex);
        return parts.map((part, index) => 
            regex.test(part) ? <mark key={index} className="search-highlight">{part}</mark> : part
        );
    };

    // Helper function to format date
    const formatDate = (date) => {
        const eventDate = new Date(date);
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const isToday = eventDate.toDateString() === today.toDateString();
        const isTomorrow = eventDate.toDateString() === tomorrow.toDateString();
        
        if (isToday) return 'Today';
        if (isTomorrow) return 'Tomorrow';
        
        return eventDate.toLocaleDateString('en-US', { 
            weekday: 'long', 
            month: 'long', 
            day: 'numeric' 
        });
    };

    // Get filtered results based on active tab
    const filteredResults = useMemo(() => {
        if (activeTab === 'all') {
            const allResults = {};
            enabledSearchTypes.forEach(type => {
                allResults[type.key] = results[type.key]?.slice(0, variant === 'compact' ? 5 : 5) || [];
            });
            return allResults;
        }
        
        const singleResults = {};
        enabledSearchTypes.forEach(type => {
            singleResults[type.key] = activeTab === type.key ? (results[type.key] || []) : [];
        });
        return singleResults;
    }, [activeTab, results, variant, enabledSearchTypes]);

    // Get total count for each category
    const counts = useMemo(() => {
        const countObj = { all: 0 };
        enabledSearchTypes.forEach(type => {
            countObj[type.key] = results[type.key]?.length || 0;
            countObj.all += countObj[type.key];
        });
        return countObj;
    }, [results, enabledSearchTypes]);

    // Build tabs dynamically based on enabled search types
    const tabs = useMemo(() => {
        const tabList = [];
        
        if (showAllTab && enabledSearchTypes.length > 1) {
            tabList.push({ key: 'all', label: 'All', icon: 'mingcute:search-fill' });
        }
        
        enabledSearchTypes.forEach(type => {
            tabList.push({
                key: type.key,
                label: type.label,
                icon: type.icon
            });
        });
        
        return tabList;
    }, [enabledSearchTypes, showAllTab]);

    // Filter counts based on available tabs
    const availableCounts = {};
    tabs.forEach(tab => {
        availableCounts[tab.key] = counts[tab.key] || 0;
    });

    // Set initial active tab when tabs change
    useEffect(() => {
        if (tabs.length > 0 && !tabs.find(tab => tab.key === activeTab)) {
            setActiveTab(tabs[0].key);
        }
    }, [tabs, activeTab]);

    const handleEventClick = (event) => {
        if (navigationHandlers.events) {
            navigationHandlers.events(event);
        } else {
            navigate(`/event/${event._id}`);
        }
        setSearch('');
        if (onSearchBlur) onSearchBlur();
    };

    const handleOrgClick = (org) => {
        if (navigationHandlers.organizations) {
            navigationHandlers.organizations(org);
        } else {
            navigate(`/org/${org.org_name}`);
        }
        setSearch('');
        if (onSearchBlur) onSearchBlur();
    };

    const handleUserClick = (user) => {
        if (navigationHandlers.users) {
            navigationHandlers.users(user);
        } else {
            navigate(`/profile/${user.username}`);
        }
        setSearch('');
        if (onSearchBlur) onSearchBlur();
    };

    const handleRoomClick = (room) => {
        if (navigationHandlers.rooms) {
            navigationHandlers.rooms(room);
        } else {
            navigate(`/room/${room._id}`);
        }
        setSearch('');
        if (onSearchBlur) onSearchBlur();
    };

    const handleSearchFocus = () => {
        if (onSearchFocus) onSearchFocus();
    };

    const handleSearchBlur = () => {
        // Only blur if no search query or results
        if (!search || search.length < 2) {
            if (onSearchBlur) onSearchBlur();
        }
    };

    const shouldShowResults = variant === 'compact' ? 
        (isSearchFocused && debouncedSearch && debouncedSearch.length >= 2) :
        (debouncedSearch && debouncedSearch.length >= 2);

    // Don't render if no search types are enabled
    if (enabledSearchTypes.length === 0) {
        return null;
    }

    return (
        <div className={`search-component ${variant} ${className}`}>
            <div className="search-container">
                <div className="search-input-wrapper">
                    <Icon icon="mingcute:search-fill" className="search-icon" />
                    <input 
                        className="search-input" 
                        placeholder={placeholder}
                        value={search} 
                        onChange={e => setSearch(e.target.value)}
                        onFocus={handleSearchFocus}
                        onBlur={handleSearchBlur}
                    />
                    {isSearching && <div className="search-spinner">⟳</div>}
                    {search && (
                        <button 
                            className="clear-button"
                            onClick={() => {
                                setSearch('');
                                setDebouncedSearch('');
                                const emptyResults = {};
                                enabledSearchTypes.forEach(type => {
                                    emptyResults[type.key] = [];
                                });
                                setResults(emptyResults);
                                if (onSearchBlur) onSearchBlur();
                            }}
                            type="button"
                            aria-label="Clear search"
                        >
                            <Icon icon="mingcute:close-fill" />
                        </button>
                    )}
                </div>
            </div>

            {error && (
                <div className="error-message">
                    {error}
                </div>
            )}

            {shouldShowResults && (
                <div className="search-results">
                    {tabs.length > 1 && (
                        <div className="tabs">
                            {tabs.map(tab => (
                                <button
                                    key={tab.key}
                                    className={`tab ${activeTab === tab.key ? 'active' : ''}`}
                                    onClick={() => setActiveTab(tab.key)}
                                >
                                    <Icon icon={tab.icon} />
                                    {tab.label}
                                    {availableCounts[tab.key] > 0 && (
                                        <span className="count">{availableCounts[tab.key]}</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="results-content">
                        {isSearching ? (
                            <div className="loading">
                                <Loader />
                                <p>Searching...</p>
                            </div>
                        ) : (
                            <>
                                {/* All Results */}
                                {activeTab === 'all' && (
                                    <div className="all-results">
                                        {enabledSearchTypes.map(type => {
                                            const typeResults = filteredResults[type.key] || [];
                                            if (typeResults.length === 0) return null;
                                            
                                            return (
                                                <div key={type.key} className="result-section">
                                                    <h3>{type.label}</h3>
                                                    <div className="result-grid">
                                                        {typeResults.map(item => {
                                                            switch (type.key) {
                                                                case 'events':
                                                                    return (
                                                                        <div key={item._id} className="result-card event-card" onClick={() => handleEventClick(item)}>
                                                                            <div className="card-header">
                                                                                <h4>{highlightMatch(item.name, debouncedSearch)}</h4>
                                                                                <span className="date">{formatDate(item.start_time)}</span>
                                                                            </div>
                                                                            <p className="description">{highlightMatch(item.description || '', debouncedSearch)}</p>
                                                                            <div className="card-footer">
                                                                                <span className="type">{item.type}</span>
                                                                                <span className="location">{item.classroom_id?.name || 'TBD'}</span>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                case 'organizations':
                                                                    return (
                                                                        <div key={item._id} className="result-card org-card" onClick={() => handleOrgClick(item)}>
                                                                            <div className="card-header">
                                                                                <img src={item.org_profile_image || '/default-org.png'} alt="" className="org-image" />
                                                                                <div>
                                                                                    <h4>{highlightMatch(item.org_name, debouncedSearch)}</h4>
                                                                                    <p className="description">{highlightMatch(item.org_description || '', debouncedSearch)}</p>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                case 'users':
                                                                    return (
                                                                        <div key={item._id} className="result-card user-card" onClick={() => handleUserClick(item)}>
                                                                            <div className="card-header">
                                                                                <img src={item.picture || '/default-user.png'} alt="" className="user-image" />
                                                                                <div>
                                                                                    <h4>{highlightMatch(item.name || item.username, debouncedSearch)}</h4>
                                                                                    <p className="username">@{item.username}</p>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                case 'rooms':
                                                                    return (
                                                                        <div key={item._id} className="result-card room-card" onClick={() => handleRoomClick(item)}>
                                                                            <div className="card-header">
                                                                                <img src={item.image || '/default-room.png'} alt="" className="room-image" />
                                                                                <div>
                                                                                    <h4>{highlightMatch(item.name, debouncedSearch)}</h4>
                                                                                    <div className="attributes">
                                                                                        {(item.attributes || []).map(attr => (
                                                                                            <span key={attr} className="attribute">
                                                                                                {highlightMatch(attr, debouncedSearch)}
                                                                                            </span>
                                                                                        ))}
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                default:
                                                                    return null;
                                                            }
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {counts.all === 0 && (
                                            <div className="no-results">
                                                <Icon icon="mingcute:search-fill" />
                                                <p>No results found for "{debouncedSearch}"</p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Individual Tab Results */}
                                {activeTab !== 'all' && enabledSearchTypes.map(type => {
                                    if (activeTab !== type.key) return null;
                                    
                                    const typeResults = filteredResults[type.key] || [];
                                    
                                    return (
                                        <div key={type.key} className={`${type.key}-results`}>
                                            {typeResults.length > 0 ? (
                                                <div className="result-grid">
                                                    {typeResults.map(item => {
                                                        switch (type.key) {
                                                            case 'events':
                                                                return (
                                                                    <div key={item._id} className="result-card event-card" onClick={() => handleEventClick(item)}>
                                                                        <div className="card-header">
                                                                            <h4>{highlightMatch(item.name, debouncedSearch)}</h4>
                                                                            <span className="date">{formatDate(item.start_time)}</span>
                                                                        </div>
                                                                        <p className="description">{highlightMatch(item.description || '', debouncedSearch)}</p>
                                                                        <div className="card-footer">
                                                                            <span className="type">{item.type}</span>
                                                                            <span className="location">{item.location}</span>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            case 'organizations':
                                                                return (
                                                                    <div key={item._id} className="result-card org-card" onClick={() => handleOrgClick(item)}>
                                                                        <div className="card-header">
                                                                            <img src={item.org_profile_image || '/default-org.png'} alt="" className="org-image" />
                                                                            <div>
                                                                                <h4>{highlightMatch(item.org_name, debouncedSearch)}</h4>
                                                                                <p className="description">{highlightMatch(item.org_description || '', debouncedSearch)}</p>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            case 'users':
                                                                return (
                                                                    <div key={item._id} className="result-card user-card" onClick={() => handleUserClick(item)}>
                                                                        <div className="card-header">
                                                                            <img src={item.picture || '/default-user.png'} alt="" className="user-image" />
                                                                            <div>
                                                                                <h4>{highlightMatch(item.name || item.username, debouncedSearch)}</h4>
                                                                                <p className="username">@{item.username}</p>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            case 'rooms':
                                                                return (
                                                                    <div key={item._id} className="result-card room-card" onClick={() => handleRoomClick(item)}>
                                                                        <div className="card-header">
                                                                            <img src={item.image || ''} alt="" className="room-image" />
                                                                            <div>
                                                                                <h4>{highlightMatch(item.name, debouncedSearch)}</h4>
                                                                                <div className="attributes">
                                                                                    {(item.attributes || []).map(attr => (
                                                                                        <span key={attr} className="attribute">
                                                                                            {highlightMatch(attr, debouncedSearch)}
                                                                                        </span>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            default:
                                                                return null;
                                                        }
                                                    })}
                                                </div>
                                            ) : (
                                                <div className="no-results">
                                                    <Icon icon={type.icon} />
                                                    <p>No {type.label.toLowerCase()} found for "{debouncedSearch}"</p>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </>
                        )}
                    </div>
                </div>
            )}

            {variant === 'default' && !debouncedSearch && (
                <div className="search-placeholder">
                    <Icon icon="mingcute:search-fill" />
                    <h3>Start searching</h3>
                    <p>Search for {enabledSearchTypes.map(type => type.label.toLowerCase()).join(', ')} to get started</p>
                </div>
            )}
        </div>
    );
}

export default Search;
