import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import Popup from '../../../../../../components/Popup/Popup';
import './JobsManager.scss';

function JobEditor({ role, event, orgRoles = [], onSave, onCancel }) {
    const [formData, setFormData] = useState({
        orgRoleId: '',
        name: '',
        description: '',
        requiredCount: 1,
        shiftStart: '',
        shiftEnd: '',
        agendaItemIds: []
    });

    useEffect(() => {
        if (role) {
            setFormData({
                orgRoleId: role.orgRoleId?._id || role.orgRoleId || '',
                name: role.name || '',
                description: role.description || '',
                requiredCount: role.requiredCount || 1,
                shiftStart: role.shiftStart ? new Date(role.shiftStart).toISOString().slice(0, 16) : '',
                shiftEnd: role.shiftEnd ? new Date(role.shiftEnd).toISOString().slice(0, 16) : '',
                agendaItemIds: role.agendaItemIds || []
            });
        }
    }, [role]);

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({
            ...role,
            ...formData,
            shiftStart: formData.shiftStart ? new Date(formData.shiftStart) : null,
            shiftEnd: formData.shiftEnd ? new Date(formData.shiftEnd) : null
        });
    };

    const handleOrgRoleChange = (value) => {
        const selectedRole = orgRoles.find(orgRole => orgRole._id === value);
        setFormData(prev => ({
            ...prev,
            orgRoleId: value,
            name: selectedRole?.name || prev.name,
            description: selectedRole?.description || prev.description
        }));
    };

    const hasOrgRole = Boolean(formData.orgRoleId);

    return (
        <Popup
            isOpen={true}
            onClose={onCancel}
            customClassName="role-editor-popup"
        >
            <div className="role-editor">
                <div className="editor-header">
                    <h3>
                        <Icon icon="mdi:account-plus" />
                        {role?._id ? 'Edit' : 'Create'} Event Job
                    </h3>
                    <button className="close-btn" onClick={onCancel}>
                        <Icon icon="mdi:close" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="editor-form">
                    <div className="form-group">
                        <label>
                            Job Template
                        </label>
                        <select
                            value={formData.orgRoleId}
                            onChange={(e) => handleOrgRoleChange(e.target.value)}
                        >
                            <option value="">
                                Custom job
                            </option>
                            {orgRoles.map(orgRole => (
                                <option key={orgRole._id} value={orgRole._id}>
                                    {orgRole.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>
                            Job Name <span className="required">*</span>
                        </label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => handleChange('name', e.target.value)}
                            required
                            readOnly={hasOrgRole}
                            placeholder="e.g., Ticketing, Registration, Setup Crew"
                        />
                    </div>

                    <div className="form-group">
                        <label>Description</label>
                        <textarea
                            value={formData.description}
                            onChange={(e) => handleChange('description', e.target.value)}
                            rows={3}
                            readOnly={hasOrgRole}
                            placeholder="Describe the job responsibilities"
                        />
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label>
                                Slots Needed <span className="required">*</span>
                            </label>
                            <input
                                type="number"
                                value={formData.requiredCount}
                                onChange={(e) => handleChange('requiredCount', parseInt(e.target.value) || 1)}
                                min="1"
                                required
                            />
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label>Shift Start</label>
                            <input
                                type="datetime-local"
                                value={formData.shiftStart}
                                onChange={(e) => handleChange('shiftStart', e.target.value)}
                            />
                        </div>

                        <div className="form-group">
                            <label>Shift End</label>
                            <input
                                type="datetime-local"
                                value={formData.shiftEnd}
                                onChange={(e) => handleChange('shiftEnd', e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="form-actions">
                        <button type="button" className="btn-cancel" onClick={onCancel}>
                            Cancel
                        </button>
                        <button type="submit" className="btn-save">
                            <Icon icon="mdi:check" />
                            <span>Save Job</span>
                        </button>
                    </div>
                </form>
            </div>
        </Popup>
    );
}

export default JobEditor;
