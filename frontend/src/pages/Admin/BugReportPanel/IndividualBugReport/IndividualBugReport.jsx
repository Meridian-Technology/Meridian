import React, { useEffect, useState } from 'react';
import './IndividualBugReport.scss';
import { useGradient } from '../../../../hooks/useGradient';
import HeaderContainer from '../../../../components/HeaderContainer/HeaderContainer';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';

const bugData = {
    "title": 'Dashboard not loading',
    "bugNumber": '#BT-2041',
    "priority": 'Critical',
    "status": 'In Progress',
    "tags": 'User Interface',
    "assignee": 'James Liu',
    "description": 'Dashboard does not load when I log into RPI email. It shows a blank white screen for me.',
    "image": 'image'
}

function IndividualBugReport(title, bugNumber, priority, status, tags, assignee, description, image) { 
    const { AdminGrad } = useGradient();
    return (
        <div className="individual-bug-report dash">
            <header className="header">
                <h1>Bug Report</h1>
                <img src={AdminGrad} alt="Admin Gradient" />
            </header>
            <div className="report_details">
                <h1>{bugData.title}</h1>
                <div>
                    <div className="report-meta">
                        <div className="bug-number-priority-status">
                            <h3>
                                Bug Report {bugData.bugNumber}
                            </h3>
                            <h4 className={`priority-pill ${bugData.priority.toLowerCase()}`}>{bugData.priority}</h4>
                            <h4 className="status-pill">{bugData.status}</h4>
                        </div>
                        <div className="bug-meta-row bug-meta-row--tags">
                            <span className="tag-pill tag-pill--placeholder">Tags</span>
                        </div>
                        <div className="bug-meta-row bug-meta-row--assignee">
                            <span className="assignee-pill assignee-pill--placeholder">Assignee: —</span>
                        </div>
                    </div>
                    <p className="report-description">{bugData.description}</p>
                    <h1>{bugData.image}</h1>
                </div>
            </div>
        </div>
    )   
}

const activityLogData = [
    {
        "assignee": "John Doe",
        "assigned": "James Liu",
        "date": "Jan 7, 2026",
        "time": "10:00 AM"
    },
    {
        "activity": "Bug Reported",
        "date": "Jan 7, 2026",
        "time": "10:00 AM"
    }
]


export default IndividualBugReport;