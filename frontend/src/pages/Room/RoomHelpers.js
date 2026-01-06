import apiRequest from '../../utils/postRequest';

function minutesToTime(minutes){
    let hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    let end = hours === 12 ? "PM": "AM";
    if(hours > 12){
        hours -= 12;
        end = "PM";
    }
    if(mins === 0){
        return `${hours}${end}`;
    }
    return `${hours}:${mins.toString().padStart(2, '0')} ${end}`;
}

const findChain = (schedule, time) => {
    for(let i=0;i<schedule.length;i++){
        const event = schedule[i];
        if(event.start_time === time){
            return findChain(schedule, event.end_time);
        }
    }
    return time;
};

const findNext = (schedule) => {
    const days = ["M","T","W","R","F"];
    const today = new Date();
    const day = today.getDay();
    const minutes = (today.getHours()*60) + today.getMinutes() + 10;
    // console.log(minutes);

    if(day === 0 || day === 6){
        return { message: "for the day", free: true };
    } else {
        if(schedule[days[day-1]].length === 0 ){
            return{ message: "for the day", free: true };
        }
        let free = true;
        let next = 9999;
        for(let i=0; i<schedule[days[day-1]].length;i++){
            const event = schedule[days[day-1]][i];
            // console.log('time:', minutes, "compare", event.start_time);
            if(event.end_time < minutes){ // passed already
                continue;
            } else if (event.start_time < minutes){ // right now
                free = false;
                next = event.end_time;
                next = findChain(schedule[days[day-1]], next);
                break;
            } else { // in the future
                next = Math.min(next, event.start_time); 
            }
        }
        if(free === true && next === 9999){
            return { message: "for the day", free: true };
        } else if (free === false){
            return { message: `until ${minutesToTime(next)}`, free };
        } else {
            return { message: `until ${minutesToTime(next)}`, free };
        }   
    }
};

const fetchDataHelper = async (id, setLoading, setData, setRoom, navigate, getRoom, setRoomName, newError, setCalendarEmpty, update) => {
    if(!update){
        setRoom(null);
        setLoading(true);
        setData(null);
    }
    if(id === "none"){
        setCalendarEmpty(true);
    } else {
        setCalendarEmpty(false);
    }
    try{
        const data = await getRoom(id);
        setLoading(false);
        setRoom(data.room);
        setRoomName(data.room.name);
        setData(data.data);
        // console.log(data.room);
    } catch (error){
        console.log(error);
        // navigate("/error/500");
        newError(error, navigate);
    }
};

const fetchFreeRoomsHelper = async (setContentState, setCalendarLoading, getFreeRooms, setResults, setNumLoaded, query, newError) => {
    setContentState("calendarSearch")
    setCalendarLoading(true)
    try{
        const roomNames = await getFreeRooms(query);
        setResults(roomNames.sort());
        setNumLoaded(10);
        setCalendarLoading(false);
    } catch (error) {
        console.log(error);
    }
};

const fetchFreeNowHelper = (setContentState, setCalendarLoading, setResults, setNumLoaded, getFreeRooms) => {
    setContentState("freeNowSearch")
    setCalendarLoading(true)
    let nowQuery = {
        'M': [],
        'T': [],
        'W': [],
        'R': [],
        'F': [],
    };
    const days = ["M", "T", "W", "R", "F"];
    const today = new Date();
    const day = today.getDay();
    let hour = today.getHours();
    const minutes = today.getMinutes() + 10;
    if(minutes >= 60){
        hour += 1;
    }
    if(minutes >=30 && minutes < 60){
        hour += 0.5;
    }
    if(day === 0 || day === 6){
        nowQuery['M'] = [{start_time: 0, end_time: 30}];
    } else {
        nowQuery[days[day-1]] = [{start_time: hour*60, end_time: (hour*60)+30}];
    }
    return nowQuery;
}

const fetchSearchHelper = async (query, attributes, sort, setContentState, setCalendarLoading, setResults, setLoadedResults, search, setNumLoaded, navigate, newError, setSearchQuery) => {
    setContentState("nameSearch")
    setCalendarLoading(true)
    setResults([]);
    setLoadedResults([]);
    setNumLoaded(0);
    try{
        const roomNames = await search(query, attributes, sort);
        setResults(roomNames);
        setNumLoaded(10);
        setCalendarLoading(false);
        // console.log(roomNames);
    } catch (error) {
        newError(error, navigate);
    } 
    setSearchQuery(query);
};

const allPurposeFetchHelper = async (allSearch, nameQuery, timeQuery, attributeQuery, sortQuery, setCalendarLoading, setResults, setLoadedResults, setNumLoaded ) => {
    // handle state setting here

    //
    setCalendarLoading(true);
    setResults([]);
    setLoadedResults([]);
    setNumLoaded(0);
    try{
        const roomNames = await allSearch(nameQuery, timeQuery, attributeQuery, sortQuery);
        setResults(roomNames);
        setNumLoaded(10);
        setCalendarLoading(false);
    } catch (error){
        console.error(error);
    }
    
}

// New utility functions that use apiRequest directly
const fetchRoomData = async (id) => {
    try {
        const response = await apiRequest(`/getroom/${id}`, null, { method: 'GET' });
        return response;
    } catch (error) {
        console.error('Error fetching room data:', error);
        throw error;
    }
};

const fetchFreeRoomsDirect = async (query) => {
    try {
        const response = await apiRequest('/free', { query });
        if (!response.success) {
            throw new Error(response.message || 'Failed to fetch free rooms');
        }
        return response.data.filter(room => !room.toLowerCase().includes('alumni'));
    } catch (error) {
        console.error('Error fetching free rooms:', error);
        throw error;
    }
};

const searchRoomsDirect = async (query, attributes, sort) => {
    try {
        const response = await apiRequest('/search', null, {
            method: 'GET',
            params: { query, attributes, sort }
        });
        if (!response.success) {
            throw new Error(response.message || 'Failed to search rooms');
        }
        return response.data;
    } catch (error) {
        console.error('Error searching rooms:', error);
        throw error;
    }
};

const allPurposeSearchDirect = async (nameQuery, timeQuery, attributes, sort) => {
    try {
        const response = await apiRequest('/all-purpose-search', null, {
            method: 'GET',
            params: {
                query: nameQuery,
                timePeriod: timeQuery,
                attributes,
                sort
            }
        });
        if (!response.success) {
            throw new Error(response.message || 'Failed to perform all-purpose search');
        }
        return response.data;
    } catch (error) {
        console.error('Error in all-purpose search:', error);
        throw error;
    }
};

const addQueryHelper = (key, newValue, setNoQuery, setContentState, setQuery) => {
    setNoQuery(false);
    setContentState("calendarSearch");
    setQuery(prev => {
        // Create a list that includes all existing timeslots plus the new one.
        const allSlots = [...prev[key], newValue];

        // Sort timeslots by start time.
        allSlots.sort((a, b) => a.start_time - b.start_time);

        // Merge overlapping or consecutive timeslots.
        const mergedSlots = allSlots.reduce((acc, slot) => {
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

        // Return updated state.
        return { ...prev, [key]: mergedSlots };
    });
};

const removeQueryHelper = (key, value, setQuery, setNoQuery ) => {
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
            setNoQuery(isQueryEmpty);
            return newQuery;
        }
    });
    
    // Check if all keys in the query object have empty arrays and update `noQuery` accordingly.
}

export { 
    findNext, 
    fetchDataHelper, 
    fetchFreeRoomsHelper, 
    fetchFreeNowHelper, 
    fetchSearchHelper, 
    addQueryHelper, 
    removeQueryHelper, 
    allPurposeFetchHelper,
    // New direct API functions
    fetchRoomData,
    fetchFreeRoomsDirect,
    searchRoomsDirect,
    allPurposeSearchDirect
};