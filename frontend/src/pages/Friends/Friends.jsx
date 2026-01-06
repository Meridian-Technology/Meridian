import React, { useState, useEffect, useRef } from 'react';
import './Friends.scss';
import { useNavigate } from 'react-router-dom';
import useAuth from '../../hooks/useAuth.js';
import Header from '../../components/Header/Header.jsx';
import pfp from '../../assets/defaultAvatar.svg'
import Friend from './Friend/Friend.jsx';
import AddFriend from '../../assets/Icons/Add-Friend.svg';
import { getFriends, sendFriendRequest, updateFriendRequest, getFriendRequests, debounceUserSearch } from './FriendsHelpers.js';
import { useNotification } from '../../NotificationContext.js';
import FriendRequest from './FriendRequest/FriendRequest.jsx';
import FriendGradient from '../../assets/FriendGrad.png';
import useClickOutside from '../../hooks/useClickOutside.js';
import useOutsideClick from '../../hooks/useClickOutside.js';
import EventsGrad from '../../assets/Gradients/EventsGrad.png';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';

function Friends() {
    const { isAuthenticated, isAuthenticating, user, checkedIn } = useAuth();
    const navigate = useNavigate();
    const [addValue, setAddValue] = useState("");
    const [contentState, setContentState] = useState('friends');
    const [friends, setFriends] = useState([]);
    const [friendRequests, setFriendRequests] = useState([]);
    const [reload, setReload] = useState(0);

    const [results, setResults] = useState([]);
    const [showSearch, setShowSearch] = useState(false);

    const wrapperRef = useRef(null);
    
    const { addNotification } = useNotification();

    useEffect(() => {
        console.log(isAuthenticating);
        if(isAuthenticating){
            return;
        }
        if (!isAuthenticated) {
            navigate('/login');
        }
    }, [isAuthenticating, isAuthenticated, navigate]);

    useEffect(() => {
        const fetchFriends = async () => {
            try{
                const result = await getFriends();
                setFriends(result);
            } catch (error){
                console.error('Error fetching friends:', error);
                if(error.response.status === 403){
                    navigate('/login');
                }
            }
        }
        const fetchFriendRequests = async () => { 
            try{
                const result = await getFriendRequests();
                console.log(result);
                setFriendRequests(result);
            } catch (error){
                console.error('Error fetching friend requests:', error);
                if(error.response.status === 403){
                    navigate('/login');
                }
            }
        }

        if(isAuthenticated){
            fetchFriends();
            fetchFriendRequests();
        }
    }, [isAuthenticated, reload]);

    useEffect(() => {
        const search = async () => {
            if(addValue.length > 0){
                const result = debounceUserSearch(addValue, setResults);
                // console.log(result);
            } else {
                setResults([]);
            }
        }
        search();
    },[addValue]);

    const handleAddChange = (e) => {
        setAddValue(e.target.value);
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        // const result = await sendFriendRequest(addValue.slice(1));
        // console.log(result);
        // setReload(reload + 1);
        // if(result === 'Friend request sent'){
        //     addNotification({title: 'Friend request sent', message: 'Friend request sent successfully', type: 'success'});
        //     setAddValue('');
        //     return;
        // }
        // if(result === 'User not found'){
        //     addNotification({title: 'User not found', message: 'We could not find a user with that username', type: 'error'});
        // } else {
        //     addNotification({title: 'Error sending friend request', message: result, type: 'error'});
        // }
        // setAddValue('');
    }

    const handleFriendRequest = async (friendUsername) => {
        console.log(friendUsername);
        const result = await sendFriendRequest(friendUsername);
        console.log(result);
        setReload(reload + 1);
        if(result === 'Friend request sent'){
            addNotification({title: 'Friend request sent', message: 'Friend request sent successfully', type: 'success'});
            return;
        }
        if(result === 'User not found'){
            addNotification({title: 'User not found', message: 'We could not find a user with that username', type: 'error'});
        } else {
            addNotification({title: 'Error sending friend request', message: result, type: 'error'});
        }
    }

    useOutsideClick(wrapperRef, () => {
        setShowSearch(false);
    }, ['add-friend-icon', 'add-friend', 'friends-results']);


    const [viewport, setViewport] = useState("100vh");
    useEffect(() => {
        let height = window.innerHeight;
        if(checkedIn!==null){
            height -= 20;
        }
        setViewport(height);
    },[checkedIn]);

    const handlePending = () =>{
        console.log('pending');
        setContentState(contentState === 'pending' ? 'friends' : 'pending');
    };

    const handleShowSearch = () => {    
        setShowSearch(!showSearch);
    }

    return (
        
        <div className="friends dash" style={{height: viewport}}>
            <div className={`dark-overlay ${showSearch ? "active" : ""}`}></div>
            <header className="header">
                <img src={EventsGrad} alt="" />
                <h1>Friends</h1>
                <p>Find and connect with your friends</p>
            </header>
            { user && isAuthenticated &&
                <>
                    <div className="friends-container">
                        <div className="friends-content">
                            <div className="user">
                                <div className="profile-picture">
                                    <img src={user.picture || pfp} alt="" />
                                </div>
                                <div className="user-content">
                                    <h1>{user.name}</h1>
                                    <p>@{user.username}</p>
                                </div>
                            </div>
                            <form className={`add-friend ${showSearch ? "active" : ""}`} onSubmit={handleSubmit} ref={wrapperRef}>
                                <input type="text" placeholder="add a friend by username" value={addValue} onChange={handleAddChange} onFocus={handleShowSearch}/>
                                <div className="add-friend-icon">
                                    <img src={AddFriend} alt=""/>
                                </div>
                                <div className={`friends-results ${showSearch ? "active" : ""}`}>
                                    {
                                        results.map(user => {
                                            return <div onClick={()=>{handleFriendRequest(user.username)}} key={user._id}>
                                                <Friend friend={user} isFriendRequest={true} reload={reload} setReload={setReload}/>
                                            </div>

                                        })
                                    }
                                </div>
                            </form>

                            <div className="friends-list">
                                <div className="friends-list-header">
                                    <h2>friends</h2>
                                    <div className="pending" onClick={handlePending}>
                                        <p className={`no-select ${contentState === 'pending' ? "active" : ""}`}>pending</p>
                                        {
                                            friendRequests.length > 0 &&
                                            <div className="pending-count">
                                                <p>{friendRequests.length}</p>
                                            </div>
                                        }
                                    </div>
                                </div>
                                <div className={`content-container  ${contentState === 'pending' ? "left-staging" : ""}`}>
                                    <div className={`content`} >
                                        {
                                            friends.map(friend => {
                                                return <Friend friend={friend} key={friend._id} isFriendRequest={false} reload={reload} setReload={setReload}/>
                                            })
                                        }
                                        {
                                            friends.length === 0 &&
                                            <div className="no-requests">
                                                <p>no friends yet, get out there!</p>
                                            </div>
                                        }
                                    </div>
                                    <div className={`content pending`} >
                                        {
                                            friendRequests.map(friend => {
                                                return <FriendRequest friendRequest={friend} reload={reload} setReload={setReload}/>
                                            })
                                        }
                                        {
                                            friendRequests.length === 0 &&
                                            <div className="no-requests">
                                                <p>no pending requests</p>
                                            </div>
                                        }
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            }
        </div>
    );
}

export default Friends;