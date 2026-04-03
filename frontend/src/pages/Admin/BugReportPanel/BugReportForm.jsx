import React from 'react';
import './BugReportForm.scss';
import { useGradient } from '../../../hooks/useGradient';

function BugReportForm() {
    const { AdminGrad } = useGradient();
    return (
        <div className="bug-report-form dash">
            <header className="header">
                <h1>Bug Report Form</h1>
                <img src={AdminGrad} alt="" />
            </header>
        </div>
    );
}

export default BugReportForm;
