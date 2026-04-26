import React from 'react';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import HeaderContainer from '../../../../components/HeaderContainer/HeaderContainer';
import MeetingCard from '../MeetingCard/MeetingCard';

function OverviewTab({ upcomingMeetings = [], pastMeetings = [], onMeetingClick }) {
    return (
        <div className="overview-content">
            <div className="stat-cards">
                <div className="stat-card">
                    <Icon icon="mdi:calendar-clock" className="stat-icon" />
                    <span className="stat-number">{upcomingMeetings.length}</span>
                    <span className="stat-label">Upcoming</span>
                </div>
                <div className="stat-card stat-card--active">
                    <Icon icon="mdi:circle-medium" className="stat-icon" />
                    <span className="stat-number">1</span>
                    <span className="stat-label">Ongoing</span>
                </div>
                <div className="stat-card">
                    <Icon icon="mdi:calendar-check" className="stat-icon" />
                    <span className="stat-number">{pastMeetings.length}</span>
                    <span className="stat-label">Past</span>
                </div>
                <div className="stat-card">
                    <Icon icon="mdi:file-document" className="stat-icon" />
                    <span className="stat-number">{pastMeetings.filter(m => m.hasMinutes).length}</span>
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
                        Upcoming <span className="section-count">({upcomingMeetings.length})</span>
                    </h2>
                    {upcomingMeetings.map((meeting) => (
                        <MeetingCard
                            key={meeting.id}
                            meeting={meeting}
                            onClick={() => onMeetingClick?.(meeting)}
                        />
                    ))}
                </div>

                <div className="past-meetings">
                    <h2 className="section-title">
                        Past <span className="section-count">({pastMeetings.length})</span>
                    </h2>
                    {pastMeetings.map((meeting) => (
                        <MeetingCard
                            key={meeting.id}
                            meeting={meeting}
                            onClick={() => onMeetingClick?.(meeting)}
                        />
                    ))}
                </div>
            </HeaderContainer>
        </div>
    );
}

export default OverviewTab;