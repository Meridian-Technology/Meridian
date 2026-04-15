import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Icon } from '@iconify-icon/react';
import apiRequest from '../../../../utils/postRequest';
import Popup from '../../../../components/Popup/Popup';
import WeeklyCalendar from '../../../../pages/OIEDash/EventsCalendar/Week/WeeklyCalendar/WeeklyCalendar';
import { classroomBuildingLabel } from '../../../../utils/classroomBuildingLabel';
import './LocationAutocomplete.scss';

// Abbreviation support (matches SearchBar) – full names ↔ building abbreviations
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
const removeLastWord = (str) => str.split(' ').slice(0, -1).join(' ');
/** Convert "DCC 308" → "Darrin Communications Center 308" */
function getFull(abb) {
    if (removeLastWord(abb) in fullNames) {
        return fullNames[removeLastWord(abb)] + " " + abb.split(' ').pop();
    }
    return abb;
}
/** Convert "DCC" → "Darrin Communications Center" */
function getAbbFull(abb) {
    if (abb && abb.toUpperCase() in fullNames) {
        return fullNames[abb.toUpperCase()];
    }
    return abb;
}
/** Normalize typed location to full name when it's an abbreviation. */
function normalizeLocation(value) {
    if (!value || !value.trim()) return value;
    const trimmed = value.trim();
    const asFull = getAbbFull(trimmed);
    if (asFull !== trimmed) return asFull;
    return getFull(trimmed);
}

function LocationAutocomplete({ formData, setFormData, preflightError = '' }) {
    const [inputValue, setInputValue] = useState(formData.location || '');
    const [suggestions, setSuggestions] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const debounceRef = useRef(null);
    const containerRef = useRef(null);
    const inputRef = useRef(null);
    const [showSchedulePopup, setShowSchedulePopup] = useState(false);
    const [roomWeeklySchedule, setRoomWeeklySchedule] = useState(null);
    const [scheduleEvents, setScheduleEvents] = useState([]);
    const [scheduleLoading, setScheduleLoading] = useState(false);
    const [startOfWeek, setStartOfWeek] = useState(() => {
        const now = new Date();
        const s = new Date(now);
        s.setDate(now.getDate() - now.getDay());
        s.setHours(0, 0, 0, 0);
        return s;
    });

    const getStartOfWeek = useCallback((dateLike) => {
        const d = new Date(dateLike);
        if (Number.isNaN(d.getTime())) return null;
        d.setDate(d.getDate() - d.getDay());
        d.setHours(0, 0, 0, 0);
        return d;
    }, []);
    const validationMessage = preflightError || formData.resourcePreflightError || '';

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
        const trimmed = query.trim();
        const queriesToTry = [trimmed];
        const firstWord = trimmed.split(' ')[0];
        if (firstWord && firstWord.toUpperCase() in fullNames) {
            const expanded = fullNames[firstWord.toUpperCase()] + (trimmed.includes(' ') ? ' ' + trimmed.split(' ').slice(1).join(' ') : '');
            if (!queriesToTry.includes(expanded)) queriesToTry.push(expanded);
        }
        if (trimmed.toUpperCase() in fullNames && !queriesToTry.includes(fullNames[trimmed.toUpperCase()])) {
            queriesToTry.push(fullNames[trimmed.toUpperCase()]);
        }
        setIsLoading(true);
        try {
            const seenIds = new Set();
            const mergedRooms = [];
            for (const q of queriesToTry) {
                const response = await apiRequest('/search-rooms', null, {
                    method: 'GET',
                    params: { query: q, limit: 10, page: 1 }
                });
                if (response.success && response.rooms) {
                    for (const room of response.rooms) {
                        if (room._id && !seenIds.has(room._id)) {
                            seenIds.add(room._id);
                            mergedRooms.push({
                                id: room._id,
                                name: room.name || 'Unknown Room',
                                building: classroomBuildingLabel(room),
                                capacity: room.capacity || 0
                            });
                        }
                    }
                }
            }
            setSuggestions(mergedRooms);
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
        const displayName = room.name;
        setInputValue(displayName);
        setFormData(prev => ({
            ...prev,
            location: displayName,
            classroom_id: room.id,
            selectedRoomIds: [room.id]
        }));
        setSuggestions([]);
        setShowDropdown(false);
        setHighlightedIndex(-1);
        inputRef.current?.blur();
    };

    const handleBlur = () => {
        const normalized = normalizeLocation(inputValue);
        if (normalized !== inputValue) {
            setInputValue(normalized);
            setFormData(prev => ({ ...prev, location: normalized }));
        }
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

    const buildScheduleEvents = useCallback((weeklySchedule) => {
        const dayMap = { M: 1, T: 2, W: 3, R: 4, F: 5 };
        const out = [];
        if (!weeklySchedule) return out;
        const base = new Date(startOfWeek);
        for (const [dayKey, dayOffset] of Object.entries(dayMap)) {
            const slots = weeklySchedule[dayKey] || [];
            slots.forEach((slot, idx) => {
                const slotDate = new Date(base);
                slotDate.setDate(base.getDate() + dayOffset);
                const start = new Date(slotDate);
                start.setHours(Math.floor(slot.start_time / 60), slot.start_time % 60, 0, 0);
                const end = new Date(slotDate);
                end.setHours(Math.floor(slot.end_time / 60), slot.end_time % 60, 0, 0);
                out.push({
                    id: `room-slot-${dayKey}-${idx}`,
                    name: slot.class_name || 'Unavailable',
                    type: 'blocked',
                    start_time: start,
                    end_time: end,
                    status: 'blocked'
                });
            });
        }
        return out;
    }, [startOfWeek]);

    useEffect(() => {
        if (!showSchedulePopup) return;
        if (!formData.start_time) return;
        const weekStart = getStartOfWeek(formData.start_time);
        if (weekStart) setStartOfWeek(weekStart);
    }, [showSchedulePopup, formData.start_time, getStartOfWeek]);

    useEffect(() => {
        const blockedEvents = buildScheduleEvents(roomWeeklySchedule);
        let prospectiveEvents = [];
        if (formData.start_time && formData.end_time) {
            prospectiveEvents = [{
                id: 'prospective-event',
                name: formData.name || 'Prospective Event',
                type: 'prospective',
                location: formData.location || '',
                start_time: new Date(formData.start_time),
                end_time: new Date(formData.end_time),
                status: 'prospective'
            }];
        }
        setScheduleEvents([...blockedEvents, ...prospectiveEvents]);
    }, [roomWeeklySchedule, buildScheduleEvents, formData.start_time, formData.end_time, formData.name, formData.location]);

    useEffect(() => {
        if (!showSchedulePopup || !formData.classroom_id) return;
        let cancelled = false;
        const loadSchedule = async () => {
            setScheduleLoading(true);
            try {
                const batch = await apiRequest('/getbatch-new', {
                    queries: [formData.classroom_id],
                    exhaustive: true
                });
                if (cancelled) return;
                setRoomWeeklySchedule(batch?.data?.[0]?.data?.weekly_schedule || null);
            } finally {
                if (!cancelled) setScheduleLoading(false);
            }
        };
        loadSchedule();
        return () => {
            cancelled = true;
        };
    }, [showSchedulePopup, formData.classroom_id]);

    return (
        <div className="location-autocomplete" ref={containerRef}>
            <div className="location-autocomplete-input-wrapper">
                <Icon icon="mdi:map-marker" className="location-icon" />
                <input
                    ref={inputRef}
                    type="text"
                    className="location-autocomplete-input"
                    placeholder="Enter a location"
                    value={inputValue}
                    onChange={handleInputChange}
                    onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
                    onBlur={handleBlur}
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
            {validationMessage && formData.classroom_id && (
                <div className="location-autocomplete-validation" role="alert">
                    <strong>Validation error:</strong> {validationMessage}
                    <button
                        type="button"
                        className="location-autocomplete-validation__link"
                        onClick={() => setShowSchedulePopup(true)}
                    >
                        View room schedule
                    </button>
                </div>
            )}
            <Popup
                isOpen={showSchedulePopup}
                onClose={() => setShowSchedulePopup(false)}
                customClassName="location-autocomplete-schedule-popup"
            >
                <h3>Room schedule</h3>
                <div className="location-autocomplete-schedule-nav">
                    <button type="button" onClick={() => {
                        const d = new Date(startOfWeek);
                        d.setDate(d.getDate() - 7);
                        setStartOfWeek(d);
                    }}>Previous week</button>
                    <span>
                        {startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {
                            new Date(startOfWeek.getTime() + 6 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        }
                    </span>
                    <button type="button" onClick={() => {
                        const d = new Date(startOfWeek);
                        d.setDate(d.getDate() + 7);
                        setStartOfWeek(d);
                    }}>Next week</button>
                </div>
                {(formData.start_time && formData.end_time) && (
                    <div className="location-autocomplete-scheduled-period">
                        Scheduled period: {new Date(formData.start_time).toLocaleString()} - {new Date(formData.end_time).toLocaleString()}
                    </div>
                )}
                <div className="location-autocomplete-schedule-calendar">
                    {scheduleLoading ? (
                        <p>Loading schedule...</p>
                    ) : (
                        <WeeklyCalendar
                            startOfWeek={startOfWeek}
                            events={scheduleEvents}
                            height="66vh"
                            dayClick={() => {}}
                            autoEnableSelection={false}
                            selectionMode="single"
                            singleSelectionOnly={true}
                            allowCrossDaySelection={false}
                            showAvailability={true}
                            startHour={6}
                            endHour={24}
                            timeIncrement={15}
                        />
                    )}
                </div>
            </Popup>
        </div>
    );
}

export default LocationAutocomplete;
