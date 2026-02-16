import React from 'react';
import { Icon } from '@iconify-icon/react';
import HeaderContainer from '../../../../../../components/HeaderContainer/HeaderContainer';
import EmptyState from '../../../../../../components/EmptyState/EmptyState';
import './JobPicker.scss';

function JobPicker({
    orgRoles,
    roles,
    creatingJobTemplate,
    setCreatingJobTemplate,
    newJobTemplate,
    setNewJobTemplate,
    onCreateJobTemplate,
    onIncrementJob,
    onDecrementJob,
    onClose,
}) {
    return (
        <HeaderContainer
            classN="job-picker"
            icon="mdi:briefcase"
            header="Add Job Slots"
            right={
                <div className="header-actions">
                    {!creatingJobTemplate && (
                        <button
                            className="btn-secondary"
                            onClick={() => setCreatingJobTemplate(true)}
                        >
                            <Icon icon="mdi:plus" />
                            New Template
                        </button>
                    )}
                    <button className="close-btn" onClick={onClose} type="button" aria-label="Close">
                        <Icon icon="mdi:close" />
                    </button>
                </div>
            }
        >
            {creatingJobTemplate && (
                <div className="job-template-form">
                    <div className="form-group">
                        <label>Template Name *</label>
                        <input
                            type="text"
                            value={newJobTemplate.name}
                            onChange={(e) => setNewJobTemplate(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="e.g., Registration, Ticketing"
                        />
                    </div>
                    <div className="form-group">
                        <label>Description</label>
                        <textarea
                            rows={2}
                            value={newJobTemplate.description}
                            onChange={(e) => setNewJobTemplate(prev => ({ ...prev, description: e.target.value }))}
                            placeholder="Describe this job template"
                        />
                    </div>
                    <div className="form-actions">
                        <button
                            className="btn-cancel"
                            type="button"
                            onClick={() => {
                                setCreatingJobTemplate(false);
                                setNewJobTemplate({ name: '', description: '' });
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            className="btn-save"
                            onClick={onCreateJobTemplate}
                            disabled={!newJobTemplate.name.trim()}
                        >
                            <Icon icon="mdi:check" />
                            Create & Add Slot
                        </button>
                    </div>
                </div>
            )}
            <div className="job-picker-list">
                {orgRoles.length === 0 && !creatingJobTemplate && (
                    <EmptyState
                        icon="mingcute:group-fill"
                        title="No job templates yet"
                        description="Create your first job template to add slots to this event."
                        actions={[{ label: 'New Template', onClick: () => setCreatingJobTemplate(true), primary: true }]}
                    />
                )}
                {orgRoles.map(orgRole => {
                    const existingRole = roles.find(role => {
                        const orgRoleId = role.orgRoleId?._id || role.orgRoleId;
                        return orgRoleId === orgRole._id;
                    });
                    const count = existingRole?.requiredCount || 0;

                    return (
                        <div key={orgRole._id} className="job-picker-item">
                            <div className="job-info">
                                <strong>{orgRole.name}</strong>
                                {orgRole.description && <p>{orgRole.description}</p>}
                            </div>
                            <div className="job-actions">
                                <button
                                    className="action-btn remove"
                                    onClick={() => onDecrementJob(orgRole)}
                                    title="Remove slot"
                                    disabled={count <= 0}
                                >
                                    <Icon icon="mdi:minus" />
                                </button>
                                <span className="job-count">{count}</span>
                                <button
                                    className="action-btn add"
                                    onClick={() => onIncrementJob(orgRole)}
                                    title="Add slot"
                                >
                                    <Icon icon="mdi:plus" />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </HeaderContainer>
    );
}

export default JobPicker;
