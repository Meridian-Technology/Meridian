import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import './DateTimePicker.scss';

function DateTimePicker({ 
    value, 
    onChange, 
    label, 
    minDateTime, 
    maxDateTime,
    placeholder = "Select date and time"
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedDate, setSelectedDate] = useState('');
    const [selectedTime, setSelectedTime] = useState('');
    const [error, setError] = useState('');
    const containerRef = useRef(null);
    const dropdownRef = useRef(null);

    // Initialize from value prop
    useEffect(() => {
        if (value) {
            const date = new Date(value);
            // Use local date/time to avoid timezone issues
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            setSelectedDate(`${year}-${month}-${day}`);
            
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            setSelectedTime(`${hours}:${minutes}`);
        } else {
            setSelectedDate('');
            setSelectedTime('');
        }
    }, [value]);

    // Position dropdown and close on outside click
    useEffect(() => {
        const positionDropdown = () => {
            if (isOpen && containerRef.current && dropdownRef.current) {
                const inputRect = containerRef.current.getBoundingClientRect();
                const dropdown = dropdownRef.current;
                const viewportHeight = window.innerHeight;
                const viewportWidth = window.innerWidth;
                const dropdownHeight = dropdown.offsetHeight || 300;
                const dropdownWidth = dropdown.offsetWidth || 280;
                
                let top = inputRect.bottom + 4;
                let left = inputRect.left;
                
                // Check if dropdown would go off bottom of viewport
                if (top + dropdownHeight > viewportHeight) {
                    // Try positioning above input
                    if (inputRect.top - dropdownHeight > 0) {
                        top = inputRect.top - dropdownHeight - 4;
                    } else {
                        // If can't fit above, position at bottom of viewport
                        top = viewportHeight - dropdownHeight - 16;
                    }
                }
                
                // Check if dropdown would go off right edge
                if (left + dropdownWidth > viewportWidth) {
                    left = viewportWidth - dropdownWidth - 16;
                }
                
                // Ensure it doesn't go off left edge
                if (left < 16) {
                    left = 16;
                }
                
                dropdown.style.top = `${top}px`;
                dropdown.style.left = `${left}px`;
            }
        };

        const handleClickOutside = (event) => {
            // Don't close if clicking on a select element or its options (native dropdown)
            const target = event.target;
            if (target.tagName === 'SELECT' || 
                target.tagName === 'OPTION' || 
                target.closest('select')) {
                return;
            }
            
            // Don't close if clicking on date input (native date picker)
            if (target.type === 'date' || target.closest('input[type="date"]')) {
                return;
            }
            
            if (containerRef.current && !containerRef.current.contains(target) &&
                dropdownRef.current && !dropdownRef.current.contains(target)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            positionDropdown();
            window.addEventListener('resize', positionDropdown);
            window.addEventListener('scroll', positionDropdown, true);
            // Use click instead of mousedown to allow select dropdowns to work
            document.addEventListener('click', handleClickOutside);
            
            return () => {
                window.removeEventListener('resize', positionDropdown);
                window.removeEventListener('scroll', positionDropdown, true);
                document.removeEventListener('click', handleClickOutside);
            };
        }
    }, [isOpen]);

    const handleDateChange = (date) => {
        setSelectedDate(date);
        setError('');
        
        // Clear time if date changes and it's no longer valid
        if (date && selectedTime) {
            const [year, month, day] = date.split('-').map(Number);
            const [hours, minutes] = selectedTime.split(':').map(Number);
            const newDateTime = new Date(year, month - 1, day, hours, minutes, 0);
            
            const minDate = minDateTime ? new Date(minDateTime) : null;
            const maxDate = maxDateTime ? new Date(maxDateTime) : null;
            
            if (minDate && newDateTime.getTime() < minDate.getTime()) {
                setSelectedTime('');
            } else if (maxDate && newDateTime.getTime() > maxDate.getTime()) {
                setSelectedTime('');
            } else {
                validateAndUpdate(newDateTime);
            }
        }
    };

    const handleTimeChange = (time) => {
        setSelectedTime(time);
        setError('');
        
        if (selectedDate && time) {
            // Create date in local timezone
            const [year, month, day] = selectedDate.split('-').map(Number);
            const [hours, minutes] = time.split(':').map(Number);
            const localDate = new Date(year, month - 1, day, hours, minutes, 0);
            validateAndUpdate(localDate);
        }
    };

    const validateAndUpdate = (dateTime) => {
        // Ensure dateTime is a Date object
        const dateObj = dateTime instanceof Date ? dateTime : new Date(dateTime);
        
        if (isNaN(dateObj.getTime())) {
            setError('Invalid date/time');
            return;
        }
        
        const minDate = minDateTime ? new Date(minDateTime) : null;
        const maxDate = maxDateTime ? new Date(maxDateTime) : null;
        
        if (minDate && dateObj.getTime() < minDate.getTime()) {
            setError('Time must be after event start');
            return;
        }
        
        if (maxDate && dateObj.getTime() > maxDate.getTime()) {
            setError('Time must be before event end');
            return;
        }

        setError('');
        if (onChange) {
            onChange(dateObj.toISOString());
        }
    };

    const handleClear = () => {
        setSelectedDate('');
        setSelectedTime('');
        setError('');
        if (onChange) {
            onChange(null);
        }
    };

    const formatDisplayValue = () => {
        if (!value) return placeholder;
        const date = new Date(value);
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    };

    // Generate time options (15-minute intervals)
    const generateTimeOptions = () => {
        const options = [];
        
        if (!selectedDate) return options;
        
        const minDate = minDateTime ? new Date(minDateTime) : null;
        const maxDate = maxDateTime ? new Date(maxDateTime) : null;
        
        if (!minDate || !maxDate) return options;
        
        // Get date strings for comparison (YYYY-MM-DD format)
        // Use local date, not UTC date, to handle timezone correctly
        const minYear = minDate.getFullYear();
        const minMonth = String(minDate.getMonth() + 1).padStart(2, '0');
        const minDay = String(minDate.getDate()).padStart(2, '0');
        const minDateStr = `${minYear}-${minMonth}-${minDay}`;
        
        const maxYear = maxDate.getFullYear();
        const maxMonth = String(maxDate.getMonth() + 1).padStart(2, '0');
        const maxDay = String(maxDate.getDate()).padStart(2, '0');
        const maxDateStr = `${maxYear}-${maxMonth}-${maxDay}`;
        
        // Check if selected date is within event range
        if (selectedDate < minDateStr || selectedDate > maxDateStr) {
            return options;
        }
        
        // Determine start and end times based on selected date
        // Create dates in local timezone
        const [year, month, day] = selectedDate.split('-').map(Number);
        let startTime = new Date(year, month - 1, day, 0, 0, 0);
        let endTime = new Date(year, month - 1, day, 23, 59, 59);
        
        // Adjust based on min/max constraints for the selected date
        const minTime = minDate.getTime();
        const maxTime = maxDate.getTime();
        
        // Check if selected date is the same as event start date
        if (selectedDate === minDateStr) {
            // Use event start time - get local time representation
            const minDateObj = new Date(minDate);
            const minHours = minDateObj.getHours();
            const minMinutes = minDateObj.getMinutes();
            startTime = new Date(year, month - 1, day, minHours, minMinutes, 0);
        }
        
        // Check if selected date is the same as event end date
        if (selectedDate === maxDateStr) {
            // Use event end time - get local time representation
            const maxDateObj = new Date(maxDate);
            const maxHours = maxDateObj.getHours();
            const maxMinutes = maxDateObj.getMinutes();
            endTime = new Date(year, month - 1, day, maxHours, maxMinutes, 0);
        }
        
        // For dates between start and end, use full day (already set above)
        
        // Generate 15-minute intervals
        const current = new Date(startTime);
        const end = new Date(endTime);
        
        // Round start time to nearest 15-minute interval
        const startMinutes = current.getMinutes();
        const roundedStartMinutes = Math.floor(startMinutes / 15) * 15;
        current.setMinutes(roundedStartMinutes, 0, 0);
        
        while (current <= end) {
            const hours = current.getHours();
            const minutes = current.getMinutes();
            const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
            
            // Create full datetime for validation (in local time)
            const fullDateTime = new Date(year, month - 1, day, hours, minutes, 0);
            const fullDateTimeTime = fullDateTime.getTime();
            
            // Compare timestamps directly - this works regardless of timezone
            if (fullDateTimeTime >= minTime && fullDateTimeTime <= maxTime) {
                options.push(timeString);
            }
            
            current.setMinutes(current.getMinutes() + 15);
            
            // Safety check to prevent infinite loop
            if (options.length > 200) break;
        }
        
        return options;
    };

    const timeOptions = generateTimeOptions();
    
    // Debug: Log time options for troubleshooting
    useEffect(() => {
        if (isOpen && selectedDate) {
            const minDate = minDateTime ? new Date(minDateTime) : null;
            const maxDate = maxDateTime ? new Date(maxDateTime) : null;
            const minDateStr = minDate ? minDate.toISOString().split('T')[0] : null;
            const maxDateStr = maxDate ? maxDate.toISOString().split('T')[0] : null;
            
            if (timeOptions.length === 0) {
                console.log('No time options generated:', {
                    selectedDate,
                    minDateTime,
                    maxDateTime,
                    minDateStr,
                    maxDateStr,
                    minDateLocal: minDate ? `${minDate.getHours()}:${minDate.getMinutes()}` : null,
                    maxDateLocal: maxDate ? `${maxDate.getHours()}:${maxDate.getMinutes()}` : null,
                    minTime: minDate ? minDate.getTime() : null,
                    maxTime: maxDate ? maxDate.getTime() : null
                });
            } else {
                console.log('Time options generated:', timeOptions.length, 'options');
            }
        }
    }, [isOpen, selectedDate, timeOptions, minDateTime, maxDateTime]);

    // Get min/max dates for date picker
    const minDate = minDateTime ? new Date(minDateTime).toISOString().split('T')[0] : '';
    const maxDate = maxDateTime ? new Date(maxDateTime).toISOString().split('T')[0] : '';

    return (
        <div className="datetime-picker" ref={containerRef}>
            {label && <label className="datetime-picker__label">{label}</label>}
            <div 
                className={`datetime-picker__input ${isOpen ? 'datetime-picker__input--open' : ''} ${error ? 'datetime-picker__input--error' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
            >
                <Icon icon="mdi:calendar-clock" />
                <span className={value ? '' : 'datetime-picker__placeholder'}>
                    {formatDisplayValue()}
                </span>
                {value && (
                    <button 
                        className="datetime-picker__clear"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleClear();
                        }}
                    >
                        <Icon icon="mdi:close" />
                    </button>
                )}
                <Icon icon={isOpen ? "mdi:chevron-up" : "mdi:chevron-down"} />
            </div>
            
            {error && (
                <div className="datetime-picker__error">
                    <Icon icon="mdi:alert-circle" />
                    {error}
                </div>
            )}

            {isOpen && (
                <div className="datetime-picker__dropdown" ref={dropdownRef}>
                    <div className="datetime-picker__section">
                        <div className="datetime-picker__section-header">
                            <Icon icon="mdi:calendar" />
                            <span>Date</span>
                        </div>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => {
                                e.stopPropagation();
                                handleDateChange(e.target.value);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            min={minDate}
                            max={maxDate}
                            className="datetime-picker__date-input"
                        />
                    </div>

                    {selectedDate && (
                        <div className="datetime-picker__section">
                            <div className="datetime-picker__section-header">
                                <Icon icon="mdi:clock-outline" />
                                <span>Time</span>
                            </div>
                            <div className="datetime-picker__time-select">
                                {timeOptions.length > 0 ? (
                                    <select
                                        value={selectedTime}
                                        onChange={(e) => {
                                            e.stopPropagation();
                                            handleTimeChange(e.target.value);
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        className="datetime-picker__time-input"
                                    >
                                        <option value="">Select time</option>
                                        {timeOptions.map((time) => (
                                            <option key={time} value={time}>
                                                {new Date(`2000-01-01T${time}`).toLocaleTimeString('en-US', {
                                                    hour: 'numeric',
                                                    minute: '2-digit',
                                                    hour12: true
                                                })}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <div className="datetime-picker__no-times">
                                        No available times for this date
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {minDateTime && maxDateTime && (
                        <div className="datetime-picker__info">
                            <Icon icon="mdi:information" />
                            <span>
                                Event runs from {new Date(minDateTime).toLocaleString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: 'numeric',
                                    minute: '2-digit',
                                    hour12: true
                                })} to {new Date(maxDateTime).toLocaleString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: 'numeric',
                                    minute: '2-digit',
                                    hour12: true
                                })}
                            </span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default DateTimePicker;

