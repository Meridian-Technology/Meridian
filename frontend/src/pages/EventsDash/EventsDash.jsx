import React, {useState, useEffect, useRef} from 'react';
import './EventsDash.scss';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import Dashboard from '../../components/Dashboard/Dashboard';
import Explore from './Explore/Explore';
import MyEvents from './MyEvents/MyEvents';
import Loader from '../../components/Loader/Loader';
import Orgs from './Orgs/Orgs';
import eventsLogo from '../../assets/Brand Image/BEACON.svg';
import useAuth from '../../hooks/useAuth';
import Friends from '../Friends/Friends';
import EventsGrad from '../../assets/Gradients/EventsGrad.png';
import Popup from '../../components/Popup/Popup';
import EventsAnalytics from '../../components/EventsAnalytics/EventsAnalytics';
import Room from '../Room/Room1';
import CreateStudySession from '../Create/CreateStudySession/CreateStudySession';
import '../Create/Create.scss';
// Sign-up prompt component
const SignUpPrompt = ({ onSignUp, onExplore, handleClose }) => {
    return (
        <div className="signup-prompt-popup">
            <div className="signup-prompt-content">
                <div className="signup-prompt-header">
                    <img src={EventsGrad} alt="" className="signup-gradient" />
                    <h1>Create a Meridian Account</h1>
                    <p>All your events in one place, RSVP with one click to let friends know what you're attending.</p>
                </div>
                
                <div className="signup-prompt-features">
                    <div className="feature">
                        <div className="feature-icon">
                            <Icon icon="mingcute:calendar-fill" />
                        </div>
                        <div className="feature-text">
                            <h3>Discover Events</h3>
                            <p>Find events from Campus, Arts, Athletics, and more</p>
                        </div>
                    </div>
                    
                    <div className="feature">
                        <div className="feature-icon">
                            <Icon icon="mingcute:group-2-fill" />
                        </div>
                        <div className="feature-text">
                            <h3>Connect with Friends</h3>
                            <p>See what your friends are up to and join them</p>
                        </div>
                    </div>
                    
                    <div className="feature">
                        <div className="feature-icon">
                            <Icon icon="mingcute:compass-fill" />
                        </div>
                        <div className="feature-text">
                            <h3>Explore Campus</h3>
                            <p>Find the perfect study spots and event venues</p>
                        </div>
                    </div>
                </div>
                
                <div className="signup-prompt-actions">
                    <button className="signup-btn primary" onClick={onSignUp}>
                        <Icon icon="mingcute:user-add-fill" />
                        Sign Up Now
                    </button>
                    <button className="signup-btn secondary" onClick={handleClose}>
                        no thanks
                    </button>
                </div>
            </div>
        </div>
    );
};

function EventsDash({}){
    const [showLoading, setShowLoading] = useState(false);
    const [showExplore, setShowExplore] = useState(false);
    const [showSignUpPrompt, setShowSignUpPrompt] = useState(false);
    const [showCreatePopup, setShowCreatePopup] = useState(false);
    const [showCreateMenu, setShowCreateMenu] = useState(false);
    const [createType, setCreateType] = useState('');
    const createMenuRef = useRef(null);
    const createButtonRef = useRef(null);
    const { user, isAuthenticating } = useAuth();
    const navigate = useNavigate();

    // Helper function to check if sign-up prompt should be shown today
    const shouldShowSignUpPrompt = () => {
        const lastPromptDate = localStorage.getItem('lastSignUpPromptDate');
        if (!lastPromptDate) return true;
        
        const today = new Date().toDateString();
        return lastPromptDate !== today;

    };

    // Helper function to mark sign-up prompt as shown today
    const markSignUpPromptAsShown = () => {
        const today = new Date().toDateString();
        localStorage.setItem('lastSignUpPromptDate', today);
    };

    // Show sign-up prompt after loading for non-authenticated users (only once per day)
    // Close create menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (
                createMenuRef.current && 
                !createMenuRef.current.contains(event.target) &&
                createButtonRef.current &&
                !createButtonRef.current.contains(event.target)
            ) {
                setShowCreateMenu(false);
            }
        };

        if (showCreateMenu) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showCreateMenu]);

    useEffect(() => {
        if (!isAuthenticating && !user && !showExplore && shouldShowSignUpPrompt()) {
            const timer = setTimeout(() => {
                setShowSignUpPrompt(true);
                markSignUpPromptAsShown();
            }, 1000); // Show after 1 second
            return () => clearTimeout(timer);
        }
    }, [isAuthenticating, user, showExplore]);

    useEffect(() => {
        if(!isAuthenticating && user){
        const newBadgeRedirect = localStorage.getItem('badge');
        console.log(newBadgeRedirect);
        if(newBadgeRedirect){
            navigate(newBadgeRedirect);
            localStorage.removeItem('badge');
        }
    }
    },[isAuthenticating, user]);

    // Handle room navigation from search results
    const handleRoomNavigation = (room) => {
        // Navigate to Rooms tab (index 2 for authenticated users, index 1 for non-authenticated)
        const roomsTabIndex = 2;
        
        // Navigate to Rooms tab with the room name as roomid parameter
        // The Room component in embedded mode expects room names, not IDs
        navigate(`/events-dashboard?page=${roomsTabIndex}&roomid=${encodeURIComponent(room.name)}`);
    };

    // Create menu items based on authentication status
    const getMenuItems = () => {
        const items = [
            { 
                label: 'Home', 
                icon: 'material-symbols:home-rounded',
                element: <MyEvents onRoomNavigation={handleRoomNavigation} />
            },
            { 
                label: 'Explore', 
                icon: 'mingcute:compass-fill',
                element: <Explore />
            },
            {
                label: 'Rooms',
                icon: 'mingcute:calendar-fill',
                element: <Room hideHeader={true} urlType="embedded" />
            }
        ];
        
        // Add additional tabs for authenticated users
        if (user) {
            
            items.push({
                label: 'Friends', 
                icon: 'mdi:account-group',
                element: <Friends />
            });
            
            // Add Analytics tab for admin users
            if (user.roles && user.roles.includes('admin')) {
                // items.push({
                //     label: 'Analytics', 
                //     icon: 'mingcute:chart-fill',
                //     element: <EventsAnalytics />
                // });
            }
            items.push({
                label: 'Orgs',
                icon: 'mingcute:group-2-fill',
                element: <Orgs />
            });
        }
        
        return items;
    };

    const menuItems = getMenuItems();

    useEffect(() => {
        const timer = setTimeout(() => {
            setShowLoading(false);
        }, 2500); // 2s delay + 1.5s animation duration

        return () => clearTimeout(timer);
    }, []);

    const handleSignUp = () => {
        setShowSignUpPrompt(false);
        navigate('/register');
    };

    const handleExplore = () => {
        setShowSignUpPrompt(false);
        setShowExplore(true);
    };

    const handleClosePrompt = () => {
        setShowSignUpPrompt(false);
    };

    const handleCreateClick = () => {
        setShowCreateMenu(!showCreateMenu);
    };

    const handleCreateOption = (action) => {
        setShowCreateMenu(false);
        if (action === 'study-session') {
            setCreateType('study-session');
            setShowCreatePopup(true);
        } else if (action === 'event') {
            navigate('/create-event');
        } else if (action === 'org') {
            navigate('/create-org');
        }
    };

    const handleCloseCreatePopup = () => {
        setShowCreatePopup(false);
        setCreateType('');
    };

    // Create the plus button middle item for authenticated users
    const getMiddleItem = () => {
        if (!user) return null;
        if(user.roles && !user.roles.includes('admin')){
            return null;
        }
        return (
            <div className="create-button-container">
                <div className="create-menu-container">
                    <button 
                        ref={createButtonRef}
                        className="create-plus-button" 
                        onClick={handleCreateClick}
                        title="Create"
                    >
                        <Icon icon="mingcute:add-circle-fill" />
                        <span>Create</span>
                    </button>
                    
                    {showCreateMenu && (
                        <div ref={createMenuRef} className="create-menu">
                            <div 
                                className="create-menu-item"
                                onClick={() => handleCreateOption('study-session')}
                            >
                                <div className="menu-item-icon">
                                    <Icon icon="mingcute:book-6-fill" />
                                </div>
                                <div className="menu-item-content">
                                    <span className="menu-item-title">Study Session</span>
                                    <span className="menu-item-subtitle">Create a new study session</span>
                                </div>
                            </div>
                            <div 
                                className="create-menu-item"
                                onClick={() => handleCreateOption('event')}
                            >
                                <div className="menu-item-icon">
                                    <Icon icon="mingcute:calendar-fill" />
                                </div>
                                <div className="menu-item-content">
                                    <span className="menu-item-title">Event</span>
                                    <span className="menu-item-subtitle">Create a new event</span>
                                </div>
                            </div>
                            <div 
                                className="create-menu-item"
                                onClick={() => handleCreateOption('org')}
                            >
                                <div className="menu-item-icon">
                                    <Icon icon="mingcute:group-fill" />
                                </div>
                                <div className="menu-item-content">
                                    <span className="menu-item-title">Organization</span>
                                    <span className="menu-item-subtitle">Create a new organization</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <>
            {showLoading && !isAuthenticating && !user && (
                <div 
                    className="loading-overlay" 
                    role="status" 
                    aria-live="polite" 
                    aria-label="Loading events dashboard"
                >
                    <div className="loader-container">
                        <Loader />
                        <div className="loading-bar" aria-hidden="true"/>
                    </div>
                </div>
            )}
            
            <Dashboard 
                menuItems={menuItems} 
                additionalClass='events-dash' 
                logo={eventsLogo} 
                primaryColor='#6D8EFA' 
                secondaryColor='rgba(109, 142, 250, 0.15)'
                middleItem={getMiddleItem()}
                // Set default page to "My Events" (index 1) if user is logged in, otherwise "Explore" (index 0)
                defaultPage={0}
            >
            </Dashboard>

            {/* Sign-up prompt popup */}
            <Popup 
                isOpen={showSignUpPrompt} 
                onClose={handleClosePrompt}
                customClassName="signup-prompt-popup"
                defaultStyling={false}
            >
                <SignUpPrompt 
                    onSignUp={handleSignUp} 
                    onExplore={handleExplore} 
                    handleClose={handleClosePrompt}
                />
            </Popup>

            {/* Create Study Session popup */}
            {createType === 'study-session' && (
                <Popup 
                    isOpen={showCreatePopup} 
                    onClose={handleCloseCreatePopup}
                    customClassName="create-study-session-popup"
                    defaultStyling={false}
                >
                    <CreateStudySession />
                </Popup>
            )}
        </>
    )
}

export default EventsDash;