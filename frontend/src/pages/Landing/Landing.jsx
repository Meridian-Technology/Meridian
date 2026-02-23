import React, { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import './Landing.scss';
import Header from "../../components/Header/Header";
import heroImage from "../../assets/Mockups/LandingMockup1.png";
import backgroundImage from "../../assets/LandingBackground.png";
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import WorkflowGraph from './WorkflowGraph';
import RPI from "../../assets/Schools/RPI.svg";
import useAuth from "../../hooks/useAuth";

function Landing() {
    const navigate = useNavigate();
    const [activeMetric, setActiveMetric] = useState('organizations');
    const [width, setWidth] = useState(window.innerWidth);
    const [isLoading, setIsLoading] = useState(true);
    const [assetsLoaded, setAssetsLoaded] = useState(false);
    const [bannerDismissed, setBannerDismissed] = useState(false);
    const [bannerScrolled, setBannerScrolled] = useState(false);

    const { isAuthenticating, isAuthenticated } = useAuth();
    const location = useLocation();

    const handleDismissBanner = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setBannerDismissed(true);
    };

    // Redirect logged-in users from / to events-dashboard; /landing stays accessible
    useEffect(() => {
        if (isAuthenticating) {
            return;
        }
        if (isAuthenticated && location.pathname === '/') {
            navigate('/events-dashboard');
        }
    }, [isAuthenticating, isAuthenticated, location.pathname]);

    useEffect(() => {
        window.addEventListener('resize', () => {
            setWidth(window.innerWidth);
        });
        return () => {
            window.removeEventListener('resize', () => {
                setWidth(window.innerWidth);
            });
        };
    }, []);

    // Wait for fonts and images to load before starting animations
    useEffect(() => {
        const loadAssets = async () => {
            try {
                // Wait for fonts to load
                if (document.fonts && document.fonts.ready) {
                    await document.fonts.ready;
                } else {
                    // Fallback: wait a bit for fonts if API not available
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

                // Preload and wait for images
                const imagesToLoad = [
                    heroImage,
                    backgroundImage,
                    RPI
                ];

                const imagePromises = imagesToLoad.map(src => {
                    return new Promise((resolve) => {
                        const img = new Image();
                        img.onload = resolve;
                        img.onerror = resolve; // Continue even if image fails
                        img.src = src;
                        // Timeout after 5 seconds to prevent hanging
                        setTimeout(resolve, 5000);
                    });
                });

                await Promise.all(imagePromises);

                // Small delay to ensure everything is rendered
                await new Promise(resolve => setTimeout(resolve, 100));

                setAssetsLoaded(true);
            } catch (error) {
                console.error('Error loading assets:', error);
                // Still show content even if loading fails
                setAssetsLoaded(true);
            }
        };

        loadAssets();
    }, []);

    // Scroll detection for banner (same hysteresis as Header)
    useEffect(() => {
        const scrollHandler = () => {
            const currentPos = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop;
            const container = document.querySelector('.landing-container');
            const containerPos = container ? container.scrollTop : 0;
            const scrollPosition = currentPos || containerPos;

            setBannerScrolled(prev => {
                if (prev) return scrollPosition > 30;
                return scrollPosition > 50;
            });
        };

        const container = document.querySelector('.landing-container');
        if (container) container.addEventListener('scroll', scrollHandler, { passive: true });
        window.addEventListener('scroll', scrollHandler, { passive: true });
        document.addEventListener('scroll', scrollHandler, { passive: true });
        scrollHandler();

        return () => {
            const c = document.querySelector('.landing-container');
            if (c) c.removeEventListener('scroll', scrollHandler);
            window.removeEventListener('scroll', scrollHandler);
            document.removeEventListener('scroll', scrollHandler);
        };
    }, []);

    // Show loader until assets are ready
    if (!assetsLoaded || isAuthenticating) {
        return (
            <div className="landing-loader">
                <div className="landing-loader__spinner"></div>
            </div>
        );
    }

    return (
        <div className="landing-container">
            <div className={`landing ${bannerDismissed ? 'landing--banner-dismissed' : 'landing--banner-visible'}`}>
                {!bannerDismissed && (
                    <div className={`landing-launch-banner ${bannerScrolled ? 'landing-launch-banner--scrolled' : ''}`}>
                        <Link to="/mobile" className="landing-launch-banner__link">
                            <Icon icon="mdi:apple" />
                            <span>Meridian is now on iOS — download the app</span>
                            <Icon icon="mdi:chevron-right" />
                        </Link>
                        <button
                            type="button"
                            className="landing-launch-banner__close"
                            onClick={handleDismissBanner}
                            aria-label="Dismiss banner"
                        >
                            <Icon icon="mdi:close" />
                        </button>
                    </div>
                )}
                <Header />

                {/* Hero */}
                <section className="hero"style={{backgroundImage: `url(${backgroundImage})`}}>
                    <div className="hero__container">
                        <div className="hero__content ">
                            <h1 className="hero__title">
                                <span className="hero__title-line hero__title-line--1">Building connected</span>
                                <br />
                                <span className="hero__title-line hero__title-line--1">campuses</span>
                            </h1>
                            <p className="hero__subtitle hero__subtitle--animated">Meridian unifies student life — organizations, events, and spaces — into one connected, data‑informed experience.</p>
                            <div className="hero__cta">
                                <button className="btn btn--primary" onClick={() => navigate('/events-dashboard')}>Get started</button>
                                <button className="btn btn--secondary" onClick={() => navigate('/contact')}>Explore demo</button>
                            </div>
                            {/* <div className="statbar">
                                <div className="stat"><span className="stat__num">8,000+</span><span className="stat__label">unique visitors</span></div>
                                <div className="stat"><span className="stat__num">200+/mo</span><span className="stat__label">events processed</span></div>
                                <div className="stat"><span className="stat__num">157</span><span className="stat__label">classrooms integrated</span></div>
                            </div> */}
                        </div>  
                        <div className="hero__visual">
                            <img src={heroImage} alt="Hero image" />
                        </div>
                    </div>
                </section>

                                {/* Pillars */}
                                <section className="pillars">
                    <div className="pillars__content">
                        <div className="pillars__head">
                            <h2 className="pillars__title">
                                <span className="pillars__title-line pillars__title-line--1">Our core pillars</span>
                                <br />
                                <span className="pillars__title-line pillars__title-line--2">for campus success</span>
                            </h2>
                        </div>
                        <div className="pillars__grid">
                            <div className="pillar">
                                <div className="pillar__icon">
                                    <Icon icon="wpf:connected" />
                                </div>
                                <h3>Connection</h3>
                                <p>Break silos so students, staff, and systems speak the same language.</p>
                            </div>
                            <div className="pillar">
                                <div className="pillar__icon">
                                    <Icon icon="mynaui:lightning-solid" />
                                </div>
                                <h3>Efficiency</h3>
                                <p>Approvals, scheduling, and coordination in minutes — not days.</p>
                            </div>
                            <div className="pillar">
                                <div className="pillar__icon">
                                    <Icon icon="ic:baseline-insights" />
                                </div>
                                <h3>Insight</h3>
                                <p>Cross‑sector data insights reveal how students, organizations, events, and spaces interact — enabling decisions that stick.</p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Feature grid */}
                <section className="features">
                    <div className="features__content">
                        <div className="features__head">
                            <h2>Everything your campus needs in one platform</h2>
                            <p>From discovering organizations to booking spaces — Meridian brings all the tools students and staff use daily into one connected experience.</p>
                        </div>
                        <div className="features__grid">
                            <div className="feature feature--small">
                                <div className="feature__content">
                                    <h4>Unified directory</h4>
                                    <p>Search and discover all campus organizations, events, and spaces from one place. Filter by interests, membership size, or activity level.</p>
                                </div>
                                <div className="feature__visual">
                                    <div className="feature-mockup unified-directory">
                                        <div className="feature-mockup__search">
                                            <Icon icon="mdi:search" />
                                            <span>Search organizations, events, or spaces...</span>
                                        </div>
                                        <div className="feature-mockup__filters">
                                            <span className="feature-mockup__filter">All</span>
                                            <span className="feature-mockup__filter feature-mockup__filter--active">Organizations</span>
                                            <span className="feature-mockup__filter">Events</span>
                                            <span className="feature-mockup__filter">Spaces</span>
                                        </div>
                                        <div className="feature-mockup__list">
                                            <div className="feature-mockup__item focus">
                                                <div className="feature-mockup__item-icon"></div>
                                                <div className="feature-mockup__item-content">
                                                    <div className="feature-mockup__item-title">Student Government</div>
                                                    <div className="feature-mockup__item-meta">156 members • Active weekly</div>
                                                    <button className="feature-mockup__btn">Apply to join</button>
                                                </div>
                                            </div>
                                            <div className="feature-mockup__item">
                                                <div className="feature-mockup__item-icon"></div>
                                                <div className="feature-mockup__item-content">
                                                    <div className="feature-mockup__item-title">Super Smash Bros Club</div>
                                                    <div className="feature-mockup__item-meta">12 members • Active weekly</div>
                                                    <button className="feature-mockup__btn">Join</button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="feature feature--large">
                                <div className="feature__content">
                                    <h4>Streamlined approvals</h4>
                                    <p>Configure workflows that automatically route based on event attributes. Notify stakeholders, request acknowledgments, or require approvals — all determined by your rules.</p>
                                </div>
                                <div className="feature__visual">
                                    <div className="feature-mockup workflow">
                                        <WorkflowGraph />
                                    </div>
                                </div>
                            </div>
                            <div className="feature feature--large">
                                <div className="feature__content">
                                    <h4>Event planning workspace</h4>
                                    <p>Plan events with built-in RSVP tracking, attendee management, and automated reminders. See who's coming, send updates, and manage check-ins all in one place.</p>
                                </div>
                                <div className="feature__visual">
                                    <div className="feature-mockup feature-mockup--workspace">
                                        <div className="feature-mockup__workspace-container">
                                            <div className="feature-mockup__workspace-header full">
                                                <h3>Event Draft</h3>
                                                <div className="feature-mockup__workspace-meta">
                                                    {/* last edited by x */}
                                                    <span className="feature-mockup__workspace-meta-item">Last edited by John Doe • 1 hour ago</span>
                                                    <span className="feature-mockup__badge" style={{marginLeft: '10px'}}>Draft</span>
                                                </div>
                                            </div>
                                            <div className="feature-mockup__workspace__full__item">

                                                <div className="feature-mockup__workspace-header">
                                                    <div>
                                                        <div className="feature-mockup__workspace-title">Tech Workshop Series</div>
                                                        <div className="feature-mockup__workspace-meta">Apr 15, 2025 • Innovation Lab • 47 RSVPs</div>
                                                    </div>
                                                </div>
                                                <div className="feature-mockup__workspace-tabs">
                                                    <span className="feature-mockup__tab feature-mockup__tab--active">Overview</span>
                                                    <span className="feature-mockup__tab">Attendees</span>
                                                    <span className="feature-mockup__tab">Resources</span>
                                                </div>
                                                <div className="feature-mockup__workspace-content">
                                                    <div className="feature-mockup__workspace-section">
                                                        <div className="feature-mockup__section-header">
                                                            <Icon icon="mdi:check-circle-outline" />
                                                            <span>Approvals</span>
                                                        </div>
                                                        <div className="feature-mockup__approval-list">
                                                            <div className="feature-mockup__approval-item feature-mockup__approval-item--approved">
                                                                <Icon icon="mdi:check-circle" />
                                                                <div>
                                                                    <div className="feature-mockup__approval-name">Room Reservation</div>
                                                                    <div className="feature-mockup__approval-meta">Facilities • Approved 2 days ago</div>
                                                                </div>
                                                            </div>
                                                            <div className="feature-mockup__approval-item feature-mockup__approval-item--pending">
                                                                <Icon icon="mdi:clock-outline" />
                                                                <div>
                                                                    <div className="feature-mockup__approval-name">Advisor Review</div>
                                                                    <div className="feature-mockup__approval-meta">Sarah Chen • Pending</div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="feature-mockup__workspace-section">
                                                        <div className="feature-mockup__section-header">
                                                            <Icon icon="mdi:account-group" />
                                                            <span>Attendees</span>
                                                            <span className="feature-mockup__section-badge">47</span>
                                                        </div>
                                                        <div className="feature-mockup__attendee-preview">
                                                            <div className="feature-mockup__attendee-avatars">
                                                                <div className="feature-mockup__avatar"></div>
                                                                <div className="feature-mockup__avatar"></div>
                                                                <div className="feature-mockup__avatar"></div>
                                                                <div className="feature-mockup__avatar feature-mockup__avatar--more">+44</div>
                                                            </div>
                                                            <div className="feature-mockup__attendee-stats">
                                                                <span>42 confirmed</span>
                                                                <span>•</span>
                                                                <span>5 waitlist</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="feature feature--small">
                                <div className="feature__content">
                                    <h4>Space booking</h4>
                                    <p>Browse available rooms, see real-time schedules, and book spaces instantly. Check amenities, capacity, and location — then reserve with one click.</p>
                                </div>
                                <div className="feature__visual">
                                    <div className="feature-mockup space-booking">
                                        <div className="feature-mockup__header">
                                            <span>Book a Space</span>
                                            <span className="feature-mockup__badge">Today</span>
                                        </div>
                                        <div className="feature-mockup__list">
                                            <div className="feature-mockup__item feature-mockup__item--bookable focus">
                                                <div className="feature-mockup__item-icon"></div>
                                                <div className="feature-mockup__item-content">
                                                    <div className="feature-mockup__item-title">Library Study Room A</div>
                                                    <div className="feature-mockup__item-rating">
                                                        <Icon icon="mdi:star" />
                                                        <span>4.7</span>
                                                        <span className="feature-mockup__item-rating-count">(23)</span>
                                                    </div>
                                                    <div className="feature-mockup__item-meta">Capacity: 8 • 2:00-4:00 PM available</div>
                                                    <div className="feature-mockup__item-history">You usually book this at 2:00 PM</div>
                                                </div>
                                                <button className="feature-mockup__btn feature-mockup__btn--small">Book</button>
                                            </div>
                                            <div className="feature-mockup__item">
                                                <div className="feature-mockup__item-icon"></div>
                                                <div className="feature-mockup__item-content">
                                                    <div className="feature-mockup__item-title">Conference Hall B</div>
                                                    <div className="feature-mockup__item-rating">
                                                        <Icon icon="mdi:star" />
                                                        <span>4.2</span>
                                                        <span className="feature-mockup__item-rating-count">(15)</span>
                                                    </div>
                                                    <div className="feature-mockup__item-meta feature-mockup__item-meta--busy">Occupied until 3pm</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            {/* <div className="feature feature--small">
                                <div className="feature__content">
                                    <h4>Messaging & notices</h4>
                                    <p>Facilitate open communications from organizations and administrators to students. Keep everyone informed with timely updates, deadlines, and important announcements.</p>
                                </div>
                                <div className="feature__visual">
                                    <div className="feature-mockup">
                                        <div className="feature-mockup__header">
                                            <span>Campus Notices</span>
                                            <span className="feature-mockup__badge">5 new</span>
                                        </div>
                                        <div className="feature-mockup__list">
                                            <div className="feature-mockup__notice feature-mockup__notice--urgent">
                                                <div className="feature-mockup__notice-dot feature-mockup__notice-dot--urgent"></div>
                                                <div className="feature-mockup__notice-content">
                                                    <div className="feature-mockup__notice-title">Course drop deadline approaching</div>
                                                    <div className="feature-mockup__notice-meta">Dean's Office • Ends in 3 days</div>
                                                </div>
                                            </div>
                                            <div className="feature-mockup__notice">
                                                <div className="feature-mockup__notice-dot"></div>
                                                <div className="feature-mockup__notice-content">
                                                    <div className="feature-mockup__notice-title">Student Government: Spring elections open</div>
                                                    <div className="feature-mockup__notice-meta">Student Government • 2h ago</div>
                                                </div>
                                            </div>
                                            <div className="feature-mockup__notice">
                                                <div className="feature-mockup__notice-dot"></div>
                                                <div className="feature-mockup__notice-content">
                                                    <div className="feature-mockup__notice-title">Financial Aid: FAFSA reminder</div>
                                                    <div className="feature-mockup__notice-meta">Financial Aid Office • 5h ago</div>
                                                </div>
                                            </div>
                                            <div className="feature-mockup__notice">
                                                <div className="feature-mockup__notice-dot"></div>
                                                <div className="feature-mockup__notice-content">
                                                    <div className="feature-mockup__notice-title">Housing: Room selection opens next week</div>
                                                    <div className="feature-mockup__notice-meta">Residence Life • 1d ago</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="feature feature--large">
                                <div className="feature__content">
                                    <h4>Integrations</h4>
                                    <p>Work with existing campus systems to accelerate adoption and results. Connect your tools, not replace them.</p>
                                </div>
                                <div className="feature__visual">
                                    <div className="feature-mockup">
                                        <div className="feature-mockup__header">
                                            <span>Connected Services</span>
                                        </div>
                                        <div className="feature-mockup__integrations">
                                            <div className="feature-mockup__integration">
                                                <div className="feature-mockup__integration-icon"></div>
                                                <span>Google Calendar</span>
                                                <span className="feature-mockup__integration-status feature-mockup__integration-status--active">Active</span>
                                            </div>
                                            <div className="feature-mockup__integration">
                                                <div className="feature-mockup__integration-icon"></div>
                                                <span>Slack</span>
                                                <span className="feature-mockup__integration-status feature-mockup__integration-status--active">Active</span>
                                            </div>
                                            <div className="feature-mockup__integration">
                                                <div className="feature-mockup__integration-icon"></div>
                                                <span>Student Portal</span>
                                                <span className="feature-mockup__integration-status feature-mockup__integration-status--active">Active</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div> */}
                        </div>
                    </div>
                </section>


                {/* Metrics: Orgs, Events, Spaces */}
                <section className="metrics">
                    <div className="metrics__content">
                        <div className="metrics__head">
                            <h2 className="metrics__title">
                                <span className="metrics__title-line metrics__title-line--1">Understand how Students</span>
                                <br />
                                <span className="metrics__title-line metrics__title-line--2">Enagage</span>
                            </h2>
                            <p className="metrics__subtitle">Go beyond point-in-time snapshots. Get AI-powered insights that tell you exactly what to do next, which orgs need support, which events are at risk, and where capacity gaps are coming.</p>
                        </div>
                        <div className="metrics__container">
                            <div className="metrics__tabs">
                                <button 
                                    className={`metrics__tab ${activeMetric === 'organizations' ? 'active' : ''}`}
                                    onClick={() => setActiveMetric('organizations')}
                                >
                                    <div className="metrics__tab-icon">
                                        <Icon icon="mdi:account-group" />
                                    </div>
                                    <div className="metrics__tab-content">
                                        <h3 className="metrics__tab-title">Organizations</h3>
                                        <p className="metrics__tab-description">Identify which groups need support and predict cross-sector engagement opportunities.</p>
                                        {/* <div className="metrics__tab-metric">
                                            <span className="metrics__tab-metric-label">Needs Support</span>
                                            <span className="metrics__tab-metric-value">12</span>
                                        </div> */}
                                    </div>
                                </button>
                                <button 
                                    className={`metrics__tab ${activeMetric === 'events' ? 'active' : ''}`}
                                    onClick={() => setActiveMetric('events')}
                                >
                                    <div className="metrics__tab-icon">
                                        <Icon icon="mdi:calendar-check" />
                                    </div>
                                    <div className="metrics__tab-content">
                                        <h3 className="metrics__tab-title">Events</h3>
                                        <p className="metrics__tab-description">Spot events at risk and identify opportunities to maximize cross-sector participation.</p>
                                        {/* <div className="metrics__tab-metric">
                                            <span className="metrics__tab-metric-label">At Risk</span>
                                            <span className="metrics__tab-metric-value">5</span>
                                        </div> */}
                                    </div>
                                </button>
                                <button 
                                    className={`metrics__tab ${activeMetric === 'spaces' ? 'active' : ''}`}
                                    onClick={() => setActiveMetric('spaces')}
                                >
                                    <div className="metrics__tab-icon">
                                        <Icon icon="mdi:map-marker-multiple" />
                                    </div>
                                    <div className="metrics__tab-content">
                                        <h3 className="metrics__tab-title">Spaces</h3>
                                        <p className="metrics__tab-description">Identify maintenance needs from student reviews and prioritize facility improvements that impact satisfaction.</p>
                                        {/* <div className="metrics__tab-metric">
                                            <span className="metrics__tab-metric-label">Needs Maintenance</span>
                                            <span className="metrics__tab-metric-value">7</span>
                                        </div> */}
                                    </div>
                                </button>
                            </div>
                            <div className="metrics__visual">
                                {/* <div className="header">
                                    <h4>Organizations Dashboard</h4>
                                    <div className="header-controls">
                                        <button className="dashboard-mockup__header-control">
                                            <Icon icon="mdi:filter" />
                                            <span>Filter</span>
                                        </button>
                                        <button className="dashboard-mockup__header-control">
                                            <Icon icon="mdi:sort" />
                                            <span>Sort</span>
                                        </button>
                                    </div>
                                </div> */}
                                {activeMetric === 'organizations' && (
                                    <div className="metrics__visual-content">
                                        <div className="dashboard-mockup">
                                            <div className="dashboard-mockup__insight">
                                                <div className="dashboard-mockup__insight-icon">
                                                    <Icon icon="octicon:sparkle-fill-24" />
                                                </div>
                                                <div className="dashboard-mockup__insight-content">
                                                    <div className="dashboard-mockup__insight-title">Weekly report focus</div>
                                                    <div className="dashboard-mockup__insight-text">Track member growth rates, event participation by org, and retention trends. Filter by org size, sector, and engagement level to identify intervention opportunities.</div>
                                                </div>
                                            </div>
                                            <div className="dashboard-mockup__header">
                                                <h4>Organizations Dashboard</h4>
                                                <div className="dashboard-mockup__header-controls">
                                                    <span className="dashboard-mockup__header-timeframe">Last 30 days</span>
                                                </div>
                                            </div>
                                            <div className="dashboard-mockup__metrics">
                                                <div className="dashboard-mockup__metric">
                                                    <div className="dashboard-mockup__metric-icon">
                                                        <Icon icon="mdi:rocket-launch" />
                                                    </div>
                                                    <div className="dashboard-mockup__metric-label">High-Impact Opportunities</div>
                                                    <div className="dashboard-mockup__metric-value">5</div>
                                                    <div className="dashboard-mockup__metric-trend">AI identified</div>
                                                    <div className="dashboard-mockup__metric-sublabel">Ready to scale</div>
                                                </div>
                                                <div className="dashboard-mockup__metric">
                                                    <div className="dashboard-mockup__metric-icon">
                                                        <Icon icon="mdi:trending-up" />
                                                    </div>
                                                    <div className="dashboard-mockup__metric-label">Growing Organizations</div>
                                                    <div className="dashboard-mockup__metric-value">12 orgs</div>
                                                    <div className="dashboard-mockup__metric-trend">+25% this month</div>
                                                    <div className="dashboard-mockup__metric-sublabel">Member growth</div>
                                                </div>
                                                <div className="dashboard-mockup__metric">
                                                    <div className="dashboard-mockup__metric-icon">
                                                        <Icon icon="mdi:link-variant" />
                                                    </div>
                                                    <div className="dashboard-mockup__metric-label">Active Cross-Sector Connections</div>
                                                    <div className="dashboard-mockup__metric-value">24</div>
                                                    <div className="dashboard-mockup__metric-trend">Strong engagement</div>
                                                    <div className="dashboard-mockup__metric-sublabel">Org ↔ Event partnerships</div>
                                                </div>
                                            </div>
                                            {/* <div className="dashboard-mockup__chart">
                                                <div className="placeholder"></div>
                                            </div> */}
                                        </div>
                                    </div>
                                )}
                                {activeMetric === 'events' && (
                                    <div className="metrics__visual-content">
                                        <div className="dashboard-mockup">
                                            <div className="dashboard-mockup__insight">
                                                <div className="dashboard-mockup__insight-icon">
                                                    <Icon icon="octicon:sparkle-fill-24" />
                                                </div>
                                                <div className="dashboard-mockup__insight-content">
                                                    <div className="dashboard-mockup__insight-title">Weekly report focus</div>
                                                    <div className="dashboard-mockup__insight-text">Monitor RSVP trends, attendance rates, and cross-org participation. Segment by event type, time of day, and organizer to optimize scheduling and identify promotion opportunities.</div>
                                                </div>
                                            </div>
                                            <div className="dashboard-mockup__header">
                                                <h4>Events Dashboard</h4>
                                                <div className="dashboard-mockup__header-controls">
                                                    <span className="dashboard-mockup__header-timeframe">Last 30 days</span>
                                                </div>
                                            </div>
                                            <div className="dashboard-mockup__metrics">
                                                <div className="dashboard-mockup__metric">
                                                    <div className="dashboard-mockup__metric-icon">
                                                        <Icon icon="mdi:star" />
                                                    </div>
                                                    <div className="dashboard-mockup__metric-label">High-Performing Events</div>
                                                    <div className="dashboard-mockup__metric-value">18</div>
                                                    <div className="dashboard-mockup__metric-trend">Above 90% capacity</div>
                                                    <div className="dashboard-mockup__metric-sublabel">Strong engagement</div>
                                                </div>
                                                <div className="dashboard-mockup__metric">
                                                    <div className="dashboard-mockup__metric-icon">
                                                        <Icon icon="mdi:clock-outline" />
                                                    </div>
                                                    <div className="dashboard-mockup__metric-label">Peak Scheduling Windows</div>
                                                    <div className="dashboard-mockup__metric-value">3</div>
                                                    <div className="dashboard-mockup__metric-trend">This month</div>
                                                    <div className="dashboard-mockup__metric-sublabel">Optimal times identified</div>
                                                </div>
                                                <div className="dashboard-mockup__metric">
                                                    <div className="dashboard-mockup__metric-icon">
                                                        <Icon icon="iconamoon:trend-up" />
                                                    </div>
                                                    <div className="dashboard-mockup__metric-label">Top Events This Month</div>
                                                    <div className="dashboard-mockup__metric-value">12</div>
                                                    <div className="dashboard-mockup__metric-trend">+150 avg RSVPs</div>
                                                    <div className="dashboard-mockup__metric-sublabel">Record attendance</div>
                                                </div>
                                            </div>
                                            {/* <div className="dashboard-mockup__chart">
                                                <div className="placeholder"></div>
                                            </div> */}
                                        </div>
                                    </div>
                                )}
                                {activeMetric === 'spaces' && (
                                    <div className="metrics__visual-content">
                                        <div className="dashboard-mockup">
                                            <div className="dashboard-mockup__insight">
                                                <div className="dashboard-mockup__insight-icon">
                                                    <Icon icon="octicon:sparkle-fill-24" />
                                                </div>
                                                <div className="dashboard-mockup__insight-content">
                                                    <div className="dashboard-mockup__insight-title">Weekly report focus</div>
                                                    <div className="dashboard-mockup__insight-text">Analyze utilization rates, booking patterns, and satisfaction scores. Group by building, room type, and time slots to prioritize maintenance and optimize space allocation.</div>
                                                </div>
                                            </div>
                                            <div className="dashboard-mockup__header">
                                                <h4>Spaces Dashboard</h4>
                                                <div className="dashboard-mockup__header-controls">
                                                    <span className="dashboard-mockup__header-timeframe">Last 30 days</span>
                                                </div>
                                            </div>
                                            <div className="dashboard-mockup__metrics">
                                                <div className="dashboard-mockup__metric">
                                                    <div className="dashboard-mockup__metric-icon">
                                                        <Icon icon="mdi:wrench" />
                                                    </div>
                                                    <div className="dashboard-mockup__metric-label">Rooms Need Maintenance</div>
                                                    <div className="dashboard-mockup__metric-value">7</div>
                                                    <div className="dashboard-mockup__metric-trend">Urgent priority</div>
                                                    <div className="dashboard-mockup__metric-sublabel">From student reviews</div>
                                                </div>
                                                <div className="dashboard-mockup__metric">
                                                    <div className="dashboard-mockup__metric-icon">
                                                        <Icon icon="fluent:building-20-regular" />
                                                    </div>
                                                    <div className="dashboard-mockup__metric-label">Quality Score Trending Down</div>
                                                    <div className="dashboard-mockup__metric-value">4.2</div>
                                                    <div className="dashboard-mockup__metric-trend">↓ -0.3 this month</div>
                                                    <div className="dashboard-mockup__metric-sublabel">Review sentiment declining</div>
                                                </div>
                                                <div className="dashboard-mockup__metric">
                                                    <div className="dashboard-mockup__metric-icon">
                                                        <Icon icon="mdi:clock-outline" />
                                                    </div>
                                                    <div className="dashboard-mockup__metric-label">Peak Usage Windows</div>
                                                    <div className="dashboard-mockup__metric-value">3</div>
                                                    <div className="dashboard-mockup__metric-trend">Daily patterns</div>
                                                    <div className="dashboard-mockup__metric-sublabel">Schedule around these times</div>
                                                </div>
                                            </div>
                                            {/* <div className="dashboard-mockup__chart">
                                                <div className="placeholder"></div>
                                            </div> */}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </section>

                {/* Use cases */}
                {/* <section className="usecases">
                    <div className="usecases__content">
                        <div className="usecases__item">
                            <div className="usecases__copy">
                                <h2>Organizations</h2>
                                <p>Discoverable communities, simple outreach, and clear engagement signals — finally see which groups are thriving and where to support.</p>
                            </div>
                            <div className="placeholder"></div>
                        </div>
                        <div className="usecases__item">
                            <div className="usecases__copy">
                                <h2>Events</h2>
                                <p>One workspace for planning and approvals with engagement analytics that reveal what brings students together.</p>
                            </div>
                            <div className="placeholder"></div>
                        </div>
                        <div className="usecases__item">
                            <div className="usecases__copy">
                                <h2>Spaces</h2>
                                <p>Real‑time visibility into availability and utilization to reduce conflicts and match how students actually study and collaborate.</p>
                            </div>
                            <div className="placeholder"></div>
                        </div>
                    </div>
                </section> */}



                {/* Data Insights */}
                {/* <section className="insights">
                    <div className="insights__content">
                        <div className="insights__head">
                            <h2>Actionable insights from unified data</h2>
                            <p>By connecting organizations, events, and spaces into one platform, Meridian captures interactions across all three sectors — delivering insights no siloed system can match.</p>
                        </div>
                        <div className="insights__grid">
                            <div className="insight">
                                <h4>Cross‑sector analytics</h4>
                                <p>See how organization membership drives event attendance, how space preferences correlate with student engagement, and which intersections drive the most value.</p>
                            </div>
                            <div className="insight">
                                <h4>Student journey mapping</h4>
                                <p>Track how students move from discovering organizations to attending events to using spaces — identify friction points and optimization opportunities.</p>
                            </div>
                            <div className="insight">
                                <h4>Predictive planning</h4>
                                <p>Use interaction patterns to forecast event success, anticipate space demand, and recommend organizations to students based on their activity.</p>
                            </div>
                            <div className="insight">
                                <h4>Resource allocation</h4>
                                <p>Data‑driven decisions on where to invest support, which spaces need expansion, and which event types generate the strongest engagement.</p>
                            </div>
                        </div>
                        <div className="insights__visual">
                            <div className="placeholder"></div>
                        </div>
                    </div>
                </section> */}

                {/* Credibility */}
                <section className="cred">
                    <div className="cred__content">
                        <div className="cred__head">
                            <h2>Organic growth, real impact</h2>
                            <p>Built by students, for students. See how Meridian gained traction through grassroots adoption—proving value before any institutional commitment.</p>
                        </div>
                        <div className="cred__card">
                            <div className="cred__badge">
                                <div className="cred__logo-container">
                                    <img src={RPI} alt="RPI Alpha" className="cred__logo" />
                                </div>
                                <div className="cred__text">
                                    <h4>RPI Alpha</h4>
                                    <p>Campus‑wide traction with sustained weekly actives and active RFP consideration.</p>
                                </div>
                            </div>
                            <div className="cred__stats">
                                <div className="cred__stat">
                                    <div className="cred__stat-value">8,000+</div>
                                    <div className="cred__stat-label">unique visitors</div>
                                </div>
                                <div className="cred__stat">
                                    <div className="cred__stat-value">13%</div>
                                    <div className="cred__stat-label">of campus uses weekly</div>
                                </div>
                                <div className="cred__stat">
                                    <div className="cred__stat-value">200+/mo</div>
                                    <div className="cred__stat-label">events processed</div>
                                </div>
                                <div className="cred__stat">
                                    <div className="cred__stat-value">157</div>
                                    <div className="cred__stat-label">classrooms integrated</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Testimonials */}
                {/* <section className="testimonials">
                    <div className="testimonials__content">
                        <div className="testimonials__grid">
                            <div className="quote">
                                <p>"Planning used to take weeks — now it takes days. Our students notice the difference."</p>
                                <span className="quote__meta">Student Activities Coordinator</span>
                            </div>
                            <div className="quote">
                                <p>"For the first time we can see which orgs need help and where to invest."</p>
                                <span className="quote__meta">Dean of Students Office</span>
                            </div>
                            <div className="quote">
                                <p>"Facilities finally has data to balance study spaces during peak weeks."</p>
                                <span className="quote__meta">Campus Operations</span>
                            </div>
                        </div>
                    </div>
                </section> */}

                {/* Pricing teaser */}
                <section className="pricing">
                    <div className="pricing__content">
                        <div className="pricing__head">
                            <h2>Built to scale across your campus</h2>
                            <p>Simple entry, expand by enrollment and departments as you grow.</p>
                        </div>
                        <div className="pricing__grid">
                            <div className="pricecard">
                                <div className="pricecard__header">
                                    <h4>Communities</h4>
                                    <p className="pricecard__description">Perfect for small teams getting started</p>
                                </div>
                                <div className="pricecard__price-section">
                                    <p className="pricecard__price">Contact us</p>
                                </div>
                                <button className="pricecard__cta" onClick={() => navigate('/contact')}>Get started</button>
                                <div className="pricecard__features">
                                    <div className="pricecard__feature">
                                        <Icon icon="mdi:check-circle" />
                                        <span>Organizations & events</span>
                                    </div>
                                    <div className="pricecard__feature">
                                        <Icon icon="mdi:check-circle" />
                                        <span>Standard approvals</span>
                                    </div>
                                    <div className="pricecard__feature">
                                        <Icon icon="mdi:check-circle" />
                                        <span>Email support</span>
                                    </div>
                                </div>
                            </div>
                            <div className="pricecard pricecard--highlight">
                                {/* <div className="pricecard__badge">Most Popular</div> */}
                                <div className="pricecard__header">
                                    <h4>Campus</h4>
                                    <p className="pricecard__description">For institutions ready to scale</p>
                                </div>
                                <div className="pricecard__price-section">
                                    <p className="pricecard__price">Contact us</p>
                                </div>
                                <button className="pricecard__cta pricecard__cta--primary" onClick={() => navigate('/contact')}>Get started</button>
                                <div className="pricecard__features">
                                    <div className="pricecard__feature">
                                        <Icon icon="mdi:check-circle" />
                                        <span>SAML/SSO integration</span>
                                    </div>
                                    <div className="pricecard__feature">
                                        <Icon icon="mdi:check-circle" />
                                        <span>Custom workflows</span>
                                    </div>
                                    <div className="pricecard__feature">
                                        <Icon icon="mdi:check-circle" />
                                        <span>Dedicated support</span>
                                    </div>
                                    <div className="pricecard__feature">
                                        <Icon icon="mdi:check-circle" />
                                        <span>Spaces & utilization</span>
                                    </div>
                                    <div className="pricecard__feature">
                                        <Icon icon="mdi:check-circle" />
                                        <span>Analytics & exports</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* FAQ */}
                {/* <section className="faq">
                    <div className="faq__head">
                        <h2>Frequently asked</h2>
                    </div>
                    <div className="faq__list">
                        <details>
                            <summary>Do we need to replace our existing tools?</summary>
                            <p>No — Meridian integrates with your current systems to accelerate adoption.</p>
                        </details>
                        <details>
                            <summary>How fast can we launch?</summary>
                            <p>Most schools pilot within weeks, expanding by department or campus over time.</p>
                        </details>
                        <details>
                            <summary>How is pricing structured?</summary>
                            <p>We scale by enrollment and scope, starting near $25–30K annually per institution.</p>
                        </details>
                    </div>
                </section> */}

                {/* CTA */}
                <section className="cta">
                    <div className="cta__content">
                        <h2>Ready to connect your campus?</h2>
                        <p>Start with a pilot, then scale across departments and campuses.</p>
                        <div className="hero__cta">
                            <button className="btn btn--primary" onClick={() => navigate('/contact')}>Contact us</button>
                            {/* <button className="btn btn--secondary" onClick={() => navigate('/login')}>Sign in</button> */}
                        </div>
                    </div>
                </section>

                {/* Footer */}
                <footer className="footer">
                    <div className="footer__grid">
                        <div className="footer__col">
                            <h5>Meridian</h5>
                            <p>Building connected campuses.</p>
                        </div>
                        <div className="footer__col">
                            <h6>Product</h6>
                            <a href="/contact">Demo</a>
                            <a href="/documentation">Docs</a>
                            <a href="/mobile">Mobile app</a>
                        </div>
                        <div className="footer__col">
                            <h6>Company</h6>
                            <a href="/login">Sign in</a>
                            <a href="/register">Create account</a>
                        </div>
                        <div className="footer__col">
                            <h6>Legal</h6>
                            <a href="/privacy-policy">Privacy Policy</a>
                            <a href="/contact">Contact</a>
                        </div>
                    </div>
                    <div className="footer__legal">© {new Date().getFullYear()} Meridian</div>
                </footer>
            </div>
        </div>
    );
}

export default Landing;