import React, { useEffect, useState } from 'react';
import './IndividualBugReport.scss';
import { useGradient } from '../../../../hooks/useGradient';
import HeaderContainer from '../../../../components/HeaderContainer/HeaderContainer';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';

function IndividualBugReport() { 
    return (
        <section className="individual-bug-report dash">
            <header className="header">
                <h1>Bug Report</h1>
            </header>
        </section>
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