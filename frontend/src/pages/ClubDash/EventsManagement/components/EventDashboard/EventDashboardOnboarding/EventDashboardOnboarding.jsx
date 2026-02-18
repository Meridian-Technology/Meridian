import React, { useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { useGradient } from '../../../../../../hooks/useGradient';
import AgendaItem from '../EventAgendaBuilder/AgendaItem';
import KpiCard from '../../../../../../components/Analytics/Dashboard/KpiCard';
import HeaderContainer from '../../../../../../components/HeaderContainer/HeaderContainer';
import FunnelChart from '../FunnelChart';
import EventDashboardChart from '../components/EventDashboardChart/EventDashboardChart';
import '../EventDashboard.scss';
import '../EventAgendaBuilder/AgendaBuilder.scss';
import '../EventJobsManager/JobsManager.scss';
import '../RegistrationsTab/RegistrationsTab.scss';
import '../EventCheckInTab/EventCheckInTab.scss';
import '../EventEditorTab/EventEditorTab.scss';
import '../EventQRTab/EventQRTab.scss';
import '../../../../../../components/EventCheckIn/EventCheckIn.scss';
import './EventDashboardOnboarding.scss';

function toCumulative(data) {
    let sum = 0;
    return data.map((d) => {
        sum += d.y;
        return { ...d, y: sum };
    });
}

function buildMockQRChartDates(daysBack = 14) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - daysBack);
    const result = [];
    const d = new Date(start);
    while (d <= today) {
        result.push(d.toISOString().slice(0, 10));
        d.setDate(d.getDate() + 1);
    }
    return result;
}

// Seeded pseudo-random for deterministic, realistic-looking daily scan counts
function seeded(seed, min, max) {
    const hash = (s) => s.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
    return Math.abs(hash(String(seed))) % (max - min + 1) + min;
}

function buildMockQRChartSeries() {
    const dates = buildMockQRChartDates(14);
    const dayOfWeek = (x) => new Date(x + 'T12:00:00').getDay();

    // Poster QR: physical posters, ramps up, weekend bumps, one promo spike
    const posterDaily = dates.map((x, i) => {
        const dow = dayOfWeek(x);
        const base = 3 + Math.floor(i * 0.8) + (dow === 0 || dow === 6 ? 4 : 0);
        const variation = seeded(x + 'poster', 0, 6);
        const spike = i === 5 ? 12 : 0; // promo day
        return Math.max(1, base + variation + spike);
    });

    // Email QR: campaign launch spike, then gradual decay
    const emailDaily = dates.map((x, i) => {
        const decay = i < 2 ? 18 - i * 4 : Math.max(2, 8 - i);
        const variation = seeded(x + 'email', 0, 4);
        return Math.max(0, decay + variation);
    });

    // Flyer QR: handouts at events, slower ramp, mid-week bump
    const flyerDaily = dates.map((x, i) => {
        const base = i < 3 ? 0 : 2 + Math.floor((i - 3) * 0.6);
        const variation = seeded(x + 'flyer', 0, 3);
        const bump = dayOfWeek(x) === 3 ? 5 : 0; // tabling day
        return Math.max(0, base + variation + bump);
    });

    return [
        { data: toCumulative(dates.map((x, i) => ({ x, y: posterDaily[i] }))), color: '#4DAA57', label: 'Poster QR' },
        { data: toCumulative(dates.map((x, i) => ({ x, y: emailDaily[i] }))), color: '#2563eb', label: 'Email QR' },
        { data: toCumulative(dates.map((x, i) => ({ x, y: flyerDaily[i] }))), color: '#f59e0b', label: 'Flyer QR' },
    ];
}

const MOCK_QR_DATES = buildMockQRChartDates(14);
const MOCK_QR_CHART_SERIES = buildMockQRChartSeries();
const MOCK_QR_EXPANDED_CHART_DATA = MOCK_QR_CHART_SERIES[0].data;
const MOCK_QR_TOTAL_SCANS = MOCK_QR_CHART_SERIES.reduce((sum, s) => sum + (s.data[s.data.length - 1]?.y ?? 0), 0);
const MOCK_QR_POSTER_SCANS = MOCK_QR_CHART_SERIES[0].data[MOCK_QR_CHART_SERIES[0].data.length - 1]?.y ?? 0;

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
    },
    {
        id: 'qr',
        label: 'QR Codes',
        icon: 'mdi:qrcode',
        description: 'Create event QR codes for posters, flyers, and emails. Track scans per code with the By QR chart and expand cards for individual performance.',
        snippet: (
            <div className="event-qr-tab event-qr-tab-onboarding">
                <div className="event-qr-overview-cards">
                    <div className="overview-card">
                        <span className="overview-value">3</span>
                        <span className="overview-label">QR Codes</span>
                    </div>
                    <div className="overview-card">
                        <span className="overview-value">{MOCK_QR_TOTAL_SCANS}</span>
                        <span className="overview-label">Total Scans</span>
                    </div>
                </div>
                <HeaderContainer
                    icon="mingcute:chart-line-fill"
                    header="Scan Growth"
                    classN="event-qr-chart-card"
                    size="1rem"
                    right={
                        <label className="chart-split-toggle">
                            <input type="checkbox" checked readOnly />
                            <span>By QR</span>
                        </label>
                    }
                >
                    <div className="chart-wrapper">
                        <EventDashboardChart
                            data={[]}
                            series={MOCK_QR_CHART_SERIES}
                            xDomain={MOCK_QR_DATES}
                            color="#4DAA57"
                            height={140}
                            emptyMessage="No scan data yet"
                        />
                    </div>
                </HeaderContainer>
                <HeaderContainer icon="mdi:qrcode" header="Your QR Codes" classN="event-qr-list-card" size="1rem">
                    <div className="event-qr-list">
                        <div className="event-qr-item expanded">
                            <div className="event-qr-item-main">
                                <div className="event-qr-preview">
                                    <div className="styled-qr-container onboarding-qr-placeholder">
                                        <Icon icon="fa7-solid:qrcode" />
                                    </div>
                                </div>
                                <div className="event-qr-info">
                                    <span className="event-qr-name">Poster QR</span>
                                    <span className="event-qr-stats">{MOCK_QR_POSTER_SCANS} scans · {Math.round(MOCK_QR_POSTER_SCANS * 0.72)} unique</span>
                                    <span className="event-qr-meta">Last scan: Today</span>
                                </div>
                                <Icon icon="mdi:chevron-up" className="expand-icon" />
                            </div>
                            <div className="event-qr-detail-chart">
                                <EventDashboardChart
                                    data={MOCK_QR_EXPANDED_CHART_DATA}
                                    xDomain={MOCK_QR_DATES}
                                    color="#4DAA57"
                                    height={120}
                                    emptyMessage="No scans yet"
                                />
                            </div>
                        </div>
                        <div className="event-qr-item">
                            <div className="event-qr-item-main">
                                <div className="event-qr-preview">
                                    <div className="styled-qr-container onboarding-qr-placeholder">
                                        <Icon icon="fa7-solid:qrcode" />
                                    </div>
                                </div>
                                <div className="event-qr-info">
                                    <span className="event-qr-name">Email QR</span>
                                    <span className="event-qr-stats">{MOCK_QR_CHART_SERIES[1].data[MOCK_QR_CHART_SERIES[1].data.length - 1]?.y ?? 0} scans · {Math.round((MOCK_QR_CHART_SERIES[1].data[MOCK_QR_CHART_SERIES[1].data.length - 1]?.y ?? 0) * 0.68)} unique</span>
                                </div>
                                <Icon icon="mdi:chevron-down" className="expand-icon" />
                            </div>
                        </div>
                    </div>
                </HeaderContainer>
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
