/**
 * Time Block Helper Utilities
 * Utilities for working with time blocks and DateTime objects
 */

// placeholder helper, should be considered for replacement in the future.

// Convert time to minutes from midnight (for compatibility with existing schedule system)
const timeToMinutes = (dateTime) => {
    const date = new Date(dateTime);
    return date.getHours() * 60 + date.getMinutes();
};

// Convert minutes from midnight to DateTime object for today
const minutesToDateTime = (minutes, baseDate = new Date()) => {
    const date = new Date(baseDate);
    date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    return date;
};

// Check if two time blocks overlap
const hasTimeOverlap = (block1, block2) => {
    const start1 = new Date(block1.startTime);
    const end1 = new Date(block1.endTime);
    const start2 = new Date(block2.startTime);
    const end2 = new Date(block2.endTime);
    
    return start1 < end2 && end1 > start2;
};

// Get duration of a time block in minutes
const getBlockDuration = (block) => {
    const start = new Date(block.startTime);
    const end = new Date(block.endTime);
    return Math.round((end - start) / (1000 * 60)); // Convert ms to minutes
};

// Validate time block structure
const validateTimeBlock = (block) => {
    const errors = [];
    
    if (!block.startTime || !block.endTime) {
        errors.push('Both startTime and endTime are required');
        return errors;
    }
    
    const start = new Date(block.startTime);
    const end = new Date(block.endTime);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        errors.push('Invalid date format');
        return errors;
    }
    
    if (start >= end) {
        errors.push('Start time must be before end time');
    }
    
    if (start <= new Date()) {
        errors.push('Time must be in the future');
    }
    
    const duration = getBlockDuration(block);
    if (duration < 15) {
        errors.push('Minimum duration is 15 minutes');
    }
    
    if (duration > 480) { // 8 hours
        errors.push('Maximum duration is 8 hours');
    }
    
    return errors;
};

// Merge overlapping time blocks
const mergeOverlappingBlocks = (blocks) => {
    if (blocks.length <= 1) return blocks;
    
    // Sort blocks by start time
    const sortedBlocks = blocks.slice().sort((a, b) => 
        new Date(a.startTime) - new Date(b.startTime)
    );
    
    const merged = [sortedBlocks[0]];
    
    for (let i = 1; i < sortedBlocks.length; i++) {
        const current = sortedBlocks[i];
        const lastMerged = merged[merged.length - 1];
        
        if (hasTimeOverlap(lastMerged, current)) {
            // Extend the last merged block
            lastMerged.endTime = new Date(Math.max(
                new Date(lastMerged.endTime),
                new Date(current.endTime)
            ));
        } else {
            merged.push(current);
        }
    }
    
    return merged;
};

// Find time gaps between blocks
const findTimeGaps = (blocks, minGapMinutes = 30) => {
    if (blocks.length <= 1) return [];
    
    const sortedBlocks = blocks.slice().sort((a, b) => 
        new Date(a.startTime) - new Date(b.startTime)
    );
    
    const gaps = [];
    
    for (let i = 0; i < sortedBlocks.length - 1; i++) {
        const currentEnd = new Date(sortedBlocks[i].endTime);
        const nextStart = new Date(sortedBlocks[i + 1].startTime);
        
        const gapDuration = (nextStart - currentEnd) / (1000 * 60); // minutes
        
        if (gapDuration >= minGapMinutes) {
            gaps.push({
                startTime: currentEnd,
                endTime: nextStart,
                duration: gapDuration
            });
        }
    }
    
    return gaps;
};

// Round time to nearest interval (e.g., 15, 30, 60 minutes)
const roundToInterval = (dateTime, intervalMinutes = 30) => {
    const date = new Date(dateTime);
    const minutes = date.getMinutes();
    const roundedMinutes = Math.round(minutes / intervalMinutes) * intervalMinutes;
    
    date.setMinutes(roundedMinutes, 0, 0);
    
    // Handle hour overflow
    if (roundedMinutes >= 60) {
        date.setHours(date.getHours() + 1);
        date.setMinutes(roundedMinutes - 60);
    }
    
    return date;
};

// Format time block for display
const formatTimeBlock = (block, options = {}) => {
    const { includeDate = false, timezone = 'local' } = options;
    
    const start = new Date(block.startTime);
    const end = new Date(block.endTime);
    
    const formatOptions = {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    };
    
    if (includeDate) {
        formatOptions.weekday = 'short';
        formatOptions.month = 'short';
        formatOptions.day = 'numeric';
    }
    
    const startStr = start.toLocaleString('en-US', formatOptions);
    const endStr = end.toLocaleString('en-US', formatOptions);
    
    if (includeDate && start.toDateString() === end.toDateString()) {
        // Same day
        const dateStr = start.toLocaleDateString('en-US', { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric' 
        });
        const timeRange = `${start.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit', 
            hour12: true 
        })} - ${end.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit', 
            hour12: true 
        })}`;
        return `${dateStr}, ${timeRange}`;
    }
    
    return `${startStr} - ${endStr}`;
};

// Check if time block is within business hours
const isWithinBusinessHours = (block, businessStart = 8, businessEnd = 22) => {
    const start = new Date(block.startTime);
    const end = new Date(block.endTime);
    
    const startHour = start.getHours();
    const endHour = end.getHours();
    const endMinutes = end.getMinutes();
    
    // Consider end time of 22:00 as within business hours
    const effectiveEndHour = endMinutes > 0 ? endHour + 1 : endHour;
    
    return startHour >= businessStart && effectiveEndHour <= businessEnd;
};

// Get day of week from date (0 = Sunday, 6 = Saturday)
const getDayOfWeek = (dateTime) => {
    return new Date(dateTime).getDay();
};

// Convert day of week to letter format (M, T, W, R, F)
const dayToLetter = (dayNumber) => {
    const days = ['S', 'M', 'T', 'W', 'R', 'F', 'S'];
    return days[dayNumber] || '';
};

// Get week boundaries for a given date
const getWeekBoundaries = (dateTime) => {
    const date = new Date(dateTime);
    const dayOfWeek = date.getDay();
    
    // Start of week (Sunday)
    const startOfWeek = new Date(date);
    startOfWeek.setDate(date.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);
    
    // End of week (Saturday)
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    
    return { startOfWeek, endOfWeek };
};

module.exports = {
    timeToMinutes,
    minutesToDateTime,
    hasTimeOverlap,
    getBlockDuration,
    validateTimeBlock,
    mergeOverlappingBlocks,
    findTimeGaps,
    roundToInterval,
    formatTimeBlock,
    isWithinBusinessHours,
    getDayOfWeek,
    dayToLetter,
    getWeekBoundaries
};
