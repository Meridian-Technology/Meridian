/**
 * Semester Helper Utilities
 * Utilities for managing semester dates and academic calendar integration
 */

// placeholder helper, should be replaced with somthing more robust in the future.

// Standard academic year structure
const SEMESTER_CONFIGS = {
    // Fall semester typically starts in August/September
    fall: {
        startMonth: 8, // August (0-indexed)
        startDay: 15,
        endMonth: 11, // December
        endDay: 31
    },
    // Spring semester typically starts in January
    spring: {
        startMonth: 0, // January (0-indexed)
        startDay: 1,
        endMonth: 4, // May
        endDay: 31
    },
    // Summer semester (optional)
    summer: {
        startMonth: 5, // June
        startDay: 1,
        endMonth: 7, // August
        endDay: 15
    }
};

/**
 * Get the current semester information
 * @param {Date} date - Optional date to check (defaults to now)
 * @returns {Object} Semester information
 */
const getCurrentSemester = (date = new Date()) => {
    const month = date.getMonth();
    const day = date.getDate();
    const year = date.getFullYear();
    
    // Determine current semester
    if (month >= 8 || (month === 7 && day >= 15)) {
        // Fall semester
        return {
            type: 'fall',
            year: month >= 8 ? year : year - 1,
            startDate: new Date(year, SEMESTER_CONFIGS.fall.startMonth, SEMESTER_CONFIGS.fall.startDay),
            endDate: new Date(year, SEMESTER_CONFIGS.fall.endMonth, SEMESTER_CONFIGS.fall.endDay, 23, 59, 59)
        };
    } else if (month <= 4) {
        // Spring semester
        return {
            type: 'spring',
            year: year,
            startDate: new Date(year, SEMESTER_CONFIGS.spring.startMonth, SEMESTER_CONFIGS.spring.startDay),
            endDate: new Date(year, SEMESTER_CONFIGS.spring.endMonth, SEMESTER_CONFIGS.spring.endDay, 23, 59, 59)
        };
    } else {
        // Summer semester
        return {
            type: 'summer',
            year: year,
            startDate: new Date(year, SEMESTER_CONFIGS.summer.startMonth, SEMESTER_CONFIGS.summer.startDay),
            endDate: new Date(year, SEMESTER_CONFIGS.summer.endMonth, SEMESTER_CONFIGS.summer.endDay, 23, 59, 59)
        };
    }
};

/**
 * Get the end date of the current semester
 * @param {Date} date - Optional date to check (defaults to now)
 * @returns {Date} End date of current semester
 */
const getCurrentSemesterEnd = (date = new Date()) => {
    const semester = getCurrentSemester(date);
    return semester.endDate;
};

/**
 * Check if a date is within the current semester
 * @param {Date} date - Date to check
 * @param {Date} referenceDate - Reference date for determining "current" semester
 * @returns {boolean} True if date is within current semester
 */
const isWithinCurrentSemester = (date, referenceDate = new Date()) => {
    const semester = getCurrentSemester(referenceDate);
    const checkDate = new Date(date);
    
    return checkDate >= semester.startDate && checkDate <= semester.endDate;
};

/**
 * Validate that a recurring event pattern doesn't extend beyond semester end
 * @param {Object} recurrencePattern - Recurrence pattern object
 * @param {Date} startDate - Start date of the recurring event
 * @returns {Object} Validation result
 */
const validateRecurrenceWithinSemester = (recurrencePattern, startDate) => {
    const semesterEnd = getCurrentSemesterEnd(startDate);
    
    if (!recurrencePattern.frequency) {
        return { isValid: true, adjustedEndDate: null };
    }
    
    // Calculate the last occurrence based on frequency
    const start = new Date(startDate);
    const frequency = recurrencePattern.frequency;
    let lastOccurrence = new Date(start);
    
    // Find the last occurrence that would happen before semester end
    while (lastOccurrence <= semesterEnd) {
        if (frequency === 'weekly') {
            lastOccurrence.setDate(lastOccurrence.getDate() + 7);
        } else if (frequency === 'biweekly') {
            lastOccurrence.setDate(lastOccurrence.getDate() + 14);
        } else {
            break;
        }
    }
    
    // Step back one occurrence to get the actual last valid date
    if (frequency === 'weekly') {
        lastOccurrence.setDate(lastOccurrence.getDate() - 7);
    } else if (frequency === 'biweekly') {
        lastOccurrence.setDate(lastOccurrence.getDate() - 14);
    }
    
    return {
        isValid: lastOccurrence <= semesterEnd,
        adjustedEndDate: lastOccurrence < semesterEnd ? lastOccurrence : semesterEnd,
        semesterEnd: semesterEnd
    };
};

/**
 * Get all occurrence dates for a recurring pattern within the semester
 * @param {Date} startDate - Start date of recurring event
 * @param {Object} recurrencePattern - Recurrence pattern
 * @returns {Array} Array of occurrence dates
 */
const getRecurrenceOccurrences = (startDate, recurrencePattern) => {
    const occurrences = [];
    const start = new Date(startDate);
    const semesterEnd = getCurrentSemesterEnd(startDate);
    
    if (!recurrencePattern.frequency) {
        return [start];
    }
    
    let currentDate = new Date(start);
    
    while (currentDate <= semesterEnd) {
        occurrences.push(new Date(currentDate));
        
        if (recurrencePattern.frequency === 'weekly') {
            currentDate.setDate(currentDate.getDate() + 7);
        } else if (recurrencePattern.frequency === 'biweekly') {
            currentDate.setDate(currentDate.getDate() + 14);
        } else {
            break;
        }
    }
    
    return occurrences;
};

/**
 * Get semester information for a specific academic year
 * @param {number} year - Academic year (year when fall semester starts)
 * @param {string} semesterType - 'fall', 'spring', or 'summer'
 * @returns {Object} Semester information
 */
const getSemesterInfo = (year, semesterType) => {
    const config = SEMESTER_CONFIGS[semesterType];
    if (!config) {
        throw new Error(`Invalid semester type: ${semesterType}`);
    }
    
    let semesterYear = year;
    if (semesterType === 'spring' || semesterType === 'summer') {
        semesterYear = year + 1;
    }
    
    return {
        type: semesterType,
        year: semesterYear,
        startDate: new Date(semesterYear, config.startMonth, config.startDay),
        endDate: new Date(semesterYear, config.endMonth, config.endDay, 23, 59, 59)
    };
};

/**
 * Format semester information for display
 * @param {Object} semester - Semester object
 * @returns {string} Formatted semester string
 */
const formatSemester = (semester) => {
    const typeCapitalized = semester.type.charAt(0).toUpperCase() + semester.type.slice(1);
    return `${typeCapitalized} ${semester.year}`;
};

/**
 * Check if it's close to semester end (within specified days)
 * @param {number} daysThreshold - Number of days before semester end
 * @param {Date} referenceDate - Reference date (defaults to now)
 * @returns {boolean} True if close to semester end
 */
const isNearSemesterEnd = (daysThreshold = 14, referenceDate = new Date()) => {
    const semesterEnd = getCurrentSemesterEnd(referenceDate);
    const thresholdDate = new Date(semesterEnd);
    thresholdDate.setDate(thresholdDate.getDate() - daysThreshold);
    
    return referenceDate >= thresholdDate;
};

/**
 * Get days remaining in current semester
 * @param {Date} referenceDate - Reference date (defaults to now)
 * @returns {number} Days remaining in semester
 */
const getDaysRemainingInSemester = (referenceDate = new Date()) => {
    const semesterEnd = getCurrentSemesterEnd(referenceDate);
    const daysDiff = Math.ceil((semesterEnd - referenceDate) / (1000 * 60 * 60 * 24));
    return Math.max(0, daysDiff);
};

/**
 * Custom semester configuration override
 * Allows schools to set custom semester dates
 * @param {string} semesterType - 'fall', 'spring', or 'summer'
 * @param {Object} config - Custom configuration
 */
const setSemesterConfig = (semesterType, config) => {
    if (!SEMESTER_CONFIGS[semesterType]) {
        throw new Error(`Invalid semester type: ${semesterType}`);
    }
    
    SEMESTER_CONFIGS[semesterType] = {
        ...SEMESTER_CONFIGS[semesterType],
        ...config
    };
};

module.exports = {
    getCurrentSemester,
    getCurrentSemesterEnd,
    isWithinCurrentSemester,
    validateRecurrenceWithinSemester,
    getRecurrenceOccurrences,
    getSemesterInfo,
    formatSemester,
    isNearSemesterEnd,
    getDaysRemainingInSemester,
    setSemesterConfig,
    SEMESTER_CONFIGS
};
