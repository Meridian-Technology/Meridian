import React, { useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { useGradient } from '../../../hooks/useGradient';
import HeaderContainer from '../../../components/HeaderContainer/HeaderContainer';
import DashStatus from '../../../components/Dashboard/DashStatus/DashStatus';
import SettingsList from '../../../components/SettingsList/SettingsList';
import RoleManager from '../../../components/RoleManager';
import '../ClubDash.scss';
import '../Dash/Dash.scss';
import '../EventsManagement/EventsManagement.scss';
import '../EventsManagement/components/StatsHeader.scss';
import '../Members/Members.scss';
import '../../../components/OrgMessages/OrgMessages.scss';
import '../../../components/SettingsList/SettingsList.scss';
import '../../../components/RoleManager/RoleManager.scss';
import '../OrgSettings/components/GeneralSettings.scss';
import './ClubDashOnboarding.scss';

const MOCK_ROLES = [
    { name: 'owner', displayName: 'Owner', permissions: ['manage_roles', 'manage_members', 'manage_events'], color: '#dc2626', order: 0 },
    { name: 'officer', displayName: 'Officer', permissions: ['manage_members', 'manage_events', 'send_announcements'], color: '#10b981', order: 1 },
    { name: 'member', displayName: 'Member', permissions: ['view_events'], color: '#6b7280', order: 2 }
];

const SETTINGS_ITEMS = [
    { title: 'Organization Name', subtitle: 'The name of your organization', action: <div className="onboarding-field-preview">My Club</div> },
    { title: 'Description', subtitle: 'A brief description of your organization', action: <div className="onboarding-field-preview">A community organization for...</div> },
    { title: 'Roles & Permissions', subtitle: 'Define roles and what each can do' },
    { title: 'Application Process', subtitle: 'Configure how new members apply' },
];

const SLIDES = [
    {
        id: 'dashboard',
        label: 'Dashboard',
        icon: 'ic:round-dashboard',
        description: 'Your home base. Quick actions, upcoming events, and application alerts at a glance.',
        snippet: (
            <div className="club-dash">
                <div className="dash">
                    <div className="org-content">
                        <div className="actions row">
                            <div className="action">
                                <Icon icon="mingcute:add-circle-fill" />
                                <p>Plan an Event</p>
                            </div>
                            <div className="action">
                                <p>Manage Members</p>
                            </div>
                        </div>
                    <DashStatus
                        status="You have 2 unreviewed officer and member applications"
                        action={() => {}}
                        actionText="view all"
                        color="var(--green)"
                        applicationsCount={2}
                    />
                    <HeaderContainer icon="mingcute:calendar-fill" classN="event-quick-look" header="Quick Look" size="1rem">
                        <div className="row events-container onboarding-events-placeholder">
                            <div className="onboarding-event-card">
                                <span className="onboarding-event-title">Spring Gala 2025</span>
                                <span className="onboarding-event-meta">In 12 days · 24 rsvps</span>
                            </div>
                            <div className="onboarding-event-card">
                                <span className="onboarding-event-title">Workshop Series</span>
                                <span className="onboarding-event-meta">In 3 weeks · 8 rsvps</span>
                            </div>
                        </div>
                    </HeaderContainer>
                    </div>
                </div>
            </div>
        )
    },
    {
        id: 'events',
        label: 'Events',
        icon: 'mingcute:calendar-fill',
        description: 'Manage all your organization\'s events. View stats, create events, and open event dashboards.',
        snippet: (
            <div className="events-management dash">
                <div className="events-management-content">
                    <div className="stats-header onboarding-stats-header">
                        <div className="stats-grid">
                            <div className="stat-card">
                                <div className="stat-icon"><Icon icon="mingcute:calendar-fill" /></div>
                                <div className="stat-content">
                                    <span className="stat-value">12</span>
                                    <span className="stat-title">Total Events</span>
                                    <span className="stat-subtitle">Last 30 days</span>
                                </div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-icon"><Icon icon="mingcute:eye-fill" /></div>
                                <div className="stat-content">
                                    <span className="stat-value">1,240</span>
                                    <span className="stat-title">Total Views</span>
                                    <span className="stat-subtitle">856 unique</span>
                                </div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-icon"><Icon icon="mingcute:user-add-fill" /></div>
                                <div className="stat-content">
                                    <span className="stat-value">312</span>
                                    <span className="stat-title">Registrations</span>
                                    <span className="stat-subtitle">289 unique</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="events-management-list onboarding-events-list">
                        <div className="onboarding-event-row">
                            <span className="onboarding-event-name">Annual Spring Gala</span>
                            <span className="onboarding-event-date">Mar 15, 2025</span>
                        </div>
                        <div className="onboarding-event-row">
                            <span className="onboarding-event-name">Workshop Series</span>
                            <span className="onboarding-event-date">Apr 2, 2025</span>
                        </div>
                        <div className="onboarding-event-row">  
                            <span className="onboarding-event-name">Annual Fall Gala</span>
                            <span className="onboarding-event-date">Oct 15, 2025</span>
                        </div>
                        <div className="onboarding-event-row">  
                            <span className="onboarding-event-name">Annual Winter Gala</span>
                            <span className="onboarding-event-date">Dec 10, 2025</span>
                        </div>
                    </div>
                </div>
            </div>
        )
    },
    {
        id: 'announcements',
        label: 'Announcements',
        icon: 'mdi:message-text',
        description: 'Post messages and announcements for your organization. Keep members in the loop.',
        snippet: (
            <div className="announcements dash">
                <div className="org-content">
                    <div className="org-message-feed">
                        <div className="org-message-composer onboarding-composer-preview">
                            <div className="composer-form">
                                <div className="onboarding-field-preview onboarding-textarea">Write a message for your organization...</div>
                                <button type="button" className="onboarding-post-btn" disabled>Post</button>
                            </div>
                        </div>
                        <div className="messages-list">
                            <div className="org-message-card">
                                <div className="profile-column">
                                    <div className="author-avatar placeholder onboarding-avatar"><Icon icon="mdi:account" /></div>
                                </div>
                                <div className="message-body">
                                    <div className="message-header">
                                        <div className="comment-author-info">
                                            <span className="comment-author">Sarah M.</span>
                                        </div>
                                        <div className="message-header-right">
                                            <span className="comment-date">2 hours ago</span>
                                        </div>
                                    </div>
                                    <div className="comment-text">Reminder: Spring Gala registration closes this Friday. Don&apos;t miss out!</div>
                                </div>
                            </div>
                            <div className="org-message-card">
                                <div className="profile-column">
                                    <div className="author-avatar placeholder onboarding-avatar"><Icon icon="mdi:account" /></div>
                                </div>
                                <div className="message-body">
                                    <div className="message-header">
                                        <div className="comment-author-info">
                                            <span className="comment-author">Alex K.</span>
                                        </div>
                                        <div className="message-header-right">
                                            <span className="comment-date">Yesterday</span>
                                        </div>
                                    </div>
                                    <div className="comment-text">Great turnout at last week&apos;s workshop. Thanks everyone!</div>
                                </div>
                            </div>
                            <div className="org-message-card">
                                <div className="profile-column">
                                    <div className="author-avatar placeholder onboarding-avatar"><Icon icon="mdi:account" /></div>
                                </div>
                                <div className="message-body">
                                    <div className="message-header">
                                        <div className="comment-author-info">
                                            <span className="comment-author">Alex K.</span>
                                        </div>
                                    </div>
                                    <div className="comment-text">Great turnout at last week&apos;s workshop. Thanks everyone!</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )
    },
    {
        id: 'members',
        label: 'Members',
        icon: 'mdi:account-group',
        description: 'View and manage your organization\'s members. Add members, assign roles, and review applications.',
        snippet: (
            <div className="members">
                <div className="member-management-container">
                    <div className="controls">
                        <div className="search-filter">
                            <div className="search-box">
                                <Icon icon="ic:round-search" className="search-icon" />
                                <div className="onboarding-field-preview onboarding-search">Search members...</div>
                            </div>
                        </div>
                    </div>
                    <div className="members-list">
                        <div className="members-list-header">
                            <h3>Name</h3>
                            <h3></h3>
                            <h3>Joined</h3>
                            <h3>Role</h3>
                            <h3>Actions</h3>
                        </div>
                        <div className="member-card">
                            <div className="member-avatar onboarding-avatar" />
                            <div className="member-details">
                                <h4>Jane Doe</h4>
                                <p className="email">jane@example.com</p>
                            </div>
                            <div className="member-meta"><span className="joined-date">Joined 2/1/2025</span></div>
                            <div className="role-badge" style={{ backgroundColor: 'rgba(77, 170, 87, 0.1)', color: '#4DAA57' }}>Officer</div>
                            <div className="action-buttons" />
                        </div>
                        <div className="member-card">
                            <div className="member-avatar onboarding-avatar" />
                            <div className="member-details">
                                <h4>John Smith</h4>
                                <p className="email">john@example.com</p>
                            </div>
                            <div className="member-meta"><span className="joined-date">Joined 1/15/2025</span></div>
                            <div className="role-badge" style={{ backgroundColor: 'rgba(5, 150, 105, 0.1)', color: '#059669' }}>Member</div>
                            <div className="action-buttons" />
                        </div>
                        <div className="member-card">
                            <div className="member-avatar onboarding-avatar" />
                            <div className="member-details">
                                <h4>John Klaumf</h4>
                                <p className="email">john@example.com</p>
                            </div>
                            <div className="member-meta"><span className="joined-date">Joined 1/15/2025</span></div>
                            <div className="role-badge" style={{ backgroundColor: 'rgba(5, 150, 105, 0.1)', color: '#059669' }}>Member</div>
                            <div className="action-buttons" />
                        </div>
                    </div>
                </div>
            </div>
        )
    },
    {
        id: 'roles',
        label: 'Roles & Permissions',
        icon: 'mdi:shield-account',
        description: 'Define custom roles and permissions. Control who can manage events, members, and organization settings.',
        snippet: (
            <div className="role-manager onboarding-role-manager">
                <RoleManager
                    roles={MOCK_ROLES}
                    onRolesChange={() => {}}
                    isEditable={false}
                    userRoleData={MOCK_ROLES[0]}
                    isOwner={true}
                />
            </div>
        )
    },
    {
        id: 'settings',
        label: 'Settings',
        icon: 'mdi:cog',
        description: 'Configure your organization. Edit profile, application process, social links, and more.',
        snippet: (
            <div className="dash settings-section">
                <div className="settings-content">
                    <SettingsList items={SETTINGS_ITEMS} />
                </div>
            </div>
        )
    }
];

function ClubDashOnboarding({ onClose, handleClose }) {
    const close = handleClose || onClose;
    const { AtlasMain } = useGradient();
    const [currentSlide, setCurrentSlide] = useState(0);
    const slide = SLIDES[currentSlide];
    const isFirst = currentSlide === 0;
    const isLast = currentSlide === SLIDES.length - 1;

    const handlePrev = () => {
        setCurrentSlide((prev) => Math.max(0, prev - 1));
    };

    const handleNext = () => {
        if (isLast) {
            close?.();
        } else {
            setCurrentSlide((prev) => Math.min(SLIDES.length - 1, prev + 1));
        }
    };

    const handleSkip = () => {
        close?.();
    };

    return (
        <div className="club-dash-onboarding">
            <div className="club-dash-onboarding__header">
                <h2 className="club-dash-onboarding__title">Welcome to the Club Dashboard</h2>
                <p className="club-dash-onboarding__subtitle">
                    Here&apos;s a quick tour of what you can do
                </p>
            </div>

            <div className="club-dash-onboarding__slide">
                <div className="club-dash-onboarding__slide-header">
                    <Icon icon={slide.icon} className="slide-icon" />
                    <h3 className="slide-title">{slide.label}</h3>
                </div>
                <div className="club-dash-onboarding__snippet-area">
                    <div className="club-dash-onboarding__gradient-bg">
                        <img src={AtlasMain} alt="" />
                    </div>
                    <span className="club-dash-onboarding__preview-badge">Preview</span>
                    <div className="club-dash-onboarding__snippet-inner">{slide.snippet}</div>
                </div>
                <p className="club-dash-onboarding__description">{slide.description}</p>
            </div>

            <div className="club-dash-onboarding__footer">
                <div className="club-dash-onboarding__dots">
                    {SLIDES.map((s, i) => (
                        <button
                            key={s.id}
                            type="button"
                            className={`onboarding-dot ${i === currentSlide ? 'active' : ''}`}
                            onClick={() => setCurrentSlide(i)}
                            aria-label={`Go to slide ${i + 1}`}
                        />
                    ))}
                </div>
                <div className="club-dash-onboarding__actions">
                    <button
                        type="button"
                        className="onboarding-btn onboarding-btn--skip"
                        onClick={handleSkip}
                    >
                        Skip
                    </button>
                    <div className="onboarding-nav-buttons">
                        <button
                            type="button"
                            className="onboarding-btn onboarding-btn--prev"
                            onClick={handlePrev}
                            disabled={isFirst}
                        >
                            <Icon icon="mdi:chevron-left" />
                            Prev
                        </button>
                        <button
                            type="button"
                            className="onboarding-btn onboarding-btn--next"
                            onClick={handleNext}
                        >
                            {isLast ? 'Get Started' : 'Next'}
                            {!isLast && <Icon icon="mdi:chevron-right" />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default ClubDashOnboarding;
