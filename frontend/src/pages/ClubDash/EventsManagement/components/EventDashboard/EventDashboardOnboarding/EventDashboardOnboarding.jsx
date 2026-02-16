import React, { useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { useGradient } from '../../../../../../hooks/useGradient';
import AgendaItem from '../EventAgendaBuilder/AgendaItem';
import KpiCard from '../../../../../../components/Analytics/Dashboard/KpiCard';
import HeaderContainer from '../../../../../../components/HeaderContainer/HeaderContainer';
import FunnelChart from '../FunnelChart';
import '../EventDashboard.scss';
import '../EventAgendaBuilder/AgendaBuilder.scss';
import '../EventJobsManager/JobsManager.scss';
import '../RegistrationsTab/RegistrationsTab.scss';
import '../EventCheckInTab/EventCheckInTab.scss';
import '../EventEditorTab/EventEditorTab.scss';
import '../../../../../../components/EventCheckIn/EventCheckIn.scss';
import './EventDashboardOnboarding.scss';

const FAKE_FUNNEL_DATA = [
    { label: 'Views', value: 1250 },
    { label: 'Form Opens', value: 680 },
    { label: 'Registrations', value: 312 },
    { label: 'Check-ins', value: 189 },
];

const MOCK_AGENDA_ITEMS = [
    { _id: '1', title: 'Welcome & Check-In', type: 'Activity', startTime: new Date('2025-03-15T09:00:00'), endTime: new Date('2025-03-15T09:30:00'), isPublic: true },
    { _id: '2', title: 'Keynote Speaker', type: 'Speaker', startTime: new Date('2025-03-15T10:00:00'), endTime: new Date('2025-03-15T11:00:00'), isPublic: true },
    { _id: '3', title: 'Workshop Sessions', type: 'Activity', startTime: new Date('2025-03-15T11:30:00'), endTime: new Date('2025-03-15T12:30:00'), isPublic: true }
];

const SLIDES = [
    {
        id: 'overview',
        label: 'Overview',
        icon: 'mingcute:chart-bar-fill',
        description: 'View event statistics, readiness checks, and quick actions at a glance.',
        snippet: (
            <div className="event-dashboard">
                <div className="event-overview">
                    <div className="overview-layout">
                    <div className="overview-left-column">
                        <div className="overview-card readiness-card">
                            <h3 className="event-dashboard-card-header">
                                <Icon icon="mdi:clipboard-check-outline" />
                                Event Readiness
                                <span className="readiness-count">2/3</span>
                            </h3>
                            <div className="readiness-list">
                                <div className="readiness-item ready">
                                    <Icon icon="mdi:check-circle" />
                                    <div className="readiness-content">
                                        <div className="readiness-header">
                                            <span className="readiness-label">Agenda Published</span>
                                        </div>
                                        <span className="readiness-description">Agenda is published and ready</span>
                                    </div>
                                </div>
                                <div className="readiness-item pending">
                                    <Icon icon="mdi:alert-circle-outline" />
                                    <div className="readiness-content">
                                        <div className="readiness-header">
                                            <span className="readiness-label">Jobs Filled</span>
                                            <span className="readiness-stats">5 / 8 (63%)</span>
                                        </div>
                                        <span className="readiness-description">5 of 8 positions filled</span>
                                        <div className="readiness-progress">
                                            <div className="readiness-progress-bar">
                                                <div className="readiness-progress-fill" style={{ width: '63%' }} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                </div>
            </div>
        )
    },
    {
        id: 'agenda',
        label: 'Agenda',
        icon: 'mdi:calendar-clock',
        description: 'Build and manage your event schedule with a visual timeline or list view.',
        snippet: (
            <div className="agenda-builder">
                <div className="agenda-items-container">
                    {MOCK_AGENDA_ITEMS.map((item) => (
                        <AgendaItem key={item._id} item={item} onEdit={() => {}} onDelete={() => {}} />
                    ))}
                </div>
            </div>
        )
    },
    {
        id: 'jobs',
        label: 'Jobs',
        icon: 'mdi:briefcase',
        description: 'Define volunteer roles and assign members to shifts.',
        snippet: (
            <div className="roles-manager">
                <div className="roles-list">
                    <div className="role-card fully-staffed">
                        <div className="role-header">
                            <div className="role-info">
                                <h4>Registration Desk</h4>
                            </div>
                        </div>
                        <div className="role-assignments">
                            <div className="assignments-header">
                                <h5>Assignments (2 / 2)</h5>
                                <span className="fully-staffed-badge">
                                    <Icon icon="mdi:check-circle" />
                                    Fully Staffed
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="role-card">
                        <div className="role-header">
                            <div className="role-info">
                                <h4>Setup Crew</h4>
                            </div>
                        </div>
                        <div className="role-assignments">
                            <div className="assignments-header">
                                <h5>Assignments (1 / 3)</h5>
                            </div>
                        </div>
                    </div>
                    <div className="role-card">
                        <div className="role-header">
                            <div className="role-info">
                                <h4>Photographer</h4>
                            </div>
                        </div>
                        <div className="role-assignments">
                            <div className="assignments-header">
                                <h5>Assignments (0 / 1)</h5>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )
    },
    {
        id: 'analytics',
        label: 'Analytics',
        icon: 'mingcute:chart-line-fill',
        description: 'Track views, RSVPs, and engagement with detailed charts and metrics.',
        snippet: (
            <div className="event-analytics-detail">
                <HeaderContainer
                    icon="mingcute:chart-bar-fill"
                    header="Engagement Funnel"
                    classN="analytics-card funnel-section"
                    size="1rem"
                >
                    <div className="card-content funnel-chart-container">
                        <div className="funnel-chart-wrapper">
                            <FunnelChart data={FAKE_FUNNEL_DATA} />
                        </div>
                    </div>
                </HeaderContainer>
                <div className="analytics-grid">
                    <HeaderContainer icon="mdi:eye" header="Views" classN="analytics-card" size="1rem">
                        <div className="card-content">
                            <div className="views-grid">
                                <div className="views-squares-wrapper">
                                    <div className="view-square-wrapper">
                                        <div className="view-square">
                                            <div className="view-square-content">
                                                <span className="view-value">98</span>
                                                <span className="view-label">Logged-in</span>
                                                <span className="view-subtitle">45 unique</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="view-square-wrapper">
                                        <div className="view-square">
                                            <div className="view-square-content">
                                                <span className="view-value">58</span>
                                                <span className="view-label">Anonymous</span>
                                                <span className="view-subtitle">32 unique</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="view-total-wrapper">
                                    <div className="view-total">
                                        <div className="view-total-content">
                                            <span className="view-value">156</span>
                                            <span className="view-label">Total Views</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </HeaderContainer>
                    <HeaderContainer icon="mingcute:trending-up-fill" header="Engagement" classN="analytics-card" size="1rem">
                        <div className="card-content">
                            <div className="stat-large">
                                <span className="stat-value">15.4%</span>
                                <span className="stat-label">Engagement Rate</span>
                            </div>
                            <div className="rsvp-segments-display">
                                <div className="rsvp-segment-item going">
                                    <span className="segment-number">24</span>
                                    <span className="segment-label">Registrations</span>
                                </div>
                            </div>
                        </div>
                    </HeaderContainer>
                </div>
            </div>
        )
    },
    {
        id: 'details',
        label: 'Details',
        icon: 'mdi:pencil',
        description: 'Edit event name, date, location, and other basic information.',
        snippet: (
            <div className="event-editor-tab">
                <div className="editor-content create-event-v3-form">
                    <div className="form-section">
                        <label className="section-label">Event Name</label>
                        <div className="onboarding-field-preview">Annual Spring Gala</div>
                    </div>
                    <div className="form-section">
                        <label className="section-label">Date & Time</label>
                        <div className="onboarding-field-preview">Saturday, March 15, 2025 at 6:00 PM – 9:00 PM</div>
                    </div>
                    <div className="form-section">
                        <label className="section-label">Location</label>
                        <div className="onboarding-field-preview">Main Hall, Building A</div>
                    </div>
                </div>
            </div>
        )
    },
    {
        id: 'registrations',
        label: 'Registrations',
        icon: 'mdi:clipboard-list-outline',
        description: 'View registration responses, export to CSV, and manage form settings.',
        snippet: (
            <div className="registrations-tab">
                <div className="registrations-table-wrapper">
                    <table className="registrations-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Submitted</th>
                                <th className="th-actions">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Jane Doe</td>
                                <td>jane@example.com</td>
                                <td>3/13/2025, 2:30:00 PM</td>
                                <td className="td-actions" />
                            </tr>
                            <tr>
                                <td>John Smith</td>
                                <td>john@example.com</td>
                                <td>3/14/2025, 10:15:00 AM</td>
                                <td className="td-actions" />
                            </tr>
                            <tr>
                                <td>Alex Chen</td>
                                <td>alex@example.com</td>
                                <td>3/15/2025, 8:00:00 AM</td>
                                <td className="td-actions" />
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        )
    },
    {
        id: 'checkin',
        label: 'Check-In',
        icon: 'uil:qrcode-scan',
        description: 'Enable QR or link check-in and track attendance in real time.',
        snippet: (
            <div className="event-checkin-tab">
                <div className="checkin-stats">
                    <KpiCard title="Checked In" value={12} icon="mdi:account-check" iconVariant="approved" />
                    <KpiCard title="Total Registrations" value={24} icon="mdi:account-group" />
                    <KpiCard title="Check-In Rate" value="50%" icon="mdi:chart-line" />
                </div>
                <div className="checkin-methods">
                    <HeaderContainer
                        icon="fa7-solid:qrcode"
                        header="QR Code"
                        classN="checkin-section checkin-section-qr"
                        right={
                            <button type="button" className="copy-checkin-link-btn" disabled>
                                <Icon icon="mdi:link-variant" />
                                Copy link
                            </button>
                        }
                    >
                        <div className="checkin-section-content">
                            <div className="qr-code-display">
                                <div className="qr-code-image-container onboarding-qr-placeholder">
                                    <Icon icon="fa7-solid:qrcode" />
                                    <span>QR Code</span>
                                </div>
                            </div>
                        </div>
                    </HeaderContainer>
                </div>
            </div>
        )
    }
];

function EventDashboardOnboarding({ onClose, handleClose }) {
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
        <div className="event-dashboard-onboarding">
            <div className="event-dashboard-onboarding__header">
                <h2 className="event-dashboard-onboarding__title">Welcome to the Event Dashboard</h2>
                <p className="event-dashboard-onboarding__subtitle">
                    Here&apos;s a quick tour of what you can do
                </p>
            </div>

            <div className="event-dashboard-onboarding__slide">
                <div className="event-dashboard-onboarding__slide-header">
                    <Icon icon={slide.icon} className="slide-icon" />
                    <h3 className="slide-title">{slide.label}</h3>
                </div>
                <div className="event-dashboard-onboarding__snippet-area">
                    <div className="event-dashboard-onboarding__gradient-bg">
                        <img src={AtlasMain} alt="" />
                    </div>
                    <span className="event-dashboard-onboarding__preview-badge">Preview</span>
                    <div className="event-dashboard-onboarding__snippet-inner">{slide.snippet}</div>
                </div>
                <p className="event-dashboard-onboarding__description">{slide.description}</p>
            </div>

            <div className="event-dashboard-onboarding__footer">
                <div className="event-dashboard-onboarding__dots">
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
                <div className="event-dashboard-onboarding__actions">
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

export default EventDashboardOnboarding;
