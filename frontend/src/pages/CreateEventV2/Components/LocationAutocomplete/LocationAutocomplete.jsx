import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Icon } from '@iconify-icon/react';
import apiRequest from '../../../../utils/postRequest';
import './LocationAutocomplete.scss';

function LocationAutocomplete({ formData, setFormData }) {
    const [inputValue, setInputValue] = useState(formData.location || '');
    const [suggestions, setSuggestions] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const debounceRef = useRef(null);
    const containerRef = useRef(null);
    const inputRef = useRef(null);

    // Sync input with formData.location when it changes externally
    useEffect(() => {
        setInputValue(formData.location || '');
    }, [formData.location]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const fetchSuggestions = useCallback(async (query) => {
        if (!query || query.trim().length === 0) {
            setSuggestions([]);
            return;
        }
        setIsLoading(true);
        try {
            const response = await apiRequest('/search-rooms', null, {
                method: 'GET',
                params: { query: query.trim(), limit: 10, page: 1 }
            });
            if (response.success && response.rooms) {
                setSuggestions(response.rooms.map(room => ({
                    id: room._id,
                    name: room.name || 'Unknown Room',
                    building: room.building || '',
                    capacity: room.capacity || 0
                })));
            } else {
                setSuggestions([]);
            }
        } catch (err) {
            setSuggestions([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const handleInputChange = (e) => {
        const value = e.target.value;
        setInputValue(value);
        setFormData(prev => ({
            ...prev,
            location: value,
            selectedRoomIds: [],
            classroom_id: null
        }));

        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (value.trim()) {
            debounceRef.current = setTimeout(() => {
                fetchSuggestions(value);
                setShowDropdown(true);
                setHighlightedIndex(-1);
            }, 300);
        } else {
            setSuggestions([]);
            setShowDropdown(false);
        }
    };

    const handleSelectRoom = (room) => {
        setInputValue(room.name);
        setFormData(prev => ({
            ...prev,
            location: room.name,
            classroom_id: room.id,
            selectedRoomIds: [room.id]
        }));
        setSuggestions([]);
        setShowDropdown(false);
        setHighlightedIndex(-1);
        inputRef.current?.blur();
    };

    const handleKeyDown = (e) => {
        if (!showDropdown || suggestions.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIndex(i => (i < suggestions.length - 1 ? i + 1 : i));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIndex(i => (i > 0 ? i - 1 : -1));
        } else if (e.key === 'Enter' && highlightedIndex >= 0) {
            e.preventDefault();
            handleSelectRoom(suggestions[highlightedIndex]);
        } else if (e.key === 'Escape') {
            setShowDropdown(false);
            setHighlightedIndex(-1);
        }
    };

    return (
        <div className="location-autocomplete" ref={containerRef}>
            <div className="location-autocomplete-input-wrapper">
                <Icon icon="mdi:map-marker" className="location-icon" />
                <input
                    ref={inputRef}
                    type="text"
                    className="location-autocomplete-input"
                    placeholder="Offline location or virtual link"
                    value={inputValue}
                    onChange={handleInputChange}
                    onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
                    onKeyDown={handleKeyDown}
                    autoComplete="off"
                />
                {isLoading && (
                    <Icon icon="mdi:loading" className="location-loading" />
                )}
            </div>
            {showDropdown && suggestions.length > 0 && (
                <ul className="location-autocomplete-dropdown" role="listbox">
                    {suggestions.map((room, index) => (
                        <li
                            key={room.id}
                            role="option"
                            aria-selected={index === highlightedIndex}
                            className={`location-autocomplete-item ${index === highlightedIndex ? 'highlighted' : ''}`}
                            onClick={() => handleSelectRoom(room)}
                        >
                            <span className="room-name">{room.name}</span>
                            {room.building && (
                                <span className="room-meta"> · {room.building}</span>
                            )}
                            {room.capacity > 0 && (
                                <span className="room-capacity">{room.capacity}</span>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export default LocationAutocomplete;
