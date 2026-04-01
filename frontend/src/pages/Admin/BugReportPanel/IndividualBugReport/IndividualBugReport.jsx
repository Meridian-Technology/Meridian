import React from 'react';
import './IndividualBugReport.scss';
import { useGradient } from '../../../../hooks/useGradient';

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

const activityLogData = [
    {
        id: 'a1',
        text: 'james@meridian.study was assigned this issue',
        dateLabel: 'Jan 7, 2026',
    },
    {
        id: 'a2',
        text: 'James Liu assigned to diami5036@gmail.com',
        dateLabel: 'Jan 8, 2026',
    },
];

function IndividualBugReport(title, bugNumber, priority, status, tags, assignee, description, image) { 
    const { AdminGrad } = useGradient();
    return (
        <div className="individual-bug-report dash">
            <header className="header">
                <h1>Bug Report</h1>
                <img src={AdminGrad} alt="Admin Gradient" />
            </header>
            <div className="report_details">
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
                    <h1 className="report-title">
                        <span className="report-field-label">Title:</span>{' '}
                        {bugData.title}
                    </h1>
                    <p className="report-description">
                        <span className="report-field-label">Description:</span>{' '}
                        {bugData.description}
                    </p>
                    <h1>{bugData.image}</h1>
                </div>
            </div>

            <section className="report-activity-panel" aria-label="Activity">
                <h2 className="report-activity-heading">Activity</h2>
                <ul className="activity-list">
                    {activityLogData.map((entry) => (
                        <li key={entry.id} className="activity-item">
                            <p className="activity-item__text">{entry.text}</p>
                            <span className="activity-date-pill">{entry.dateLabel}</span>
                        </li>
                    ))}
                </ul>
                <textarea
                    id="bug-report-comment"
                    className="activity-comment-input"
                    placeholder="Leave a comment…"
                    rows={4}
                    aria-label="Comment"
                />
                <div className="activity-send-row">
                    <button type="button" className="activity-send-pill">
                        Send
                    </button>
                </div>
            </section>

            <div className="report-bottom-actions">
                <div className="activity-actions">
                    <button type="button" className="activity-action-pill">
                        Archive
                    </button>
                    <button type="button" className="activity-action-pill activity-action-pill--linear">
                        Move to Linear
                    </button>
                </div>
            </div>
        </div>
    )   
}

export default IndividualBugReport;