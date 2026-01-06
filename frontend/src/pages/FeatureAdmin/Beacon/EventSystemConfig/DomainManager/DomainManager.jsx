import React, { useState } from 'react';
import './DomainManager.scss';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';

const DomainManager = ({ domains = [], onChange }) => {
    const [showNewDomainModal, setShowNewDomainModal] = useState(false);
    
    const handleAddDomain = () => {
        setShowNewDomainModal(true);
    };
    
    const handleDeleteDomain = (domainId) => {
        if (window.confirm('Are you sure you want to delete this domain?')) {
            const updatedDomains = domains.filter(domain => domain.domainId !== domainId);
            onChange(updatedDomains);
        }
    };
    
    return (
        <div className="domain-manager">
            <div className="domain-header">
                <div className="header-content">
                    <h2>Domain Management</h2>
                    <p>Manage facilities, departments, and other domains for event configuration</p>
                </div>
                <button 
                    className="add-domain-btn"
                    onClick={handleAddDomain}
                >
                    <Icon icon="mdi:plus" />
                    Add Domain
                </button>
            </div>
            
            {domains.length === 0 ? (
                <div className="no-domains">
                    <Icon icon="mdi:domain-off" />
                    <h3>No Domains Configured</h3>
                    <p>Add your first domain to start configuring event settings for specific facilities or departments.</p>
                    <button 
                        className="add-first-domain-btn"
                        onClick={handleAddDomain}
                    >
                        <Icon icon="mdi:plus" />
                        Add Your First Domain
                    </button>
                </div>
            ) : (
                <div className="domains-grid">
                    {domains.map(domain => (
                        <div key={domain.domainId} className="domain-card">
                            <div className="domain-header">
                                <div className="domain-info">
                                    <h3>{domain.name}</h3>
                                    <span className="domain-type">{domain.type}</span>
                                </div>
                                <div className="domain-actions">
                                    <button className="edit-btn">
                                        <Icon icon="mdi:pencil" />
                                    </button>
                                    <button 
                                        className="delete-btn"
                                        onClick={() => handleDeleteDomain(domain.domainId)}
                                    >
                                        <Icon icon="mdi:delete" />
                                    </button>
                                </div>
                            </div>
                            
                            <div className="domain-content">
                                <div className="domain-stats">
                                    <div className="stat">
                                        <Icon icon="mdi:calendar" />
                                        <span>0</span>
                                        <label>Events</label>
                                    </div>
                                    <div className="stat">
                                        <Icon icon="mdi:account-group" />
                                        <span>{domain.domainSettings?.approvalWorkflow?.stakeholders?.length || 0}</span>
                                        <label>Stakeholders</label>
                                    </div>
                                </div>
                                
                                <div className="domain-settings">
                                    <div className="setting">
                                        <Icon icon="mdi:shield-check" />
                                        <span>Approval: {domain.domainSettings?.approvalWorkflow?.enabled ? 'Enabled' : 'Disabled'}</span>
                                    </div>
                                    <div className="setting">
                                        <Icon icon="mdi:bell" />
                                        <span>Notifications: {domain.domainSettings?.notificationPreferences?.channels?.length || 0} channels</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            
            {showNewDomainModal && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h3>Add New Domain</h3>
                            <button 
                                className="close-btn"
                                onClick={() => setShowNewDomainModal(false)}
                            >
                                <Icon icon="mdi:close" />
                            </button>
                        </div>
                        <div className="modal-content">
                            <p>Domain management interface coming soon!</p>
                            <p>This will include forms for:</p>
                            <ul>
                                <li>Domain information (name, type, description)</li>
                                <li>Operating hours configuration</li>
                                <li>Capacity and booking rules</li>
                                <li>Approval workflow setup</li>
                                <li>Notification preferences</li>
                            </ul>
                        </div>
                        <div className="modal-footer">
                            <button 
                                className="cancel-btn"
                                onClick={() => setShowNewDomainModal(false)}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DomainManager;
