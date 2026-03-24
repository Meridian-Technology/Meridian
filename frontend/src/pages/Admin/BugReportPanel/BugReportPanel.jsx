import React, { useEffect, useState } from 'react';
import './BugReportPanel.scss';
import { useGradient } from '../../../hooks/useGradient';
import HeaderContainer from '../../../components/HeaderContainer/HeaderContainer';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';


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

function BugCard({title, date, bugNumber, priority, status}) {
    return (
        <div className="bug-card">
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
        "status": 'In Progress'
    },
    {
        "title": 'Unable to Submit Application',
        "date": 'Jan 7, 2026',
        "bugNumber": '#BT-2041',
        "priority": 'Critical',
        "status": 'In review'
    },
    {
        "title": 'Not letting me log in',
        "date": 'Apr 7, 2026',
        "bugNumber": '#BT-2044',
        "priority": 'Critical',
        "status": 'Unopened'
    },
    {
        "title": 'Cannot add my club, and cannot join any clubs',
        "date": 'Mar 7, 2026',
        "bugNumber": '#BT-2043',
        "priority": 'High',
        "status": 'In Progress'
    },
    {
        "title": 'Cannot upload club meeting',
        "date": 'Feb 7, 2026',
        "bugNumber": '#BT-2042',
        "priority": 'Medium',
        "status": 'Unopened'
    },
    {
        "title": 'Cannot reserve this classroom for the entire campus',
        "date": 'Jan 7, 2026',
        "bugNumber": '#BT-2041',
        "priority": 'Low',
        "status": 'In Review'
    },

]

function BugReportPanel() {
    const { AdminGrad } = useGradient();
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
                    bugData.map((item) => <BugCard title={item.title} date={item.date} bugNumber={item.bugNumber} priority={item.priority} status={item.status}/>)
                }
                </HeaderContainer>
            </div>
        </section>
    );
};

export default BugReportPanel;