import React from 'react';
import './AnalyticsConfig.scss';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import SlideSwitch from '../../../../../components/SlideSwitch/SlideSwitch';
import SettingsList from '../../../../../components/SettingsList/SettingsList';

const AnalyticsConfig = ({ analytics = {}, onChange }) => {
    const handleChange = (field, value) => {
        onChange({ ...analytics, [field]: value });
    };

    const trackingItems = [
        {
            title: 'Exclude Admin Users from Tracking',
            subtitle: 'When enabled, users with the admin role will not have their page views or actions tracked in the platform analytics pipeline. This reduces noise from internal testing and administration.',
            action:
                <SlideSwitch
                    checked={analytics.excludeAdminUsersFromTracking !== false}
                    onChange={(e) => handleChange('excludeAdminUsersFromTracking', e.target.checked)}
                />
        },
    ];

    return (
        <div className="analytics-config">
            <div className="analytics-header">
                <div className="header-content">
                    <h2>Analytics & Reporting</h2>
                    <p>Configure analytics settings and tracking behavior</p>
                </div>
            </div>
            
            <SettingsList
                title="Tracking"
                items={trackingItems}
            />
            
            <div className="coming-soon">
                <Icon icon="mdi:chart-line" />
                <h3>Additional Analytics Configuration Coming Soon</h3>
                <p>This section will include:</p>
                <ul>
                    <li>Data retention policies and settings</li>
                    <li>Automated report scheduling</li>
                    <li>Custom dashboard configuration</li>
                    <li>Export and backup settings</li>
                </ul>
            </div>
        </div>
    );
};

export default AnalyticsConfig;
