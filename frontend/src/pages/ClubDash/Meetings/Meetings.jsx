import React, { useState } from 'react';
import { useGradient } from '../../../hooks/useGradient';
import './Meetings.scss';
import TabbedContainer from '../../../components/TabbedContainer/TabbedContainer';
import NextMeetingBanner from './NextMeetingBanner/NextMeetingBanner';
import OverviewTab from './Tabs/OverviewTab';
import AttendanceTab from './Tabs/AttendanceTab';
import MinutesTab from './Tabs/MinutesTab';
import Meeting from './Meeting/Meeting';

const defaultUpcomingMeetings = [
    {
        id: 'gbm-march',
        type: 'gbm',
        title: 'General Body Meeting - March',
        time: '6:00 PM – 8:00 PM',
        location: 'Student Center Room 301',
        attending: 42,
        excused: 8,
        noResponse: 15,
        completed: false,
        hasMinutes: false,
    },
    {
        id: 'officer-weekly',
        type: 'officer',
        title: 'Officer Meeting - Weekly Sync',
        time: '2:00 PM – 3:00 PM',
        location: 'Zoom',
        attending: 7,
        excused: 0,
        noResponse: 1,
        completed: false,
        hasMinutes: false,
    },
];

const defaultPastMeetings = [
    {
        id: 'gbm-february',
        type: 'gbm',
        title: 'General Body Meeting - February',
        time: '6:00 PM – 8:00 PM',
        location: 'Student Center Room 301',
        attending: 38,
        excused: 5,
        noResponse: 22,
        completed: true,
        hasMinutes: true,
    },
    {
        id: 'special-planning',
        type: 'special',
        title: 'Special Planning Session',
        time: '4:00 PM – 6:00 PM',
        location: 'Conference Room A',
        attending: 5,
        excused: 2,
        noResponse: 0,
        completed: true,
        hasMinutes: true,
    },
    {
        id: 'officer-mar3',
        type: 'officer',
        title: 'Officer Meeting - Mar 3',
        time: '2:00 PM – 3:00 PM',
        location: 'Zoom',
        attending: 8,
        excused: 0,
        noResponse: 0,
        completed: true,
        hasMinutes: true,
    },
];

const defaultAttendanceRecords = [
    { id: 'gbm-march',       title: 'GBM - March (in progress)', active: true,  attended: 42, excused: 5, unexcused: 3,  rate: 84  },
    { id: 'gbm-february',    title: 'GBM - February',            active: false, attended: 35, excused: 5, unexcused: 17, rate: 61  },
    { id: 'special-planning',title: 'Special Planning Session',   active: false, attended: 5,  excused: 2, unexcused: 0,  rate: 71  },
    { id: 'officer-mar3',    title: 'Officer Meeting - Mar 3',    active: false, attended: 8,  excused: 0, unexcused: 0,  rate: 100 },
];

const defaultActiveMeeting = {
    tag: 'GBM',
    title: 'GBM - March (in progress)',
    location: 'Student Center Room 301',
};

function Meetings({
    upcomingMeetings = defaultUpcomingMeetings,
    pastMeetings = defaultPastMeetings,
    attendanceRecords = defaultAttendanceRecords,
    activeMeeting = defaultActiveMeeting,
}) {
    const { AtlasMain } = useGradient();
    const [selectedMeeting, setSelectedMeeting] = useState(null);

    const handleMeetingClick = (meeting) => setSelectedMeeting(meeting);
    const handleBack = () => setSelectedMeeting(null);

    const handleTakeAttendance = () => {
        // Find the active meeting object and open it
        const active = [...upcomingMeetings, ...pastMeetings].find(m => !m.completed) || defaultActiveMeeting;
        setSelectedMeeting(active);
    };

    const tabs = [
        {
            id: 'overview',
            label: 'Overview',
            icon: 'mdi:view-dashboard',
            content: <OverviewTab upcomingMeetings={upcomingMeetings} pastMeetings={pastMeetings} onMeetingClick={handleMeetingClick} />,
        },
        {
            id: 'meeting-minutes',
            label: 'Meeting Minutes',
            icon: 'mdi:file-document-outline',
            content: <MinutesTab />,
        },
        {
            id: 'attendance-records',
            label: 'Attendance Records',
            icon: 'mdi:calendar-check-outline',
            content: <AttendanceTab attendanceRecords={attendanceRecords} onRecordClick={handleMeetingClick} />,
        },
    ];

    // Show detail view when a meeting is selected
    if (selectedMeeting) {
        return (
            <div className="meetings dash">
                <Meeting
                    meeting={selectedMeeting}
                    onBack={handleBack}
                />
            </div>
        );
    }

    return (
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
                <NextMeetingBanner
                    meeting={activeMeeting}
                    onTakeAttendance={handleTakeAttendance}
                    onClick={() => handleMeetingClick(activeMeeting)}
                />
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