import React, { useEffect, useRef, useState } from 'react';
import './TimeLocation.scss';
import WeeklyCalendar from '../../../../OIEDash/EventsCalendar/Week/WeeklyCalendar/WeeklyCalendar';

const TimeLocation = ({ formData, setFormData, onComplete }) => {
    const [currentWeekStart, setCurrentWeekStart] = useState(new Date());
    const [selectedTimeslots, setSelectedTimeslots] = useState(formData.selectedTimeslots || []);


    // Initialize current week to start of this week
    useEffect(() => {
        const today = new Date();
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay()); // Start on Sunday
        startOfWeek.setHours(0, 0, 0, 0);
        setCurrentWeekStart(startOfWeek);
    }, []);

    // Update form data when timeslots change
    useEffect(() => {
        setFormData(prev => ({
            ...prev,
            selectedTimeslots
        }));
    }, [selectedTimeslots, setFormData]);

    // Validate step completion (call once, avoid Flow re-render loop)
    const onCompleteRef = useRef(onComplete);
    useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
    useEffect(() => {
        if (onCompleteRef.current) {
            onCompleteRef.current(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleInputChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleTimeslotSelection = (selectionData) => {
        // Add the new selection to our list of selected timeslots
        const newTimeslot = {
            id: `timeslot-${Date.now()}-${Math.random()}`,
            startTime: selectionData.startTime,
            endTime: selectionData.endTime,
            startDay: selectionData.startDay,
            endDay: selectionData.endDay,
            duration: selectionData.duration,
            displayText: formatTimeslotDisplay(selectionData)
        };

        setSelectedTimeslots(prev => [...prev, newTimeslot]);
    };

    const formatTimeslotDisplay = (selectionData) => {
        const startDate = new Date(selectionData.startTime);
        const endDate = new Date(selectionData.endTime);
        
        const dayName = startDate.toLocaleDateString('en-US', { weekday: 'short' });
        const startTimeStr = startDate.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        });
        const endTimeStr = endDate.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        });
        
        return `${dayName} ${startTimeStr} - ${endTimeStr}`;
    };



    const navigateWeek = (direction) => {
        const newWeekStart = new Date(currentWeekStart);
        newWeekStart.setDate(newWeekStart.getDate() + (direction * 7));
        setCurrentWeekStart(newWeekStart);
    };

    return (
        <div className="time-location-step">
            <div className="form-section">
                {/* <h3>Available Times & Location</h3>
                <p>Select multiple possible meeting times for your study session. Group members can vote on their preferred times.</p> */}

                <div className="timeslot-selection-section">
                

                    {/* Week Navigation */}
                    <div className="week-navigation">
                        <span 
                            role="button"
                            tabIndex={0}
                            className="nav-link left"
                            onClick={() => navigateWeek(-1)}
                            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigateWeek(-1)}
                        >
                            <span className="arrow">←</span>
                            <span className="label">previous</span>
                        </span>
                        <span 
                            role="button"
                            tabIndex={0}
                            className="nav-link right"
                            onClick={() => navigateWeek(1)}
                            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigateWeek(1)}
                        >
                            <span className="label">next</span>
                            <span className="arrow">→</span>
                        </span>
                    </div>

                    {/* Enhanced WeeklyCalendar for timeslot selection */}
                    <div className="calendar-container">
                        <WeeklyCalendar
                            startOfWeek={currentWeekStart}
                            events={[]}
                            height="calc(100vh - 300px)"
                            autoEnableSelection={true}
                            selectionMode="multiple"
                            allowCrossDaySelection={false}
                            timeIncrement={30}
                            singleSelectionOnly={false}
                            startHour={6}
                            endHour={24}
                            dayClick={() => {}}
                            onTimeSelection={handleTimeslotSelection}
                            initialSelections={selectedTimeslots}
                            onSelectionsChange={setSelectedTimeslots}
                        />
                    </div>


                </div>

                <div className="location-section">
                    <h4>Location</h4>
                    
                    <div className="form-group">
                        <label htmlFor="location">Where will you meet? *</label>
                        <input
                            id="location"
                            type="text"
                            placeholder="e.g., Library Study Room A, Online, DCC 308"
                            value={formData.location}
                            onChange={(e) => handleInputChange('location', e.target.value)}
                            maxLength={200}
                        />
                        <div className="location-help">
                            You can specify a physical room, "Online" for virtual sessions, or "TBD" to decide later.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TimeLocation;
