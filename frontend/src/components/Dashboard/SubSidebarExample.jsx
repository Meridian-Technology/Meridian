import React from 'react';
import Dashboard from './Dashboard';
import { Icon } from '@iconify-icon/react';

// Example components for different pages
const DashboardHome = () => (
    <div style={{ padding: '20px' }}>
        <h1>Dashboard Home</h1>
        <p>Welcome to the main dashboard!</p>
    </div>
);

const SettingsGeneral = () => (
    <div style={{ padding: '20px' }}>
        <h1>General Settings</h1>
        <p>Configure general application settings here.</p>
    </div>
);

const SettingsSecurity = () => (
    <div style={{ padding: '20px' }}>
        <h1>Security Settings</h1>
        <p>Manage your security preferences and authentication settings.</p>
    </div>
);

const SettingsPrivacy = () => (
    <div style={{ padding: '20px' }}>
        <h1>Privacy Settings</h1>
        <p>Control your privacy and data sharing preferences.</p>
    </div>
);

const UserProfile = () => (
    <div style={{ padding: '20px' }}>
        <h1>User Profile</h1>
        <p>View and edit your profile information.</p>
    </div>
);

const AnalyticsOverview = () => (
    <div style={{ padding: '20px' }}>
        <h1>Analytics Overview</h1>
        <p>View your analytics and performance metrics.</p>
    </div>
);

const AnalyticsReports = () => (
    <div style={{ padding: '20px' }}>
        <h1>Reports</h1>
        <p>Generate and view detailed reports.</p>
    </div>
);

const AnalyticsCharts = () => (
    <div style={{ padding: '20px' }}>
        <h1>Charts & Graphs</h1>
        <p>Visualize your data with interactive charts.</p>
    </div>
);

const SubSidebarExample = () => {
    // Example menu items with nested sub-items and elements
    const menuItems = [
        {
            label: 'Dashboard',
            icon: 'material-symbols:dashboard',
            element: <DashboardHome />
        },
        {
            label: 'Settings',
            icon: 'material-symbols:settings',
            element: <SettingsGeneral />,
            subItems: [
                {
                    label: 'General',
                    icon: 'material-symbols:settings-general',
                    element: <SettingsGeneral />
                },
                {
                    label: 'Security',
                    icon: 'material-symbols:security',
                    element: <SettingsSecurity />
                },
                {
                    label: 'Privacy',
                    icon: 'material-symbols:privacy-tip',
                    element: <SettingsPrivacy />
                }
            ]
        },
        {
            label: 'Profile',
            icon: 'material-symbols:person',
            element: <UserProfile />
        },
        {
            label: 'Analytics',
            icon: 'material-symbols:analytics',
            element: <AnalyticsOverview />,
            subItems: [
                {
                    label: 'Overview',
                    icon: 'material-symbols:overview',
                    element: <AnalyticsOverview />
                },
                {
                    label: 'Reports',
                    icon: 'material-symbols:assessment',
                    element: <AnalyticsReports />
                },
                {
                    label: 'Charts',
                    icon: 'material-symbols:bar-chart',
                    element: <AnalyticsCharts />
                }
            ]
        }
    ];

    return (
        <Dashboard
            menuItems={menuItems}
            logo="/path/to/your/logo.png"
            primaryColor="#007bff"
            secondaryColor="rgba(0, 123, 255, 0.1)"
            enableSubSidebar={true}
        />
    );
};

export default SubSidebarExample; 