import React, { useState, useEffect, useRef, useCallback } from 'react';
import './When.scss'

import WeeklyCalendar from '../../../../pages/OIEDash/EventsCalendar/Week/WeeklyCalendar/WeeklyCalendar';
import DailyCalendar from '../../../../pages/OIEDash/EventsCalendar/Day/DailyCalendar/DailyCalendar';
import MonthDisplay from '../../../../pages/OIEDash/EventsCalendar/Month/MonthDisplay';
import Switch from '../../../../components/Switch/Switch';
import Filter from '../../../../components/Filter/Filter';
import { useNotification } from '../../../../NotificationContext';
import apiRequest from '../../../../utils/postRequest';

function When({ formData, setFormData, onComplete }){
    const {addNotification} = useNotification();
    const [combinedBlockedEvents, setCombinedBlockedEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isInitialized, setIsInitialized] = useState(false);
    
    // Calendar view state
    const [view, setView] = useState(1); // 0: month, 1: week, 2: day
    const [contentHeight, setContentHeight] = useState(500);
    const [startOfWeek, setStartOfWeek] = useState(new Date(new Date().setDate(new Date().getDate() - new Date().getDay())));
    const [selectedDay, setSelectedDay] = useState(new Date());
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const [year, setYear] = useState(new Date().getFullYear());
    const [filter, setFilter] = useState({type: "all"});
    const [showAvailability, setShowAvailability] = useState(true);
    
    // Time selection state - initialize from formData if available
    const [selectedTimeslots, setSelectedTimeslots] = useState(() => {
        if (formData.start_time && formData.end_time) {
            return [{
                id: 'initial-selection',
                startTime: new Date(formData.start_time),
                endTime: new Date(formData.end_time),
                startDay: new Date(formData.start_time),
                endDay: new Date(formData.end_time),
                duration: (new Date(formData.end_time) - new Date(formData.start_time)) / (1000 * 60)
            }];
        }
        return [];
    });
    
    const contentRef = useRef(null);
    
    // Use ref to prevent circular updates
    const isInternalUpdate = useRef(false);

    useEffect(() => {
        if(contentRef.current){
            setContentHeight(contentRef.current.clientHeight);
        }
    }, [contentRef.current]);

    // Helper function to merge overlapping time intervals
    const mergeIntervals = (intervals) => {
        if (intervals.length === 0) return [];
        
        // Sort intervals by start time
        intervals.sort((a, b) => a.start - b.start);
        
        const merged = [intervals[0]];
        
        for (let i = 1; i < intervals.length; i++) {
            const current = intervals[i];
            const lastMerged = merged[merged.length - 1];
            
            // If current interval overlaps with the last merged interval
            if (current.start <= lastMerged.end) {
                // Merge them by extending the end time
                lastMerged.end = Math.max(lastMerged.end, current.end);
            } else {
                // No overlap, add current interval to merged list
                merged.push(current);
            }
        }
        
        return merged;
    };

    // Function to combine all room schedules into blocked time periods
    const combineRoomSchedules = (roomsData) => {
        const dayMap = { 'M': 1, 'T': 2, 'W': 3, 'R': 4, 'F': 5 }; // Monday = 1, etc.
        const combinedSchedule = {};
        
        // Initialize days
        Object.keys(dayMap).forEach(day => {
            combinedSchedule[day] = [];
        });

        // Collect all time slots from all rooms
        roomsData.forEach(roomData => {
            const schedule = roomData.data?.weekly_schedule;
            if (schedule) {
                Object.keys(dayMap).forEach(day => {
                    if (schedule[day] && schedule[day].length > 0) {
                        schedule[day].forEach(slot => {
                            combinedSchedule[day].push({
                                start: slot.start_time, // Already in minutes from midnight
                                end: slot.end_time, // Already in minutes from midnight
                                class_name: slot.class_name
                            });
                        });
                    }
                });
            }
        });

        // Merge overlapping intervals for each day
        Object.keys(combinedSchedule).forEach(day => {
            combinedSchedule[day] = mergeIntervals(combinedSchedule[day]);
        });

        return combinedSchedule;
    };

    // Function to generate blocked events for the calendar
    const generateBlockedEvents = (combinedSchedule) => {
        const events = [];
        const today = new Date();
        const currentWeekStart = new Date(today.setDate(today.getDate() - today.getDay())); // Start of current week (Sunday)
        
        // Generate events for the next 4 weeks
        for (let week = 0; week < 4; week++) {
            Object.entries(combinedSchedule).forEach(([dayKey, slots]) => {
                const dayMap = { 'M': 1, 'T': 2, 'W': 3, 'R': 4, 'F': 5 };
                const dayOffset = dayMap[dayKey];
                
                slots.forEach((slot, index) => {
                    const eventDate = new Date(currentWeekStart);
                    eventDate.setDate(currentWeekStart.getDate() + (week * 7) + dayOffset);
                    
                    const startTime = new Date(eventDate);
                    const startHours = Math.floor(slot.start / 60);
                    const startMinutes = slot.start % 60;
                    startTime.setHours(startHours, startMinutes, 0, 0);
                    
                    const endTime = new Date(eventDate);
                    const endHours = Math.floor(slot.end / 60);
                    const endMinutes = slot.end % 60;
                    endTime.setHours(endHours, endMinutes, 0, 0);
                    
                    events.push({
                        id: `blocked-${week}-${dayKey}-${index}`,
                        name: 'Room Unavailable',
                        type: 'blocked',
                        location: 'Multiple Rooms',
                        start_time: startTime,
                        end_time: endTime,
                        status: 'blocked',
                        description: 'Combined unavailable time from selected rooms'
                    });
                });
            });
        }
        
        return events;
    };

    // Fetch and combine all selected rooms' schedules
    const fetchAndCombineSchedules = async () => {
        try {
            setLoading(true);
            
            // If no rooms were selected in Where step, show error
            if (!formData.selectedRoomIds || formData.selectedRoomIds.length === 0) {
                addNotification({ 
                    title: "No Rooms Selected", 
                    message: "Please select rooms in the previous step", 
                    type: "error" 
                });
                setCombinedBlockedEvents([]);
                setLoading(false);
                return;
            }

            // Batch fetch all selected rooms at once (more efficient than individual calls)
            const batchResponse = await apiRequest('/getbatch-new', {
                queries: formData.selectedRoomIds,
                exhaustive: true
            });

            if (!batchResponse || !batchResponse.success || !batchResponse.data) {
                throw new Error('Failed to fetch room schedules');
            }

            // Transform batch response into room data format
            const roomsWithData = batchResponse.data.map((item, index) => {
                const roomId = formData.selectedRoomIds[index];
                return {
                    id: roomId,
                    name: item?.room?.name || `Room ${roomId}`,
                    data: item?.data || {},
                    roomInfo: item?.room || {}
                };
            });
            
            // Combine all schedules
            const combinedSchedule = combineRoomSchedules(roomsWithData);
            
            // Generate blocked events for the calendar
            const blockedEvents = generateBlockedEvents(combinedSchedule);
            setCombinedBlockedEvents(blockedEvents);
            
            setLoading(false);
        } catch (error) {
            console.error('Error fetching and combining room schedules:', error);
            addNotification({ 
                title: "Error", 
                message: "Failed to load room schedules", 
                type: "error" 
            });
            setLoading(false);
        }
    };

    // Calendar navigation functions
    const changeToWeek = (week) => {
        setStartOfWeek(new Date(week));
        setView(1);
    };

    const changeToDay = (day) => {
        setSelectedDay(new Date(day));
        setView(2);
    };

    // Week navigation
    const updateWeek = (days) => {
        setStartOfWeek(prev => {
            const newStart = new Date(prev);
            newStart.setDate(newStart.getDate() + days);
            return newStart;
        });
    };

    // Day navigation
    const updateDay = (days) => {
        setSelectedDay(prev => {
            const newDate = new Date(prev);
            newDate.setDate(newDate.getDate() + days);
            return newDate;
        });
    };

    // Month navigation
    const nextMonth = () => {
        setMonth(m => m === 12 ? 1 : m + 1);
        setYear(y => month === 12 ? y + 1 : y);
    };

    const prevMonth = () => {
        setMonth(m => m === 1 ? 12 : m - 1);
        setYear(y => month === 1 ? y - 1 : y);
    };

    // Filter events for current view
    const getFilteredEvents = () => {
        if (view === 0) { // Month view
            return combinedBlockedEvents.filter(event => {
                const eventStart = new Date(event.start_time);
                return eventStart.getMonth() + 1 === month && eventStart.getFullYear() === year;
            });
        } else if (view === 1) { // Week view
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(endOfWeek.getDate() + 6);
            endOfWeek.setHours(23, 59, 59, 999);
            
            return combinedBlockedEvents.filter(event => {
                const eventStart = new Date(event.start_time);
                return eventStart >= startOfWeek && eventStart <= endOfWeek;
            });
        } else { // Day view
            return combinedBlockedEvents.filter(event => {
                const eventStart = new Date(event.start_time);
                const eventDay = new Date(eventStart.getFullYear(), eventStart.getMonth(), eventStart.getDate());
                const currentDay = new Date(selectedDay.getFullYear(), selectedDay.getMonth(), selectedDay.getDate());
                return eventDay.getTime() === currentDay.getTime();
            });
        }
    };

    // Fetch rooms data when selectedRoomIds changes
    useEffect(() => {
        fetchAndCombineSchedules();
    }, [formData.selectedRoomIds]);

    // Handle time selection from calendar - memoized to prevent infinite loops
    const handleTimeSelection = useCallback((selections) => {
        setSelectedTimeslots(selections);
        
        // Use the first selection for start_time and end_time
        if (selections && selections.length > 0) {
            const firstSelection = selections[0];
            setFormData(prev => {
                const newStartTime = new Date(firstSelection.startTime);
                const newEndTime = new Date(firstSelection.endTime);
                
                // Only update if times actually changed
                if (prev.start_time?.getTime() === newStartTime.getTime() && 
                    prev.end_time?.getTime() === newEndTime.getTime()) {
                    return prev; // Return previous state if unchanged
                }
                
                return {
                    ...prev,
                    start_time: newStartTime,
                    end_time: newEndTime
                };
            });
        } else {
            // Clear times if no selection
            setFormData(prev => {
                if (!prev.start_time && !prev.end_time) {
                    return prev; // Already cleared
                }
                return {
                    ...prev,
                    start_time: null,
                    end_time: null
                };
            });
        }
    }, [setFormData]);

    // Refs to avoid dependency issues
    const onCompleteRef = useRef(onComplete);
    const prevValidityRef = useRef(null);
    
    // Keep onComplete ref up to date
    useEffect(() => {
        onCompleteRef.current = onComplete;
    }, [onComplete]);

    // Initialize completion state and validate when times change
    useEffect(() => {
        const hasTimes = !!(formData.start_time && formData.end_time);
        const hasRooms = formData.selectedRoomIds && formData.selectedRoomIds.length > 0;
        
        // Validate: need both rooms and times
        const isValid = hasRooms && hasTimes;
        
        if (!isInitialized) {
            setIsInitialized(true);
        }
        
        // Only call onComplete if validity actually changed
        if (prevValidityRef.current !== isValid) {
            prevValidityRef.current = isValid;
            onCompleteRef.current(isValid);
        }
    }, [formData.start_time, formData.end_time, formData.selectedRoomIds, isInitialized]);

    if (loading) {
        return (
            <div className="when-component">
                <div className="loading">
                    <p>Loading room schedules...</p>
                </div>
            </div>
        );
    }

    if (!formData.selectedRoomIds || formData.selectedRoomIds.length === 0) {
        return (
            <div className="when-component">
                <div className="no-rooms">
                    <p>No rooms available. Please go back and select rooms first.</p>
                </div>
            </div>
        );
    }

    const filteredEvents = getFilteredEvents();
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const currentDay = new Date().getDate();

    return(
        <div className="when-component">
            <div className="info-box">
                <div className="info-content">
                    <span className="info-text">
                        {showAvailability 
                            ? `Grey blocks show unavailable times across all selected rooms (${formData.selectedRoomIds.length} rooms). Click and drag on the calendar to select your event time.`
                            : `Click and drag on the calendar to select your event time. Toggle "Show Availability" to see room availability.`
                        }
                    </span>
                    {formData.start_time && formData.end_time && (
                        <div className="selected-time-info" style={{ marginTop: '0.5rem', fontWeight: '500' }}>
                            Selected: {new Date(formData.start_time).toLocaleString()} - {new Date(formData.end_time).toLocaleString()}
                        </div>
                    )}
                </div>
            </div>
            
            <div className="calendar-wrapper">
                <div className="calendar-controls">
                    <div className="calendar-navigation">
                        {view === 0 && (
                            <>
                                <button onClick={prevMonth} className="nav-button">
                                    ←
                                </button>
                                <span className="date-display">
                                    {new Date(year, month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                                </span>
                                <button onClick={nextMonth} className="nav-button">
                                    →
                                </button>
                            </>
                        )}
                        
                        {view === 1 && (
                            <>
                                <button onClick={() => updateWeek(-7)} className="nav-button">
                                    ←
                                </button>
                                <span className="date-display">
                                    {startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {
                                        new Date(startOfWeek.getTime() + 6 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                    }
                                </span>
                                <button onClick={() => updateWeek(7)} className="nav-button">
                                    →
                                </button>
                            </>
                        )}
                        
                        {view === 2 && (
                            <>
                                <button onClick={() => updateDay(-1)} className="nav-button">
                                    ←
                                </button>
                                <span className="date-display">
                                    {selectedDay.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                                </span>
                                <button onClick={() => updateDay(1)} className="nav-button">
                                    →
                                </button>
                            </>
                        )}
                    </div>
                    
                    <div className="calendar-controls-right">
                        {view === 1 && (
                            <div className="availability-toggle" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: '1rem' }}>
                                <label style={{ fontSize: '0.875rem', cursor: 'pointer', userSelect: 'none' }} onClick={() => setShowAvailability(!showAvailability)}>
                                    Show Availability
                                </label>
                                <Switch 
                                    options={["off", "on"]} 
                                    onChange={(index) => setShowAvailability(index === 1)} 
                                    selectedPass={showAvailability ? 1 : 0} 
                                    setSelectedPass={(index) => setShowAvailability(index === 1)}
                                />
                            </div>
                        )}
                        <Switch 
                            options={["month", "week", "day"]} 
                            onChange={setView} 
                            selectedPass={view} 
                            setSelectedPass={setView}
                        />
                        <Filter 
                            options={["all", "study", "campus", "social", "club", "meeting", "sports"]} 
                            selected={filter.type} 
                            setSelected={(type)=>setFilter({...filter, type})} 
                            label={"filter"}
                        />
                    </div>
                </div>

                <div className="calendar-content" ref={contentRef}>
                    {view === 0 && (
                        <MonthDisplay 
                            month={month}
                            year={year}
                            events={filteredEvents}
                            height={`${contentHeight}px`}
                            currentMonth={currentMonth}
                            currentYear={currentYear}
                            currentDay={currentDay}
                            onWeekClick={changeToWeek}
                        />
                    )}
                    
                    {view === 1 && (
                        <WeeklyCalendar 
                            startOfWeek={startOfWeek}
                            events={filteredEvents}
                            height={`${contentHeight}px`}
                            dayClick={changeToDay}
                            autoEnableSelection={true}
                            selectionMode="single"
                            allowCrossDaySelection={false}
                            timeIncrement={15}
                            singleSelectionOnly={true}
                            startHour={6}
                            endHour={24}
                            showAvailability={showAvailability}
                            onSelectionsChange={handleTimeSelection}
                            initialSelections={selectedTimeslots}
                        />
                    )}
                    
                    {view === 2 && (
                        <DailyCalendar 
                            selectedDay={selectedDay}
                            events={filteredEvents}
                            height={`${contentHeight}px`}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

export default When;

