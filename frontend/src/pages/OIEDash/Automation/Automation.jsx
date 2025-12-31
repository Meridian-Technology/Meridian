import React, { useState } from 'react';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import { useNotification } from '../../../NotificationContext';
import postRequest from '../../../utils/postRequest';
import './Automation.scss';

function Automation({ org, expandedClass }) {
    const [saving, setSaving] = useState(false);
    const { addNotification } = useNotification();

    const [automationSettings, setAutomationSettings] = useState({
        autoEscalation: {
            enabled: org?.approvalSettings?.autoEscalate || false,
            timeout: org?.approvalSettings?.escalationTimeout || 72,
            target: 'next-step'
        },
        notifications: {
            email: org?.approvalSettings?.notificationPreferences?.email || true,
            inApp: org?.approvalSettings?.notificationPreferences?.inApp || true,
            sms: org?.approvalSettings?.notificationPreferences?.sms || false,
            reminderFrequency: 24,
            urgentNotifications: false
        },
        autoAssignment: {
            enabled: false,
            strategy: 'round-robin',
            workloadLimit: 5
        },
        conditionalLogic: {
            smartRouting: false,
            priorityHandling: false,
            autoApproval: false
        }
    });

    const handleSettingChange = (category, setting, value) => {
        setAutomationSettings(prev => ({
            ...prev,
            [category]: {
                ...prev[category],
                [setting]: value
            }
        }));
    };

    const handleSaveSettings = async () => {
        setSaving(true);
        try {
            const response = await postRequest(`/orgs/${org._id}/approval-settings`, {
                approvalSettings: {
                    autoEscalate: automationSettings.autoEscalation.enabled,
                    escalationTimeout: automationSettings.autoEscalation.timeout,
                    notificationPreferences: automationSettings.notifications
                }
            });

            if (response.success) {
                addNotification({
                    title: 'Success',
                    message: 'Automation settings saved successfully',
                    type: 'success'
                });
            } else {
                throw new Error(response.message || 'Failed to save settings');
            }
        } catch (error) {
            console.error('Error saving automation settings:', error);
            addNotification({
                title: 'Error',
                message: 'Failed to save automation settings',
                type: 'error'
            });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={`automation-dashboard ${expandedClass}`}>
            <div className="automation-header">
                <h2>Automation & Workflow</h2>
                <p>Configure intelligent automation features for your approval group</p>
                <button 
                    className="save-settings-btn"
                    onClick={handleSaveSettings}
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
                            Save Settings
                        </>
                    )}
                </button>
            </div>

            <div className="automation-grid">
                <div className="automation-card">
                    <div className="card-header">
                        <Icon icon="mdi:clock-fast" />
                        <h3>Auto-Escalation</h3>
                    </div>
                    <div className="card-content">
                        <div className="setting-item">
                            <label>Enable Auto-Escalation</label>
                            <div className="setting-control">
                                <input 
                                    type="checkbox" 
                                    checked={automationSettings.autoEscalation.enabled}
                                    onChange={(e) => handleSettingChange('autoEscalation', 'enabled', e.target.checked)}
                                />
                                <span>Automatically escalate after timeout</span>
                            </div>
                        </div>
                        <div className="setting-item">
                            <label>Escalation Timeout</label>
                            <div className="setting-control">
                                <input 
                                    type="number" 
                                    value={automationSettings.autoEscalation.timeout}
                                    onChange={(e) => handleSettingChange('autoEscalation', 'timeout', parseInt(e.target.value))}
                                />
                                <span>hours</span>
                            </div>
                        </div>
                        <div className="setting-item">
                            <label>Escalation Target</label>
                            <div className="setting-control">
                                <select 
                                    value={automationSettings.autoEscalation.target}
                                    onChange={(e) => handleSettingChange('autoEscalation', 'target', e.target.value)}
                                >
                                    <option value="next-step">Next Step</option>
                                    <option value="admin">Administrator</option>
                                    <option value="owner">Group Owner</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="automation-card">
                    <div className="card-header">
                        <Icon icon="mdi:bell" />
                        <h3>Notifications</h3>
                    </div>
                    <div className="card-content">
                        <div className="setting-item">
                            <label>Email Notifications</label>
                            <div className="setting-control">
                                <input 
                                    type="checkbox" 
                                    checked={automationSettings.notifications.email}
                                    onChange={(e) => handleSettingChange('notifications', 'email', e.target.checked)}
                                />
                                <span>Send email notifications</span>
                            </div>
                        </div>
                        <div className="setting-item">
                            <label>In-App Notifications</label>
                            <div className="setting-control">
                                <input 
                                    type="checkbox" 
                                    checked={automationSettings.notifications.inApp}
                                    onChange={(e) => handleSettingChange('notifications', 'inApp', e.target.checked)}
                                />
                                <span>Show in-app notifications</span>
                            </div>
                        </div>
                        <div className="setting-item">
                            <label>SMS Notifications</label>
                            <div className="setting-control">
                                <input 
                                    type="checkbox" 
                                    checked={automationSettings.notifications.sms}
                                    onChange={(e) => handleSettingChange('notifications', 'sms', e.target.checked)}
                                />
                                <span>Send SMS notifications</span>
                            </div>
                        </div>
                        <div className="setting-item">
                            <label>Reminder Frequency</label>
                            <div className="setting-control">
                                <select 
                                    value={automationSettings.notifications.reminderFrequency}
                                    onChange={(e) => handleSettingChange('notifications', 'reminderFrequency', parseInt(e.target.value))}
                                >
                                    <option value={24}>Every 24 hours</option>
                                    <option value={48}>Every 48 hours</option>
                                    <option value={72}>Every 72 hours</option>
                                </select>
                            </div>
                        </div>
                        <div className="setting-item">
                            <label>Urgent Notifications</label>
                            <div className="setting-control">
                                <input 
                                    type="checkbox" 
                                    checked={automationSettings.notifications.urgentNotifications}
                                    onChange={(e) => handleSettingChange('notifications', 'urgentNotifications', e.target.checked)}
                                />
                                <span>Send urgent notifications for overdue items</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="automation-card">
                    <div className="card-header">
                        <Icon icon="mdi:account-multiple-check" />
                        <h3>Auto-Assignment</h3>
                    </div>
                    <div className="card-content">
                        <div className="setting-item">
                            <label>Enable Auto-Assignment</label>
                            <div className="setting-control">
                                <input 
                                    type="checkbox" 
                                    checked={automationSettings.autoAssignment.enabled}
                                    onChange={(e) => handleSettingChange('autoAssignment', 'enabled', e.target.checked)}
                                />
                                <span>Automatically assign approvals</span>
                            </div>
                        </div>
                        <div className="setting-item">
                            <label>Assignment Strategy</label>
                            <div className="setting-control">
                                <select 
                                    value={automationSettings.autoAssignment.strategy}
                                    onChange={(e) => handleSettingChange('autoAssignment', 'strategy', e.target.value)}
                                >
                                    <option value="round-robin">Round Robin</option>
                                    <option value="least-busy">Least Busy</option>
                                    <option value="random">Random</option>
                                </select>
                            </div>
                        </div>
                        <div className="setting-item">
                            <label>Workload Limit</label>
                            <div className="setting-control">
                                <input 
                                    type="number" 
                                    value={automationSettings.autoAssignment.workloadLimit}
                                    onChange={(e) => handleSettingChange('autoAssignment', 'workloadLimit', parseInt(e.target.value))}
                                />
                                <span>max pending per member</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="automation-card">
                    <div className="card-header">
                        <Icon icon="mdi:brain" />
                        <h3>Conditional Logic</h3>
                    </div>
                    <div className="card-content">
                        <div className="setting-item">
                            <label>Smart Routing</label>
                            <div className="setting-control">
                                <input 
                                    type="checkbox" 
                                    checked={automationSettings.conditionalLogic.smartRouting}
                                    onChange={(e) => handleSettingChange('conditionalLogic', 'smartRouting', e.target.checked)}
                                />
                                <span>Route based on event type</span>
                            </div>
                        </div>
                        <div className="setting-item">
                            <label>Priority Handling</label>
                            <div className="setting-control">
                                <input 
                                    type="checkbox" 
                                    checked={automationSettings.conditionalLogic.priorityHandling}
                                    onChange={(e) => handleSettingChange('conditionalLogic', 'priorityHandling', e.target.checked)}
                                />
                                <span>Handle high-priority events first</span>
                            </div>
                        </div>
                        <div className="setting-item">
                            <label>Auto-Approval</label>
                            <div className="setting-control">
                                <input 
                                    type="checkbox" 
                                    checked={automationSettings.conditionalLogic.autoApproval}
                                    onChange={(e) => handleSettingChange('conditionalLogic', 'autoApproval', e.target.checked)}
                                />
                                <span>Auto-approve low-risk events</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="automation-info">
                <div className="info-card">
                    <Icon icon="mdi:information" />
                    <div className="info-content">
                        <h4>Automation Benefits</h4>
                        <ul>
                            <li>Reduce manual workload and processing time</li>
                            <li>Ensure consistent approval processes</li>
                            <li>Improve response times and efficiency</li>
                            <li>Minimize human error in routine tasks</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Automation;
