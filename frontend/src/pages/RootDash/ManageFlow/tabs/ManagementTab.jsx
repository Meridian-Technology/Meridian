import React from 'react';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';

function ManagementTab({ 
    approvalFlowData, 
    approvalGroupsData 
}) {
    return (
        <div className="management-section">
            <div className="section-header">
                <h2>Workflow Management</h2>
                <div className="management-actions">
                    <button className="bulk-action-btn">
                        <Icon icon="mdi:reorder-horizontal" />
                        Reorder Workflows
                    </button>
                    <button className="bulk-action-btn">
                        <Icon icon="mdi:export" />
                        Export Configuration
                    </button>
                    <button className="bulk-action-btn">
                        <Icon icon="mdi:import" />
                        Import Configuration
                    </button>
                </div>
            </div>

            <div className="management-grid">
                <div className="management-card">
                    <div className="card-header">
                        <Icon icon="mdi:workflow" />
                        <h3>Workflow Order</h3>
                    </div>
                    <div className="card-content">
                        <p>Drag and drop to reorder workflow steps</p>
                        <div className="flow-order-list">
                            {approvalFlowData.data?.data?.steps?.map((step, index) => {
                                const group = approvalGroupsData.data?.data?.find(g => g._id === step.orgId);
                                return (
                                    <div key={step._id || index} className="order-item">
                                        <div className="order-number">{index + 1}</div>
                                        <div className="order-info">
                                            <span className="group-name">{group?.org_name || step.role}</span>
                                            <span className="step-role">{step.role}</span>
                                        </div>
                                        <div className="order-actions">
                                            <button className="move-up-btn" disabled={index === 0}>
                                                <Icon icon="mdi:chevron-up" />
                                            </button>
                                            <button className="move-down-btn" disabled={index === (approvalFlowData.data?.data?.steps?.length - 1)}>
                                                <Icon icon="mdi:chevron-down" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="management-card">
                    <div className="card-header">
                        <Icon icon="mdi:shield-check" />
                        <h3>Workflow Status</h3>
                    </div>
                    <div className="card-content">
                        <div className="status-controls">
                            <div className="status-item">
                                <label>Overall Workflow Status</label>
                                <div className="status-toggle">
                                    <input type="checkbox" defaultChecked />
                                    <span className="toggle-label">Active</span>
                                </div>
                            </div>
                            <div className="status-item">
                                <label>Auto-Escalation</label>
                                <div className="status-toggle">
                                    <input type="checkbox" />
                                    <span className="toggle-label">Enabled</span>
                                </div>
                            </div>
                            <div className="status-item">
                                <label>Notifications</label>
                                <div className="status-toggle">
                                    <input type="checkbox" defaultChecked />
                                    <span className="toggle-label">Enabled</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="management-card">
                    <div className="card-header">
                        <Icon icon="mdi:clock-outline" />
                        <h3>Global Timeouts</h3>
                    </div>
                    <div className="card-content">
                        <div className="timeout-settings">
                            <div className="timeout-item">
                                <label>Default Escalation (hours)</label>
                                <input 
                                    type="number" 
                                    defaultValue={72} 
                                    className="timeout-input"
                                />
                            </div>
                            <div className="timeout-item">
                                <label>Max Processing Time (days)</label>
                                <input 
                                    type="number" 
                                    defaultValue={365} 
                                    className="timeout-input"
                                />
                            </div>
                            <div className="timeout-item">
                                <label>Reminder Interval (hours)</label>
                                <input 
                                    type="number" 
                                    defaultValue={24} 
                                    className="timeout-input"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="management-card">
                    <div className="card-header">
                        <Icon icon="mdi:backup-restore" />
                        <h3>Backup & Restore</h3>
                    </div>
                    <div className="card-content">
                        <div className="backup-actions">
                            <button className="backup-btn">
                                <Icon icon="mdi:download" />
                                Download Backup
                            </button>
                            <button className="restore-btn">
                                <Icon icon="mdi:upload" />
                                Restore Backup
                            </button>
                        </div>
                        <div className="backup-info">
                            <p>Last backup: Never</p>
                            <p>Backup size: 0 KB</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default ManagementTab;



