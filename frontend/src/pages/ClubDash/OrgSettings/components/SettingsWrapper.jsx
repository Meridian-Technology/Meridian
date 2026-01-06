import React, { useState } from 'react';
import { Icon } from '@iconify-icon/react';
import GeneralSettings from './GeneralSettings';
import AppearanceSettings from './AppearanceSettings';
import RolesSettings from './RolesSettings';
import DangerZone from './DangerZone';
import './SettingsWrapper.scss';

const SettingsWrapper = ({ org, expandedClass }) => {
    const [activeSection, setActiveSection] = useState('general');

    const sections = [
        { key: 'general', label: 'General', icon: 'mdi:cog', component: GeneralSettings },
        { key: 'appearance', label: 'Appearance', icon: 'mdi:palette', component: AppearanceSettings },
        { key: 'roles', label: 'Roles & Permissions', icon: 'mdi:shield-account', component: RolesSettings },
        { key: 'danger', label: 'Danger Zone', icon: 'mdi:alert-circle', component: DangerZone },
    ];

    const ActiveComponent = sections.find(section => section.key === activeSection)?.component;

    return (
        <div className={`dash ${expandedClass}`}>
            <div className="org-settings">
                <header className="header">
                    <h1>Organization Settings</h1>
                    <p>Manage settings for {org?.org_name}</p>
                </header>

                <div className="settings-container">
                    <div className="settings-sidebar">
                        <div className="sidebar-section">
                            <h3>Settings</h3>
                            {sections.map(section => (
                                <button 
                                    key={section.key}
                                    className={`sidebar-item ${activeSection === section.key ? 'active' : ''}`}
                                    onClick={() => setActiveSection(section.key)}
                                >
                                    <Icon icon={section.icon} />
                                    <span>{section.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="settings-content">
                        {ActiveComponent && <ActiveComponent org={org} expandedClass={expandedClass} />}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsWrapper; 