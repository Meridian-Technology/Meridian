import React from 'react';
import './AnalyticsConfig.scss';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';

const AnalyticsConfig = ({ analytics = {}, onChange }) => {
    return (
        <div className="analytics-config">
            <div className="analytics-header">
                <div className="header-content">
                    <h2>Analytics & Reporting</h2>
                    <p>Configure analytics settings, data retention, and automated reports</p>
                </div>
            </div>
            
            <div className="coming-soon">
                <Icon icon="mdi:chart-line" />
                <h3>Analytics Configuration Coming Soon</h3>
                <p>This section will include:</p>
                <ul>
                    <li>Data retention policies and settings</li>
                    <li>Automated report scheduling</li>
                    <li>Custom dashboard configuration</li>
                    <li>Export and backup settings</li>
                    <li>Privacy and compliance controls</li>
                </ul>
            </div>
        </div>
    );
};

export default AnalyticsConfig;
