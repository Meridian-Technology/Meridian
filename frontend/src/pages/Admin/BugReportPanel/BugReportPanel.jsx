import React, { useEffect, useState } from 'react';
import './BugReportPanel.scss';
import { useGradient } from '../../../hooks/useGradient';
import HeaderContainer from '../../../components/HeaderContainer/HeaderContainer';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import IndividualBugReport from './IndividualBugReport/IndividualBugReport';
import { useDashboardOverlay } from '../../../hooks/useDashboardOverlay';


function StatCard({number, statCard, description}) {
    return (
        <div className="stat-card">
            <h2>{number}</h2>
            <h3>{statCard}</h3>
            <p>{description}</p>
        </div>
    )
}

const priorityData = [
    {
        "number": 9,
        "priority": 'Critical',
        "description": "System crashes, payment failues, data loss"
    },
    {
        "number": 24,
        "priority": 'High',
        "description": "Major features broken, severe UX issues"
    },
    {
        "number": 51,
        "priority": 'Medium',
        "description": "Partial feature issues, performance drops"
    },
    {
        "number": 44,
        "priority": 'Low',
        "description": "UI glitches, minor inconsistencies"
    },
]

function BugCard({title, date, bugNumber, priority, status, onInteract}) {
    return (
        <div className="bug-card" onClick={onInteract}>
            <div className="icon-title-date">
                <Icon icon="solar:bug-bold"/>
                <div className="title-date">
                    <h3>{title}</h3>
                    <p>{date}</p>
                </div>
            </div>
            <div className="number-priority-status">
                <h4>{bugNumber}</h4>
                <h3 className={`${priority.toLowerCase()}`}>{priority}</h3>
                <h3>{status}</h3>
            </div>
        </div>
    )
}

const bugData = [
    {
        "title": 'Dashboard Not Loading',
        "date": 'Jan 7, 2026',
        "bugNumber": '#BT-2041',
        "priority": 'Critical',
        "status": 'In Progress',
        "tags": ['User Interface', 'Dashboard'],
        "assignee": 'James Liu',
        "description": 'Dashboard does not load when I log into my RPI email. It shows a blank white screen.',
        "image": null,
    },
    {
        "title": 'Unable to Submit Application',
        "date": 'Jan 7, 2026',
        "bugNumber": '#BT-2041',
        "priority": 'Critical',
        "status": 'In review',
        "tags": ['Forms', 'Application'],
        "assignee": '—',
        "description": 'On the final step, clicking Submit does nothing. No error message appears and the application is not saved.',
        "image": null,
    },
    {
        "title": 'Not letting me log in',
        "date": 'Apr 7, 2026',
        "bugNumber": '#BT-2044',
        "priority": 'Critical',
        "status": 'Unopened',
        "tags": ['Auth', 'Login'],
        "assignee": '—',
        "description": 'Login page loops back after entering credentials. User never reaches the dashboard.',
        "image": null,
    },
    {
        "title": 'Cannot add my club, and cannot join any clubs',
        "date": 'Mar 7, 2026',
        "bugNumber": '#BT-2043',
        "priority": 'High',
        "status": 'In Progress',
        "tags": ['Clubs', 'Permissions'],
        "assignee": '—',
        "description": 'Creating a club fails with an error, and joining any club shows a permission error even for valid users.',
        "image": null,
    },
    {
        "title": 'Cannot upload club meeting',
        "date": 'Feb 7, 2026',
        "bugNumber": '#BT-2042',
        "priority": 'Medium',
        "status": 'Unopened',
        "tags": ['Uploads', 'Clubs'],
        "assignee": '—',
        "description": 'Uploading a meeting agenda PDF fails. Spinner runs forever and no file appears afterwards.',
        "image": null,
    },
    {
        "title": 'Cannot reserve this classroom for the entire campus',
        "date": 'Jan 7, 2026',
        "bugNumber": '#BT-2041',
        "priority": 'Low',
        "status": 'In Review',
        "tags": ['Reservations', 'Scheduling'],
        "assignee": '—',
        "description": 'Reservation form rejects valid time ranges with “conflict” even when no other reservations exist.',
        "image": null,
    },

]

function BugReportPanel() {
    const { AdminGrad } = useGradient();
    const { showOverlay, hideOverlay } = useDashboardOverlay();
    return (
        <section className="bug_report_panel dash">
            <header className="header">
                <h1>Bug Reports</h1>
                <p>Manage and View Bug Reports</p>
                <img src={AdminGrad} alt="Admin Gradient" />
            </header>
            
            <div className="bug-report-content">
                <section className="priority-breakdown">
                    <h3>Priority Breakdown</h3>
                    <div className="stat-cards">
                        {
                            priorityData.map((item) => <StatCard number={item.number} statCard={item.priority} description={item.description}/>)
                        }
                    </div>
                </section>
                <HeaderContainer header="Recent Bugs" classN="bug-cards">
                {
                    bugData.map((item) =>
                         <BugCard 
                            key={item.bugNumber + item.title}
                            title={item.title} 
                            date={item.date} 
                            bugNumber={item.bugNumber} 
                            priority={item.priority} 
                            status={item.status}
                            onInteract={() => showOverlay(<IndividualBugReport bugReport={item} />)}
                        />)
                }
                </HeaderContainer>
            </div>
        </section>
    );
};

export default BugReportPanel;