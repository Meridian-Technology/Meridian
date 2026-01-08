import './MyEvents.scss';
import EventsGrad from '../../../assets/Gradients/EventsGrad.png';
import useAuth from '../../../hooks/useAuth';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import { getFriends } from '../../../pages/Friends/FriendsHelpers.js';
import Search from '../../../components/Search/Search';
import { useFetch } from '../../../hooks/useFetch';
import { useNotification } from '../../../NotificationContext';
import HeaderContainer from '../../../components/HeaderContainer/HeaderContainer';

import RecommendedEvents from './RecommendedEvents/RecommendedEvents';
import MyEventsContent from './MyEventsContent/MyEventsContent';
import RecommendedRoomCard from '../../../components/RecommendedRoomCard/RecommendedRoomCard';
import RecommendedEventPreviewCard from './RecommendedEvents/RecommendedEventPreviewCard/RecommendedEventPreviewCard';

function MyEvents({ onRoomNavigation }){
    //define welcometext to be either good morning, good afternoon, or good evening, in one line
    const welcomeText = `Good ${new Date().getHours() < 12 ? "Morning" : new Date().getHours() < 18 ? "Afternoon" : "Evening"}`;
    const { user, isAuthenticated } = useAuth();
    const navigate = useNavigate();
    const { addNotification } = useNotification();
    const [friends, setFriends] = useState([]);
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const [searching, setSearching] = useState(false);

    // Fetch featured content for all users
    const { data: featuredResponse, loading: featuredLoading, error: featuredError } = useFetch('/featured-all');

    useEffect(()=>{
        console.log(featuredResponse);
    },[featuredResponse])
    
    const featuredEvents = featuredResponse?.data?.events || [];
    const featuredRooms = featuredResponse?.data?.rooms || [];

    // Customize search types for MyEvents - focus on events and organizations
    const myEventsSearchTypes = [
        { key: 'events', label: 'Events', icon: 'mingcute:calendar-fill', enabled: true },
        // { key: 'organizations', label: 'Organizations', icon: 'mingcute:group-2-fill', enabled: true },
        { key: 'rooms', label: 'Rooms', icon: 'mingcute:building-fill', enabled: true },
        { key: 'users', label: 'Users', icon: 'mingcute:user-fill', enabled: isAuthenticated } // Only show users if authenticated
    ];

    // Custom navigation handlers
    const navigationHandlers = {
        rooms: onRoomNavigation || ((room) => navigate(`/room/${room._id}`)), // Use custom handler or fallback to default
        events: (event) => navigate(`/event/${event._id}`),
        organizations: (org) => navigate(`/org/${org.org_name}`),
        users: (user) => navigate(`/profile/${user.username}`)
    };

    useEffect(() => {
        const fetchFriends = async () => {
            if (isAuthenticated) {
                try {
                    const result = await getFriends();
                    setFriends(result);
                } catch (error) {
                    console.error('Error fetching friends:', error);
                }
            }
        };
        
        fetchFriends();
    }, [isAuthenticated]);

    const handleAddFriends = () => {
        navigate('/events-dashboard?page=3');
    };

    const handleSearchFocus = () => {
        setIsSearchFocused(true);
    };

    const handleSearchBlur = () => {
        setIsSearchFocused(false);
    };

    // Handle navigation to different sections
    const handleNavigateToEvents = () => {
        navigate('/events-dashboard?page=1'); // Navigate to Explore tab
    };

    const handleNavigateToRooms = () => {
        navigate('/events-dashboard?page=2'); // Navigate to Rooms tab
    };

    const handleNavigateToOrgs = () => {
        navigate('/events-dashboard?page=3'); // Navigate to Orgs tab
    };

    const handleNavigateToFriends = () => {
        if (isAuthenticated) {
            navigate('/events-dashboard?page=3'); // Navigate to Friends tab
        }
    };

    // Handle event press
    const handleEventPress = (event) => {
        console.log('Event pressed:', event);
        addNotification({
            title: 'Event Selected',
            message: `Opening ${event.title}`,
            type: 'info'
        });
    };

    // Handle room press
    const handleRoomPress = (room) => {
        // Navigate to Rooms tab (index 2 for authenticated users, index 1 for non-authenticated)
        const roomsTabIndex = 2;
        navigate(`/events-dashboard?page=${roomsTabIndex}&roomid=${encodeURIComponent(room.name)}`);
    };

    // Handle errors
    useEffect(() => {
        if (featuredError) {
            addNotification({
                title: 'Error',
                message: 'Failed to load featured content',
                type: 'error'
            });
        }
    }, [featuredError, addNotification]);

    return(
        <div className="my-events dash">
            <header className={`header ${isSearchFocused ? 'search-mode' : ''}`}>
                <img src={EventsGrad} alt="" />
                <h1>
                    {isAuthenticated 
                        ? `${welcomeText}, ${user?.username || 'User'}`
                        : 'Welcome to Meridian'
                    }
                </h1>
                <p>
                    {isAuthenticated 
                        ? 'Check out your upcoming events and see top picks for you'
                        : 'Discover campus events and find the perfect study spaces'
                    }
                </p>
            </header>
            
            {/* Search Bar */}
            <Search 
                variant="compact"
                onSearchFocus={handleSearchFocus}
                onSearchBlur={handleSearchBlur}
                isSearchFocused={isSearchFocused}
                placeholder="Search for events or rooms..."
                className={`my-events-search ${isSearchFocused ? 'search-focused' : ''}`}
                searchTypes={myEventsSearchTypes}
                showAllTab={true}
                navigationHandlers={navigationHandlers}
                setSearching={setSearching}
            />

            {isAuthenticated && friends.length === 0 && (
                <div className="friends-notice">
                    <div className="notice-container">
                        <Icon icon="mingcute:user-add-fill" />
                        <span>You don't have any friends yet. Start connecting with people!</span>
                    </div>
                    <button onClick={handleAddFriends}>
                        Add Friends <Icon icon="heroicons:chevron-right" />
                    </button>
                </div>
            )}

            {/* Quick Actions Section */}
            {!isSearchFocused && (
                <div className="quick-actions-section">
                <h2 className="section-title">Explore</h2>
                <div className="quick-actions-grid">
                    <div 
                        className="quick-action-card"
                        onClick={handleNavigateToEvents}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleNavigateToEvents();
                            }
                        }}
                    >
                        <div className="quick-action-icon" style={{ backgroundColor: '#6D8EFA20' }}>
                            <Icon icon="mingcute:calendar-fill" style={{ color: '#6D8EFA' }} />
                        </div>
                        <div className="quick-action-content">
                            <h3 className="quick-action-title">Events</h3>
                            <p className="quick-action-subtitle">Discover campus events</p>
                        </div>
                    </div>

                    <div 
                        className="quick-action-card"
                        onClick={handleNavigateToRooms}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleNavigateToRooms();
                            }
                        }}
                    >
                        <div className="quick-action-icon" style={{ backgroundColor: '#6EB25F20' }}>
                            <Icon icon="ic:baseline-room" style={{ color: '#6EB25F' }} />
                        </div>
                        <div className="quick-action-content">
                            <h3 className="quick-action-title">Study Rooms</h3>
                            <p className="quick-action-subtitle">Find available study spaces</p>
                        </div>
                    </div>

                    {isAuthenticated && (
                        <>
                            {/* <div 
                                className="quick-action-card"
                                onClick={handleNavigateToOrgs}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        handleNavigateToOrgs();
                                    }
                                }}
                            >
                                <div className="quick-action-icon" style={{ backgroundColor: '#FFF8E6' }}>
                                    <Icon icon="mingcute:group-2-fill" style={{ color: '#FFDE82' }} />
                                </div>
                                <div className="quick-action-content">
                                    <h3 className="quick-action-title">Organizations</h3>
                                    <p className="quick-action-subtitle">Join campus groups</p>
                                </div>
                            </div> */}

                            <div 
                                className="quick-action-card"
                                onClick={handleNavigateToFriends}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        handleNavigateToFriends();
                                    }
                                }}
                            >
                                <div className="quick-action-icon" style={{ backgroundColor: '#FF6B6B20' }}>
                                    <Icon icon="mdi:account-group" style={{ color: '#FF6B6B' }} />
                                </div>
                                <div className="quick-action-content">
                                    <h3 className="quick-action-title">Friends</h3>
                                    <p className="quick-action-subtitle">Connect with peers</p>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Horizontal Resources Card */}
            </div>
            )}
            
            <div className={`my-events-container ${isSearchFocused ? 'search-mode' : ''}`}>
                {isSearchFocused ? 
                    !searching && (
                        <div className="search-placeholder">
                            <Icon icon="mingcute:search-fill" />
                            <h3>Search Results</h3>
                            <p>Type in the search bar above to find events, rooms, or users</p>
                        </div>
                    )
                     : (
                    <>
                        {/* Featured Content for All Users */}
                        {!featuredLoading && (
                            <>
                                {/* Featured Events - Show for both authenticated and unauthenticated users */}
                                {featuredEvents?.length > 0 && !isAuthenticated &&  (
                                    <HeaderContainer
                                        icon="mingcute:calendar-fill"
                                        header="Featured Events"
                                        right={
                                            <button className="see-all-button" onClick={handleNavigateToEvents}>
                                                See all
                                                <Icon icon="mingcute:arrow-right-fill" />
                                            </button>
                                        }
                                        classN="featured-section"
                                    >
                                        <div className="horizontal-scroll">
                                            {featuredEvents.slice(0, 5).map((event) => (
                                                <RecommendedEventPreviewCard 
                                                    key={event._id}
                                                    event={event}
                                                />
                                            ))}
                                        </div>
                                    </HeaderContainer>
                                )}

                                {/* Featured Rooms - Show for both authenticated and unauthenticated users */}
                                {featuredRooms.length > 0 && (
                                    <HeaderContainer
                                        icon="ic:baseline-room"
                                        header="Available Study Rooms"
                                        right={
                                            <button className="see-all-button" onClick={handleNavigateToRooms}>
                                                See all
                                                <Icon icon="mingcute:arrow-right-fill" />
                                            </button>
                                        }
                                        classN="featured-section"
                                    >
                                        <div className="horizontal-scroll">
                                            {featuredRooms.slice(0, 5).map((room) => (
                                                <RecommendedRoomCard 
                                                    key={room._id}
                                                    horizontalScroll={true}
                                                    room={room}
                                                    onRoomClick={handleRoomPress}
                                                />
                                            ))}
                                        </div>
                                    </HeaderContainer>
                                )}
                            </>
                        )}

                        {/* Call to Action for Non-Authenticated Users */}
                        {/* {!isAuthenticated && (
                            <div className="cta-section">
                                <div className="cta-card">
                                    <div className="cta-icon">
                                        <Icon icon="mingcute:user-add-fill" />
                                    </div>
                                    <div className="cta-content">
                                        <h3>Join the Community</h3>
                                        <p>Create an account to RSVP to events, bookmark study rooms, and connect with friends.</p>
                                        <button 
                                            className="cta-button"
                                            onClick={() => navigate('/register')}
                                        >
                                            Sign Up Now
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )} */}

                        {/* Authenticated User Content */}
                        {isAuthenticated && (
                            <>
                                <RecommendedEvents />
                                <MyEventsContent />
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}

export default MyEvents;