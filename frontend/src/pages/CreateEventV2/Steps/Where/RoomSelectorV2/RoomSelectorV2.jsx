import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useFetch } from '../../../../../hooks/useFetch';
import { useNotification } from '../../../../../NotificationContext';
import apiRequest from '../../../../../utils/postRequest';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import Loader from '../../../../../components/Loader/Loader';
import FilledStar from '../../../../../assets/Icons/FilledStar.svg';
import { attributeIcons, selectedAttributeIcons } from '../../../../../Icons';
import Popup from '../../../../../components/Popup/Popup';
import './RoomSelectorV2.scss';

function RoomSelectorV2({ formData, setFormData, onComplete }) {
    const { addNotification } = useNotification();
    
    // State
    const [rooms, setRooms] = useState([]);
    const [loading, setLoading] = useState(true); // Start with loading true for initial fetch
    const [selectedRoomIds, setSelectedRoomIds] = useState(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
    const [selectedTags, setSelectedTags] = useState([]);
    const [sortBy, setSortBy] = useState('name');
    const [showFilterPopup, setShowFilterPopup] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [totalRooms, setTotalRooms] = useState(0);
    
    // Cache for fetched rooms to avoid re-fetching
    const roomsCache = useRef(new Map());
    
    // Refs for stable callbacks
    const setFormDataRef = useRef(setFormData);
    const onCompleteRef = useRef(onComplete);
    
    useEffect(() => {
        setFormDataRef.current = setFormData;
        onCompleteRef.current = onComplete;
    }, [setFormData, onComplete]);
    
    // Initialize selectedRoomIds from formData
    useEffect(() => {
        if (formData.selectedRoomIds && Array.isArray(formData.selectedRoomIds)) {
            setSelectedRoomIds(new Set(formData.selectedRoomIds));
        }
    }, []); // Only on mount
    
    // Debounce search query
    useEffect(() => {
        // Don't update if query hasn't actually changed
        if (searchQuery === debouncedSearchQuery) {
            return;
        }
        
        const timer = setTimeout(() => {
            const wasSearching = debouncedSearchQuery.trim();
            const willBeSearching = searchQuery.trim();
            
            setDebouncedSearchQuery(searchQuery);
            
            // Only reset page and clear rooms if transitioning between search and no-search
            if (wasSearching !== willBeSearching) {
                setPage(1); // Reset to first page
                if (willBeSearching) {
                    // Starting a new search - clear rooms
                    setRooms([]);
                } else {
                    // Clearing search - will reload top rated rooms
                    hasInitialized.current = false; // Allow reload of top rated
                }
            } else if (willBeSearching && searchQuery !== debouncedSearchQuery) {
                // Search query changed but still searching - reset page
                setPage(1);
                setRooms([]);
            }
        }, 300);
        
        return () => clearTimeout(timer);
    }, [searchQuery]);
    
    // Track if initial load has happened to prevent re-fetching
    const hasInitialized = useRef(false);
    const isFetching = useRef(false);
    
    // Fetch rooms based on search/filter - only fetch what's needed
    useEffect(() => {
        // Prevent concurrent fetches
        if (isFetching.current) {
            return;
        }
        
        const fetchRooms = async () => {
            // Prevent re-fetching initial load if already done
            // Only skip if we have rooms loaded (not just initialized flag)
            if (!debouncedSearchQuery.trim() && hasInitialized.current && rooms.length > 0) {
                return;
            }
            
            // If no search query and already initialized but no rooms, something went wrong - reset
            if (!debouncedSearchQuery.trim() && hasInitialized.current && rooms.length === 0 && page === 1) {
                hasInitialized.current = false;
            }
            
            isFetching.current = true;
            setLoading(true);
            try {
                // If there's a search query, use search-rooms endpoint (more efficient)
                if (debouncedSearchQuery.trim()) {
                    const response = await apiRequest('/search-rooms', null, {
                        method: 'GET',
                        params: {
                            query: debouncedSearchQuery.trim(),
                            limit: 20,
                            page: page
                        }
                    });
                    
                    if (response.success && response.rooms) {
                        const newRooms = response.rooms.map(room => ({
                            id: room._id,
                            name: room.name || 'Unknown Room',
                            image: room.image || null,
                            building: room.building || '',
                            floor: room.floor || '',
                            capacity: room.capacity || 0,
                            attributes: room.attributes || [],
                            average_rating: room.average_rating || 0,
                            number_of_ratings: room.number_of_ratings || 0
                        }));
                        
                        if (page === 1) {
                            setRooms(newRooms);
                        } else {
                            setRooms(prev => [...prev, ...newRooms]);
                        }
                        
                        setTotalRooms(response.pagination?.total || newRooms.length);
                        setHasMore(page < (response.pagination?.totalPages || 1));
                    }
                } else {
                    // No search query - fetch initial set and show top 10 highest rated
                    // Only fetch once on initial load
                    if (!hasInitialized.current) {
                        hasInitialized.current = true;
                        
                        // Use optimized endpoint to get top rated rooms directly
                        const topRatedResponse = await apiRequest('/top-rated-rooms', null, {
                            method: 'GET',
                            params: {
                                limit: 10
                            }
                        });
                        
                        if (topRatedResponse && topRatedResponse.success && topRatedResponse.data) {
                            const topRatedRooms = topRatedResponse.data;
                            
                            // Get total room count for display
                            const roomsData = await apiRequest('/getrooms', null, { method: 'GET' });
                            const totalCount = roomsData?.data ? Object.keys(roomsData.data).length : topRatedRooms.length;
                            
                            setRooms(topRatedRooms);
                            setTotalRooms(totalCount);
                            setHasMore(false);
                        } else {
                            // Fallback to old method if new endpoint fails
                            const roomsData = await apiRequest('/getrooms', null, { method: 'GET' });
                            
                            if (roomsData && roomsData.success && roomsData.data && Object.keys(roomsData.data).length > 0) {
                                const allRoomIds = Object.values(roomsData.data);
                                const totalCount = allRoomIds.length;
                                const sampleSize = Math.min(20, allRoomIds.length);
                                const sampleRoomIds = allRoomIds.slice(0, sampleSize);
                                
                                if (sampleRoomIds.length > 0) {
                                    const batchResponse = await apiRequest('/getbatch-new', {
                                        queries: sampleRoomIds,
                                        exhaustive: true
                                    });
                                    
                                    if (batchResponse && batchResponse.success && batchResponse.data) {
                                        const fetchedRooms = batchResponse.data
                                            .map((item, index) => {
                                                if (!item || !item.room) return null;
                                                const room = item.room;
                                                return {
                                                    id: sampleRoomIds[index],
                                                    name: room.name || 'Unknown Room',
                                                    image: room.image || null,
                                                    building: room.building || '',
                                                    floor: room.floor || '',
                                                    capacity: room.capacity || 0,
                                                    attributes: room.attributes || [],
                                                    average_rating: room.average_rating || 0,
                                                    number_of_ratings: room.number_of_ratings || 0,
                                                    schedule: item.data || null
                                                };
                                            })
                                            .filter(Boolean);
                                        
                                        const sortedRooms = fetchedRooms.sort((a, b) => {
                                            const ratingA = a.average_rating || 0;
                                            const ratingB = b.average_rating || 0;
                                            if (ratingB !== ratingA) {
                                                return ratingB - ratingA;
                                            }
                                            return (b.number_of_ratings || 0) - (a.number_of_ratings || 0);
                                        });
                                        
                                        const topRatedRooms = sortedRooms.slice(0, 10);
                                        setRooms(topRatedRooms);
                                        setTotalRooms(totalCount);
                                        setHasMore(false);
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('[RoomSelectorV2] Error fetching rooms:', error);
                addNotification({
                    title: 'Error',
                    message: 'Failed to load rooms. Please try again.',
                    type: 'error'
                });
            } finally {
                setLoading(false);
                isFetching.current = false;
            }
        };
        
        fetchRooms();
    }, [debouncedSearchQuery, page, addNotification]);
    
    // Extract unique attributes from visible rooms (for filter popup)
    const availableAttributes = useMemo(() => {
        const attributeSet = new Set();
        rooms.forEach(room => {
            if (room.attributes && Array.isArray(room.attributes)) {
                room.attributes.forEach(attr => attributeSet.add(attr));
            }
        });
        return Array.from(attributeSet).sort();
    }, [rooms]);
    
    // Filter and sort rooms (client-side filtering for attributes and sorting)
    const filteredRooms = useMemo(() => {
        let filtered = [...rooms];
        
        // Apply attribute filter (client-side since we're already filtering by search)
        if (selectedTags.length > 0) {
            filtered = filtered.filter(room =>
                selectedTags.every(tag => room.attributes?.includes(tag))
            );
        }
        
        // Apply sorting
        filtered.sort((a, b) => {
            switch (sortBy) {
                case 'name':
                    return a.name.localeCompare(b.name);
                case 'rating':
                    return (b.average_rating || 0) - (a.average_rating || 0);
                case 'capacity':
                    return (b.capacity || 0) - (a.capacity || 0);
                default:
                    return 0;
            }
        });
        
        return filtered;
    }, [rooms, selectedTags, sortBy]);
    
    // Selected rooms for display - fetch details if not already loaded
    const [selectedRooms, setSelectedRooms] = useState([]);
    
    useEffect(() => {
        const fetchSelectedRoomDetails = async () => {
            const selectedArray = Array.from(selectedRoomIds);
            if (selectedArray.length === 0) {
                setSelectedRooms([]);
                return;
            }
            
            // Find which selected rooms we already have loaded
            const loadedRooms = selectedArray
                .map(id => rooms.find(room => room.id === id))
                .filter(Boolean);
            
            // Find which selected rooms we need to fetch
            const missingIds = selectedArray.filter(id => !rooms.find(room => room.id === id));
            
            if (missingIds.length === 0) {
                setSelectedRooms(loadedRooms);
                return;
            }
            
            // Fetch missing room details in batch
            try {
                const batchResponse = await apiRequest('/getbatch-new', {
                    queries: missingIds,
                    exhaustive: true
                });
                
                if (batchResponse.success && batchResponse.data) {
                    const fetchedRooms = batchResponse.data
                        .map((item, index) => {
                            if (!item.data || !item.room) return null;
                            const room = item.room;
                            return {
                                id: missingIds[index],
                                name: room.name || 'Unknown Room',
                                image: room.image || null,
                                building: room.building || '',
                                floor: room.floor || '',
                                capacity: room.capacity || 0,
                                attributes: room.attributes || [],
                                average_rating: room.average_rating || 0,
                                number_of_ratings: room.number_of_ratings || 0,
                                schedule: item.data
                            };
                        })
                        .filter(Boolean);
                    
                    // Combine loaded and fetched rooms
                    setSelectedRooms([...loadedRooms, ...fetchedRooms]);
                } else {
                    setSelectedRooms(loadedRooms);
                }
            } catch (error) {
                console.error('Error fetching selected room details:', error);
                setSelectedRooms(loadedRooms);
            }
        };
        
        fetchSelectedRoomDetails();
    }, [selectedRoomIds, rooms]);
    
    // Update form data when selection changes
    const prevSelectionRef = useRef(null);
    useEffect(() => {
        if (loading) return;
        
        const selectedArray = Array.from(selectedRoomIds);
        const selectionKey = JSON.stringify(selectedArray.sort());
        
        if (prevSelectionRef.current === selectionKey) {
            return;
        }
        
        prevSelectionRef.current = selectionKey;
        
        // Find first selected room from either loaded rooms or selectedRooms
        const firstSelectedRoom = selectedArray.length > 0 
            ? (rooms.find(room => room.id === selectedArray[0]) || 
               selectedRooms.find(room => room.id === selectedArray[0])) 
            : null;
        
        setFormDataRef.current(prev => ({
            ...prev,
            selectedRoomIds: selectedArray,
            location: firstSelectedRoom?.name || null,
            classroomId: firstSelectedRoom?.id || null,
            classroom_id: firstSelectedRoom?.id || null
        }));
        
        onCompleteRef.current(selectedArray.length > 0);
    }, [selectedRoomIds, rooms, selectedRooms, loading]);
    
    // Load more rooms (pagination) - only for search results
    const loadMore = useCallback(() => {
        // Only load more if we have a search query (pagination for search)
        // For initial top-rated rooms, we don't paginate
        if (!loading && hasMore && debouncedSearchQuery.trim()) {
            setPage(prev => prev + 1);
        }
    }, [loading, hasMore, debouncedSearchQuery]);
    
    // Handle room toggle
    const handleRoomToggle = useCallback((roomId) => {
        setSelectedRoomIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(roomId)) {
                newSet.delete(roomId);
            } else {
                newSet.add(roomId);
            }
            return newSet;
        });
    }, []);
    
    // Handle tag toggle
    const handleTagToggle = useCallback((tag) => {
        setSelectedTags(prev => {
            if (prev.includes(tag)) {
                return prev.filter(t => t !== tag);
            } else {
                return [...prev, tag];
            }
        });
    }, []);
    
    // Intersection observer for infinite scroll - only for search results
    const observerTarget = useRef(null);
    
    useEffect(() => {
        // Only enable infinite scroll for search results, not initial top-rated load
        if (!debouncedSearchQuery.trim()) {
            return;
        }
        
        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting && hasMore && !loading) {
                    loadMore();
                }
            },
            { threshold: 0.1 }
        );
        
        const currentTarget = observerTarget.current;
        if (currentTarget) {
            observer.observe(currentTarget);
        }
        
        return () => {
            if (currentTarget) {
                observer.unobserve(currentTarget);
            }
        };
    }, [hasMore, loading, loadMore, debouncedSearchQuery]);
    
    return (
        <div className="room-selector-v2">
            <div className="info-box">
                <p className="info-text">
                    {searchQuery.trim() 
                        ? 'Search results for your query. Select one or more rooms for your event.'
                        : 'Showing top 10 highest rated rooms. Search to find specific rooms by name, building, or attributes.'}
                </p>
            </div>
            
            {/* Search and Filter Bar */}
            <div className="search-filter-bar">
                <div className="search-input-wrapper">
                    <Icon icon="mdi:magnify" className="search-icon" />
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Search rooms..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <button 
                            className="clear-search"
                            onClick={() => setSearchQuery('')}
                        >
                            <Icon icon="mdi:close" />
                        </button>
                    )}
                </div>
                
                <div className="filter-buttons">
                    <button
                        className={`filter-btn ${selectedTags.length > 0 ? 'active' : ''}`}
                        onClick={() => setShowFilterPopup(true)}
                    >
                        <Icon icon="mdi:filter" />
                        Filters
                        {selectedTags.length > 0 && (
                            <span className="filter-count">{selectedTags.length}</span>
                        )}
                    </button>
                    
                    <div className="sort-dropdown">
                        <select
                            className="sort-select"
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                        >
                            <option value="name">Sort by Name</option>
                            <option value="rating">Sort by Rating</option>
                            <option value="capacity">Sort by Capacity</option>
                        </select>
                        <Icon icon="mdi:chevron-down" className="sort-icon" />
                    </div>
                </div>
            </div>
            
            {/* Selected Rooms */}
            {selectedRooms.length > 0 && (
                <div className="selected-section">
                    <h3>Selected Rooms ({selectedRooms.length})</h3>
                    <div className="selected-grid">
                        {selectedRooms.map(room => (
                            <RoomCard
                                key={room.id}
                                room={room}
                                isSelected={true}
                                onToggle={() => handleRoomToggle(room.id)}
                            />
                        ))}
                    </div>
                </div>
            )}
            
            {/* All Rooms List */}
            <div className="rooms-section">
                {loading && rooms.length === 0 ? (
                    <div className="loading-state">
                        <Loader />
                        <p>Loading rooms...</p>
                    </div>
                ) : (
                    <>
                        <h3>
                            {filteredRooms.length === 0 
                                ? 'No rooms found' 
                                : debouncedSearchQuery.trim()
                                ? `Search Results (${totalRooms}${totalRooms > filteredRooms.length ? '+' : ''})`
                                : `Top Rated Rooms (${filteredRooms.length})`}
                        </h3>
                <div className="rooms-grid">
                    {filteredRooms.map(room => (
                        <RoomCard
                            key={room.id}
                            room={room}
                            isSelected={selectedRoomIds.has(room.id)}
                            onToggle={() => handleRoomToggle(room.id)}
                        />
                    ))}
                </div>
                
                {/* Loading indicator for pagination */}
                {loading && rooms.length > 0 && (
                    <div className="loading-more">
                        <Loader />
                    </div>
                )}
                
                {/* Infinite scroll trigger */}
                {hasMore && !loading && (
                    <div ref={observerTarget} className="scroll-trigger" />
                )}
                
                {/* No more rooms message */}
                {!hasMore && rooms.length > 0 && (
                    <div className="no-more-rooms">
                        <p>No more rooms to load</p>
                    </div>
                )}
                    </>
                )}
            </div>
            
            {/* Filter Popup */}
            <Popup 
                isOpen={showFilterPopup} 
                onClose={() => setShowFilterPopup(false)} 
                defaultStyling={true}
            >
                <div className="filter-popup-content">
                    <h3>Filter by Attributes</h3>
                    <div className="attributes-grid">
                        {availableAttributes.map(attr => (
                            <button
                                key={attr}
                                className={`attribute-tag ${selectedTags.includes(attr) ? 'selected' : ''}`}
                                onClick={() => handleTagToggle(attr)}
                            >
                                {attr}
                            </button>
                        ))}
                    </div>
                    <div className="popup-actions">
                        <button 
                            className="btn-secondary"
                            onClick={() => {
                                setSelectedTags([]);
                                setShowFilterPopup(false);
                            }}
                        >
                            Clear
                        </button>
                        <button 
                            className="btn-primary"
                            onClick={() => setShowFilterPopup(false)}
                        >
                            Apply
                        </button>
                    </div>
                </div>
            </Popup>
        </div>
    );
}

// Room Card Component
function RoomCard({ room, isSelected, onToggle }) {
    const getAttributeIcon = (attr) => {
        const attrLower = attr.toLowerCase().trim();
        return selectedAttributeIcons[attrLower] || attributeIcons[attrLower] || null;
    };
    
    return (
        <div 
            className={`room-card ${isSelected ? 'selected' : ''}`}
            onClick={onToggle}
        >
            <div className="room-image">
                {room.image ? (
                    <img src={room.image} alt={room.name} />
                ) : (
                    <div className="no-image">
                        <Icon icon="mdi:office-building" />
                    </div>
                )}
                {isSelected && (
                    <div className="selected-badge">
                        <Icon icon="mdi:check-circle" />
                    </div>
                )}
            </div>
            
            <div className="room-content">
                <h4 className="room-name">{room.name}</h4>
                
                <div className="room-meta">
                    {room.average_rating > 0 && (
                        <div className="rating">
                            <img src={FilledStar} alt="star" />
                            <span>{room.average_rating.toFixed(1)}</span>
                        </div>
                    )}
                    {room.capacity > 0 && (
                        <div className="capacity">
                            <Icon icon="mdi:account-group" />
                            <span>{room.capacity}</span>
                        </div>
                    )}
                </div>
                
                {room.attributes && room.attributes.length > 0 && (
                    <div className="room-attributes">
                        {room.attributes.slice(0, 3).map((attr, idx) => {
                            const icon = getAttributeIcon(attr);
                            return (
                                <div key={idx} className="attribute-item">
                                    {icon && <img src={icon} alt={attr} />}
                                    <span>{attr}</span>
                                </div>
                            );
                        })}
                        {room.attributes.length > 3 && (
                            <span className="more-attributes">
                                +{room.attributes.length - 3}
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default RoomSelectorV2;

