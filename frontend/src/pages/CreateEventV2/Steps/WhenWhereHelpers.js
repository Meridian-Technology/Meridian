const addQueryHelper = (key, newValue, setQuery) => {
    setQuery(prev => {
        // Clear all other keys except for the current key.
        const clearedQueries = Object.keys(prev).reduce((acc, currentKey) => {
            acc[currentKey] = currentKey === key ? prev[currentKey] : [];
            return acc;
        }, {});

        // Create a list that includes all existing timeslots for the current key plus the new one.
        const allSlots = [...clearedQueries[key], newValue];
        
        // Sort timeslots by start time.
        allSlots.sort((a, b) => a.start_time - b.start_time);

        // Merge overlapping or consecutive timeslots.
        let mergedSlots = allSlots.reduce((acc, slot) => {
            if (acc.length === 0) {
                acc.push(slot);
            } else {
                let lastSlot = acc[acc.length - 1];
                if (lastSlot.end_time >= slot.start_time) {
                    // If the current slot overlaps or is consecutive with the last slot in acc, merge them.
                    lastSlot.end_time = Math.max(lastSlot.end_time, slot.end_time);
                } else {
                    // If not overlapping or consecutive, just add the slot to acc.
                    acc.push(slot);
                }
            }
            return acc;
        }, []);

        if(mergedSlots.length > 1){
            mergedSlots = [newValue];
        }

        // Return updated state with only the current key containing merged slots.
        return { ...clearedQueries, [key]: mergedSlots };
    });
};


const removeQueryHelper = (key, value, setQuery) => {
    // setNoQuery(true); //failsafe, useEffect checks before query anyways
    setQuery(prev => {
        const existing = prev[key];
        if (existing === undefined) {
            // If the key does not exist, return the previous state unchanged.
            return prev;
        } else {
            // Filter the array to remove the specified value.
            const filtered = existing.filter(v => v !== value);
            // Always return the object with the key, even if the array is empty.
            const newQuery = { ...prev, [key]: filtered };
            const isQueryEmpty = Object.values(newQuery).every(arr => arr.length === 0);
            return newQuery;
        }
    });
    
    // Check if all keys in the query object have empty arrays and update `noQuery` accordingly.
}

function getCurrentWeek() {
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay()); // Start on Sunday

    const week = [];

    for (let i = 0; i < 7; i++) {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + i);
        
        const monthDayString = `${date.getMonth() + 1}/${date.getDate()}`; // MM/DD format
        week.push([monthDayString, date]);
    }

    return week;
}

function getNextWeek(currentWeek) {
    return currentWeek.map(([monthDayString, date]) => {
        const nextDate = new Date(date);
        nextDate.setDate(date.getDate() + 7);
        
        const nextMonthDayString = `${nextDate.getMonth() + 1}/${nextDate.getDate()}`;
        return [nextMonthDayString, nextDate];
    });
}

function getPreviousWeek(currentWeek) {
    return currentWeek.map(([monthDayString, date]) => {
        const previousDate = new Date(date);
        previousDate.setDate(date.getDate() - 7);
        
        const prevMonthDayString = `${previousDate.getMonth() + 1}/${previousDate.getDate()}`;
        return [prevMonthDayString, previousDate];
    });
}

function getDateTime(dayObject, minutesFromMidnight) {
    // Clone the day object to avoid modifying the original date
    const targetDate = new Date(dayObject);

    // Calculate hours and minutes from minutesFromMidnight
    const hours = Math.floor(minutesFromMidnight / 60);
    const minutes = minutesFromMidnight % 60;

    // Set the hours and minutes
    targetDate.setHours(hours, minutes, 0, 0);

    return targetDate;
}


export { addQueryHelper, removeQueryHelper, getNextWeek, getPreviousWeek, getCurrentWeek, getDateTime };