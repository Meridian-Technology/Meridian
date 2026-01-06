import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Calendar from '../../components/CalendarComponents/Calendar/Calendar.jsx';
import './Room.scss';
import Header from '../../components/Header/Header.jsx';
import SearchBar from '../../components/SearchBar/SearchBar.jsx';
import useAuth from '../../hooks/useAuth.js';
import { useCache } from '../../CacheContext.js';
import { useError } from '../../ErrorContext.js'; 
import Classroom from '../../components/Classroom/Classroom.jsx';
import MobileCalendar from '../../components/CalendarComponents/MobileCalendar/MobileCalendar.jsx';
import { findNext, fetchDataHelper, fetchFreeRoomsHelper, fetchFreeNowHelper, fetchSearchHelper, addQueryHelper, removeQueryHelper , allPurposeFetchHelper} from "./RoomHelpers.js";
import Results from '../../components/Results/Results.jsx';
import Sort from '../../components/Sort/Sort.jsx';
import Footer from '../../components/Footer/Footer.jsx';
import Recommended from '../../components/Recommended/Recommended.jsx';
import Banner from '../../components/Banner/Banner.jsx';
import Report from '../../components/Report/Report.jsx';
import { useProfileCreation } from '../../ProfileCreationContext';
import { getRecommendation } from '../../DBInteractions.js';

import chevronUp from '../../assets/chevronup.svg';
import SortIcon from '../../assets/Icons/Sort.svg';
import Github from '../../assets/Icons/Github.svg';


import { debounce} from '../../Query.js';
import ProfilePicture from '../../components/ProfilePicture/ProfilePicture.jsx';
import { set } from 'mongoose';

/** 
documentation:
https://incongruous-reply-44a.notion.site/Frontend-Room-Page-667531d41a284511bb64681e09ee702a
*/

/*
STATES
contentState: "empty", "classroom", "calendarSearch" , "calendarSearchResult", "nameSearch" , "freeNowSearch" 
*/ 

function Room({hideHeader = false, urlType = 'embedded'}) {
    //get search params
    let { roomid } = useParams();
    let navigate = useNavigate();
    
    // Handle embedded mode - if no roomid from params, set to "none"
    if (urlType === 'embedded' && !roomid) {
        roomid = "none";
    }
    
    const [room, setRoom] = useState(null);
    const [roomName, setRoomName] = useState(null);
    const [rooms, setRooms] = useState(null);
    const [roomIds, setRoomIds] = useState({});
    const [ready, setReady] = useState(false);
    const { isAuthenticated, isAuthenticating, user, checkedIn } = useAuth();
    const { getRooms, getRoomUpdate, getFreeRooms, getRoom, getBatch, search, allSearch } = useCache();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [calendarLoading, setCalendarLoading] = useState(true);

    const [freeNow, setFreeNow] = useState(false);

    const [contentState, setContentState] = useState("empty")

    const [results, setResults] = useState([]);
    const [numLoaded, setNumLoaded] = useState(0);
    const [loadedResults, setLoadedResults] = useState([]);
    const [query, setQuery] = useState({'M': [],'T': [],'W': [],'R': [],'F': [],});
    const [noquery, setNoQuery] = useState(true);

    const [searchQuery, setSearchQuery] = useState(""); // for search bar
    const [searchAttributes, setSearchAttributes] = useState([]);
    const [searchSort, setSearchSort] = useState("name"); 

    const [searchFocus, setSearchFocus] = useState(false);
    const [showFilter, setShowFilter] = useState(false);

    const [calendarEmpty, setCalendarEmpty] = useState(false);

    const [bannerVisible, setBannerVisible] = useState(false);
    const [reportIsUp, setReportIsUp] = useState(false);  

    const [recommendedRoom, setRecommendedRoom] = useState(null);

    const { handleOpen } = useProfileCreation();

    function clearQuery(){ setQuery({'M': [],'T': [],'W': [],'R': [],'F': [],});
        setNoQuery(true);
    }

    const { newError } = useError();

    const [width, setWidth] = useState(window.innerWidth);

    const fetchData = async (id) => fetchDataHelper(id, setLoading, setData, setRoom, navigate, getRoom, setRoomName, newError, setCalendarEmpty, false);
    const fetchDataUpdate = async (id) => fetchDataHelper(id, setLoading, setData, setRoom, navigate, getRoomUpdate, setRoomName, newError, setCalendarEmpty, true);
    const fetchFreeRooms = async () => fetchFreeRoomsHelper(setContentState, setCalendarLoading, getFreeRooms, setResults, setNumLoaded, query, newError);
    const debouncedFetchData = debounce(fetchData, 500); // Adjust delay as needed
    const fetchFreeNow = () => fetchFreeNowHelper(setContentState, setCalendarLoading, setResults, setNumLoaded, getFreeRooms);
    const fetchSearch = async (query, attributes, sort) => fetchSearchHelper(query, attributes, sort, setContentState, setCalendarLoading, setResults, setLoadedResults, search, setNumLoaded, navigate, newError, setSearchQuery);
    const addQuery = (key, newValue) => addQueryHelper(key, newValue, setNoQuery, setContentState, setQuery);
    const removeQuery = (key, value) => removeQueryHelper(key, value, setQuery, setNoQuery);
    const allPurposeSearch = async () => allPurposeFetchHelper(allSearch, searchQuery, query, searchAttributes, searchSort, setCalendarLoading, setResults, setLoadedResults, setNumLoaded);
    const allPurposeFreeNow = async (query1) => allPurposeFetchHelper(allSearch, searchQuery, query1, searchAttributes, searchSort, setCalendarLoading, setResults, setLoadedResults, setNumLoaded);
    const debouncedAllPurposeSearch = useCallback(debounce(allPurposeSearch, 500), [searchQuery, searchAttributes, searchSort, query]);

//=========================================== UI LOGIC =====================================================================================================

    useEffect(() => { //useEffect for window resizing
      function handleResize() {
        setWidth(window.innerWidth);
      }
      window.addEventListener('resize', handleResize);


      return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(()=>{
        if(contentState === "calendarSearch" || contentState === "freeNowSearch"){
            return;
        }
        
        // In embedded mode, check if we have a roomid from URL parameters
        if (urlType === 'embedded') {
            // Check if roomid is provided via URL parameters (for EventsDash integration)
            const urlParams = new URLSearchParams(window.location.search);
            const urlRoomId = urlParams.get('roomid');
            
            if (urlRoomId && urlRoomId !== "none") {
                // We have a roomid from URL, use it
                roomid = decodeURIComponent(urlRoomId);
                setContentState("classroom");
                return;
            }
            
            if(roomid === "none"){
                setContentState("empty");
                setSearchQuery("");
                fetchData("none");
                return;
            }
            return;
        }
        
        const searchParams = new URLSearchParams(window.location.search);
        const searchQuery = searchParams.get('query');
        if(searchQuery){
            setContentState("nameSearch");
            return;
        }
        if(roomid === "none"){
            setContentState("empty");
            setSearchQuery("");
            fetchData("none");
            return;
        }

    },[roomid]);

    function changeURL(option) {
        // Check if the room exists in roomIds
        if (roomIds[option] === undefined) {
            // Room not found, trigger a search instead
            onSearch(option, [], "name");
            return;
        }
        
        if (urlType === 'embedded') {
            // In embedded mode, just update internal state without navigation
            fetchData(roomIds[option]);
            setContentState("calendarSearchResult");
        } else {
            navigate(`/room/${encodeURI(option)}`);
            fetchData(roomIds[option]);
            setContentState("calendarSearchResult");
        }
    }

    function changeURL2(option) {
        // Check if the room exists in roomIds
        if (roomIds[option] === undefined) {
            // Room not found, trigger a search instead
            onSearch(option, [], "name");
            return;
        }
        
        if (urlType === 'embedded') {
            // In embedded mode, just update internal state without navigation
            fetchData(roomIds[option]);
            setContentState("classroom");
        } else {
            navigate(`/room/${encodeURI(option)}`);
            fetchData(roomIds[option]);
            setContentState("classroom");
        }
    }

    function onX(){ //make a reset function soon
        setContentState('empty');
        fetchData('none');
        setResults([]);
        clearQuery();
        setLoadedResults([]);
        setFreeNow(false);
        setSearchQuery(''); // Clear search query
        setSearchAttributes([]); // Clear search attributes
        setSearchSort('name'); // Reset search sort to default
    }

    function setReportUp(){
        if (!isAuthenticated) {
            handleOpen();
        }
        else{
            setReportIsUp(!reportIsUp);
        }
    }

    useEffect(()=>{
        if(contentState === "empty"){
            setNumLoaded(0);
            setLoadedResults([]);
        }
    },[contentState]);

        
    const [showMobileCalendar, setShowMobileCalendar] = useState(false);

    const [viewport, setViewport] = useState("100vh");
    useEffect(() => {
        let height = window.innerHeight;
        if(checkedIn!==null && !hideHeader){
            height -= 20;
        }
        if(!isAuthenticated && !isAuthenticating && !hideHeader){
            height -= 20;
            setViewport(height + 'px');
        }
        
        setViewport(height + 'px');

        //add listener
    },[checkedIn, isAuthenticated, isAuthenticating]);


//==========================================================================================================================================================



//=========================================== FETCHING LOGIC ===============================================================================================

    useEffect(() => { // FETCH ROOM DATA , triggers on url change
        if(isAuthenticating){
            return;
        }
        if(isAuthenticated){
            if(user.onboarded === false){
                if (urlType === 'embedded') {
                    // In embedded mode, we can't navigate away, so just return
                    return;
                } else {
                    navigate('/events-dashboard');
                }
            }
        }
        if(!roomIds){
            return;
        }
        
        // In embedded mode, check for roomid from URL parameters
        if (urlType === 'embedded') {
            // Check if roomid is provided via URL parameters (for EventsDash integration)
            const urlParams = new URLSearchParams(window.location.search);
            const urlRoomId = urlParams.get('roomid');
            
            if (urlRoomId && urlRoomId !== "none") {
                // We have a roomid from URL, decode it and use it
                const decodedRoomId = decodeURIComponent(urlRoomId);
                
                // Check if this room exists in our roomIds mapping
                if (roomIds[decodedRoomId] === undefined) {
                    // Room not found, show empty state
                    setContentState("empty");
                    fetchData("none");
                    return;
                }
                
                // Room found, fetch its data
                fetchData(roomIds[decodedRoomId]);
                setContentState("classroom");
                clearQuery();
                return;
            }
            
            // No URL roomid, use the roomid from props
            if(roomIds[roomid] === undefined && roomid !== "none"){
                return;
            }
            if(roomid === "none"){
                setContentState("empty");
                fetchData("none");
                return;
            }
            if(contentState === "calendarSearchResult"){
                fetchData(roomIds[roomid]);
            } else {
                fetchData(roomIds[roomid]);
                setContentState("classroom");
                clearQuery();
            }
            return;
        }
        
        // Handle URL-based navigation for non-embedded mode
        const searchParams = new URLSearchParams(window.location.search);
        const searchQueryParams = searchParams.get('query');
        const attributes = searchParams.get('attributes') ? JSON.parse(searchParams.get('attributes')) : null;
        const sort = searchParams.get('sort');
        if(searchQueryParams){
            if(!ready){
                return;
            }
            console.log("hello");
            setSearchAttributes(attributes);
            setSearchSort(sort); 
            setSearchQuery(searchQueryParams);   
            setContentState("nameSearch");
            fetchData("none");

        } else {
            if(roomIds[roomid] === undefined && roomid !== "none"){
                return;
            }
            if(roomid === "none"){
                setContentState("empty");
                fetchData("none");
                return;
            }
            if(contentState === "calendarSearchResult"){
                fetchData(roomIds[roomid]);
            } else {
                fetchData(roomIds[roomid]);
                setContentState("classroom");
                clearQuery();
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthenticated, isAuthenticating, roomIds]);

    function onSearch(query, attributes, sort){
        if (urlType === 'embedded') {
            // In embedded mode, just update internal state without navigation
            setSearchAttributes(attributes);
            setSearchSort(sort);
            setSearchQuery(query);
        } else {
            const queryString = new URLSearchParams({ query, attributes: JSON.stringify(attributes), sort }).toString();
            navigate(`/room/search?${queryString}`, { replace: true });        
            setSearchAttributes(attributes);
            setSearchSort(sort);
            setSearchQuery(query);
        }
    }

    function reloadClassroom(){
        // Validate room ID before reloading
        const roomIdToReload = room?._id || roomIds[roomid];
        if (!roomIdToReload || roomIdToReload === undefined) {
            console.error("Cannot reload classroom: room ID is undefined", { roomid, roomIds, room });
            return;
        }
        fetchDataUpdate(roomIdToReload);
        setContentState("classroom");
        clearQuery();
    }

    useEffect(() => {
        if(isAuthenticating){
            return;
        }
        // if(searchQuery === ""){
        //     return;
        // }
        if(noquery && searchQuery === "" && searchAttributes.length === 0 && contentState !== "classroom"){
            setContentState("empty");
            return;
        }
        // In embedded mode, if we have a search query, set content state to nameSearch
        if (urlType === 'embedded' && searchQuery && searchQuery !== "" && contentState !== "classroom") {
            setContentState("nameSearch");
        }
        allPurposeSearch();
    }, [searchQuery, searchAttributes, searchSort, query]);

    useEffect(()=>{console.log(data)},[data])

    
    useEffect(() => { 
        // if query is changed and noquery is true, set contentstate to empty unless query cleaered using classroom
        // if ((noquery === true && contentState === "calendarSearchResult") || roomid === "none") {
        //     setContentState("empty");
        // } else if(contentState !== "classroom"){ 
        //     setContentState("calendarSearch");  
        // }
     // eslint-disable-next-line react-hooks/exhaustive-deps
     console.log(query);
    }, [query])

    useEffect(() => {
        const getRecommendationData = async () => {
            
            try{
                const recommendation = await getRecommendation();
                setRecommendedRoom(recommendation.data);
            } catch (error){
                console.log(error);
            }
        }

        getRecommendationData();

        const newBadgeRedirect = localStorage.getItem('badge');
        if(newBadgeRedirect){
            if (urlType === 'embedded') {
                // In embedded mode, we can't navigate away, so just clear the badge
                localStorage.removeItem('badge');
            } else {
                navigate(newBadgeRedirect);
                localStorage.removeItem('badge');
            }
        }

    },[]);


//=========================================== DONT TOUCH HERE ===============================================================================================
    

    useEffect(() => { //useEffect fetch all room names
        const fetchRooms = async () => {
            try{
                const rooms = await getRooms();
                setRooms(Object.keys(rooms).sort());
                setRoomIds(rooms);
                setReady(true);
            } catch (error){
                console.log(error);
                const fetchError = {
                    message: "Failed to fetch rooms list, likely due to proxy error. Please try again later.",
                    status: 500,
                }
                newError(fetchError, navigate);
            }
        };
        fetchRooms();
    }, []);

    useEffect(()=>{ // don't touch logic here
        const updateLoadedResults = async ()=>{
            if(numLoaded === 0){
                setLoadedResults([]);
            }
            try{
                let batchResults = await getBatch(results.slice(loadedResults.length, Math.min(numLoaded, results.length)).map(room => roomIds[room]));
                let newResults = [...loadedResults, ...batchResults];
                setLoadedResults(newResults);
            } catch(error){
                console.log(error);
                newError(error, navigate);
            }
        };
        updateLoadedResults();
    },[numLoaded]);

    const handleFreeNow = async () => {
        if(freeNow){
            setFreeNow(false);
            return;   
        }
        const query = fetchFreeNow();
        allPurposeFreeNow(query);
        setFreeNow(true);
    }

    const handleFreeNow1 = () => {
        //if weekend
        if(new Date().getDay() === 0 || new Date().getDay() === 6){
            handleFreeNow();
            return;
        }
        if(freeNow){
            setFreeNow(false);
            //remove query
            clearQuery();
            setContentState("empty");
            return;
        }
        const now = new Date();
        const day = now.getDay();
        let startTime = (now.getHours() * 60) + now.getMinutes() + 10;
        //round down to nearest 30 minutes
        startTime = Math.floor(startTime / 30) * 30;
        let endTime = startTime + 30;
        const timePeriod = {
            class_name: "search",
            start_time: startTime,
            end_time: endTime,
        }
        const query = { 'M': [], 'T': [], 'W': [], 'R': [], 'F': [] };
        query[["M", "T", "W", "R", "F"][day - 1]].push(timePeriod);
        addQuery(["M", "T", "W", "R", "F"][day - 1], timePeriod);
        setContentState("freeNowSearch");
    }

//==========================================================================================================================================================

    return (    
        <div className={`room ${hideHeader ? "hide-header" : ""}`} style={{ height: viewport }}>
            {/* <Banner visible={bannerVisible} setVisible={setBannerVisible}/> */}
            <Report text={roomName} isUp={reportIsUp} setIsUp={setReportUp}/>
            {hideHeader ? "" : <Header />}
            <div className="content-container" 
            style={{height: width < 800 ? "calc(100% - 20px)" : hideHeader ? "max(100% - 10px)" : bannerVisible ? "max(100% - 135px)":  "max(100% - 115px)", maxHeight:width < 800 ? "calc(100% - 20px)" : hideHeader ? "max(100% - 10px)" : bannerVisible ? "max(100% - 135px)":  "max(100% - 115px)"}}>
                <div className="calendar-container">
                    <div className={width < 800 ? "left-mobile" : "left"}>
                        {ready && contentState !== "classroom" && 
                            <Recommended 
                                id={recommendedRoom ? recommendedRoom._id : null}
                                debouncedFetchData={debouncedFetchData}
                                changeURLHelper={changeURL2}
                                findNext={findNext}
                                contentState={contentState}
                                setContentState={setContentState}
                                hide={searchFocus || contentState !== "empty"}
                                givenRoom={recommendedRoom}
                            />
                        }
                        <SearchBar data={rooms} addQuery={addQuery} onEnter={changeURL2} room={contentState === "classroom" || contentState === "calendarSearchResult" ? roomName : searchQuery } onX={onX} onSearch={onSearch} query={searchQuery} onBlur={setSearchFocus} urlType={urlType} />
                        {contentState === "classroom" || contentState === "calendarSearchResult"  ? 
                            <Classroom  
                                room={room} 
                                state={contentState} 
                                setState={setContentState}
                                schedule={data}
                                roomName={roomName}
                                width={width}
                                setShowMobileCalendar={setShowMobileCalendar}
                                setIsUp={setReportUp}
                                reload={reloadClassroom}
                                urlType={urlType}
                            /> 
                        : ""}
                        {/* {contentState !== "classroom" &&

                        } */}
                        {contentState === "calendarSearch" || contentState === "freeNowSearch" || contentState === "nameSearch" ? calendarLoading ? "" : 
                            <div className="resultsCountContainer">
                                <h1 className="resultCount">{results.length} results {contentState === "nameSearch" ? searchQuery ? `for "${searchQuery.slice(0,width < 800 ? 8:15)}${searchQuery.length>(width < 800 ? 8:15) ? "..." : ""}"` : "" : ""}</h1> 
                                {/* <img src={SortIcon} alt="sort" onClick={()=>{setShowFilter(!showFilter)}}/> */}
                            </div>
                        : ""}
                        { (contentState !== "classroom" )? 
                            <Sort
                                query={searchQuery}
                                searchAttributes={searchAttributes}
                                setSearchAttributes={setSearchAttributes}   
                                searchSort={searchSort}
                                setSearchSort={setSearchSort}
                                onSearch={onSearch}
                                handleFreeNow={handleFreeNow1}
                                contentState={contentState}
                                freeNow={freeNow}
                                setFreeNow={setFreeNow}
                            /> 
                        : ""}
                        {contentState === "calendarSearch" || contentState === "freeNowSearch" || contentState === "nameSearch" ? 
                            <Results 
                                results={results}
                                loadedResults={loadedResults}
                                numLoaded={numLoaded}
                                setNumLoaded={setNumLoaded}
                                debouncedFetchData={debouncedFetchData}
                                contentState={contentState}
                                changeURL={changeURL}
                                findNext={findNext}
                                calendarLoading={calendarLoading}
                            />: ""
                        }
                        { contentState === "empty" ? <div className="instruction">
                            <p>try searching for specific classroom like <span className="example">dcc 318</span> or a building like <span className="example">low</span></p>
                            
                        </div> : ""}

                    </div>
                    {width < 800 || viewport < 700? (
                        <div className={`calendar-content-container ${showMobileCalendar ? "active" : ""}`}>
                            <MobileCalendar className={"s"} data={data} isloading={loading} addQuery={addQuery} removeQuery={removeQuery} query={query} show={showMobileCalendar} setShow={setShowMobileCalendar} />
                        </div>
                        
                    ) : (
                        <div className="right">
                            <div className={`calendar-instruction ${(contentState === "empty" && calendarEmpty) ? "visible": ""}`}>select a timeslot</div>
                            <Calendar className={room ? room.name ? room.name : "none": ""} data={data} isloading={loading} addQuery={addQuery} removeQuery={removeQuery} query={query} />
                        </div>
                    )}
                    {/* {width < 800 || viewport < 700 ? contentState === "calendarSearchResult" || contentState === "classroom" ? <button className="show-calendar" onClick={() => { setShowMobileCalendar(true) }}> <img src={chevronUp} alt="show schedule" /> </button> : "" : ""} */}
                </div>
            </div>
            {
                width > 800 && !hideHeader ? 
                    <Footer/>
                : ""
            }
        </div>
    );
}

export default Room;