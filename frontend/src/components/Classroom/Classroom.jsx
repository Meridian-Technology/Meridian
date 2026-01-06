import React, { useEffect, useState, useRef, useCallback } from 'react';
import './Classroom.scss';
import leftArrow from '../../assets/leftarrow.svg';
import { useNavigate } from 'react-router-dom';
import Bookmark from '../Interface/Bookmark/Bookmark';
import useAuth from '../../hooks/useAuth.js';
import EditAttributes from './EditAttributes/EditAttributes.jsx';
import CheckedIn from './CheckedIn/CheckedIn.jsx';
import Loader from '../Loader/Loader.jsx';
import FileUpload from '../FileUpload/FileUpload.jsx';
import RatingComponent from '../Rating/Rating.jsx';
// import { useWebSocket1 } from '../../WebSocketContext.js';
import Flag from '../Flag/Flag.jsx';
import Popup from '../Popup/Popup.jsx';
import UserRating from './UserRating/UserRating.jsx';
import AllRatings from './AllRatings/AllRatings.jsx';
import RatingGraph from './AllRatings/RatingGraph/RatingGraph.jsx';

import Edit from '../../assets/Icons/Edit.svg';
import Outlets from '../../assets/Icons/Outlets.svg';
import Windows from '../../assets/Icons/Windows.svg';
import Printer from '../../assets/Icons/Printer.svg';
import FilledStar from '../../assets/Icons/FilledStar.svg';
import circleWarning from '../../assets/gray-circle-warning.svg';
import useOutsideClick from '../../hooks/useClickOutside';

import Image from '../../assets/Icons/Image.svg';

import { checkIn, checkOut, getUser, getUsers, userRated, getRatings } from '../../DBInteractions.js';
import { findNext } from '../../pages/Room/RoomHelpers.js';
import { useNotification } from '../../NotificationContext.js';
import { useWebSocket } from '../../WebSocketContext.js';

import '../../pages/Room/Room.scss';

function Classroom({ room, state, setState, schedule, roomName, width, setShowMobileCalendar, setIsUp, reload, urlType }) {
    const [image, setImage] = useState("")
    const { isAuthenticating, isAuthenticated, user } = useAuth();
    const [success, setSuccess] = useState(null);
    const [message, setMessage] = useState("");
    const [defaultImage, setDefaultImage] = useState(false);
    const [fillerHeight, setFillerHeight] = useState(0);
    const [isClassImgOpen, setClassImgOpen] = useState(false);

    const [checkedInUsers, setCheckedInUsers] = useState({});

    const [userRating, setUserRating] = useState(null);

    const [ratings, setRatings] = useState([]);

    const { emit, on, off } = useWebSocket();
    const { addNotification } = useNotification();
    const navigate = useNavigate();

    // Use refs to access latest values in event handlers without causing re-renders
    const roomRef = useRef(room);
    const checkedInUsersRef = useRef(checkedInUsers);

    // Get all users currently checked in
    const getCheckedInUsers = useCallback(async () => {
        try {
            const currentRoom = roomRef.current;
            if (!currentRoom || !currentRoom.checked_in || currentRoom.checked_in.length === 0) {
                setCheckedInUsers({});
                return;
            }
            const users = await getUsers(currentRoom.checked_in);
            const checkedInUsersMap = {};
            users.forEach(user => {
                if (user && user._id) {
                    checkedInUsersMap[user._id] = user;
                }
            });
            setCheckedInUsers(checkedInUsersMap);
        } catch (error) {
            console.error('Error fetching checked-in users:', error);
            addNotification({ 
                title: "Error loading users", 
                message: "Could not load checked-in users", 
                type: "error" 
            });
        }
    }, [addNotification]);

    useEffect(() => {
        roomRef.current = room;
        checkedInUsersRef.current = checkedInUsers;
    }, [room, checkedInUsers]);

    const handleCheckInEvent = useCallback(async (data) => {
        const currentRoom = roomRef.current;
        if (currentRoom && data.classroomId === currentRoom._id) {
            // Update room data first
            await reload();
            // Then update checked-in users list
            const currentCheckedInUsers = checkedInUsersRef.current;
            if (data.userId && !currentCheckedInUsers[data.userId]) {
                try {
                    const newUser = await getUser(data.userId);
                    setCheckedInUsers(prevState => ({
                        ...prevState,
                        [data.userId]: newUser
                    }));
                } catch (error) {
                    console.error('Error fetching new user:', error);
                    // Fallback: reload all checked-in users
                    getCheckedInUsers();
                }
            } else {
                // If user already exists or userId not provided, reload all
                getCheckedInUsers();
            }
        }
    }, [reload, getCheckedInUsers]);

    const handleCheckOutEvent = useCallback(async (data) => {
        const currentRoom = roomRef.current;
        if (currentRoom && data.classroomId === currentRoom._id) {
            // Update room data
            await reload();
            // Remove user from checked-in users list
            if (data.userId) {
                setCheckedInUsers(prevState => {
                    const updated = { ...prevState };
                    delete updated[data.userId];
                    return updated;
                });
            } else {
                // If userId not provided, reload all
                getCheckedInUsers();
            }
        }
    }, [reload, getCheckedInUsers]);

    useEffect(() => {
        if(!room){
            return;
        }
        getRatings(room._id)
            .then((response) => {
                setRatings(response);
            })
            .catch((error) => {
                console.log(error);
            });
    }, [room]);


    // Initialize checked-in users and WebSocket listeners when room changes
    useEffect(() => {
        if (!room || !room._id) {
            return;
        }

        // Load checked-in users
        getCheckedInUsers();

        // Join the room for this classroom via WebSocket
        emit('join-classroom', room._id);

        // Listen for check-in events
        on('check-in', handleCheckInEvent);
        on('check-out', handleCheckOutEvent);

        // Clean up on component unmount or room change
        return () => {
            off('check-in', handleCheckInEvent);
            off('check-out', handleCheckOutEvent);
        };
    }, [room?._id, handleCheckInEvent, handleCheckOutEvent, emit, on, off, getCheckedInUsers]);
    
    useEffect(() => {
        if(!user){
            return;
        }
        if (ratings.find(rating => rating.user_id === user._id)!== undefined) {
            setUserRating(ratings.find(rating => rating.user_id === user._id));
        }    
    }, [ratings, user]);


    // Update checked-in users when room.checked_in changes (from reload or WebSocket)
    useEffect(() => {
        if (room && room.checked_in) {
            // Sync checkedInUsers with room.checked_in
            const currentUserIds = Object.keys(checkedInUsers);
            const roomUserIds = room.checked_in;
            
            // Check if we need to update (if counts differ or IDs don't match)
            const needsUpdate = 
                currentUserIds.length !== roomUserIds.length ||
                roomUserIds.some(id => !checkedInUsers[id]);
            
            if (needsUpdate) {
                getCheckedInUsers();
            }
        }
    }, [room?.checked_in, getCheckedInUsers]);

    const handleImageClick = () => {
        setClassImgOpen(true);
    };

    const closeImage = () => {
        setClassImgOpen(false);
    };

    const ref = useRef();

    useOutsideClick(ref, () => {
        closeImage();
    });

    const checkInRef = useRef(null);
    const [rating, setRating] = useState(0);


    const [edit, setEdit] = useState(false);
    const attributeIcons = {
        "outlets": Outlets,
        "windows": Windows,
        "printer": Printer
    };

    useEffect(() => {
        if (checkInRef.current) {
            setFillerHeight(checkInRef.current.clientHeight + 100);
        }
    }, [checkInRef.current]);

    useEffect(() => {
        setImage("");
    }, [room])

    // Removed auto-checkout logic - users should manually check out

    useEffect(() => {

        if (room === null || room === undefined) {
            return;
        }
        if (room.image === "https://studycompass.s3.amazonaws.com/downsizedPlaceholder.jpeg") {
            setDefaultImage(true);

        }
        setImage(room.image);
    }, [room]);

    // useEffect(() => { console.log(state) }, [state]);
    useEffect(() => {
        setSuccess(schedule ? findNext(schedule.weekly_schedule).free : true);
        setMessage(schedule ? findNext(schedule.weekly_schedule).message : "");
    }, [schedule]);

    const [isRatingPopupOpen, setIsRatingPopupOpen] = useState(false);
    const [isAllRatingsOpen, setIsAllRatingsOpen] = useState(false);

    const handleOpenRatingPopup = () => setIsRatingPopupOpen(true);
    const handleCloseRatingPopup = () => setIsRatingPopupOpen(false);
    const handleOpenAllRatings = () => setIsAllRatingsOpen(true);
    const handleCloseAllRatings = () => setIsAllRatingsOpen(false);

    if (!room) {
        return <Loader />;
    }

    if (room.name === "none" || room.attributes === undefined) {
        return "";
    }

    if (!roomName) {
        return "";
    }

    const backtoResults = () => {
        setState("calendarSearch");
        
        if(urlType !== "embedded"){
            navigate(-1);
        }
    };

    const handleCheckIn = async () => {
        if (!isAuthenticated || !user) {
            addNotification({ 
                title: "Authentication required", 
                message: "Please log in to check in", 
                type: "error" 
            });
            return;
        }

        if (!success) {
            addNotification({ 
                title: "Classroom unavailable", 
                message: "This classroom is currently in use", 
                type: "error" 
            });
            return;
        }

        try {
            await checkIn(room._id);
            // Reload room data to get updated checked_in array
            await reload();
            // Update checked-in users list
            await getCheckedInUsers();
            // Show success notification
            addNotification({ 
                title: "Checked in successfully", 
                message: `You're now checked in to ${roomName}`, 
                type: "success" 
            });
        } catch (error) {
            console.error('Check-in error:', error);
            if (error.response?.status === 400) {
                addNotification({ 
                    title: "Already checked in", 
                    message: "You are already checked in to another classroom. Please check out first.", 
                    type: "error" 
                });
            } else {
                addNotification({ 
                    title: "Check-in failed", 
                    message: "An error occurred while checking in. Please try again.", 
                    type: "error" 
                });
            }
        }
    }

    const handleCheckOut = async () => {
        if (!isAuthenticated || !user) {
            return;
        }

        try {
            await checkOut(room._id);
            // Remove current user from checked-in users list immediately
            setCheckedInUsers(prevState => {
                const updated = { ...prevState };
                delete updated[user._id];
                return updated;
            });
            // Reload room data
            await reload();
            // Show rating popup if user hasn't rated
            if (!userRating) {
                handleOpenRatingPopup();
            }
            // Show success notification
            addNotification({ 
                title: "Checked out successfully", 
                message: `You've checked out of ${roomName}`, 
                type: "success" 
            });
        } catch (error) {
            console.error('Check-out error:', error);
            addNotification({ 
                title: "Check-out failed", 
                message: "An error occurred while checking out. Please try again.", 
                type: "error" 
            });
        }
    }

    // This function is no longer needed - handleCheckInEvent handles user updates

    return (
        <div className={`classroom-component  ${user && room.checked_in.includes(user._id) ? "checked-in" : ""}`}>
            <Popup isOpen={isAllRatingsOpen} onClose={handleCloseAllRatings}>
                {isAllRatingsOpen && <AllRatings average_rating={room.average_rating.toFixed(1)} givenRatings={ratings}/>}
            </Popup>
            <Popup isOpen={isRatingPopupOpen} onClose={handleCloseRatingPopup}>
                <RatingComponent classroomId={room._id} rating={rating} setRating={setRating} name={room.name} reload={reload} />
            </Popup>
            <div className={`whole-page ${isClassImgOpen ? 'in' : 'out'}`}>
                <div className={`img-pop-up ${isClassImgOpen ? 'in' : 'out'}`} ref={ref}>
                    <img src={image} alt="classroom"></img>
                </div>
            </div>
            <div className='z-index'>
                <div className={`image ${image === "" ? "shimmer" : ""}`}>
                    {!(image === "") ?
                        <img src={image} alt="classroom" className={`${isClassImgOpen ? 'out' : 'in'}`}></img>
                        : ""}
                    {
                        (room.image !== "https://studycompass.s3.amazonaws.com/downsizedPlaceholder.jpeg") &&
                        <div className={`open-image ${isClassImgOpen ? 'out' : 'in'}`} onClick={handleImageClick}>
                            <img src={Image} alt="open image" />
                            <p>View</p>
                        </div>
                    }
                </div>

                <div className="classroom-info">
                    {state === "calendarSearchResult" ? <div className="back-to-results" onClick={backtoResults}>
                        <img src={leftArrow} alt="back arrow" ></img>
                        <p>back to results</p>
                    </div> : ""}
                    <div className="header-row">
                        <h1>{roomName}</h1>
                        <div className="bookmark-container">
                            <Bookmark room={room} />
                        </div>
                    </div>

                    <div className="info-row">
                        <div className="rating">
                            <img src={FilledStar} alt="star" />
                            <p>{room.average_rating.toFixed(1)}</p>
                        </div>
                        <div className="rating-num" onClick={handleOpenAllRatings}>
                            {room.number_of_ratings === 1 ? <p>{room.number_of_ratings} rating</p> : <p>{room.number_of_ratings} ratings</p>}
                        </div>
                        {isAuthenticated && userRating === null &&
                            <button className="add-rating" onClick={handleOpenRatingPopup}>
                                <p>add your rating</p>
                            </button>
                        }
                    </div>

                    <div className="attributes">
                        {room && room.attributes.map((attribute, index) => {
                            return (
                                <div className="attribute" key={index}>
                                    {attribute in attributeIcons ? <img src={attributeIcons[attribute]} alt={attribute} /> : ""}
                                    {attribute}
                                </div>
                            );
                        })}
                        {user && user.roles.includes("admin") ? <div className="attribute" onClick={() => { setEdit(!edit) }}><img src={Edit} alt="" /></div> : ""}
                    </div>
                    {userRating && <UserRating rating={userRating} />}
                    {
                        defaultImage && (!isAuthenticating) && isAuthenticated && user.roles.includes('admin') ? <FileUpload classroomName={room.name} /> : ""
                    }
                    <div>
                        <Flag functions={setIsUp} primary={"rgba(176, 175, 175, .13)"} img={circleWarning} accent={"#D9D9D9"} color={"#737373"} text={"As Study Compass is still in beta, certain information may be incorrect. Reporting incorrect information is an important part of our troubleshooting process, so please help us out!"} />
                    </div>
                    {/* <button onClick={handleOpenAllRatings}>
                        see all ratings
                    </button> */}
                    <div className="ratings-preview">
                        <div className="ratings-header">
                            <h2>Review Summary</h2>
                            <button onClick={handleOpenAllRatings}>see all reviews</button>
                        </div>
                        <RatingGraph ratings={ratings} average_rating={room.average_rating.toFixed(1)}/>
                        {
                            ratings.length > 0 ?
                            <UserRating rating={ratings[0]} providedUser={ratings[0].user_info} />
                            : ""
                        }
                        {isAuthenticated && userRating === null &&
                            <button onClick={handleOpenRatingPopup}>
                                add your review
                            </button>
                        }
                    </div>
                    <div className="filler" style={{ height: `${fillerHeight}px` }}>

                    </div>
                </div>
                {user && user.roles.includes('admin') ? room ? edit ? <EditAttributes room={room} attributes={room.attributes} setEdit={setEdit} /> : "" : "" : ""}
                <div className="check-in" ref={checkInRef}>
                    <div className={`${success ? 'free-until' : 'class-until'}`}>
                        <div className="dot">
                            <div className="outer-dot"></div>
                            <div className="inner-dot"></div>
                        </div>
                        {success ? "free" : "class in session"} {message}
                    </div>
                    {room && room.checked_in && room.checked_in.length > 0 &&
                        <CheckedIn users={Object.values(checkedInUsers)} />
                    }
                    <div className="button-container">
                        {width < 800 && <button className="schedule-button" onClick={() => { setShowMobileCalendar(true) }}>view-schedule</button>}
                        {
                            user && room.checked_in.includes(user._id) ?
                                <button className="out" onClick={handleCheckOut}>check out</button>
                                :
                                <button disabled={!success || !isAuthenticated} className="check-in-button" onClick={handleCheckIn}>check in</button>
                        }
                    </div>
                </div>
            </div >
        </div >
    );
}

export default Classroom;
