import React, { useEffect, useState } from 'react';
import './ScheduleTime.scss';
import WeeklyCalendar from '../../../../OIEDash/EventsCalendar/Week/WeeklyCalendar/WeeklyCalendar';

const ScheduleTime = ({ formData, setFormData, onComplete }) => {
    const [currentWeekStart, setCurrentWeekStart] = useState(new Date());
    const [selectedTime, setSelectedTime] = useState(null);

    // Initialize current week to start of this week
    useEffect(() => {
        const today = new Date();
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        setCurrentWeekStart(startOfWeek);
    }, []);

    // Update form data when time is selected
    useEffect(() => {
        if (selectedTime) {
            setFormData(prev => ({
                ...prev,
                startTime: selectedTime.startTime,
                endTime: selectedTime.endTime
            }));
        }
    }, [selectedTime, setFormData]);

    // Validate step completion
    useEffect(() => {
        const isValid = !!(formData.startTime && formData.endTime && formData.location &&
                          new Date(formData.startTime) < new Date(formData.endTime) &&
                          new Date(formData.startTime) > new Date());
        onComplete(isValid);
    }, [formData.startTime, formData.endTime, formData.location, onComplete]);

    const handleTimeSelection = (selectionData) => {
        // For schedule mode, only allow single selection
        setSelectedTime({
            startTime: selectionData.startTime,
            endTime: selectionData.endTime
        });
    };

    const handleInputChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const formatSelectedTime = () => {
        if (!formData.startTime || !formData.endTime) return null;
        const start = new Date(formData.startTime);
        const end = new Date(formData.endTime);
        
        const dayName = start.toLocaleDateString('en-US', { weekday: 'long' });
        const dateStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const startTimeStr = start.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        });
        const endTimeStr = end.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        });
        
        return `${dayName}, ${dateStr} from ${startTimeStr} to ${endTimeStr}`;
    };

    return (
        <div className="schedule-time-step">
            <div className="form-section">
                <h3>Schedule Your Study Session</h3>
                <p>Select a specific date and time for your study session.</p>

                <div className="time-selection-section">
                    <div className="week-navigation">
                        <span 
                            role="button"
                            tabIndex={0}
                            className="nav-link left"
                            onClick={() => {
                                const newWeek = new Date(currentWeekStart);
                                newWeek.setDate(newWeek.getDate() - 7);
                                setCurrentWeekStart(newWeek);
                            }}
                        >
                            <span className="arrow">←</span>
                            <span className="label">previous</span>
                        </span>
                        <span 
                            role="button"
                            tabIndex={0}
                            className="nav-link right"
                            onClick={() => {
                                const newWeek = new Date(currentWeekStart);
                                newWeek.setDate(newWeek.getDate() + 7);
                                setCurrentWeekStart(newWeek);
                            }}
                        >
                            <span className="label">next</span>
                            <span className="arrow">→</span>
                        </span>
                    </div>

                    <div className="calendar-container">
                        <WeeklyCalendar
                            startOfWeek={currentWeekStart}
                            events={[]}
                            height="calc(100vh - 400px)"
                            autoEnableSelection={true}
                            selectionMode="single"
                            allowCrossDaySelection={false}
                            timeIncrement={30}
                            singleSelectionOnly={true}
                            startHour={6}
                            endHour={24}
                            dayClick={() => {}}
                            onTimeSelection={handleTimeSelection}
                            initialSelections={selectedTime ? [selectedTime] : []}
                        />
                    </div>

                    {formData.startTime && formData.endTime && (
                        <div className="selected-time-display">
                            <strong>Selected Time:</strong> {formatSelectedTime()}
                        </div>
                    )}
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
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ScheduleTime;

