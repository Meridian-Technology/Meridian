import React from 'react';
import './IndividualBugReport.scss';
import { useGradient } from '../../../../hooks/useGradient';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import { useDashboardOverlay } from '../../../../hooks/useDashboardOverlay';

const bugData = {
    "title": 'Dashboard not loading',
    "bugNumber": '#BT-2041',
    "priority": 'Critical',
    "status": 'In Progress',
    "tags":[ 'User Interface'],
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

const analyticData = [
    {
        user: 'jamesliu@gmail.com',
        date: 'April 5, 2025',
        platform: {
            label: 'Web',
            userCount: 185
        },
        deviceTypes: {
            label: 'Web',
            userCount: 185
        },
        topBrowsers: [
            { name: 'Chrome', users: 185},
            { name: 'iOS', users: 52},
            { name: 'Firefox', users: 23},
            { name: 'Android', users: 11}
        ],
        topOS: {
            label: 'Unknown',
            userCount: 185
        }
    }
]

function IndividualBugReport(title, bugNumber, priority, status, tags, assignee, description, image, onBack) { 
    const { AdminGrad } = useGradient();
    const analytics = analyticData[0];
    const {hideOverlay} = useDashboardOverlay();

    return (
        <div className="individual-bug-report dash">
            <header className="header">
                <h1>Bug Report</h1>
                <img src={AdminGrad} alt="Admin Gradient" />
            </header>
            <div className="individual-bug-report__body">

                <div className="report-main-column">
                    <div className="back" onClick={()=>{hideOverlay()}}>
                        <Icon icon="material-symbols:arrow-back-rounded"/>
                        <p>Back</p>
                        
                    </div>
                    <div className="report_details">
                        <div>
                            <h1 className="report-title">
                                {bugData.title}
                            </h1>
                            <div className="report-meta">
                                <div className="bug-number-priority-status">
                                    <h3>
                                        Bug Report {bugData.bugNumber}
                                    </h3>
                                    <h4 className={`priority-pill ${bugData.priority.toLowerCase()}`}>{bugData.priority}</h4>
                                    <h4 className="status-pill">{bugData.status}</h4>
                                </div>
                                <div className="bug-meta-row bug-meta-row--tags">
                                    {bugData?.tags?.map((tag) => (
                                        <span key={tag} className="tag-pill">{tag}</span>
                                    ))}
                                </div>
                                <div className="bug-meta-row bug-meta-row--assignee">
                                    <span className="assignee-pill assignee-pill--placeholder">Assignee: —</span>
                                </div>
                            </div>
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

                <aside className="report-secondary-column" aria-label="Analytics">
                    {analytics ? (
                        <div className="report-analytics-panel">
                            <h2 className="report-analytics-heading">Analytics</h2>
                            <p className="report-analytics-meta">
                                <span className="report-analytics-meta__row">
                                    <Icon icon="solar:user-bold" />
                                    <span className="report-analytics-meta__user">{analytics.user}</span>
                                </span>
                                <span className="report-analytics-meta__row">
                                    <Icon icon="solar:calendar-bold" />
                                    <span className="report-analytics-meta__date">{analytics.date}</span>
                                </span>
                                <span className="report-analytics-meta__row">
                                    <Icon icon="mdi:devices" />
                                    <span className="report-analytics-meta__devices">
                                        Devices &amp; Platform
                                    </span>
                                </span>
                            </p>

                            <section className="analytics-section">
                                <h3 className="analytics-section__title">Platform</h3>
                                <div className="analytics-pills">
                                    <span className="analytics-pill">
                                        <span>{analytics.platform.label}</span>
                                        <span className="analytics-pill__count">{analytics.platform.userCount} users</span>
                                    </span>
                                </div>
                            </section>

                            <section className="analytics-section">
                                <h3 className="analytics-section__title">Device types</h3>
                                <div className="analytics-pills">
                                    <span className="analytics-pill">
                                        <span>{analytics.deviceTypes.label}</span>
                                        <span className="analytics-pill__count">{analytics.deviceTypes.userCount} users</span>
                                    </span>
                                </div>
                            </section>

                            <section className="analytics-section">
                                <h3 className="analytics-section__title">Top browsers</h3>
                                <ul className="analytics-browser-list">
                                    {analytics.topBrowsers.map((row) => (
                                        <li key={row.name} className="analytics-browser-list__row">
                                            <span className="analytics-pill">
                                                <span>{row.name}</span>
                                                <span className="analytics-pill__count">{row.users} users</span>
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </section>

                            <section className="analytics-section">
                                <h3 className="analytics-section__title">Top OS</h3>
                                <div className="analytics-pills">
                                    <span className="analytics-pill">
                                        <span>{analytics.topOS.label}</span>
                                        <span className="analytics-pill__count">{analytics.topOS.userCount} users</span>
                                    </span>
                                </div>
                            </section>
                        </div>
                    ) : null}
                </aside>
            </div>
        </div>
    )   
}

export default IndividualBugReport;