import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import { useNotification } from '../../../../../NotificationContext';
import postRequest from '../../../../../utils/postRequest';
import './ApprovalFlowConfig.scss';

const ApprovalFlowConfig = ({ config, onChange }) => {
    const { addNotification } = useNotification();
    const [fieldDefinitions, setFieldDefinitions] = useState([]);
    const [allowedOperators, setAllowedOperators] = useState([]);
    const [defaultSettings, setDefaultSettings] = useState({});
    const [showAddField, setShowAddField] = useState(false);
    const [editingField, setEditingField] = useState(null);
    const [hasChanges, setHasChanges] = useState(false);
    const [newField, setNewField] = useState({
        name: '',
        type: 'string',
        label: '',
        description: '',
        inputType: 'text',
        isActive: true,
        validation: {
            required: false,
            min: null,
            max: null,
            pattern: '',
            options: []
        }
    });

    useEffect(() => {
        if (config) {
            setFieldDefinitions(config.fieldDefinitions || []);
            setAllowedOperators(config.allowedOperators || []);
            setDefaultSettings(config.defaultSettings || {});
        }
    }, [config]);

    const handleFieldChange = (index, field, value) => {
        const updatedFields = [...fieldDefinitions];
        if (field.includes('.')) {
            const [parent, child] = field.split('.');
            updatedFields[index][parent][child] = value;
        } else {
            updatedFields[index][field] = value;
        }
        setFieldDefinitions(updatedFields);
        setHasChanges(true);
        onChange({
            fieldDefinitions: updatedFields,
            allowedOperators,
            defaultSettings
        });
    };

    const saveApprovalFlowConfig = async (newConfig) => {
        try {
            const response = await postRequest('/api/event-system-config/approval-flow', newConfig, {
                method: 'PUT'
            });
            
            if (response.success) {
                addNotification({
                    title: 'Success',
                    message: 'Approval flow configuration saved successfully',
                    type: 'success'
                });
            } else {
                throw new Error(response.message || 'Failed to save configuration');
            }
        } catch (error) {
            console.error('Error saving approval flow config:', error);
            addNotification({
                title: 'Error',
                message: 'Failed to save approval flow configuration',
                type: 'error'
            });
        }
    };

    const handleAddField = () => {
        if (!newField.name || !newField.label) {
            addNotification({
                title: 'Error',
                message: 'Field name and label are required',
                type: 'error'
            });
            return;
        }

        // Check for duplicate names
        if (fieldDefinitions.some(field => field.name === newField.name)) {
            addNotification({
                title: 'Error',
                message: 'Field name must be unique',
                type: 'error'
            });
            return;
        }

        const updatedFields = [...fieldDefinitions, { ...newField }];
        setFieldDefinitions(updatedFields);
        setNewField({
            name: '',
            type: 'string',
            label: '',
            description: '',
            inputType: 'text',
            isActive: true,
            validation: {
                required: false,
                min: null,
                max: null,
                pattern: '',
                options: []
            }
        });
        setShowAddField(false);
        setHasChanges(true);
        onChange({
            fieldDefinitions: updatedFields,
            allowedOperators,
            defaultSettings
        });
    };

    const handleDeleteField = (index) => {
        const updatedFields = fieldDefinitions.filter((_, i) => i !== index);
        setFieldDefinitions(updatedFields);
        setHasChanges(true);
        onChange({
            fieldDefinitions: updatedFields,
            allowedOperators,
            defaultSettings
        });
    };

    const handleToggleFieldActive = (index) => {
        const updatedFields = [...fieldDefinitions];
        updatedFields[index].isActive = !updatedFields[index].isActive;
        setFieldDefinitions(updatedFields);
        setHasChanges(true);
        onChange({
            fieldDefinitions: updatedFields,
            allowedOperators,
            defaultSettings
        });
    };

    const handleDefaultSettingsChange = (field, value) => {
        const updatedSettings = { ...defaultSettings, [field]: value };
        setDefaultSettings(updatedSettings);
        setHasChanges(true);
        onChange({
            fieldDefinitions,
            allowedOperators,
            defaultSettings: updatedSettings
        });
    };

    const getInputTypeForFieldType = (type) => {
        switch (type) {
            case 'string': return 'text';
            case 'number': return 'number';
            case 'boolean': return 'boolean';
            case 'date': return 'date';
            default: return 'text';
        }
    };

    const updateFieldType = (index, newType) => {
        const updatedFields = [...fieldDefinitions];
        updatedFields[index].type = newType;
        updatedFields[index].inputType = getInputTypeForFieldType(newType);
        setFieldDefinitions(updatedFields);
        setHasChanges(true);
        onChange({
            fieldDefinitions: updatedFields,
            allowedOperators,
            defaultSettings
        });
    };

    const handleSave = async () => {
        const configToSave = {
            fieldDefinitions,
            allowedOperators,
            defaultSettings
        };
        
        await saveApprovalFlowConfig(configToSave);
        setHasChanges(false);
    };

    return (
        <div className="approval-flow-config">
            <div className="config-section">
                <div className="section-header">
                    <div className="header-content">
                        <h3>Field Definitions</h3>
                        <p>Define the fields that can be used in approval conditions</p>
                    </div>
                    <div className="header-actions">
                        {hasChanges && (
                            <button 
                                className="save-btn"
                                onClick={handleSave}
                            >
                                <Icon icon="mdi:content-save" />
                                Save Changes
                            </button>
                        )}
                        <button 
                            className="add-field-btn"
                            onClick={() => setShowAddField(true)}
                        >
                            <Icon icon="mdi:plus" />
                            Add Field
                        </button>
                    </div>
                </div>

                {showAddField && (
                    <div className="add-field-form">
                        <h4>Add New Field</h4>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Field Name *</label>
                                <input
                                    type="text"
                                    value={newField.name}
                                    onChange={(e) => setNewField({...newField, name: e.target.value})}
                                    placeholder="e.g., location, budget"
                                />
                            </div>
                            <div className="form-group">
                                <label>Field Type *</label>
                                <select
                                    value={newField.type}
                                    onChange={(e) => {
                                        const newType = e.target.value;
                                        setNewField({
                                            ...newField, 
                                            type: newType,
                                            inputType: getInputTypeForFieldType(newType)
                                        });
                                    }}
                                >
                                    <option value="string">String</option>
                                    <option value="number">Number</option>
                                    <option value="boolean">Boolean</option>
                                    <option value="date">Date</option>
                                </select>
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Display Label *</label>
                                <input
                                    type="text"
                                    value={newField.label}
                                    onChange={(e) => setNewField({...newField, label: e.target.value})}
                                    placeholder="e.g., Event Location"
                                />
                            </div>
                            <div className="form-group">
                                <label>Description</label>
                                <input
                                    type="text"
                                    value={newField.description}
                                    onChange={(e) => setNewField({...newField, description: e.target.value})}
                                    placeholder="Optional description"
                                />
                            </div>
                        </div>
                        <div className="form-actions">
                            <button onClick={handleAddField} className="save-btn">
                                <Icon icon="mdi:check" />
                                Add Field
                            </button>
                            <button onClick={() => setShowAddField(false)} className="cancel-btn">
                                <Icon icon="mdi:close" />
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                <div className="fields-list">
                    {fieldDefinitions.length === 0 ? (
                        <div className="empty-state">
                            <Icon icon="mdi:filter-off" />
                            <p>No field definitions configured</p>
                            <p>Add fields to enable approval conditions</p>
                        </div>
                    ) : (
                        fieldDefinitions.map((field, index) => (
                            <div key={field.name} className={`field-item ${!field.isActive ? 'inactive' : ''}`}>
                                <div className="field-header">
                                    <div className="field-info">
                                        <h4>{field.label}</h4>
                                        <span className="field-name">{field.name}</span>
                                        <span className="field-type">{field.type}</span>
                                    </div>
                                    <div className="field-actions">
                                        <button
                                            className={`toggle-btn ${field.isActive ? 'active' : 'inactive'}`}
                                            onClick={() => handleToggleFieldActive(index)}
                                            title={field.isActive ? 'Disable field' : 'Enable field'}
                                        >
                                            <Icon icon={field.isActive ? 'mdi:eye' : 'mdi:eye-off'} />
                                        </button>
                                        <button
                                            className="delete-btn"
                                            onClick={() => handleDeleteField(index)}
                                            title="Delete field"
                                        >
                                            <Icon icon="mdi:delete" />
                                        </button>
                                    </div>
                                </div>
                                <div className="field-details">
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Type</label>
                                            <select
                                                value={field.type}
                                                onChange={(e) => updateFieldType(index, e.target.value)}
                                            >
                                                <option value="string">String</option>
                                                <option value="number">Number</option>
                                                <option value="boolean">Boolean</option>
                                                <option value="date">Date</option>
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label>Label</label>
                                            <input
                                                type="text"
                                                value={field.label}
                                                onChange={(e) => handleFieldChange(index, 'label', e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label>Description</label>
                                        <input
                                            type="text"
                                            value={field.description || ''}
                                            onChange={(e) => handleFieldChange(index, 'description', e.target.value)}
                                        />
                                    </div>
                                    {field.validation?.options && field.validation.options.length > 0 && (
                                        <div className="form-group">
                                            <label>Options</label>
                                            <div className="options-list">
                                                {field.validation.options.map((option, optIndex) => (
                                                    <div key={optIndex} className="option-item">
                                                        <input
                                                            type="text"
                                                            value={option}
                                                            onChange={(e) => {
                                                                const newOptions = [...field.validation.options];
                                                                newOptions[optIndex] = e.target.value;
                                                                handleFieldChange(index, 'validation.options', newOptions);
                                                            }}
                                                        />
                                                        <button
                                                            onClick={() => {
                                                                const newOptions = field.validation.options.filter((_, i) => i !== optIndex);
                                                                handleFieldChange(index, 'validation.options', newOptions);
                                                            }}
                                                        >
                                                            <Icon icon="mdi:delete" />
                                                        </button>
                                                    </div>
                                                ))}
                                                <button
                                                    className="add-option-btn"
                                                    onClick={() => {
                                                        const newOptions = [...(field.validation.options || []), ''];
                                                        handleFieldChange(index, 'validation.options', newOptions);
                                                    }}
                                                >
                                                    <Icon icon="mdi:plus" />
                                                    Add Option
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div className="config-section">
                <div className="section-header">
                    <h3>Default Approval Settings</h3>
                    <p>Configure default settings for approval workflows</p>
                </div>
                <div className="settings-form">
                    <div className="form-row">
                        <div className="form-group">
                            <label>Escalation Timeout (hours)</label>
                            <input
                                type="number"
                                value={defaultSettings.escalationTimeout || 72}
                                onChange={(e) => handleDefaultSettingsChange('escalationTimeout', parseInt(e.target.value))}
                                min="1"
                                max="168"
                            />
                        </div>
                        <div className="form-group">
                            <label>Max Approvers</label>
                            <input
                                type="number"
                                value={defaultSettings.maxApprovers || ''}
                                onChange={(e) => handleDefaultSettingsChange('maxApprovers', e.target.value ? parseInt(e.target.value) : null)}
                                min="1"
                                placeholder="No limit"
                            />
                        </div>
                    </div>
                    <div className="form-row">
                        <div className="form-group checkbox-group">
                            <label>
                                <input
                                    type="checkbox"
                                    checked={defaultSettings.requireAllMembers || false}
                                    onChange={(e) => handleDefaultSettingsChange('requireAllMembers', e.target.checked)}
                                />
                                Require All Members
                            </label>
                        </div>
                        <div className="form-group checkbox-group">
                            <label>
                                <input
                                    type="checkbox"
                                    checked={defaultSettings.requireAnyMember !== false}
                                    onChange={(e) => handleDefaultSettingsChange('requireAnyMember', e.target.checked)}
                                />
                                Require Any Member
                            </label>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ApprovalFlowConfig;
