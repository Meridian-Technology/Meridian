import React, { useState, useEffect } from 'react';
import './FlowManagement.scss';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import { useNotification } from '../../../../NotificationContext';
import postRequest from '../../../../utils/postRequest';

function FlowManagement({ group, onBack, onSave }) {
    const [activeTab, setActiveTab] = useState('general');
    const [formData, setFormData] = useState({
        name: group?.org_name || '',
        description: group?.org_description || '',
        maxPendingApprovals: group?.approvalSettings?.maxPendingApprovals || 10,
        escalationTimeout: group?.approvalSettings?.escalationTimeout || 72,
        autoEscalate: group?.approvalSettings?.autoEscalate || false,
        notificationPreferences: group?.approvalSettings?.notificationPreferences || {
            email: true,
            inApp: true,
            sms: false
        }
    });
    const [hasChanges, setHasChanges] = useState(false);
    const [saving, setSaving] = useState(false);
    const { addNotification } = useNotification();

    useEffect(() => {
        // Check if form data has changed
        const originalData = {
            name: group?.org_name || '',
            description: group?.org_description || '',
            maxPendingApprovals: group?.approvalSettings?.maxPendingApprovals || 10,
            escalationTimeout: group?.approvalSettings?.escalationTimeout || 72,
            autoEscalate: group?.approvalSettings?.autoEscalate || false,
            notificationPreferences: group?.approvalSettings?.notificationPreferences || {
                email: true,
                inApp: true,
                sms: false
            }
        };
        
        setHasChanges(JSON.stringify(formData) !== JSON.stringify(originalData));
    }, [formData, group]);

    const handleInputChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleNotificationChange = (type, value) => {
        setFormData(prev => ({
            ...prev,
            notificationPreferences: {
                ...prev.notificationPreferences,
                [type]: value
            }
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // Update approval settings
            const approvalSettingsResponse = await postRequest(`/${group._id}/approval-settings`, {
                approvalSettings: {
                    maxPendingApprovals: formData.maxPendingApprovals,
                    escalationTimeout: formData.escalationTimeout,
                    autoEscalate: formData.autoEscalate,
                    notificationPreferences: formData.notificationPreferences
                }
            });

            if (approvalSettingsResponse.success) {
                addNotification({
                    title: 'Success',
                    message: 'Approval group settings updated successfully',
                    type: 'success'
                });
                onSave();
            } else {
                throw new Error(approvalSettingsResponse.message || 'Failed to update settings');
            }
        } catch (error) {
            console.error('Error saving approval group settings:', error);
            addNotification({
                title: 'Error',
                message: 'Failed to update approval group settings',
                type: 'error'
            });
        } finally {
            setSaving(false);
        }
    };

    const tabs = [
        { id: 'general', label: 'General', icon: 'mdi:cog' },
        { id: 'approval', label: 'Approval Settings', icon: 'mdi:check-circle' },
        { id: 'notifications', label: 'Notifications', icon: 'mdi:bell' },
        { id: 'members', label: 'Members', icon: 'mdi:account-group' }
    ];

    return (
        <div className="flow-management">
            <div className="management-header">
                <button className="back-btn" onClick={onBack}>
                    <Icon icon="mdi:arrow-left" />
                    Back to Overview
                </button>
                <div className="header-content">
                    <h1>{group?.org_name}</h1>
                    <p>Manage approval group settings and configuration</p>
                </div>
                <div className="header-actions">
                    {hasChanges && (
                        <button 
                            className="save-btn" 
                            onClick={handleSave}
                            disabled={saving}
                        >
                            {saving ? (
                                <>
                                    <Icon icon="mdi:loading" className="spinning" />
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <Icon icon="mdi:content-save" />
                                    Save Changes
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>

            <div className="management-content">
                <div className="tabs">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            <Icon icon={tab.icon} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className="tab-content">
                    {activeTab === 'general' && (
                        <div className="general-tab">
                            <div className="form-section">
                                <h3>Basic Information</h3>
                                <div className="form-group">
                                    <label>Group Name</label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => handleInputChange('name', e.target.value)}
                                        placeholder="Enter approval group name"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Description</label>
                                    <textarea
                                        value={formData.description}
                                        onChange={(e) => handleInputChange('description', e.target.value)}
                                        placeholder="Describe the purpose of this approval group"
                                        rows="3"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'approval' && (
                        <div className="approval-tab">
                            <div className="form-section">
                                <h3>Approval Settings</h3>
                                <div className="form-group">
                                    <label>Maximum Pending Approvals</label>
                                    <input
                                        type="number"
                                        value={formData.maxPendingApprovals}
                                        onChange={(e) => handleInputChange('maxPendingApprovals', parseInt(e.target.value))}
                                        min="1"
                                        max="100"
                                    />
                                    <p className="help-text">Maximum number of pending approvals this group can handle</p>
                                </div>
                                <div className="form-group">
                                    <label>Escalation Timeout (hours)</label>
                                    <input
                                        type="number"
                                        value={formData.escalationTimeout}
                                        onChange={(e) => handleInputChange('escalationTimeout', parseInt(e.target.value))}
                                        min="1"
                                        max="168"
                                    />
                                    <p className="help-text">Time before an approval is automatically escalated</p>
                                </div>
                                <div className="form-group">
                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={formData.autoEscalate}
                                            onChange={(e) => handleInputChange('autoEscalate', e.target.checked)}
                                        />
                                        <span className="checkmark"></span>
                                        Enable automatic escalation
                                    </label>
                                    <p className="help-text">Automatically escalate approvals that exceed the timeout</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'notifications' && (
                        <div className="notifications-tab">
                            <div className="form-section">
                                <h3>Notification Preferences</h3>
                                <div className="notification-options">
                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={formData.notificationPreferences.email}
                                            onChange={(e) => handleNotificationChange('email', e.target.checked)}
                                        />
                                        <span className="checkmark"></span>
                                        Email notifications
                                    </label>
                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={formData.notificationPreferences.inApp}
                                            onChange={(e) => handleNotificationChange('inApp', e.target.checked)}
                                        />
                                        <span className="checkmark"></span>
                                        In-app notifications
                                    </label>
                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={formData.notificationPreferences.sms}
                                            onChange={(e) => handleNotificationChange('sms', e.target.checked)}
                                        />
                                        <span className="checkmark"></span>
                                        SMS notifications
                                    </label>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'members' && (
                        <div className="members-tab">
                            <div className="form-section">
                                <h3>Member Management</h3>
                                <p>Member management is handled through the main organization interface.</p>
                                <button 
                                    className="manage-members-btn"
                                    onClick={() => window.open(`/club-dashboard/${group.org_name}`, '_blank')}
                                >
                                    <Icon icon="mdi:account-group" />
                                    Manage Members
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default FlowManagement;
