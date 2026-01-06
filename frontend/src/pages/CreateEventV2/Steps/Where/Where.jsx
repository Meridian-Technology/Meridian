import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import './Where.scss'

// swap from useCache to useFetch or post request
import { useCache } from '../../../../CacheContext';
import { useNotification } from '../../../../NotificationContext';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import Loader from '../../../../components/Loader/Loader.jsx';
import FilledStar from '../../../../assets/Icons/FilledStar.svg';
import Tags from '../../../../assets/Icons/sort/Tags.svg';
import SortBy from '../../../../assets/Icons/sort/SortBy.svg';
import TagsSelected from '../../../../assets/Icons/sort/TagsSelected.svg';
import SortBySelected from '../../../../assets/Icons/sort/SortBySelected.svg';
import ChevronDown from '../../../../assets/Icons/sort/ChevronDown.svg';
import ChevronUp from '../../../../assets/Icons/sort/ChevronUp.svg';
import tab from '../../../../assets/tab.svg';
import x from '../../../../assets/x.svg';
import { attributeIcons, selectedAttributeIcons } from '../../../../Icons';

function Where({ formData, setFormData, onComplete }){
    const { addNotification } = useNotification();
    const { getRooms, getRoom } = useCache();
    const [rooms, setRooms] = useState([]);
    const [roomData, setRoomData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedRoomIds, setSelectedRoomIds] = useState(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedFilter, setSelectedFilter] = useState(null);
    const [isInitialized, setIsInitialized] = useState(false);
    const [selectedTags, setSelectedTags] = useState([]);
    const [sortBy, setSortBy] = useState('name');
    
    // Temporary state for pending changes (not applied until user clicks apply)
    const [tempSelectedTags, setTempSelectedTags] = useState([]);
    const [tempSortBy, setTempSortBy] = useState('name');
    
    // Search enhancements from SearchBar
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [selectedSearchResult, setSelectedSearchResult] = useState(0);
    const [predictiveText, setPredictiveText] = useState('');
    const [searchFocused, setSearchFocused] = useState(false);
    
    // Lazy loading state from Results
    const [numLoaded, setNumLoaded] = useState(10);
    const [scrollLoading, setScrollLoading] = useState(false);
    
    // Refs
    const popupRef = useRef(null);
    const searchInputRef = useRef(null);
    const shadowRef = useRef(null);
    const roomListRef = useRef(null);
    const searchResultRefs = useRef([]);

    // Available tags with their icons
    const availableTags = ["windows", "outlets", "printer", "small desks", "tables"];

    // Abbreviations system from SearchBar
    const abbreviations = {
        "Darrin Communications Center": "DCC",
        "Jonsson Engineering Center": "JEC", 
        "Jonsson-Rowland Science Center": "JROWL",
        "Low Center for Industrial Inn.": "LOW",
        "Pittsburgh Building": "PITTS",
        "Russell Sage Laboratory": "SAGE",
        "Voorhees Computing Center": "VCC",
        "Walker Laboratory": "WALK",
        "Winslow Building": "WINS",
        "Troy Building": "TROY",
    };

    const fullNames = {
        "DCC": "Darrin Communications Center",
        "JEC": "Jonsson Engineering Center",
        "JROWL": "Jonsson-Rowland Science Center", 
        "LOW": "Low Center for Industrial Inn.",
        "PITTS": "Pittsburgh Building",
        "SAGE": "Russell Sage Laboratory",
        "VCC": "Voorhees Computing Center",
        "WALK": "Walker Laboratory",
        "WINS": "Winslow Building",
        "TROY": "Troy Building",
    };

    // Helper functions from SearchBar
    const removeLastWord = str => str.split(' ').slice(0, -1).join(' ');
    
    const getFull = (abb) => {
        if(removeLastWord(abb) in fullNames){
            return fullNames[removeLastWord(abb)]+" "+abb.split(' ').pop();
        } else {
            return abb;
        }
    };

    const getAbbFull = (abb) => {
        if(abb.toUpperCase() in fullNames){
            return fullNames[abb.toUpperCase()];
        } else {
            return abb;
        }
    };

    // Debug attributeIcons import
    useEffect(() => {
        console.log('attributeIcons imported as:', attributeIcons);
        console.log('selectedAttributeIcons imported as:', selectedAttributeIcons);
        console.log('attributeIcons keys:', attributeIcons ? Object.keys(attributeIcons) : 'undefined');
    }, []);

    // Debounced search effect from SearchBar
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery);
        }, 300); // Faster than SearchBar for better UX

        return () => {
            clearTimeout(handler);
        };
    }, [searchQuery]);

    // Create room data with abbreviations
    const roomDataWithAbb = useMemo(() => {
        if (!roomData.length) return [];
        
        let newData = [...roomData];
        roomData.forEach(room => {
            const roomNameWithoutNumber = removeLastWord(room.name);
            if (roomNameWithoutNumber in abbreviations) {
                const roomNumber = room.name.split(' ').pop();
                const abbName = abbreviations[roomNameWithoutNumber] + " " + roomNumber;
                newData.push({
                    ...room,
                    name: abbName,
                    originalName: room.name,
                    isAbbreviation: true
                });
            }
        });
        return newData;
    }, [roomData]);

    // Fetch all rooms and their data (only once)
    // SWAP TO GET BATCH INSTEAD OF GETROOM
    const fetchRoomsData = async () => {
        try {
            setLoading(true);
            
            // Get all room names and IDs
            const roomIds = await getRooms();
            if (!roomIds) {
                addNotification({ 
                    title: "Error", 
                    message: "Failed to fetch rooms", 
                    type: "error" 
                });
                return;
            }

            // Get room names sorted
            const roomNames = Object.keys(roomIds).sort();
            setRooms(roomNames);

            // Fetch detailed data for each room
            const roomPromises = roomNames.map(async (roomName) => {
                const roomId = roomIds[roomName];
                const roomDetail = await getRoom(roomId);
                return {
                    name: roomName,
                    id: roomId,
                    data: roomDetail?.data || {},
                    roomInfo: roomDetail?.room || {}
                };
            });

            const roomsWithData = await Promise.all(roomPromises);
            console.log('Sample room data:', roomsWithData[0]); // Debug room data structure
            setRoomData(roomsWithData);
            setLoading(false);
        } catch (error) {
            console.error('Error fetching rooms data:', error);
            addNotification({ 
                title: "Error", 
                message: "Failed to fetch room data", 
                type: "error" 
            });
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRoomsData();
    }, []);

    // Enhanced search functionality based on SearchBar component
    useEffect(() => {
        if (!debouncedSearchQuery.trim()) {
            setSearchResults([]);
            setPredictiveText('');
            setSelectedSearchResult(0);
            return;
        }
        
        const query = debouncedSearchQuery.toLowerCase().trim();
        
        // First get exact matches (startsWith)
        const exactMatches = roomDataWithAbb.filter(room => 
            room.name.toLowerCase().startsWith(query)
        );
        
        // Then get partial matches (contains but doesn't start with)
        const partialMatches = roomDataWithAbb.filter(room => {
            const name = room.name.toLowerCase();
            return name.includes(query) && !name.startsWith(query);
        });
        
        // Also search in attributes
        const attributeMatches = roomDataWithAbb.filter(room => {
            if (!room.roomInfo.attributes) return false;
            const nameMatch = room.name.toLowerCase().includes(query);
            if (nameMatch) return false; // Already included above
            
            return room.roomInfo.attributes.some(attr => 
                attr.toLowerCase().includes(query)
            );
        });
        
        // Combine and limit results
        const allMatches = [...exactMatches, ...partialMatches, ...attributeMatches];
        const uniqueMatches = allMatches.filter((room, index, self) => 
            index === self.findIndex(r => r.id === room.id)
        );
        
        let limitedResults = uniqueMatches.slice(0, 15);
        
        // Add "no results found" if no matches
        if (limitedResults.length === 0) {
            limitedResults = [{ name: "no results found", id: "no-results" }];
        }
        
        setSearchResults(limitedResults);
        setSelectedSearchResult(0);
        
        // Set predictive text only for actual results
        if (limitedResults.length > 0 && limitedResults[0].name !== "no results found" && 
            limitedResults[0].name.toLowerCase().startsWith(query)) {
            setPredictiveText(limitedResults[0].name.toLowerCase());
        } else {
            setPredictiveText('');
        }
    }, [debouncedSearchQuery, roomDataWithAbb]);

    // Scroll the selected search result into view
    useEffect(() => {
        const selectedItemRef = searchResultRefs.current[selectedSearchResult];
        if (selectedItemRef) {
            selectedItemRef.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
            });
        }
    }, [selectedSearchResult]);

    // Click outside detection to close popup and reset temporary state
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (popupRef.current && !popupRef.current.contains(event.target)) {
                // Reset temporary state to current applied state
                setTempSelectedTags(selectedTags);
                setTempSortBy(sortBy);
                setSelectedFilter(null);
            }
        };

        if (selectedFilter) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [selectedFilter, selectedTags, sortBy]);

    // Initialize selected rooms from formData ONLY ONCE when component mounts
    useEffect(() => {
        if (!isInitialized && formData.selectedRoomIds && formData.selectedRoomIds.length > 0) {
            setSelectedRoomIds(new Set(formData.selectedRoomIds));
            setIsInitialized(true);
            console.log('Where component initialized with existing selection');
            onComplete(true);
        } else if (!isInitialized) {
            setIsInitialized(true);
            onComplete(false);
        }
    }, [formData.selectedRoomIds, isInitialized, onComplete]);

    // Get selected room objects from canonical roomData - maintain selection order
    const selectedRooms = useMemo(() => {
        if (roomData.length === 0 || selectedRoomIds.size === 0) {
            return [];
        }
        // Create a map for quick room lookup
        const roomMap = new Map(roomData.map(room => [room.id, room]));
        // Return rooms in the order they were selected (order of selectedRoomIds)
        return Array.from(selectedRoomIds)
            .map(id => roomMap.get(id))
            .filter(Boolean); // Filter out any undefined rooms
    }, [roomData, selectedRoomIds]);

    // Refs to avoid dependency issues
    const setFormDataRef = useRef(setFormData);
    const onCompleteRef = useRef(onComplete);
    
    // Keep refs up to date
    useEffect(() => {
        setFormDataRef.current = setFormData;
        onCompleteRef.current = onComplete;
    }, [setFormData, onComplete]);
    
    // Track previous values to prevent unnecessary updates
    const prevSelectionRef = useRef(null);

    // Update form data when selection changes - but ONLY after initialization
    useEffect(() => {
        if (!isInitialized) return;

        const selectedRoomIdsArray = Array.from(selectedRoomIds);
        const hasSelectedRooms = selectedRoomIdsArray.length > 0;
        
        // Create a key to compare if selection actually changed
        const selectionKey = JSON.stringify({
            roomIds: selectedRoomIdsArray.sort(),
            roomDataLength: roomData.length
        });
        
        // Only update if selection actually changed
        if (prevSelectionRef.current === selectionKey) {
            return;
        }
        
        prevSelectionRef.current = selectionKey;
        
        // Get the first selected room for backward compatibility
        const firstSelectedRoom = hasSelectedRooms ? 
            roomData.find(room => room.id === selectedRoomIdsArray[0]) : null;

        // Update form data
        setFormDataRef.current(prev => ({
            ...prev,
            selectedRoomIds: selectedRoomIdsArray,
            location: firstSelectedRoom?.name || null,
            classroomId: firstSelectedRoom?.id || null
        }));

        onCompleteRef.current(hasSelectedRooms);
    }, [selectedRoomIds, roomData, isInitialized]);

    // Handle room selection/deselection
    const handleRoomToggle = useCallback((room) => {
        setSelectedRoomIds(prev => {
            const newSet = new Set(prev);
            // Use the original room ID, not the abbreviation
            const roomId = room.isAbbreviation ? 
                roomData.find(r => r.name === room.originalName)?.id : room.id;
            
            if (newSet.has(roomId)) {
                newSet.delete(roomId);
            } else {
                newSet.add(roomId);
            }
            return newSet;
        });
    }, [roomData]);

    // Remove room from selection
    const handleRemoveRoom = useCallback((roomId) => {
        setSelectedRoomIds(prev => {
            const newSet = new Set(prev);
            newSet.delete(roomId);
            return newSet;
        });
    }, []);

    // Handle filter selection
    const handleFilterSelect = (filter) => {
        if(selectedFilter === filter){
            setSelectedFilter(null);
        } else {
            // Initialize temporary state with current applied state when opening popup
            setTempSelectedTags(selectedTags);
            setTempSortBy(sortBy);
            setSelectedFilter(filter);
        }
    };

    // Handle temporary tag selection (not applied until user clicks apply)
    const handleTempTagSelect = (tag) => {
        setTempSelectedTags(prev => {
            if (prev.includes(tag)) {
                return prev.filter(t => t !== tag);
            } else {
                return [...prev, tag];
            }
        });
    };

    // Handle temporary sort selection (not applied until user clicks apply)
    const handleTempSortSelect = (sortType) => {
        setTempSortBy(sortType);
    };

    // Apply filters - commit temporary state to actual state
    const applyFilters = () => {
        setSelectedTags(tempSelectedTags);
        setSortBy(tempSortBy);
        setSelectedFilter(null);
        // Reset lazy loading when filters change
        setNumLoaded(10);
    };

    // Clear all filters
    const clearFilters = () => {
        setTempSelectedTags([]);
        setTempSortBy('name');
    };

    // Check if there are pending changes for apply button state
    const hasChanges = useMemo(() => {
        const tagsChanged = JSON.stringify(tempSelectedTags.sort()) !== JSON.stringify(selectedTags.sort());
        const sortChanged = tempSortBy !== sortBy;
        return tagsChanged || sortChanged;
    }, [tempSelectedTags, selectedTags, tempSortBy, sortBy]);

    // Filter rooms based on search query and selected tags - PRESERVE SELECTED ROOMS
    const filteredRooms = useMemo(() => {
        if (!roomData.length) return [];
        
        // If there's a search query, use search results as base, otherwise use all room data
        let filtered = debouncedSearchQuery.trim() ? 
            searchResults.map(result => result.isAbbreviation ? 
                roomData.find(r => r.name === result.originalName) || result : result
            ) : roomData;

        // Apply tag filters
        if (selectedTags.length > 0) {
            filtered = filtered.filter(room => 
                room.roomInfo.attributes && 
                selectedTags.some(tag => 
                    room.roomInfo.attributes.some(attr => 
                        attr.toLowerCase().includes(tag.toLowerCase())
                    )
                )
            );
        }

        // Apply sorting
        filtered.sort((a, b) => {
            switch (sortBy) {
                case 'name':
                    return a.name.localeCompare(b.name);
                case 'availability':
                    // For now, just sort by name since availability is fixed
                    return a.name.localeCompare(b.name);
                default:
                    return 0;
            }
        });

        return filtered;
    }, [roomData, debouncedSearchQuery, searchResults, selectedTags, sortBy]);

    // Lazy loaded rooms for display
    const loadedRooms = useMemo(() => {
        return filteredRooms.slice(0, numLoaded);
    }, [filteredRooms, numLoaded]);

    // Lazy loading scroll handler
    useEffect(() => {
        const container = roomListRef.current;
        if (!container) return;

        const handleScroll = () => {
            const scrollPosition = container.scrollTop + container.offsetHeight + 100;
            const containerHeight = container.scrollHeight;

            if (scrollPosition >= containerHeight && !scrollLoading && loadedRooms.length < filteredRooms.length) {
                setScrollLoading(true);
                setTimeout(() => {
                    setNumLoaded(prev => prev + 10);
                    setScrollLoading(false);
                }, 500);
            }
        };

        container.addEventListener('scroll', handleScroll);
        return () => {
            container.removeEventListener('scroll', handleScroll);
        };
    }, [loadedRooms.length, filteredRooms.length, scrollLoading]);

    // Reset lazy loading when search or filters change
    useEffect(() => {
        setNumLoaded(10);
    }, [debouncedSearchQuery, selectedTags, sortBy]);

    // Get recommended rooms (first 3, excluding already selected ones)
    const recommendedRooms = useMemo(() => {
        if (!roomData.length) return [];
        
        return roomData
            .filter(room => !selectedRoomIds.has(room.id))
            .slice(0, 3);
    }, [roomData, selectedRoomIds]);

    // Fixed availability status - always high availability
    const getAvailabilityStatus = useCallback(() => {
        return { status: 'high availability', color: 'green' };
    }, []);

    // Extract room number from room name if it ends with a number
    const getRoomNumber = useCallback((roomName) => {
        const match = roomName.match(/(\d+)$/);
        return match ? match[1] : null;
    }, []);

    // Get room name without number
    const getRoomNameWithoutNumber = useCallback((roomName) => {
        return roomName.replace(/\s+\d+$/, '');
    }, []);

    // Handle search input change
    const handleSearchInputChange = (event) => {
        setSearchQuery(event.target.value);
    };

    // Handle search input focus
    const handleSearchFocus = () => {
        setSearchFocused(true);
    };

    // Handle search input blur
    const handleSearchBlur = () => {
        setSearchFocused(false);
        // Clear predictive text when user stops interacting
        setPredictiveText('');
    };

    // Handle search keyboard navigation
    const handleSearchKeyDown = (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            
            // Check if the typed text exactly matches a room name
            const query = searchQuery.toLowerCase().trim();
            const exactMatch = roomDataWithAbb.find(room => 
                room.name.toLowerCase() === query
            );
            
            if (exactMatch) {
                // If exact match found, add that room
                const actualRoom = exactMatch.isAbbreviation ? 
                    roomData.find(r => r.name === exactMatch.originalName) : exactMatch;
                if (actualRoom) {
                    handleRoomToggle(actualRoom);
                }
            }
            
            // Always close autocomplete dropdown and clear predictions
            setSearchFocused(false);
            setPredictiveText('');
            searchInputRef.current.blur();
            return;
        }

        if (searchResults.length === 0) {
            return;
        }

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setSelectedSearchResult(prev => 
                prev === searchResults.length - 1 ? 0 : prev + 1
            );
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            setSelectedSearchResult(prev => 
                prev === 0 ? searchResults.length - 1 : prev - 1
            );
        }

        if (event.key === 'Tab') {
            if (searchResults.length > 0 && searchResults[0].name !== "no results found") {
                event.preventDefault();
                const selectedRoom = searchResults[selectedSearchResult];
                const roomName = selectedRoom.isAbbreviation ? selectedRoom.originalName : selectedRoom.name;
                setSearchQuery(roomName.toLowerCase());
                setPredictiveText('');
            }
        }

        if (event.key === 'Escape') {
            setSearchQuery('');
            setSearchFocused(false);
            searchInputRef.current.blur();
        }
    };

    // Handle search result click
    const handleSearchResultClick = (event, room) => {
        event.preventDefault();
        const actualRoom = room.isAbbreviation ? 
            roomData.find(r => r.name === room.originalName) : room;
        if (actualRoom) {
            handleRoomToggle(actualRoom);
        }
        // Don't clear search - keep it active for more selections
        setSearchFocused(false);
    };

    // Calculate tab shadow position
    const tabShadow = (word) => {
        if (word === "") {
            return 0;
        } else {
            const input = shadowRef.current;
            if (input) {
                return input.scrollWidth;
            }
        }
    };

    // Sync scroll between input and shadow
    useEffect(() => {
        const inputElement = searchInputRef.current;
        const shadowElement = shadowRef.current;

        const syncScroll = () => {
            if (shadowElement && inputElement) {
                shadowElement.scrollLeft = inputElement.scrollLeft;
            }
        };

        if (inputElement) {
            inputElement.addEventListener('scroll', syncScroll);
            return () => {
                inputElement.removeEventListener('scroll', syncScroll);
            };
        }
    }, []);

    if (loading) {
        return (
            <div className="where create-component">
                <div className="loading">
                    <p>Loading rooms...</p>
                </div>
            </div>
        );
    }

    return(
        <div className="where create-component">
            
            {/* Selected Section (shows when rooms are selected) */}
            {selectedRooms.length > 0 && (
                <div className="selected-section">
                    <div className={`selected-grid ${selectedRooms.length > 3 ? 'scrollable' : ''}`}>
                        {selectedRooms.map((room) => {
                            const availability = getAvailabilityStatus();
                            const roomNumber = getRoomNumber(room.name);
                            const roomNameWithoutNumber = getRoomNameWithoutNumber(room.name);
                            
                            console.log('Selected room attributes check:', {
                                roomName: room.name,
                                attributes: room.roomInfo.attributes,
                                attributesType: typeof room.roomInfo.attributes,
                                attributesLength: room.roomInfo.attributes?.length
                            });
                            
                            return (
                                <div 
                                    key={`selected-${room.id}`}
                                    className="room-card selected"
                                >
                                    <div className="room-image">
                                        {room.roomInfo.image ? (
                                            <img src={room.roomInfo.image} alt={room.name} />
                                        ) : (
                                            <div className="no-image">No Image</div>
                                        )}
                                        <button 
                                            className="remove-btn"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleRemoveRoom(room.id);
                                            }}
                                        >
                                            <Icon icon="material-symbols:close" />
                                        </button>
                                    </div>
                                    <div className="room-info">
                                        <div className="room-title">
                                            <h3>{roomNameWithoutNumber}</h3>
                                            {roomNumber && <span className="room-number">{roomNumber}</span>}
                                        </div>
                                        <div className="rating-availability">
                                            <div className="rating">
                                                <img src={FilledStar} alt="star" />
                                                <span>{room.roomInfo.average_rating ? room.roomInfo.average_rating.toFixed(1) : '4.7'}</span>
                                            </div>
                                            <div className="availability">
                                                <div className={`availability-dot ${availability.color}`}></div>
                                                <span>{availability.status}</span>
                                            </div>
                                        </div>
                                        {/* ALWAYS show room attributes - SIMPLIFIED AND DEFENSIVE */}
                                        {room.roomInfo.attributes && Array.isArray(room.roomInfo.attributes) && room.roomInfo.attributes.length > 0 ? (
                                            <div className="attributes">
                                                {room.roomInfo.attributes.slice(0, 4).map((attr, index) => {
                                                    
                                                    // Safely check for icons - don't let icon failures prevent attribute display
                                                    let iconSrc = null;
                                                    try {
                                                        if (attributeIcons && typeof attributeIcons === 'object') {
                                                            const attrLower = attr.toLowerCase().trim();
                                                            const iconKey = Object.keys(attributeIcons).find(key => 
                                                                attrLower.includes(key.toLowerCase()) || 
                                                                key.toLowerCase().includes(attrLower)
                                                            );
                                                            if (iconKey && attributeIcons[iconKey]) {
                                                                iconSrc = attributeIcons[iconKey];
                                                            }
                                                        }
                                                    } catch (e) {
                                                        console.error('Error processing icon for attribute:', attr, e);
                                                    }
                                                    
                                                    return (
                                                        <span key={`selected-attr-${index}`} className="attribute">
                                                            {iconSrc && (
                                                                <img 
                                                                    src={iconSrc} 
                                                                    alt={attr}
                                                                    className="attribute-icon"
                                                                    onError={(e) => {
                                                                        console.error(`Failed to load icon for ${attr}`);
                                                                        e.target.style.display = 'none';
                                                                    }}
                                                                />
                                                            )}
                                                            {attr}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="attributes">
                                                <span className="attribute">No attributes available</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <h2 style={{marginTop: '10px',
                        marginBottom: '0px',
                    }}>selected ({selectedRooms.length})</h2>
                </div>
            )}

            {/* Recommended Section (shows when no rooms are selected) */}
            {selectedRooms.length === 0 && (
                <div className="selected-section">
                    <div className="selected-grid">
                        {recommendedRooms.map((room) => {
                            const availability = getAvailabilityStatus();
                            const roomNumber = getRoomNumber(room.name);
                            const roomNameWithoutNumber = getRoomNameWithoutNumber(room.name);
                            
                            
                            return (
                                <div 
                                    key={`recommended-${room.id}`}
                                    className="room-card selected"
                                    style={{
                                        border: '1px solid var(--lightborder)',
                                        boxShadow: 'none'
                                    }}
                                    onClick={() => handleRoomToggle(room)}
                                >
                                    <div className="room-image">
                                        {room.roomInfo.image ? (
                                            <img src={room.roomInfo.image} alt={room.name} />
                                        ) : (
                                            <div className="no-image">No Image</div>
                                        )}
                                    </div>
                                    <div className="room-info">
                                        <div className="room-title">
                                            <h3>{roomNameWithoutNumber}</h3>
                                            {roomNumber && <span className="room-number">{roomNumber}</span>}
                                        </div>
                                        <div className="rating-availability">
                                            <div className="rating">
                                                <img src={FilledStar} alt="star" />
                                                <span>{room.roomInfo.average_rating ? room.roomInfo.average_rating.toFixed(1) : '4.7'}</span>
                                            </div>
                                            <div className="availability">
                                                <div className={`availability-dot ${availability.color}`}></div>
                                                <span>{availability.status}</span>
                                            </div>
                                        </div>
                                        {/* ALWAYS show room attributes - SIMPLIFIED AND DEFENSIVE */}
                                        {room.roomInfo.attributes && Array.isArray(room.roomInfo.attributes) && room.roomInfo.attributes.length > 0 ? (
                                            <div className="attributes">
                                                {room.roomInfo.attributes.slice(0, 4).map((attr, index) => {
                                                    
                                                    // Safely check for icons - don't let icon failures prevent attribute display
                                                    let iconSrc = null;
                                                    try {
                                                        if (attributeIcons && typeof attributeIcons === 'object') {
                                                            const attrLower = attr.toLowerCase().trim();
                                                            const iconKey = Object.keys(attributeIcons).find(key => 
                                                                attrLower.includes(key.toLowerCase()) || 
                                                                key.toLowerCase().includes(attrLower)
                                                            );
                                                            if (iconKey && attributeIcons[iconKey]) {
                                                                iconSrc = attributeIcons[iconKey];
                                                            }
                                                        }
                                                    } catch (e) {
                                                        console.error('Error processing icon for attribute:', attr, e);
                                                    }
                                                    
                                                    return (
                                                        <span key={`selected-attr-${index}`} className="attribute">
                                                            {iconSrc && (
                                                                <img 
                                                                    src={iconSrc} 
                                                                    alt={attr}
                                                                    className="attribute-icon"
                                                                    onError={(e) => {
                                                                        console.error(`Failed to load icon for ${attr}`);
                                                                        e.target.style.display = 'none';
                                                                    }}
                                                                />
                                                            )}
                                                            {attr}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="attributes">
                                                <span className="attribute">No attributes available</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                        <h2 style={{marginTop: '10px',
                        marginBottom: '0px',
                    }}>recommended</h2>
                </div>
            )}

                        {/* Search and Filter Bar */}
            <div className="search-filter-section">
                <div className="search-container">
                    <input
                        className="search-bar"
                        type="text"
                        value={searchQuery}
                        onChange={handleSearchInputChange}
                        placeholder={!searchFocused ? "search rooms..." : ""}
                        onFocus={handleSearchFocus}
                        onBlur={handleSearchBlur}
                        onKeyDown={handleSearchKeyDown}
                        spellCheck="false"  
                        ref={searchInputRef}
                    />
                    <div className={`shadow ${predictiveText === "" ? "white" : ""}`}
                        readOnly={true}
                        ref={shadowRef} 
                    >
                        {predictiveText === "" ? "." : predictiveText}
                        <img src={tab} alt="tab" className={`tab ${predictiveText === "" ? "disappear" : ""}`} style={{right:`${tabShadow(predictiveText)}px`}}/>
                    </div>
                    <div className="x-container">
                        <img src={x} className="x" alt="x" onClick={() => {
                            setSearchQuery('');
                            setSearchFocused(false);
                            setPredictiveText('');
                            setSearchResults([]);
                        }} />
                    </div>
                    {searchFocused && searchResults.length > 0 && debouncedSearchQuery.trim() && (
                        <ul className="suggestions-list">
                            <div className="spacer"></div>
                            {searchResults.map((item, index) => {
                                const actualRoom = item.isAbbreviation ? 
                                    roomData.find(r => r.name === item.originalName) || item : item;
                                const matchIndex = actualRoom.name.toLowerCase().indexOf(debouncedSearchQuery.toLowerCase());
                                const beforeMatch = actualRoom.name.slice(0, matchIndex);
                                const matchText = actualRoom.name.slice(matchIndex, matchIndex + debouncedSearchQuery.length);
                                const afterMatch = actualRoom.name.slice(matchIndex + debouncedSearchQuery.length);
                                
                                if (item.name === "no results found") {
                                    return (
                                        <li key={index} className="no-results">
                                            <span className="non-match">{item.name}</span>
                                        </li>
                                    );
                                }
                                return (
                                    <li 
                                        ref={(el) => (searchResultRefs.current[index] = el)}
                                        key={index} 
                                        value={index} 
                                        className={`search-suggestion ${index === selectedSearchResult ? "chosen" : ""}`} 
                                        onClick={(e) => handleSearchResultClick(e, actualRoom)}
                                    >
                                        <span className="result non-match">{beforeMatch}</span>
                                        <span className="result match">{matchText}</span>
                                        <span className="result non-match">{afterMatch}</span>
                                    </li>
                                );
                            })}                 
                        </ul>
                    )}
                </div>
                
                {/* Sort Row - using Sort component styling */}
                <div className="sort-row">
                    {selectedFilter === "tags" && (
                        <div className="sort-popup" ref={popupRef}>
                            <div className="heading">
                                <h1>Tags</h1>
                                <p onClick={clearFilters} className="clear">clear</p>
                            </div>
                            <div className="tags-container">
                                <div className="tags-content">
                                    <div className="include">
                                        {availableTags.map((tag, index) => (
                                            <div 
                                                key={index} 
                                                className={`option ${tempSelectedTags.includes(tag) ? "selected" : ""}`} 
                                                onClick={() => handleTempTagSelect(tag)}
                                            >
                                                {attributeIcons && Object.keys(attributeIcons).includes(tag) && (
                                                    <img 
                                                        src={tempSelectedTags.includes(tag) ? selectedAttributeIcons?.[tag] : attributeIcons[tag]} 
                                                        alt={tag}
                                                    />
                                                )}
                                                <p>{tag}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <button 
                                className={`button ${hasChanges ? 'active' : ''}`} 
                                onClick={applyFilters}
                                disabled={!hasChanges}
                            >
                                apply
                            </button>
                        </div>
                    )}
                    
                    {selectedFilter === "sort" && (
                        <div className="sort-popup" ref={popupRef}>
                            <div className="heading">
                                <h1>Sort by</h1>
                            </div>
                            <div className="sort-options">
                                <div 
                                    className={tempSortBy === "name" ? "option selected" : "option"} 
                                    onClick={() => handleTempSortSelect("name")}
                                >
                                    <Icon icon="material-symbols:sort-by-alpha" />
                                    <p>Name</p>
                                </div>
                                <div 
                                    className={tempSortBy === "availability" ? "option selected" : "option"} 
                                    onClick={() => handleTempSortSelect("availability")}
                                >
                                    <Icon icon="material-symbols:schedule" />
                                    <p>Availability</p>
                                </div>
                            </div>
                            <button 
                                className={`button ${hasChanges ? 'active' : ''}`} 
                                onClick={applyFilters}
                                disabled={!hasChanges}
                            >
                                apply
                            </button>
                        </div>
                    )}
                    
                    <div 
                        className={`tags ${selectedFilter === 'tags' ? "selected": ""} ${selectedTags.length > 0 ? "has-filters" : ""}`} 
                        onClick={() => handleFilterSelect('tags')}
                    >
                        <img src={selectedFilter === 'tags' ? TagsSelected : Tags} alt="" />
                        <p>Tags {selectedTags.length > 0 && `(${selectedTags.length})`}</p>
                        <img src={selectedFilter === 'tags' ? ChevronUp : ChevronDown} alt="" />
                    </div>
                    <div 
                        className={`sort-by ${selectedFilter === 'sort' ? "selected" : ""} ${sortBy !== 'name' ? "has-filters" : ""}`} 
                        onClick={() => handleFilterSelect('sort')}
                    >
                        <img src={selectedFilter === 'sort' ? SortBySelected : SortBy} alt="" />
                        <p>Sort {sortBy !== 'name' && `(${sortBy})`}</p>
                        <img src={selectedFilter === 'sort' ? ChevronUp : ChevronDown} alt="" />
                    </div>
                </div>
            </div>

            {/* Room List Section */}
            <div className="room-list-section" ref={roomListRef}>
                {loadedRooms.length === 0 && debouncedSearchQuery.trim() && (
                    <div className="no-results">
                        <p>No rooms found matching "{debouncedSearchQuery}"</p>
                        <p className="suggestion">Try adjusting your search terms or clearing filters</p>
                    </div>
                )}
                                 {loadedRooms.map((room, index) => {
                     const availability = getAvailabilityStatus();
                     const isSelected = selectedRoomIds.has(room.id);
                     const roomNumber = getRoomNumber(room.name);
                     const roomNameWithoutNumber = getRoomNameWithoutNumber(room.name);

                     
                     return (
                         <div 
                             key={`list-${room.id}`}
                             className={`room-list-item ${isSelected ? 'selected' : ''}`}
                             onClick={() => handleRoomToggle(room)}
                         >
                                                         <div className="room-thumbnail">
                                 {room.roomInfo.image ? (
                                     <img src={room.roomInfo.image} alt={room.name} />
                                 ) : (
                                     <div className="no-image">No Image</div>
                                 )}
                             </div>
                             <div className="room-details">
                                 <div className="room-title">
                                     <h3>{roomNameWithoutNumber}</h3>
                                     {roomNumber && <span className="room-number">{roomNumber}</span>}
                                 </div>
                                 <div className="rating-availability">
                                     <div className="rating">
                                         <img src={FilledStar} alt="star" />
                                         <span>{room.roomInfo.average_rating ? room.roomInfo.average_rating.toFixed(1) : '4.7'}</span>
                                     </div>
                                     <div className="availability">
                                         <div className={`availability-dot ${availability.color}`}></div>
                                         <span>{availability.status}</span>
                                     </div>
                                 </div>
                                 {/* ALWAYS show room attributes - SIMPLIFIED AND DEFENSIVE */}
                                 {room.roomInfo.attributes && Array.isArray(room.roomInfo.attributes) && room.roomInfo.attributes.length > 0 ? (
                                     <div className="attributes">
                                         {room.roomInfo.attributes.map((attr, index) => {
                                            
                                            // Safely check for icons - don't let icon failures prevent attribute display
                                            let iconSrc = null;
                                            try {
                                                if (attributeIcons && typeof attributeIcons === 'object') {
                                                    const attrLower = attr.toLowerCase().trim();
                                                    const iconKey = Object.keys(attributeIcons).find(key => 
                                                        attrLower.includes(key.toLowerCase()) || 
                                                        key.toLowerCase().includes(attrLower)
                                                    );
                                                    if (iconKey && attributeIcons[iconKey]) {
                                                        iconSrc = attributeIcons[iconKey];
                                                    }
                                                }
                                            } catch (e) {
                                                console.error('Error processing icon for attribute:', attr, e);
                                            }
                                            
                                            return (
                                                <span key={`list-attr-${index}`} className="attribute">
                                                    {iconSrc && (
                                                        <img 
                                                            src={iconSrc} 
                                                            alt={attr}
                                                            className="attribute-icon"
                                                            onError={(e) => {
                                                                console.error(`Failed to load icon for ${attr}`);
                                                                e.target.style.display = 'none';
                                                            }}
                                                        />
                                                    )}
                                                    {attr}
                                                </span>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="attributes">
                                        <span className="attribute">No attributes available</span>
                                    </div>
                                )}
                            </div>
                            <div className="room-actions">
                                <div className={`add-btn ${isSelected ? 'selected' : ''}`}>
                                    {isSelected ? 'remove' : 'add'}
                                </div>
                                                         </div>
                         </div>
                     );
                 })}
                 
                 {/* Loader for lazy loading */}
                 {scrollLoading && (
                     <div className="loader-container">
                         <Loader />
                     </div>
                 )}
                 
                 {/* Show loader if there are more items to load */}
                 {!scrollLoading && loadedRooms.length < filteredRooms.length && (
                     <div className="loader-container">
                         <Loader />
                     </div>
                 )}
             </div>
         </div>
     );
}

export default Where;