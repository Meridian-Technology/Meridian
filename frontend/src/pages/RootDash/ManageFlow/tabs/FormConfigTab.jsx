import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import { useNotification } from '../../../../NotificationContext';
import postRequest from '../../../../utils/postRequest';
import { useFetch } from '../../../../hooks/useFetch';
import './FormConfigTab.scss';

function FormConfigTab() {
    const { addNotification } = useNotification();
    const formConfigData = useFetch('/api/event-system-config/form-config');
    const [formConfig, setFormConfig] = useState(null);
    const [activeStep, setActiveStep] = useState(null);
    const [editingField, setEditingField] = useState(null);
    const [showAddField, setShowAddField] = useState(false);
    const [showAddStep, setShowAddStep] = useState(false);
    const [newField, setNewField] = useState({
        name: '',
        type: 'string',
        label: '',
        description: '',
        placeholder: '',
        inputType: 'text',
        isActive: true,
        isRequired: false,
        order: 0,
        step: '',
        validation: {
            required: false,
            min: null,
            max: null,
            minLength: null,
            maxLength: null,
            pattern: '',
            options: [],
            defaultValue: null
        },
        helpText: ''
    });
    const [newStep, setNewStep] = useState({
        id: '',
        title: '',
        description: '',
        order: 0,
        isActive: true,
        fields: []
    });
    const [hasChanges, setHasChanges] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (formConfigData.data?.data) {
            setFormConfig(formConfigData.data.data);
            if (formConfigData.data.data.steps && formConfigData.data.data.steps.length > 0) {
                setActiveStep(formConfigData.data.data.steps[0].id);
            }
        }
    }, [formConfigData.data]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const response = await postRequest('/api/event-system-config/form-config', formConfig, {
                method: 'PUT'
            });
            
            if (response.success) {
                addNotification({
                    title: 'Success',
                    message: 'Form configuration saved successfully',
                    type: 'success'
                });
                setHasChanges(false);
                formConfigData.refetch();
            } else {
                throw new Error(response.message || 'Failed to save configuration');
            }
        } catch (error) {
            console.error('Error saving form config:', error);
            addNotification({
                title: 'Error',
                message: error.message || 'Failed to save form configuration',
                type: 'error'
            });
        } finally {
            setSaving(false);
        }
    };

    const handleFieldChange = (fieldName, updates) => {
        setFormConfig(prev => {
            const newConfig = { ...prev };
            const fieldIndex = newConfig.fields.findIndex(f => f.name === fieldName);
            if (fieldIndex !== -1) {
                newConfig.fields[fieldIndex] = { ...newConfig.fields[fieldIndex], ...updates };
            }
            setHasChanges(true);
            return newConfig;
        });
    };

    const handleStepChange = (stepId, updates) => {
        setFormConfig(prev => {
            const newConfig = { ...prev };
            const stepIndex = newConfig.steps.findIndex(s => s.id === stepId);
            if (stepIndex !== -1) {
                newConfig.steps[stepIndex] = { ...newConfig.steps[stepIndex], ...updates };
            }
            setHasChanges(true);
            return newConfig;
        });
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
        if (formConfig.fields.some(f => f.name === newField.name)) {
            addNotification({
                title: 'Error',
                message: 'Field name must be unique',
                type: 'error'
            });
            return;
        }

        setFormConfig(prev => ({
            ...prev,
            fields: [...prev.fields, { ...newField }].sort((a, b) => a.order - b.order)
        }));

        // Add field to step if step is selected
        if (newField.step) {
            handleStepChange(newField.step, {
                fields: [...(formConfig.steps.find(s => s.id === newField.step)?.fields || []), newField.name]
            });
        }

        setNewField({
            name: '',
            type: 'string',
            label: '',
            description: '',
            placeholder: '',
            inputType: 'text',
            isActive: true,
            isRequired: false,
            order: 0,
            step: '',
            validation: {
                required: false,
                min: null,
                max: null,
                minLength: null,
                maxLength: null,
                pattern: '',
                options: [],
                defaultValue: null
            },
            helpText: ''
        });
        setShowAddField(false);
        setHasChanges(true);
    };

    const handleDeleteField = (fieldName) => {
        if (!window.confirm(`Are you sure you want to delete the field "${fieldName}"?`)) {
            return;
        }

        setFormConfig(prev => ({
            ...prev,
            fields: prev.fields.filter(f => f.name !== fieldName),
            steps: prev.steps.map(step => ({
                ...step,
                fields: step.fields.filter(f => f !== fieldName)
            }))
        }));
        setHasChanges(true);
    };

    const handleAddStep = () => {
        if (!newStep.id || !newStep.title) {
            addNotification({
                title: 'Error',
                message: 'Step ID and title are required',
                type: 'error'
            });
            return;
        }

        // Check for duplicate IDs
        if (formConfig.steps.some(s => s.id === newStep.id)) {
            addNotification({
                title: 'Error',
                message: 'Step ID must be unique',
                type: 'error'
            });
            return;
        }

        setFormConfig(prev => ({
            ...prev,
            steps: [...prev.steps, { ...newStep }].sort((a, b) => a.order - b.order)
        }));

        setNewStep({
            id: '',
            title: '',
            description: '',
            order: formConfig.steps.length,
            isActive: true,
            fields: []
        });
        setShowAddStep(false);
        setHasChanges(true);
    };

    const handleDeleteStep = (stepId) => {
        if (!window.confirm(`Are you sure you want to delete this step? All fields in this step will be removed.`)) {
            return;
        }

        const step = formConfig.steps.find(s => s.id === stepId);
        setFormConfig(prev => ({
            ...prev,
            steps: prev.steps.filter(s => s.id !== stepId),
            fields: prev.fields.filter(f => f.step !== stepId)
        }));
        setHasChanges(true);
    };

    const getFieldsForStep = (stepId) => {
        if (!formConfig) return [];
        const step = formConfig.steps.find(s => s.id === stepId);
        if (!step) return [];
        return formConfig.fields
            .filter(f => step.fields.includes(f.name))
            .sort((a, b) => a.order - b.order);
    };

    const getAvailableFields = () => {
        if (!formConfig) return [];
        const currentStep = formConfig.steps.find(s => s.id === activeStep);
        if (!currentStep) return [];
        return formConfig.fields.filter(f => !currentStep.fields.includes(f.name));
    };

    const addFieldToStep = (fieldName) => {
        handleStepChange(activeStep, {
            fields: [...(formConfig.steps.find(s => s.id === activeStep)?.fields || []), fieldName]
        });
    };

    const removeFieldFromStep = (fieldName) => {
        const step = formConfig.steps.find(s => s.id === activeStep);
        handleStepChange(activeStep, {
            fields: step.fields.filter(f => f !== fieldName)
        });
    };

    if (!formConfig) {
        return <div className="form-config-loading">Loading form configuration...</div>;
    }

    const currentStepData = formConfig.steps.find(s => s.id === activeStep);
    const stepFields = getFieldsForStep(activeStep);

    return (
        <div className="form-config-tab">
            <div className="form-config-header">
                <h2>Event Form Configuration</h2>
                <div className="header-actions">
                    {hasChanges && (
                        <button className="save-btn" onClick={handleSave} disabled={saving}>
                            <Icon icon="mdi:content-save" />
                            {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                    )}
                </div>
            </div>

            <div className="form-config-content">
                <div className="steps-sidebar">
                    <div className="steps-header">
                        <h3>Form Steps</h3>
                        <button 
                            className="add-step-btn" 
                            onClick={() => setShowAddStep(true)}
                        >
                            <Icon icon="mdi:plus" />
                            Add Step
                        </button>
                    </div>
                    <div className="steps-list">
                        {formConfig.steps
                            .sort((a, b) => a.order - b.order)
                            .map(step => (
                                <div
                                    key={step.id}
                                    className={`step-item ${activeStep === step.id ? 'active' : ''} ${!step.isActive ? 'inactive' : ''}`}
                                    onClick={() => setActiveStep(step.id)}
                                >
                                    <div className="step-info">
                                        <h4>{step.title}</h4>
                                        <p>{step.description || 'No description'}</p>
                                        <span className="field-count">
                                            {step.fields.length} field{step.fields.length !== 1 ? 's' : ''}
                                        </span>
                                    </div>
                                    <div className="step-actions">
                                        <button
                                            className="delete-step-btn"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteStep(step.id);
                                            }}
                                        >
                                            <Icon icon="mdi:delete" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                    </div>
                </div>

                <div className="fields-panel">
                    {currentStepData && (
                        <>
                            <div className="step-header">
                                <div>
                                    <h3>{currentStepData.title}</h3>
                                    <p>{currentStepData.description || 'No description'}</p>
                                </div>
                                <button
                                    className="add-field-btn"
                                    onClick={() => setShowAddField(true)}
                                >
                                    <Icon icon="mdi:plus" />
                                    Add Field
                                </button>
                            </div>

                            <div className="fields-list">
                                {stepFields.map(field => (
                                    <div
                                        key={field.name}
                                        className={`field-item ${field.isLocked ? 'locked' : ''} ${!field.isActive ? 'inactive' : ''}`}
                                    >
                                        <div className="field-header">
                                            <div className="field-info">
                                                <h4>
                                                    {field.label}
                                                    {field.isLocked && (
                                                        <Icon icon="mdi:lock" className="lock-icon" title="Locked field" />
                                                    )}
                                                    {field.isRequired && (
                                                        <span className="required-badge">Required</span>
                                                    )}
                                                </h4>
                                                <p className="field-name">{field.name} ({field.type})</p>
                                            </div>
                                            <div className="field-actions">
                                                {!field.isLocked && (
                                                    <button
                                                        className="edit-field-btn"
                                                        onClick={() => setEditingField(field.name)}
                                                    >
                                                        <Icon icon="mdi:pencil" />
                                                    </button>
                                                )}
                                                {!field.isLocked && (
                                                    <button
                                                        className="remove-field-btn"
                                                        onClick={() => removeFieldFromStep(field.name)}
                                                    >
                                                        <Icon icon="mdi:close" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        {editingField === field.name && (
                                            <div className="field-editor">
                                                <div className="form-group">
                                                    <label>Label</label>
                                                    <input
                                                        type="text"
                                                        value={field.label}
                                                        onChange={(e) => handleFieldChange(field.name, { label: e.target.value })}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label>Description</label>
                                                    <textarea
                                                        value={field.description || ''}
                                                        onChange={(e) => handleFieldChange(field.name, { description: e.target.value })}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label>Placeholder</label>
                                                    <input
                                                        type="text"
                                                        value={field.placeholder || ''}
                                                        onChange={(e) => handleFieldChange(field.name, { placeholder: e.target.value })}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label>
                                                        <input
                                                            type="checkbox"
                                                            checked={field.isRequired}
                                                            onChange={(e) => handleFieldChange(field.name, { isRequired: e.target.checked })}
                                                        />
                                                        Required
                                                    </label>
                                                </div>
                                                <div className="form-group">
                                                    <label>
                                                        <input
                                                            type="checkbox"
                                                            checked={field.isActive}
                                                            onChange={(e) => handleFieldChange(field.name, { isActive: e.target.checked })}
                                                        />
                                                        Active
                                                    </label>
                                                </div>
                                                <div className="form-group">
                                                    <label>Order</label>
                                                    <input
                                                        type="number"
                                                        value={field.order}
                                                        onChange={(e) => handleFieldChange(field.name, { order: parseInt(e.target.value) || 0 })}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label>Help Text</label>
                                                    <textarea
                                                        value={field.helpText || ''}
                                                        onChange={(e) => handleFieldChange(field.name, { helpText: e.target.value })}
                                                    />
                                                </div>
                                                {field.validation?.options && (
                                                    <div className="form-group">
                                                        <label>Options (one per line)</label>
                                                        <textarea
                                                            value={field.validation.options.join('\n')}
                                                            onChange={(e) => handleFieldChange(field.name, {
                                                                validation: {
                                                                    ...field.validation,
                                                                    options: e.target.value.split('\n').filter(o => o.trim())
                                                                }
                                                            })}
                                                        />
                                                    </div>
                                                )}
                                                <div className="field-editor-actions">
                                                    <button onClick={() => setEditingField(null)}>Done</button>
                                                    {!field.isLocked && (
                                                        <button
                                                            className="delete-btn"
                                                            onClick={() => {
                                                                handleDeleteField(field.name);
                                                                setEditingField(null);
                                                            }}
                                                        >
                                                            Delete Field
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <div className="available-fields">
                                <h4>Available Fields</h4>
                                {getAvailableFields().length > 0 ? (
                                    <div className="available-fields-list">
                                        {getAvailableFields().map(field => (
                                            <div
                                                key={field.name}
                                                className="available-field-item"
                                                onClick={() => addFieldToStep(field.name)}
                                            >
                                                <span>{field.label}</span>
                                                <Icon icon="mdi:plus" />
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p>No available fields. All fields are assigned to steps.</p>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {showAddField && (
                <div className="modal-overlay" onClick={() => setShowAddField(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <h3>Add New Field</h3>
                        <div className="form-group">
                            <label>Field Name *</label>
                            <input
                                type="text"
                                value={newField.name}
                                onChange={(e) => setNewField({ ...newField, name: e.target.value })}
                                placeholder="e.g., budget, speaker"
                            />
                        </div>
                        <div className="form-group">
                            <label>Label *</label>
                            <input
                                type="text"
                                value={newField.label}
                                onChange={(e) => setNewField({ ...newField, label: e.target.value })}
                                placeholder="Display label"
                            />
                        </div>
                        <div className="form-group">
                            <label>Type</label>
                            <select
                                value={newField.type}
                                onChange={(e) => {
                                    const newType = e.target.value;
                                    let inputType = 'text';
                                    if (newType === 'number') inputType = 'number';
                                    else if (newType === 'boolean') inputType = 'checkbox';
                                    else if (newType === 'date') inputType = 'datetime-local';
                                    else if (newType === 'select') inputType = 'select';
                                    else if (newType === 'textarea') inputType = 'textarea';
                                    setNewField({ ...newField, type: newType, inputType });
                                }}
                            >
                                <option value="string">String</option>
                                <option value="number">Number</option>
                                <option value="boolean">Boolean</option>
                                <option value="date">Date</option>
                                <option value="select">Select</option>
                                <option value="textarea">Textarea</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Step</label>
                            <select
                                value={newField.step}
                                onChange={(e) => setNewField({ ...newField, step: e.target.value })}
                            >
                                <option value="">Select a step</option>
                                {formConfig.steps.map(step => (
                                    <option key={step.id} value={step.id}>{step.title}</option>
                                ))}
                            </select>
                        </div>
                        <div className="modal-actions">
                            <button onClick={handleAddField}>Add Field</button>
                            <button onClick={() => setShowAddField(false)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {showAddStep && (
                <div className="modal-overlay" onClick={() => setShowAddStep(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <h3>Add New Step</h3>
                        <div className="form-group">
                            <label>Step ID *</label>
                            <input
                                type="text"
                                value={newStep.id}
                                onChange={(e) => setNewStep({ ...newStep, id: e.target.value })}
                                placeholder="e.g., additional-info"
                            />
                        </div>
                        <div className="form-group">
                            <label>Title *</label>
                            <input
                                type="text"
                                value={newStep.title}
                                onChange={(e) => setNewStep({ ...newStep, title: e.target.value })}
                                placeholder="Step title"
                            />
                        </div>
                        <div className="form-group">
                            <label>Description</label>
                            <textarea
                                value={newStep.description}
                                onChange={(e) => setNewStep({ ...newStep, description: e.target.value })}
                                placeholder="Step description"
                            />
                        </div>
                        <div className="modal-actions">
                            <button onClick={handleAddStep}>Add Step</button>
                            <button onClick={() => setShowAddStep(false)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default FormConfigTab;

