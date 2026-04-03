import React from 'react';
import { useGradient } from '../../../hooks/useGradient';
import './Meetings.scss';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import TabbedContainer, { CommonTabConfigs } from '../../../components/TabbedContainer/TabbedContainer';


function Meetings(){
    const {AtlasMain} = useGradient();
    const tabs = [
        {
            id: 'overview',
            label: 'Overview',
            icon: 'mdi:view-dashboard',
            content: <Overview />
        },
        {
            id: 'meeting-minutes',
            label: 'Meeting Minutes',
            icon: 'mdi:file-document-outline',
            content: <MeetingMinutes />
        },
        {
            id: 'attendance-records',
            label: 'Attendance Records',
            icon: 'mdi:calendar-check-outline',
            content: <AttendanceRecords />
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
            </div>
        </div>


    )
}
export default Meetings;