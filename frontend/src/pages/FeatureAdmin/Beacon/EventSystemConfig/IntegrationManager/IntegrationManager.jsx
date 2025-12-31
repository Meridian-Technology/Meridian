import React from 'react';
import './IntegrationManager.scss';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';

const IntegrationManager = ({ integrations = {}, onChange }) => {
    return (
        <div className="integration-manager">
            <div className="integration-header">
                <div className="header-content">
                    <h2>System Integrations</h2>
                    <p>Configure external system connections and API integrations</p>
                </div>
            </div>
            
            <div className="coming-soon">
                <Icon icon="mdi:connection" />
                <h3>Integration Management Coming Soon</h3>
                <p>This section will include:</p>
                <ul>
                    <li>Calendar integrations (Google, Outlook, Apple)</li>
                    <li>External event platforms (Eventbrite, Facebook, Meetup)</li>
                    <li>Campus system connections (SIS, facilities, security)</li>
                    <li>API key management and testing</li>
                    <li>Webhook configuration</li>
                </ul>
            </div>
        </div>
    );
};

export default IntegrationManager;
