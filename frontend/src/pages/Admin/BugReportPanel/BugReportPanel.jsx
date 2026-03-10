import React, { useEffect, useState } from 'react';
import './BugReportPanel.scss';
import { useGradient } from '../../../hooks/useGradient';

function BugReportPanel() {
    const { AdminGrad } = useGradient();

    return (
        <section className="bug_report_panel dash">
            <header className="header">
                <h1>Bug Reports</h1>
                <p>Manage and View Bug Reports</p>
                <img src={AdminGrad} alt="Admin Gradient" />
            </header>
        </section>
    );
};

export default BugReportPanel;