import React from 'react';
import { useGradient } from '../../../hooks/useGradient';
import './Meetings.scss';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import TabbedContainer from '../../../components/TabbedContainer/TabbedContainer';
import HeaderContainer from '../../../components/HeaderContainer/HeaderContainer';


function Meetings(){
    const {AtlasMain} = useGradient();
    const tabs = [
        {
            id: 'overview',
            label: 'Overview',
            icon: 'mdi:view-dashboard',
            content: (
                <div className="overview-content">
                    <div className="stat-cards">
                        <div className="stat-card">
                            <Icon icon="mdi:calendar-clock" className="stat-icon" />
                            <span className="stat-number">2</span>
                            <span className="stat-label">Upcoming</span>
                        </div>
                        <div className="stat-card stat-card--active">
                            <Icon icon="mdi:circle-medium" className="stat-icon" />
                            <span className="stat-number">1</span>
                            <span className="stat-label">Ongoing</span>
                        </div>
                        <div className="stat-card">
                            <Icon icon="mdi:calendar-check" className="stat-icon" />
                            <span className="stat-number">3</span>
                            <span className="stat-label">Past</span>
                        </div>
                        <div className="stat-card">
                            <Icon icon="mdi:file-document" className="stat-icon" />
                            <span className="stat-number">4</span>
                            <span className="stat-label">Meeting Minutes</span>
                        </div>
                    </div>
                    <HeaderContainer
                        icon="mdi:calendar-clock"
                        header="Meetings"
                        subheader="GBM & Officer Meetings"
                        right={<button className="plan-meeting-button">+ Plan Meeting</button>}
                        >
                        <div className="upcoming-meetings">
                            <h2 className="section-title">
                                <Icon icon="mdi:calendar-clock" width={20} />
                                Upcoming <span className="section-count">(2)</span>
                            </h2>

                            <div className="meeting-card">
                                <div className="meeting-card__top">
                                    <span className="meeting-tag meeting-tag--gbm">
                                        <Icon icon="mdi:account-group" width={14} /> General Body
                                    </span>
                                </div>
                                <div className="meeting-card__title">General Body Meeting - March</div>
                                <div className="meeting-card__meta">
                                    <span><Icon icon="mdi:calendar" width={14} /> 6:00 PM – 8:00 PM</span>
                                    <span><Icon icon="mdi:map-marker" width={14} /> Student Center Room 301</span>
                                </div>
                                <div className="meeting-card__rsvp">
                                    <span className="rsvp attending"><Icon icon="mdi:check-circle" width={14} /> 42 attending</span>
                                    <span className="rsvp excused"><Icon icon="mdi:close-circle" width={14} /> 8 excused</span>
                                    <span className="rsvp no-response"><Icon icon="mdi:help-circle" width={14} /> 15 no response</span>
                                </div>
                            </div>

                            <div className="meeting-card">
                                <div className="meeting-card__top">
                                    <span className="meeting-tag meeting-tag--officer">Officer</span>
                                </div>
                                <div className="meeting-card__title">Officer Meeting - Weekly Sync</div>
                                <div className="meeting-card__meta">
                                    <span><Icon icon="mdi:calendar" width={14} /> 2:00 PM – 3:00 PM</span>
                                    <span>Zoom</span>
                                </div>
                                <div className="meeting-card__rsvp">
                                    <span className="rsvp attending">7 attending</span>
                                    <span className="rsvp excused">0 excused</span>
                                    <span className="rsvp no-response">1 no response</span>
                                </div>
                            </div>
                        </div>

                        <div className="past-meetings">
                            <h2 className="section-title">
                                Past <span className="section-count">(3)</span>
                            </h2>

                            <div className="meeting-card">
                                <div className="meeting-card__top">
                                    <span className="meeting-tag meeting-tag--gbm">General Body</span>
                                    <div className="meeting-card__badges">
                                        <span className="badge badge--completed">Completed</span>
                                        <span className="badge badge--minutes">Minutes</span>
                                    </div>
                                </div>
                                <div className="meeting-card__title">General Body Meeting - February</div>
                                <div className="meeting-card__meta">
                                    <span>6:00 PM – 8:00 PM</span>
                                    <span>Student Center Room 301</span>
                                </div>
                                <div className="meeting-card__rsvp">
                                    <span className="rsvp attending">38 attending</span>
                                    <span className="rsvp excused">5 excused</span>
                                    <span className="rsvp no-response">22 no response</span>
                                </div>
                            </div>

                            <div className="meeting-card">
                                <div className="meeting-card__top">
                                    <span className="meeting-tag meeting-tag--special">Special / Officer</span>
                                    <div className="meeting-card__badges">
                                        <span className="badge badge--completed">Completed</span>
                                        <span className="badge badge--minutes">Minutes</span>
                                    </div>
                                </div>
                                <div className="meeting-card__title">Special Planning Session</div>
                                <div className="meeting-card__meta">
                                    <span>4:00 PM – 6:00 PM</span>
                                    <span>Conference Room A</span>
                                </div>
                                <div className="meeting-card__rsvp">
                                    <span className="rsvp attending">5 attending</span>
                                    <span className="rsvp excused">2 excused</span>
                                    <span className="rsvp no-response">0 no response</span>
                                </div>
                            </div>

                            <div className="meeting-card">
                                <div className="meeting-card__top">
                                    <span className="meeting-tag meeting-tag--officer">Officer</span>
                                    <div className="meeting-card__badges">
                                        <span className="badge badge--completed">Completed</span>
                                        <span className="badge badge--minutes">Minutes</span>
                                    </div>
                                </div>
                                <div className="meeting-card__title">Officer Meeting - Mar 3</div>
                                <div className="meeting-card__meta">
                                    <span>2:00 PM – 3:00 PM</span>
                                    <span>Zoom</span>
                                </div>
                                <div className="meeting-card__rsvp">
                                    <span className="rsvp attending">8 attending</span>
                                    <span className="rsvp excused">0 excused</span>
                                    <span className="rsvp no-response">0 no response</span>
                                </div>
                            </div>
                            </div>
                    </HeaderContainer>
                </div>
            )
        },
        {
            id: 'meeting-minutes',
            label: 'Meeting Minutes',
            icon: 'mdi:file-document-outline',
            // content: 
        },
        {
            id: 'attendance-records',
            label: 'Attendance Records',
            icon: 'mdi:calendar-check-outline',
            content: (
                <div className="attendance-content">
                    <p className="attendance-description">
                        Attendance is tracked per meeting. RSVP Yes → confirm attendance; RSVP No → excused; No response → unexcused.
                    </p>
                    <div className="attendance-cards">
        
                        <div className="attendance-card attendance-card--active">
                            <h3>GBM - March (in progress)</h3>
                            <span className="in-progress-label">
                                <span className="status-dot" /> In progress
                            </span>
                            <div className="attendance-stats">
                                <div className="stat attended">
                                    <Icon icon="mdi:check-circle" width={18} /> 42 attended
                                </div>
                                <div className="stat excused">
                                    <Icon icon="mdi:calendar-minus" width={18} /> 5 excused
                                </div>
                                <div className="stat unexcused">
                                    <Icon icon="mdi:calendar-remove" width={18} /> 3 unexcused
                                </div>
                            </div>
                            <div className="attendance-bar">
                                <div className="attendance-bar__fill" style={{ width: '84%' }} />
                            </div>
                            <span className="attendance-rate">84% attendance rate</span>
                            <span className="view-details">View details →</span>
                        </div>
        
                        <div className="attendance-card">
                            <h3>GBM - February</h3>
                            <div className="attendance-stats">
                                <div className="stat attended">
                                    <Icon icon="mdi:check-circle" width={18} /> 35 attended
                                </div>
                                <div className="stat excused">
                                    <Icon icon="mdi:calendar-minus" width={18} /> 5 excused
                                </div>
                                <div className="stat unexcused">
                                    <Icon icon="mdi:calendar-remove" width={18} /> 17 unexcused
                                </div>
                            </div>
                            <div className="attendance-bar">
                                <div className="attendance-bar__fill" style={{ width: '61%' }} />
                            </div>
                            <span className="attendance-rate">61% attendance rate</span>
                            <span className="view-details">View details →</span>
                        </div>
        
                        <div className="attendance-card">
                            <h3>Special Planning Session</h3>
                            <div className="attendance-stats">
                                <div className="stat attended">
                                    <Icon icon="mdi:check-circle" width={18} /> 5 attended
                                </div>
                                <div className="stat excused">
                                    <Icon icon="mdi:calendar-minus" width={18} /> 2 excused
                                </div>
                                <div className="stat unexcused">
                                    <Icon icon="mdi:calendar-remove" width={18} /> 0 unexcused
                                </div>
                            </div>
                            <div className="attendance-bar">
                                <div className="attendance-bar__fill" style={{ width: '71%' }} />
                            </div>
                            <span className="attendance-rate">71% attendance rate</span>
                            <span className="view-details">View details →</span>
                        </div>
        
                        <div className="attendance-card">
                            <h3>Officer Meeting - Mar 3</h3>
                            <div className="attendance-stats">
                                <div className="stat attended">
                                    <Icon icon="mdi:check-circle" width={18} /> 8 attended
                                </div>
                                <div className="stat excused">
                                    <Icon icon="mdi:calendar-minus" width={18} /> 0 excused
                                </div>
                                <div className="stat unexcused">
                                    <Icon icon="mdi:calendar-remove" width={18} /> 0 unexcused
                                </div>
                            </div>
                            <div className="attendance-bar">
                                <div className="attendance-bar__fill" style={{ width: '100%' }} />
                            </div>
                            <span className="attendance-rate">100% attendance rate</span>
                            <span className="view-details">View details →</span>
                        </div>
        
                    </div>
                </div>
            )
        }
    ];
    return(
        <div className="meetings dash">
            <header className="header">
                <h1>Meetings</h1>
                <p>Manage GBMs, officer meetings, attendance, and minutes</p>
                <img src={AtlasMain} alt="" />
            </header> 
            <div className="meeting-container">
                <div className="actions-header">
                    <button className="plan-meeting-button">+ Plan Meeting</button>
                </div>
                <div className="next-meeting">
                    <div className="meeting-status">
                        <span className="status-dot" />
                        <span className="status-label">Meeting in progress</span>
                    </div>
                    <div className="meeting-info">
                        <div className="meeting-info-top">
                            <span className="meeting-tag">GBM</span>
                            <span className="take-attendance">Take attendance</span>
                        </div>
                        <div className="meeting-title">GBM - March (in progress)</div>
                        <div className="meeting-location">
                        <Icon icon="mdi:map-marker" width={16} color="#6b7280" />
                            Student Center Room 301
                        </div>
                    </div>
                </div>
                <TabbedContainer
                    tabs={tabs}
                    defaultTab="overview"
                    tabPosition="top"
                    tabStyle="default"
                />
            </div>
        </div>
    );
}
export default Meetings;