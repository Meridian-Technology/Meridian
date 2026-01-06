import React, { useMemo } from 'react';
import './AvailabilityOverlay.scss';

/**
 * AvailabilityOverlay Component
 * 
 * Renders visual availability indicators across the calendar grid.
 * Shows availability states: available, conflict, blocked
 * 
 * Philosophy: Visual feedback should be immediate and intuitive
 */
const AvailabilityOverlay = ({ 
    days, 
    events, 
    timeIncrement = 15,
    showAvailability = true,
    visibleStartMinutes = 0,
    visibleEndMinutes = 1440
}) => {
    const MINUTE_HEIGHT = 1; // 1px per minute

    /**
     * Calculate availability state for each time slot
     * Returns: 'available', 'conflict', 'blocked'
     */
    const calculateAvailabilityGrid = useMemo(() => {
        if (!showAvailability || !days || days.length === 0) return [];

        const availabilityGrid = [];
        // Only calculate slots for the visible time range
        const visibleRangeMinutes = visibleEndMinutes - visibleStartMinutes;
        const slotsPerDay = Math.ceil(visibleRangeMinutes / timeIncrement);

        days.forEach((day, dayIndex) => {
            const dayAvailability = [];
            
            // Start from visibleStartMinutes, not midnight
            for (let slotIndex = 0; slotIndex < slotsPerDay; slotIndex++) {
                const slotStartMinutes = visibleStartMinutes + (slotIndex * timeIncrement);
                const slotEndMinutes = Math.min(slotStartMinutes + timeIncrement, visibleEndMinutes);
                
                // Skip if slot is outside visible range
                if (slotStartMinutes >= visibleEndMinutes) break;
                
                // Create time objects for this slot
                const slotStart = new Date(day);
                slotStart.setHours(Math.floor(slotStartMinutes / 60));
                slotStart.setMinutes(slotStartMinutes % 60);
                slotStart.setSeconds(0);
                
                const slotEnd = new Date(day);
                slotEnd.setHours(Math.floor(slotEndMinutes / 60));
                slotEnd.setMinutes(slotEndMinutes % 60);
                slotEnd.setSeconds(0);
                
                // Check for conflicts with existing events (exclude user selections)
                const hasConflict = events.some(event => {
                    // Skip user selections - they're temporary and shouldn't show as conflicts
                    if (event.isUserSelection) return false;
                    
                    const eventStart = new Date(event.start_time);
                    const eventEnd = new Date(event.end_time);
                    
                    // Same day check
                    if (eventStart.toDateString() !== day.toDateString()) {
                        return false;
                    }
                    
                    // Time overlap check
                    return !(eventEnd <= slotStart || slotEnd <= eventStart);
                });
                
                // Check for blocked events (room unavailable times)
                const isBlocked = events.some(event => {
                    // Only check blocked events
                    if (event.type !== 'blocked' && event.status !== 'blocked') return false;
                    
                    const eventStart = new Date(event.start_time);
                    const eventEnd = new Date(event.end_time);
                    
                    // Same day check
                    if (eventStart.toDateString() !== day.toDateString()) {
                        return false;
                    }
                    
                    // Time overlap check
                    return !(eventEnd <= slotStart || slotEnd <= eventStart);
                });
                
                // Determine availability state
                let availabilityState = 'available';
                if (isBlocked) {
                    availabilityState = 'blocked';
                } else if (hasConflict) {
                    availabilityState = 'conflict';
                }
                
                dayAvailability.push({
                    dayIndex,
                    slotIndex,
                    startMinutes: slotStartMinutes,
                    endMinutes: slotEndMinutes,
                    startTime: slotStart.toISOString(),
                    endTime: slotEnd.toISOString(),
                    state: availabilityState
                });
            }
            
            availabilityGrid.push(dayAvailability);
        });

        return availabilityGrid;
    }, [days, events, timeIncrement, showAvailability, visibleStartMinutes, visibleEndMinutes]);

    /**
     * Render availability indicators for a single day
     */
    const renderDayAvailability = (dayAvailability, dayIndex) => {
        return dayAvailability.map((slot, slotIndex) => {
            // Skip rendering for available slots to reduce DOM overhead
            if (slot.state === 'available') return null;
            
            // Position relative to visible start, not absolute from midnight
            const top = (slot.startMinutes - visibleStartMinutes) * MINUTE_HEIGHT;
            const height = (slot.endMinutes - slot.startMinutes) * MINUTE_HEIGHT;
            
            return (
                <div
                    key={`${dayIndex}-${slotIndex}`}
                    className={`availability-indicator availability-${slot.state}`}
                    style={{
                        position: 'absolute',
                        top: `${top}px`,
                        left: '0',
                        right: '0',
                        height: `${height}px`,
                        pointerEvents: 'none',
                        zIndex: 1
                    }}
                    data-availability-state={slot.state}
                    data-time-slot={`${slot.startTime}-${slot.endTime}`}
                />
            );
        });
    };

    if (!showAvailability || calculateAvailabilityGrid.length === 0) {
        return null;
    }

    return (
        <div className="availability-overlay">
            {calculateAvailabilityGrid.map((dayAvailability, dayIndex) => (
                <div
                    key={dayIndex}
                    className="day-availability"
                    style={{
                        position: 'absolute',
                        left: `${(dayIndex / 7) * 100}%`,
                        width: `${100 / 7}%`,
                        height: '100%',
                        pointerEvents: 'none'
                    }}
                >
                    {renderDayAvailability(dayAvailability, dayIndex)}
                </div>
            ))}
        </div>
    );
};

export default AvailabilityOverlay;