import React, { useEffect, useState } from 'react';
import './BugReportPanel.scss';
import { useGradient } from '../../../hooks/useGradient';

function StatCard({number, statCard, description}) {
    return (
        <div className="stat-card">
            <h2>{number}</h2>
            <h3>{statCard}</h3>
            <p>{description}</p>
        </div>
    )
}

const fakeData = [
    {
        "number": 9,
        "priority": 'Critical',
        "description": "System crashes, payment failues, data loss"
    },
    {
        "number": 9,
        "priority": 'Critical',
        "description": "System crashes, payment failues, data loss"
    },
    {
        "number": 9,
        "priority": 'Critical',
        "description": "System crashes, payment failues, data loss"
    },
    {
        "number": 9,
        "priority": 'Critical',
        "description": "System crashes, payment failues, data loss"
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
                        <StatCard number = {9} statCard = "Critical" description = "System crashes, payment failues, data loss" />
                        <StatCard number = {24} statCard = "High" description = "System crashes, payment failues, data loss" />
                        <StatCard number = {51} statCard = "Medium" description = "System crashes, payment failues, data loss" />
                        <StatCard number = {44} statCard = "Low" description = "System crashes, payment failues, data loss" />
                    </div>
                </section>
            </div>
        </section>
    );
};

export default BugReportPanel;