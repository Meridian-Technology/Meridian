import React, { useMemo, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import useAuth from '../../../hooks/useAuth';
import { useCache } from '../../../CacheContext';
import { useFetch } from '../../../hooks/useFetch';
import NoticeBanner from '../../../components/NoticeBanner/NoticeBanner';
import Search from '../../../components/Search/Search';
import MyEventCard from '../../EventsDash/MyEvents/MyEventCard/MyEventCard';
import RecommendedEventPreviewCard from '../../EventsDash/MyEvents/RecommendedEvents/RecommendedEventPreviewCard/RecommendedEventPreviewCard';
import RecommendedRoomCard from '../../../components/RecommendedRoomCard/RecommendedRoomCard';
import OrgResult from '../../EventsDash/Orgs/OrgResult/OrgResult';
import EmptyState from '../../../components/EmptyState/EmptyState';
import GlobeIcon from '../../../assets/Brand Image/Globe.svg';
import './EventsHubHome.scss';

// Hardcoded "you visit often" style quick actions (Chrome-inspired)
const QUICK_ACTIONS = [
  { key: 'explore', label: 'Explore Events', icon: 'mingcute:compass-fill', path: '/events?tab=1' },
  { key: 'rooms', label: 'Study Rooms', icon: 'ic:baseline-room', path: '/events?tab=2' },
  { key: 'friends', label: 'Friends', icon: 'mdi:account-group', path: '/events?tab=3' },
  { key: 'orgs', label: 'Organizations', icon: 'mingcute:group-2-fill', path: '/events?tab=4' },
  { key: 'create', label: 'Create Event', icon: 'mingcute:add-circle-fill', path: '/create-event' },
];

const SEARCH_TYPES = [
  { key: 'events', label: 'Events', icon: 'mingcute:calendar-fill', enabled: true },
  { key: 'rooms', label: 'Rooms', icon: 'mingcute:building-fill', enabled: true },
  { key: 'organizations', label: 'Organizations', icon: 'mingcute:group-2-fill', enabled: true },
  { key: 'users', label: 'Users', icon: 'mingcute:user-fill', enabled: true },
];

function buildFreeNowQuery() {
  const nowQuery = { M: [], T: [], W: [], R: [], F: [] };
  const days = ['M', 'T', 'W', 'R', 'F'];
  const today = new Date();
  const day = today.getDay();
  let hour = today.getHours();
  const minutes = today.getMinutes() + 10;
  if (minutes >= 60) hour += 1;
  else if (minutes >= 30 && minutes < 60) hour += 0.5;
  if (day === 0 || day === 6) {
    nowQuery.M = [{ start_time: 0, end_time: 30 }];
  } else {
    nowQuery[days[day - 1]] = [{ start_time: hour * 60, end_time: hour * 60 + 30 }];
  }
  return nowQuery;
}

function EventsHubHome({ onRoomNavigation, onTabChangeByKey }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { getBatch, getFreeRooms } = useCache();
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isSearchClosing, setIsSearchClosing] = useState(false);
  const [searchOriginRect, setSearchOriginRect] = useState(null);
  const closeTimeoutRef = useRef(null);
  const [searching, setSearching] = useState(false);
  const [savedSpacesFree, setSavedSpacesFree] = useState([]);
  const [savedSpacesLoading, setSavedSpacesLoading] = useState(false);

  const welcomeText = `Good ${new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 18 ? 'Afternoon' : 'Evening'}`;

  const navigationHandlers = {
    rooms: (room) => {
      if (onRoomNavigation) onRoomNavigation(room);
      else navigate(`/room/${room.name || room._id}`);
    },
    events: (event) => navigate(`/event/${event._id}`),
    organizations: (org) => navigate(`/org/${encodeURIComponent(org.org_name)}`),
    users: (u) => navigate(`/profile/${u.username}`),
  };

  const { data: goingData } = useFetch('/going-events?limit=100');
  const { data: hostingData } = useFetch('/get-my-events?sort=desc&limit=100');
  const { data: featuredData } = useFetch('/featured-all');
  const { data: suggestedActionData, loading: suggestedActionLoading } = useFetch('/suggested-action');

  // Saved spaces that are free now (user's saved rooms filtered by availability)
  useEffect(() => {
    if (!user?.saved?.length) {
      setSavedSpacesFree([]);
      return;
    }
    let cancelled = false;
    setSavedSpacesLoading(true);
    (async () => {
      try {
        const savedRooms = await getBatch(user.saved);
        if (cancelled || !savedRooms?.length) {
          setSavedSpacesFree([]);
          return;
        }
        const query = buildFreeNowQuery();
        const freeNames = await getFreeRooms(query);
        if (!freeNames || !Array.isArray(freeNames)) {
          setSavedSpacesFree([]);
          return;
        }
        const freeSet = new Set(freeNames.map((n) => String(n).toLowerCase()));
        const free = savedRooms.filter((r) => r?.name && freeSet.has(String(r.name).toLowerCase()));
        if (!cancelled) setSavedSpacesFree(free.slice(0, 6));
      } catch {
        if (!cancelled) setSavedSpacesFree([]);
      } finally {
        if (!cancelled) setSavedSpacesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.saved, getBatch, getFreeRooms]);

  const upcomingEvents = useMemo(() => {
    const now = new Date();
    const going = goingData?.events || [];
    const hosting = hostingData?.events || [];
    const all = [...going, ...hosting].filter((e) => {
      const start = new Date(e.start_time);
      const end = new Date(e.end_time || e.start_time);
      return end >= now; // Include live (start <= now && end >= now) and future (start >= now)
    });
    return all.sort((a, b) => new Date(a.start_time) - new Date(b.start_time)).slice(0, 6);
  }, [goingData, hostingData]);

  // Prioritize attending event (ongoing or coming up soon) for the suggestion banner
  const attendingEventForBanner = useMemo(() => {
    const now = new Date();
    const soonCutoff = new Date(now.getTime() + 24 * 60 * 60 * 1000); // within 24 hours
    const going = goingData?.events || [];
    const hosting = hostingData?.events || [];
    const all = [...going, ...hosting];
    const ongoing = all.filter((e) => {
      const start = new Date(e.start_time);
      const end = new Date(e.end_time || e.start_time);
      return start <= now && end >= now;
    });
    const comingUpSoon = all.filter((e) => {
      const start = new Date(e.start_time);
      return start > now && start <= soonCutoff;
    });
    if (ongoing.length > 0) return ongoing[0];
    if (comingUpSoon.length > 0) {
      return comingUpSoon.sort((a, b) => new Date(a.start_time) - new Date(b.start_time))[0];
    }
    return null;
  }, [goingData, hostingData]);

  const suggestedEvents = useMemo(() => {
    const now = new Date();
    const featured = featuredData?.data?.events || [];
    return featured
      .filter((e) => new Date(e.start_time) >= now)
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
      .slice(0, 6);
  }, [featuredData]);

  // User's personal organizations (from clubAssociations)
  const myOrgs = useMemo(() => {
    const orgs = user?.clubAssociations || [];
    return Array.isArray(orgs) ? orgs.slice(0, 6) : [];
  }, [user?.clubAssociations]);

  const closeSearch = () => {
    if (isSearchClosing) return;
    setIsSearchClosing(true);
    // Fallback: ensure we always unmount even if onAnimationEnd doesn't fire (e.g. child animations)
    closeTimeoutRef.current = setTimeout(handleSearchCloseAnimationEnd, 280);
  };

  const handleSearchCloseAnimationEnd = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setIsSearchFocused(false);
    setIsSearchClosing(false);
    setSearchOriginRect(null);
  };

  useEffect(() => {
    if (!isSearchFocused || isSearchClosing) return;
    const handleEscape = (e) => {
      if (e.key === 'Escape') closeSearch();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isSearchFocused, isSearchClosing]);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  const goTo = (key) => {
    if (onTabChangeByKey) {
      const tabMap = { explore: 'explore', rooms: 'rooms', friends: 'friends', orgs: 'orgs' };
      if (tabMap[key]) {
        onTabChangeByKey(tabMap[key]);
        return;
      }
    }
    const action = QUICK_ACTIONS.find((a) => a.key === key);
    if (action) navigate(action.path);
  };

  const handleRoomPress = (room) => {
    if (onRoomNavigation) onRoomNavigation(room);
    else navigate(`/room/${room.name || room._id}`);
  };

  return (
    <div className="events-hub-home">
      {/* Large header with gradient from bottom */}
      <header className="events-hub-home__header">
        <div className="events-hub-home__header-gradient" />
        <div className="events-hub-home__header-content">
          <h1 className="events-hub-home__greeting events-hub-home__greeting--animated">
            <img src={GlobeIcon} alt="" className="events-hub-home__globe" />
            {welcomeText}, <span className="events-hub-home__name">{user?.username || 'there'}</span>
          </h1>
          <p className="events-hub-home__subline events-hub-home__subline--animated">Here&apos;s what&apos;s happening for you today</p>
          <div className="events-hub-home__quick-actions events-hub-home__quick-actions--animated">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.key}
                type="button"
                className="events-hub-home__quick-action"
                onClick={() => goTo(action.key)}
              >
                <Icon icon={action.icon} />
                <span>{action.label}</span>
              </button>
            ))}
          </div>
          <div className="events-hub-home__notice-wrapper">
            <NoticeBanner />
          </div>
          <div
            className={`events-hub-home__search-wrap ${isSearchFocused || isSearchClosing ? 'events-hub-home__search-wrap--hidden' : ''}`}
          >
            <Search
              variant="compact"
              onSearchFocus={(rect) => {
                setSearchOriginRect(rect ?? null);
                setIsSearchFocused(true);
              }}
              isSearchFocused={false}
              placeholder="Search for events or rooms..."
              className="events-hub-home__search"
              searchTypes={SEARCH_TYPES}
              showAllTab
              navigationHandlers={navigationHandlers}
              setSearching={setSearching}
            />
          </div>
        </div>
      </header>

      {/* Spotlight-style overlay + search popup when focused (portal so Search stacks above overlay) */}
      {(isSearchFocused || isSearchClosing) && createPortal(
        <div className={`events-hub-search-spotlight ${isSearchClosing ? 'events-hub-search-spotlight--closing' : ''}`}>
          <div
            className="events-hub-search-overlay"
            onClick={closeSearch}
            role="button"
            tabIndex={-1}
            aria-label="Close search"
          />
          <div
            className={`events-hub-search-popup ${searchOriginRect ? 'events-hub-search-popup--from-bar' : ''} ${isSearchClosing ? 'events-hub-search-popup--closing' : ''}`}
            style={searchOriginRect ? {
              '--origin-top': `${searchOriginRect.top}px`,
              '--origin-left': `${searchOriginRect.left}px`,
              '--origin-width': `${searchOriginRect.width}px`,
              '--origin-height': `${searchOriginRect.height}px`,
            } : undefined}
            onAnimationEnd={(e) => {
              if (isSearchClosing && e.target === e.currentTarget) {
                handleSearchCloseAnimationEnd();
              }
            }}
          >
            <Search
              variant="compact"
              spotlightMode
              onSearchFocus={() => setIsSearchFocused(true)}
              onSearchBlur={closeSearch}
              isSearchFocused={!isSearchClosing}
              placeholder="Search for events or rooms..."
              className="events-hub-home__search events-hub-home__search--spotlight"
              searchTypes={SEARCH_TYPES}
              showAllTab
              navigationHandlers={navigationHandlers}
              setSearching={setSearching}
            />
          </div>
        </div>,
        document.body
      )}

      {/* Suggested action: attending event (ongoing/soon) takes priority, else API suggestion */}
      {(() => {
        const d = attendingEventForBanner
          ? {
              type: 'event',
              id: attendingEventForBanner._id,
              item: attendingEventForBanner,
              suggestionReason: (() => {
                const now = new Date();
                const start = new Date(attendingEventForBanner.start_time);
                const end = new Date(attendingEventForBanner.end_time || attendingEventForBanner.start_time);
                if (start <= now && end >= now) return 'Happening now';
                return 'Coming up soon';
              })(),
            }
          : !suggestedActionLoading && suggestedActionData?.success && suggestedActionData?.data
            ? suggestedActionData.data
            : null;
        if (!d) return null;
        return (
          <section key={d.id || 'suggested'} className="events-hub-home__section--suggested">
            <button
              type="button"
              className="events-hub-home__suggested-banner"
              onClick={() => {
                if (d.type === 'event') {
                  if (d.destination === 'workspace' && d.orgId && d.orgName) {
                    navigate(`/club-dashboard/${encodeURIComponent(d.orgName)}?page=1&overlay=event-dashboard&eventId=${d.id}&orgId=${d.orgId}`);
                  } else {
                    navigate(`/event/${d.id}`);
                  }
                } else if (d.type === 'org') {
                  navigate(d.destination === 'dashboard' ? `/club-dashboard/${encodeURIComponent(d.item.org_name)}` : `/org/${encodeURIComponent(d.item.org_name)}`);
                } else if (d.type === 'room') handleRoomPress(d.item);
              }}
            >
              <div className="events-hub-home__suggested-banner__content">
                <div className="events-hub-home__suggested-banner__thumb">
                  {d.type === 'event' && (d.item?.image || d.item?.previewImage) ? (
                    <img src={d.item.image || d.item.previewImage} alt="" />
                  ) : d.type === 'org' && d.item?.org_profile_image ? (
                    <img src={d.item.org_profile_image} alt="" />
                  ) : d.type === 'room' && d.item?.image ? (
                    <img src={d.item.image} alt="" />
                  ) : (
                    <Icon icon="mingcute:calendar-fill" />
                  )}
                </div>
                <div className="events-hub-home__suggested-banner__text">
                  <span className="events-hub-home__suggested-banner__label">
                    {d.suggestionReason || (d.isHotRightNow ? 'Hot right now' : 'Suggested for you')}
                  </span>
                  <span className="events-hub-home__suggested-banner__title">
                    {d.type === 'event' && d.item?.name}
                    {d.type === 'org' && d.item?.org_name}
                    {d.type === 'room' && d.item?.name}
                  </span>
                </div>
              </div>
              <Icon icon="mingcute:arrow-right-fill" className="events-hub-home__suggested-banner__arrow" />
            </button>
          </section>
        );
      })()}

      {/* Scrollable content: Events, Organizations, Saved spaces */}
      <section className="events-hub-home__section">
        <div className="events-hub-home__section-header">
          <h2>{upcomingEvents.length > 0 ? 'Upcoming events' : 'Suggested for you'}</h2>
          <button type="button" className="events-hub-home__see-all" onClick={() => goTo('explore')}>
            See all <Icon icon="mingcute:arrow-right-fill" />
          </button>
        </div>
        {upcomingEvents.length > 0 ? (
          <div className="events-hub-home__events-grid">
            {upcomingEvents.map((event) => (
              <MyEventCard key={event._id} event={event} />
            ))}
          </div>
        ) : suggestedEvents.length > 0 ? (
          <div className="events-hub-home__events-grid">
            {suggestedEvents.map((event) => (
              <RecommendedEventPreviewCard key={event._id} event={event} />
            ))}
          </div>
        ) : (
          <div className="events-hub-home__empty">
            <EmptyState title="No upcoming events" />
            <button type="button" className="events-hub-home__cta" onClick={() => goTo('explore')}>
              Explore events
            </button>
          </div>
        )}
      </section>

      <section className="events-hub-home__section">
        <div className="events-hub-home__section-header">
          <h2>Your organizations</h2>
          <button type="button" className="events-hub-home__see-all" onClick={() => goTo('orgs')}>
            See all <Icon icon="mingcute:arrow-right-fill" />
          </button>
        </div>
        {myOrgs.length > 0 ? (
          <div className="events-hub-home__orgs-grid">
            {myOrgs.map((org) => (
              <div key={org._id || org.org_name} className="events-hub-home__org-card">
                <OrgResult org={org} />
                <div className="events-hub-home__org-actions">
                  <button
                    type="button"
                    className="events-hub-home__org-action events-hub-home__org-action--view"
                    onClick={(e) => { e.stopPropagation(); navigate(`/org/${encodeURIComponent(org.org_name)}`); }}
                  >
                    <Icon icon="mingcute:eye-line" />
                    View
                  </button>
                  <button
                    type="button"
                    className="events-hub-home__org-action events-hub-home__org-action--manage"
                    onClick={(e) => { e.stopPropagation(); navigate(`/club-dashboard/${encodeURIComponent(org.org_name)}`); }}
                  >
                    <Icon icon="mingcute:settings-3-line" />
                    Manage
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="events-hub-home__empty">
            <EmptyState
              title="No organizations yet"
              description="Join organizations to see them here"
            />
            <button type="button" className="events-hub-home__cta" onClick={() => goTo('orgs')}>
              Browse organizations
            </button>
          </div>
        )}
      </section>

      <section className="events-hub-home__section">
        <div className="events-hub-home__section-header">
          <h2>Saved spaces free now</h2>
          <button type="button" className="events-hub-home__see-all" onClick={() => goTo('rooms')}>
            See all <Icon icon="mingcute:arrow-right-fill" />
          </button>
        </div>
        {savedSpacesLoading ? (
          <div className="events-hub-home__empty">
            <EmptyState title="Loading..." />
          </div>
        ) : savedSpacesFree.length > 0 ? (
          <div className="events-hub-home__spaces-grid">
            {savedSpacesFree.map((room) => (
              <RecommendedRoomCard
                key={room._id || room.name}
                room={room}
                horizontalScroll
                onRoomClick={handleRoomPress}
              />
            ))}
          </div>
        ) : (
          <div className="events-hub-home__empty">
            <EmptyState
              title="No saved spaces free right now"
              description="Save rooms you like to see them here when they're available"
            />
            <button type="button" className="events-hub-home__cta" onClick={() => goTo('rooms')}>
              Find study rooms
            </button>
          </div>
        )}
      </section>

      <div className="events-hub-home__bottom-pad" />
    </div>
  );
}

export default EventsHubHome;
