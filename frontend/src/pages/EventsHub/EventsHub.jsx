import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import './EventsHub.scss';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import { analytics } from '../../services/analytics/analytics';
import Explore from '../EventsDash/Explore/Explore';
import MyEvents from '../EventsDash/MyEvents/MyEvents';
import Orgs from '../EventsDash/Orgs/Orgs';
import eventsLogo from '../../assets/Brand Image/BEACON.svg';
import defaultAvatar from '../../assets/defaultAvatar.svg';
import useAuth from '../../hooks/useAuth';
import { useFetch } from '../../hooks/useFetch';
import Friends from '../Friends/Friends';
import EventsGrad from '../../assets/Gradients/EventsGrad.png';
import Popup from '../../components/Popup/Popup';
import Room from '../Room/Room1';
import CreateStudySession from '../Create/CreateStudySession/CreateStudySession';
import ProfilePopup from '../../components/ProfilePopup/ProfilePopup';
import '../Create/Create.scss';

// Sign-up prompt (shared with EventsDash)
const SignUpPrompt = ({ onSignUp, onExplore, handleClose }) => (
    <div className="signup-prompt-popup">
        <div className="signup-prompt-content">
            <div className="signup-prompt-header">
                <img src={EventsGrad} alt="" className="signup-gradient" />
                <h1>Create a Meridian Account</h1>
                <p>All your events in one place, RSVP with one click to let friends know what you're attending.</p>
            </div>
            <div className="signup-prompt-features">
                <div className="feature">
                    <div className="feature-icon"><Icon icon="mingcute:calendar-fill" /></div>
                    <div className="feature-text">
                        <h3>Discover Events</h3>
                        <p>Find events from Campus, Arts, Athletics, and more</p>
                    </div>
                </div>
                <div className="feature">
                    <div className="feature-icon"><Icon icon="mingcute:group-2-fill" /></div>
                    <div className="feature-text">
                        <h3>Connect with Friends</h3>
                        <p>See what your friends are up to and join them</p>
                    </div>
                </div>
                <div className="feature">
                    <div className="feature-icon"><Icon icon="mingcute:compass-fill" /></div>
                    <div className="feature-text">
                        <h3>Explore Campus</h3>
                        <p>Find the perfect study spots and event venues</p>
                    </div>
                </div>
            </div>
            <div className="signup-prompt-actions">
                <button className="signup-btn primary" onClick={onSignUp}>
                    <Icon icon="mingcute:user-add-fill" /> Sign Up Now
                </button>
                <button className="signup-btn secondary" onClick={handleClose}>no thanks</button>
            </div>
        </div>
    </div>
);

const TAB_CONFIG = {
    explore: { label: 'Explore', icon: 'mingcute:compass-fill', index: 0 },
    home: { label: 'Home', icon: 'material-symbols:home-rounded', index: 1 },
    rooms: { label: 'Rooms', icon: 'ic:baseline-room', index: 2 },
    friends: { label: 'Friends', icon: 'mdi:account-group', index: 3 },
    orgs: { label: 'Orgs', icon: 'mingcute:group-2-fill', index: 4 },
};

const EXPLORE_HEADER_SCROLL_THRESHOLD = 50;

function EventsHub() {
    const [showSignUpPrompt, setShowSignUpPrompt] = useState(false);
    const [showCreatePopup, setShowCreatePopup] = useState(false);
    const [showCreateMenu, setShowCreateMenu] = useState(false);
    const [createType, setCreateType] = useState('');
    const [exploreScrollTop, setExploreScrollTop] = useState(0);
    const [exploreHasCoverImage, setExploreHasCoverImage] = useState(false);
    const [exploreScrolledPastCover, setExploreScrolledPastCover] = useState(false);
    const createMenuRef = useRef(null);
    const createButtonRef = useRef(null);
    const contentRef = useRef(null);
    const coverSentinelRef = useRef(null);
    const { user, isAuthenticating } = useAuth();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const eligibilityData = useFetch(user ? '/api/event-system-config/event-creation-eligibility' : null);
    const eligibility = eligibilityData.data?.data;
    const canCreateEvent = eligibility
        ? (eligibility.allowIndividualUserHosting || (eligibility.orgsWithEventPermission?.length > 0))
        : false;

    const [width, setWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 768);
    useEffect(() => {
        const handleResize = () => setWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const isMobile = width < 768;

    // Tab state from URL (default: first tab = Home when logged in, Explore when guest)
    const tabParam = searchParams.get('tab');
    const defaultTabIndex = 0; // First tab is Home (logged in) or Explore (guest)
    const tabIndex = tabParam !== null && !isNaN(parseInt(tabParam, 10))
        ? Math.max(0, Math.min(parseInt(tabParam, 10), 4))
        : defaultTabIndex;

    const setTab = (index) => {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set('tab', String(index));
            return next;
        }, { replace: true });
    };

    const shouldShowSignUpPrompt = () => {
        const lastPromptDate = localStorage.getItem('lastSignUpPromptDate');
        if (!lastPromptDate) return true;
        return lastPromptDate !== new Date().toDateString();
    };

    const markSignUpPromptAsShown = () => {
        localStorage.setItem('lastSignUpPromptDate', new Date().toDateString());
    };

    useEffect(() => {
        if (!isAuthenticating && !user && shouldShowSignUpPrompt()) {
            const timer = setTimeout(() => {
                setShowSignUpPrompt(true);
                markSignUpPromptAsShown();
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [isAuthenticating, user]);

    useEffect(() => {
        if (!isAuthenticating && user) {
            const newBadgeRedirect = localStorage.getItem('badge');
            if (newBadgeRedirect) {
                navigate(newBadgeRedirect);
                localStorage.removeItem('badge');
            }
        }
    }, [isAuthenticating, user, navigate]);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (
                createMenuRef.current && !createMenuRef.current.contains(e.target) &&
                createButtonRef.current && !createButtonRef.current.contains(e.target)
            ) {
                setShowCreateMenu(false);
            }
        };
        if (showCreateMenu) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showCreateMenu]);

    useEffect(() => {
        analytics.screen('Events Hub');
    }, []);

    const getTabs = () => {
        const baseTabs = [
            { key: 'home', ...TAB_CONFIG.home },
            { key: 'explore', ...TAB_CONFIG.explore },
            { key: 'rooms', ...TAB_CONFIG.rooms },
        ];
        if (user) {
            return [
                ...baseTabs,
                { key: 'friends', ...TAB_CONFIG.friends },
                { key: 'orgs', ...TAB_CONFIG.orgs },
            ];
        }
        // Guest: show Explore first (content-first), then Home, Rooms
        return [
            { key: 'explore', ...TAB_CONFIG.explore },
            { key: 'home', ...TAB_CONFIG.home },
            { key: 'rooms', ...TAB_CONFIG.rooms },
        ];
    };

    const tabs = getTabs();
    const currentTabIndex = Math.min(tabIndex, tabs.length - 1);
    const currentTab = tabs[currentTabIndex];

    const isExploreHeaderTransparent =
        currentTab?.key === 'explore' &&
        exploreHasCoverImage &&
        !exploreScrolledPastCover;

    // Use IntersectionObserver to detect when cover has scrolled out of view (works regardless of which element scrolls)
    useEffect(() => {
        if (currentTab?.key !== 'explore' || !exploreHasCoverImage) return;

        const root = contentRef.current;
        const sentinel = coverSentinelRef.current;
        if (!sentinel) return;

        const setScrolledPast = (isPast) => {
            setExploreScrolledPastCover(isPast);
        };

        const observerOptions = { threshold: 0 };

        // Observer 1: scroll within content area (contentRef is scroll container)
        if (root) {
            const observer = new IntersectionObserver(
                (entries) => {
                    if (entries[0]) setScrolledPast(!entries[0].isIntersecting);
                },
                { root, ...observerOptions }
            );
            observer.observe(sentinel);

            // Observer 2: window/document scroll (root: null = viewport)
            const windowObserver = new IntersectionObserver(
                (entries) => {
                    if (entries[0]) setScrolledPast(!entries[0].isIntersecting);
                },
                { root: null, ...observerOptions }
            );
            windowObserver.observe(sentinel);

            return () => {
                observer.disconnect();
                windowObserver.disconnect();
            };
        }

        const windowObserver = new IntersectionObserver(
            (entries) => {
                if (entries[0]) setScrolledPast(!entries[0].isIntersecting);
            },
            { root: null, ...observerOptions }
        );
        windowObserver.observe(sentinel);
        return () => windowObserver.disconnect();
    }, [currentTab?.key, exploreHasCoverImage]);

    // Keep scroll listener as fallback for exploreScrollTop (e.g. for other uses)
    useLayoutEffect(() => {
        if (currentTab?.key !== 'explore') return;

        const updateScroll = () => {
            const contentScroll = contentRef.current?.scrollTop ?? 0;
            const windowScroll = window.scrollY ?? document.documentElement.scrollTop ?? 0;
            setExploreScrollTop(Math.max(contentScroll, windowScroll));
        };

        const contentEl = contentRef.current;
        if (contentEl) {
            contentEl.addEventListener('scroll', updateScroll, { passive: true });
        }
        window.addEventListener('scroll', updateScroll, { passive: true });

        updateScroll(); // Initial read

        return () => {
            if (contentEl) contentEl.removeEventListener('scroll', updateScroll);
            window.removeEventListener('scroll', updateScroll);
        };
    }, [currentTab?.key]);

    const handleRoomNavigation = (room) => {
        const roomsIndex = tabs.findIndex((t) => t.key === 'rooms');
        if (roomsIndex >= 0) {
            setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.set('tab', String(roomsIndex));
                next.set('roomid', encodeURIComponent(room.name));
                return next;
            }, { replace: true });
        }
    };

    const handleCreateClick = () => setShowCreateMenu(!showCreateMenu);
    const handleCreateOption = (action) => {
        setShowCreateMenu(false);
        if (action === 'study-session') {
            setCreateType('study-session');
            setShowCreatePopup(true);
        } else if (action === 'event') {
            analytics.track('event_create_click', { source: 'events_hub' });
            navigate('/create-event');
        } else if (action === 'org') {
            navigate('/create-org');
        }
    };
    const handleCloseCreatePopup = () => {
        setShowCreatePopup(false);
        setCreateType('');
    };

    // Reset explore scroll state when leaving Explore tab
    useEffect(() => {
        if (currentTab?.key !== 'explore') {
            setExploreScrollTop(0);
            setExploreHasCoverImage(false);
            setExploreScrolledPastCover(false);
        }
    }, [currentTab?.key]);

    const renderContent = () => {
        switch (currentTab?.key) {
            case 'explore':
                return (
                    <Explore
                        scrollContainerRef={contentRef}
                        coverSentinelRef={coverSentinelRef}
                        onScrollReport={setExploreScrollTop}
                        onHasCoverImage={setExploreHasCoverImage}
                    />
                );
            case 'home':
                return (
                    <MyEvents
                        onRoomNavigation={handleRoomNavigation}
                        onTabChange={setTab}
                        onTabChangeByKey={(key) => {
                            const i = tabs.findIndex((t) => t.key === key);
                            if (i >= 0) setTab(i);
                        }}
                    />
                );
            case 'rooms':
                return <Room hideHeader={true} urlType="embedded" />;
            case 'friends':
                return <Friends />;
            case 'orgs':
                return <Orgs />;
            default:
                return <Explore />;
        }
    };

    return (
        <div className="events-hub">
            {/* Slim top header - content-first, transparent overlay when on Explore with cover image */}
            <header
                className={`events-hub-header ${isExploreHeaderTransparent ? 'events-hub-header--transparent' : ''} ${currentTab?.key === 'explore' ? 'events-hub-header--overlay' : ''}`}
            >
                <div className="events-hub-header__inner">
                    <button
                        className="events-hub-logo"
                        onClick={() => setTab(0)}
                        aria-label="Meridian Events"
                    >
                        <img src={eventsLogo} alt="Meridian" />
                    </button>

                    {/* Desktop: compact pill nav */}
                    {!isMobile && (
                        <nav className="events-hub-nav-desktop" role="navigation" aria-label="Main navigation">
                            {tabs.map((tab, i) => (
                                <button
                                    key={tab.key}
                                    className={`events-hub-nav-item ${currentTabIndex === i ? 'active' : ''}`}
                                    onClick={() => setTab(i)}
                                >
                                    <Icon icon={tab.icon} />
                                    <span>{tab.label}</span>
                                </button>
                            ))}
                        </nav>
                    )}

                    <div className="events-hub-header__actions">
                        {user && (
                            <div className="events-hub-create">
                                <button
                                    ref={createButtonRef}
                                    className="events-hub-create-btn"
                                    onClick={handleCreateClick}
                                    title="Create"
                                >
                                    <Icon icon="mingcute:add-circle-fill" />
                                    <span>Create</span>
                                </button>
                                {showCreateMenu && (
                                    <div ref={createMenuRef} className="events-hub-create-menu">
                                        <div className="events-hub-create-menu-item" onClick={() => handleCreateOption('study-session')}>
                                            <Icon icon="mingcute:book-6-fill" />
                                            <div>
                                                <span className="title">Study Session</span>
                                                <span className="subtitle">Create a new study session</span>
                                            </div>
                                        </div>
                                        {canCreateEvent && (
                                            <div className="events-hub-create-menu-item" onClick={() => handleCreateOption('event')}>
                                                <Icon icon="mingcute:calendar-fill" />
                                                <div>
                                                    <span className="title">Event</span>
                                                    <span className="subtitle">Create a new event</span>
                                                </div>
                                            </div>
                                        )}
                                        <div className="events-hub-create-menu-item" onClick={() => handleCreateOption('org')}>
                                            <Icon icon="mingcute:group-fill" />
                                            <div>
                                                <span className="title">Organization</span>
                                                <span className="subtitle">Create a new organization</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        {user ? (
                            <ProfilePopup
                                position="bottom-right"
                                trigger={
                                    <button className="events-hub-profile" aria-label="Profile">
                                        <img src={user?.picture || defaultAvatar} alt="" />
                                    </button>
                                }
                            />
                        ) : (
                            <button
                                className="events-hub-login"
                                onClick={() => navigate('/login', { state: { from: { pathname: '/events' } } })}
                            >
                                Log in
                            </button>
                        )}
                    </div>
                </div>
            </header>

            {/* Main content - full width */}
            <main
                ref={contentRef}
                className={`events-hub-content ${currentTab?.key === 'explore' ? 'events-hub-content--explore' : ''}`}
            >
                {renderContent()}
            </main>

            {/* Mobile: bottom nav */}
            {isMobile && (
                <nav className="events-hub-nav-mobile" role="navigation" aria-label="Main navigation">
                    {tabs.map((tab, i) => (
                        <button
                            key={tab.key}
                            className={`events-hub-nav-mobile-item ${currentTabIndex === i ? 'active' : ''}`}
                            onClick={() => setTab(i)}
                            aria-current={currentTabIndex === i ? 'page' : undefined}
                        >
                            <Icon icon={tab.icon} />
                            <span>{tab.label}</span>
                        </button>
                    ))}
                </nav>
            )}

            {/* Sign-up prompt */}
            <Popup isOpen={showSignUpPrompt} onClose={() => setShowSignUpPrompt(false)} customClassName="signup-prompt-popup" defaultStyling={false}>
                <SignUpPrompt
                    onSignUp={() => { setShowSignUpPrompt(false); navigate('/register'); }}
                    onExplore={() => setShowSignUpPrompt(false)}
                    handleClose={() => setShowSignUpPrompt(false)}
                />
            </Popup>

            {/* Create Study Session popup */}
            {createType === 'study-session' && (
                <Popup isOpen={showCreatePopup} onClose={handleCloseCreatePopup} customClassName="create-study-session-popup" defaultStyling={false}>
                    <CreateStudySession />
                </Popup>
            )}
        </div>
    );
}

export default EventsHub;
