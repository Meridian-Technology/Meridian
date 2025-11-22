import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import { useNotification } from '../../../../../NotificationContext';
import Popup from '../../../../../components/Popup/Popup';
import '../../../../RootDash/ManageFlow/tabs/FormConfigTab.scss';

function FormConfig({ config, onChange }) {
    const { addNotification } = useNotification();
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

    // Initialize formConfig from config prop and ensure locked fields and default configurable fields exist
    useEffect(() => {
        if (config?.formConfig && config.formConfig.fields && config.formConfig.fields.length > 0) {
            // Ensure all required locked fields are present
            const requiredLockedFieldNames = ['name', 'start_time', 'end_time', 'hostingId', 'hostingType'];
            const defaultConfigurableFieldNames = ['description', 'type', 'visibility', 'expectedAttendance', 'image', 'location', 'classroom_id', 'contact', 'rsvpEnabled', 'rsvpRequired', 'rsvpDeadline', 'maxAttendees'];
            const existingFieldNames = config.formConfig.fields.map(f => f.name);
            const missingLockedFields = [];
            const missingConfigurableFields = [];
            
            // Check for missing required locked fields
            requiredLockedFieldNames.forEach(fieldName => {
                if (!existingFieldNames.includes(fieldName)) {
                    // Add missing locked field with default config
                    if (fieldName === 'name') {
                        missingLockedFields.push({
                            name: 'name',
                            type: 'string',
                            label: 'Event Title',
                            description: 'Choose a clear, descriptive title',
                            placeholder: 'Enter your event title',
                            inputType: 'text',
                            isActive: true,
                            isLocked: true,
                            isRequired: true,
                            order: 0,
                            step: 'basic-info',
                            validation: { required: true, minLength: 3, maxLength: 100 },
                            helpText: 'Choose a clear, descriptive title that explains what your event is about'
                        });
                    } else if (fieldName === 'start_time') {
                        missingLockedFields.push({
                            name: 'start_time',
                            type: 'date',
                            label: 'Start Time',
                            description: 'When the event begins',
                            inputType: 'datetime-local',
                            isActive: true,
                            isLocked: true,
                            isRequired: true,
                            order: 0,
                            step: 'date-time',
                            validation: { required: true }
                        });
                    } else if (fieldName === 'end_time') {
                        missingLockedFields.push({
                            name: 'end_time',
                            type: 'date',
                            label: 'End Time',
                            description: 'When the event ends',
                            inputType: 'datetime-local',
                            isActive: true,
                            isLocked: true,
                            isRequired: true,
                            order: 1,
                            step: 'date-time',
                            validation: { required: true }
                        });
                    } else if (fieldName === 'hostingId') {
                        missingLockedFields.push({
                            name: 'hostingId',
                            type: 'string',
                            label: 'Hosting ID',
                            description: 'Event host identifier',
                            inputType: 'text',
                            isActive: true,
                            isLocked: true,
                            isRequired: true,
                            order: 0,
                            step: 'basic-info',
                            validation: { required: true }
                        });
                    } else if (fieldName === 'hostingType') {
                        missingLockedFields.push({
                            name: 'hostingType',
                            type: 'string',
                            label: 'Hosting Type',
                            description: 'Type of host (User or Org)',
                            inputType: 'select',
                            isActive: true,
                            isLocked: true,
                            isRequired: true,
                            order: 0,
                            step: 'basic-info',
                            validation: { required: true, options: ['User', 'Org'] }
                        });
                    }
                }
            });
            
            // Check for missing default configurable fields
            const defaultConfigurableFieldsMap = {
                'description': {
                    name: 'description',
                    type: 'textarea',
                    label: 'Description',
                    description: 'Tell us about your event',
                    placeholder: 'Tell us a little about your event',
                    inputType: 'textarea',
                    isActive: true,
                    isLocked: false,
                    isRequired: true,
                    order: 1,
                    step: 'basic-info',
                    validation: { required: true, minLength: 10 },
                    helpText: 'Explain what your event is about, what you\'re trying to achieve, and how others can get involved'
                },
                'type': {
                    name: 'type',
                    type: 'select',
                    label: 'Event Type',
                    description: 'Category of the event',
                    inputType: 'select',
                    isActive: true,
                    isLocked: false,
                    isRequired: true,
                    order: 2,
                    step: 'basic-info',
                    validation: { required: true, options: ['study', 'workshop', 'campus', 'social', 'club', 'meeting', 'sports'] },
                    helpText: 'Choose the category that best describes your event'
                },
                'visibility': {
                    name: 'visibility',
                    type: 'select',
                    label: 'Event Visibility',
                    description: 'Who can see this event',
                    inputType: 'select',
                    isActive: true,
                    isLocked: false,
                    isRequired: true,
                    order: 3,
                    step: 'basic-info',
                    validation: { required: true, options: ['public', 'campus', 'private'] },
                    helpText: 'Choose who can see and join your event'
                },
                'expectedAttendance': {
                    name: 'expectedAttendance',
                    type: 'number',
                    label: 'Expected Attendance',
                    description: 'Number of expected attendees',
                    placeholder: '1',
                    inputType: 'number',
                    isActive: true,
                    isLocked: false,
                    isRequired: true,
                    order: 4,
                    step: 'basic-info',
                    validation: { required: true, min: 1, max: 10000, defaultValue: 1 },
                    helpText: 'Estimate the number of people you expect to attend'
                },
                'image': {
                    name: 'image',
                    type: 'image',
                    label: 'Event Flier',
                    description: 'Upload an image to promote your event',
                    inputType: 'file',
                    isActive: true,
                    isLocked: false,
                    isRequired: false,
                    order: 5,
                    step: 'basic-info',
                    validation: { required: false },
                    helpText: 'Upload an image to promote your event (optional)'
                },
                'location': {
                    name: 'location',
                    type: 'location',
                    label: 'Location',
                    description: 'Event location',
                    inputType: 'text',
                    isActive: true,
                    isLocked: false,
                    isRequired: true,
                    order: 0,
                    step: 'location',
                    validation: { required: true }
                },
                'classroom_id': {
                    name: 'classroom_id',
                    type: 'string',
                    label: 'Classroom',
                    description: 'Select a classroom',
                    inputType: 'select',
                    isActive: true,
                    isLocked: false,
                    isRequired: false,
                    order: 1,
                    step: 'location',
                    validation: { required: false }
                },
                'contact': {
                    name: 'contact',
                    type: 'string',
                    label: 'Contact Information',
                    description: 'Contact person for the event',
                    placeholder: 'Email or phone number',
                    inputType: 'text',
                    isActive: true,
                    isLocked: false,
                    isRequired: false,
                    order: 0,
                    step: 'additional',
                    validation: { required: false }
                },
                'rsvpEnabled': {
                    name: 'rsvpEnabled',
                    type: 'boolean',
                    label: 'Enable RSVP',
                    description: 'Allow attendees to RSVP',
                    inputType: 'checkbox',
                    isActive: true,
                    isLocked: false,
                    isRequired: false,
                    order: 1,
                    step: 'additional',
                    validation: { required: false, defaultValue: false }
                },
                'rsvpRequired': {
                    name: 'rsvpRequired',
                    type: 'boolean',
                    label: 'Require RSVP',
                    description: 'Require RSVP to attend',
                    inputType: 'checkbox',
                    isActive: true,
                    isLocked: false,
                    isRequired: false,
                    order: 2,
                    step: 'additional',
                    validation: { required: false, defaultValue: false },
                    conditional: { dependsOn: 'rsvpEnabled', showWhen: true }
                },
                'rsvpDeadline': {
                    name: 'rsvpDeadline',
                    type: 'date',
                    label: 'RSVP Deadline',
                    description: 'Deadline for RSVP',
                    inputType: 'datetime-local',
                    isActive: true,
                    isLocked: false,
                    isRequired: false,
                    order: 3,
                    step: 'additional',
                    validation: { required: false },
                    conditional: { dependsOn: 'rsvpEnabled', showWhen: true }
                },
                'maxAttendees': {
                    name: 'maxAttendees',
                    type: 'number',
                    label: 'Maximum Attendees',
                    description: 'Maximum number of attendees',
                    placeholder: 'No limit',
                    inputType: 'number',
                    isActive: true,
                    isLocked: false,
                    isRequired: false,
                    order: 4,
                    step: 'additional',
                    validation: { required: false, min: 1 },
                    conditional: { dependsOn: 'rsvpEnabled', showWhen: true }
                }
            };
            
            defaultConfigurableFieldNames.forEach(fieldName => {
                if (!existingFieldNames.includes(fieldName) && defaultConfigurableFieldsMap[fieldName]) {
                    missingConfigurableFields.push(defaultConfigurableFieldsMap[fieldName]);
                }
            });
            
            if (missingLockedFields.length > 0 || missingConfigurableFields.length > 0) {
                // Add missing fields
                const updatedConfig = {
                    ...config.formConfig,
                    fields: [...config.formConfig.fields, ...missingLockedFields, ...missingConfigurableFields]
                };
                setFormConfig(updatedConfig);
                onChange({ formConfig: updatedConfig });
            } else {
                setFormConfig(config.formConfig);
            }
            
            if (config.formConfig.steps && config.formConfig.steps.length > 0) {
                setActiveStep(config.formConfig.steps[0].id);
            }
        } else {
            // Initialize with default fields (locked + configurable) if no config exists
            const defaultFormConfig = {
                steps: [
                    {
                        id: 'basic-info',
                        title: 'Basic Information',
                        description: 'General information about your event',
                        order: 0,
                        isActive: true,
                        fields: ['name', 'description', 'type', 'visibility', 'expectedAttendance', 'image']
                    },
                    {
                        id: 'location',
                        title: 'Location',
                        description: 'Select a room for your event',
                        order: 1,
                        isActive: true,
                        fields: ['location', 'classroom_id']
                    },
                    {
                        id: 'date-time',
                        title: 'Date & Time',
                        description: 'Choose your preferred time slot',
                        order: 2,
                        isActive: true,
                        fields: ['start_time', 'end_time']
                    },
                    {
                        id: 'additional',
                        title: 'Additional Details',
                        description: 'Additional information and settings',
                        order: 3,
                        isActive: true,
                        fields: ['contact', 'rsvpEnabled', 'rsvpRequired', 'rsvpDeadline', 'maxAttendees']
                    }
                ],
                fields: [
                    // Locked fields (required system fields)
                    {
                        name: 'name',
                        type: 'string',
                        label: 'Event Title',
                        description: 'Choose a clear, descriptive title',
                        placeholder: 'Enter your event title',
                        inputType: 'text',
                        isActive: true,
                        isLocked: true,
                        isRequired: true,
                        order: 0,
                        step: 'basic-info',
                        validation: {
                            required: true,
                            minLength: 3,
                            maxLength: 100
                        },
                        helpText: 'Choose a clear, descriptive title that explains what your event is about'
                    },
                    {
                        name: 'start_time',
                        type: 'date',
                        label: 'Start Time',
                        description: 'When the event begins',
                        inputType: 'datetime-local',
                        isActive: true,
                        isLocked: true,
                        isRequired: true,
                        order: 0,
                        step: 'date-time',
                        validation: {
                            required: true
                        }
                    },
                    {
                        name: 'end_time',
                        type: 'date',
                        label: 'End Time',
                        description: 'When the event ends',
                        inputType: 'datetime-local',
                        isActive: true,
                        isLocked: true,
                        isRequired: true,
                        order: 1,
                        step: 'date-time',
                        validation: {
                            required: true
                        }
                    },
                    {
                        name: 'hostingId',
                        type: 'string',
                        label: 'Hosting ID',
                        description: 'Event host identifier',
                        inputType: 'text',
                        isActive: true,
                        isLocked: true,
                        isRequired: true,
                        order: 0,
                        step: 'basic-info',
                        validation: {
                            required: true
                        }
                    },
                    {
                        name: 'hostingType',
                        type: 'string',
                        label: 'Hosting Type',
                        description: 'Type of host (User or Org)',
                        inputType: 'select',
                        isActive: true,
                        isLocked: true,
                        isRequired: true,
                        order: 0,
                        step: 'basic-info',
                        validation: {
                            required: true,
                            options: ['User', 'Org']
                        }
                    },
                    // Default configurable fields
                    {
                        name: 'description',
                        type: 'textarea',
                        label: 'Description',
                        description: 'Tell us about your event',
                        placeholder: 'Tell us a little about your event',
                        inputType: 'textarea',
                        isActive: true,
                        isLocked: false,
                        isRequired: true,
                        order: 1,
                        step: 'basic-info',
                        validation: {
                            required: true,
                            minLength: 10
                        },
                        helpText: 'Explain what your event is about, what you\'re trying to achieve, and how others can get involved'
                    },
                    {
                        name: 'type',
                        type: 'select',
                        label: 'Event Type',
                        description: 'Category of the event',
                        inputType: 'select',
                        isActive: true,
                        isLocked: false,
                        isRequired: true,
                        order: 2,
                        step: 'basic-info',
                        validation: {
                            required: true,
                            options: ['study', 'workshop', 'campus', 'social', 'club', 'meeting', 'sports']
                        },
                        helpText: 'Choose the category that best describes your event'
                    },
                    {
                        name: 'visibility',
                        type: 'select',
                        label: 'Event Visibility',
                        description: 'Who can see this event',
                        inputType: 'select',
                        isActive: true,
                        isLocked: false,
                        isRequired: true,
                        order: 3,
                        step: 'basic-info',
                        validation: {
                            required: true,
                            options: ['public', 'campus', 'private']
                        },
                        helpText: 'Choose who can see and join your event'
                    },
                    {
                        name: 'expectedAttendance',
                        type: 'number',
                        label: 'Expected Attendance',
                        description: 'Number of expected attendees',
                        placeholder: '1',
                        inputType: 'number',
                        isActive: true,
                        isLocked: false,
                        isRequired: true,
                        order: 4,
                        step: 'basic-info',
                        validation: {
                            required: true,
                            min: 1,
                            max: 10000,
                            defaultValue: 1
                        },
                        helpText: 'Estimate the number of people you expect to attend'
                    },
                    {
                        name: 'image',
                        type: 'image',
                        label: 'Event Flier',
                        description: 'Upload an image to promote your event',
                        inputType: 'file',
                        isActive: true,
                        isLocked: false,
                        isRequired: false,
                        order: 5,
                        step: 'basic-info',
                        validation: {
                            required: false
                        },
                        helpText: 'Upload an image to promote your event (optional)'
                    },
                    {
                        name: 'location',
                        type: 'location',
                        label: 'Location',
                        description: 'Event location',
                        inputType: 'text',
                        isActive: true,
                        isLocked: false,
                        isRequired: true,
                        order: 0,
                        step: 'location',
                        validation: {
                            required: true
                        }
                    },
                    {
                        name: 'classroom_id',
                        type: 'string',
                        label: 'Classroom',
                        description: 'Select a classroom',
                        inputType: 'select',
                        isActive: true,
                        isLocked: false,
                        isRequired: false,
                        order: 1,
                        step: 'location',
                        validation: {
                            required: false
                        }
                    },
                    {
                        name: 'contact',
                        type: 'string',
                        label: 'Contact Information',
                        description: 'Contact person for the event',
                        placeholder: 'Email or phone number',
                        inputType: 'text',
                        isActive: true,
                        isLocked: false,
                        isRequired: false,
                        order: 0,
                        step: 'additional',
                        validation: {
                            required: false
                        }
                    },
                    {
                        name: 'rsvpEnabled',
                        type: 'boolean',
                        label: 'Enable RSVP',
                        description: 'Allow attendees to RSVP',
                        inputType: 'checkbox',
                        isActive: true,
                        isLocked: false,
                        isRequired: false,
                        order: 1,
                        step: 'additional',
                        validation: {
                            required: false,
                            defaultValue: false
                        }
                    },
                    {
                        name: 'rsvpRequired',
                        type: 'boolean',
                        label: 'Require RSVP',
                        description: 'Require RSVP to attend',
                        inputType: 'checkbox',
                        isActive: true,
                        isLocked: false,
                        isRequired: false,
                        order: 2,
                        step: 'additional',
                        validation: {
                            required: false,
                            defaultValue: false
                        },
                        conditional: {
                            dependsOn: 'rsvpEnabled',
                            showWhen: true
                        }
                    },
                    {
                        name: 'rsvpDeadline',
                        type: 'date',
                        label: 'RSVP Deadline',
                        description: 'Deadline for RSVP',
                        inputType: 'datetime-local',
                        isActive: true,
                        isLocked: false,
                        isRequired: false,
                        order: 3,
                        step: 'additional',
                        validation: {
                            required: false
                        },
                        conditional: {
                            dependsOn: 'rsvpEnabled',
                            showWhen: true
                        }
                    },
                    {
                        name: 'maxAttendees',
                        type: 'number',
                        label: 'Maximum Attendees',
                        description: 'Maximum number of attendees',
                        placeholder: 'No limit',
                        inputType: 'number',
                        isActive: true,
                        isLocked: false,
                        isRequired: false,
                        order: 4,
                        step: 'additional',
                        validation: {
                            required: false,
                            min: 1
                        },
                        conditional: {
                            dependsOn: 'rsvpEnabled',
                            showWhen: true
                        }
                    }
                ]
            };
            setFormConfig(defaultFormConfig);
            setActiveStep('basic-info');
            // Notify parent of initial config
            onChange({ formConfig: defaultFormConfig });
        }
    }, [config]);

    // Notify parent when formConfig changes - but only after initial load to avoid loops
    const isInitialMount = React.useRef(true);
    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false;
            return;
        }
        if (formConfig) {
            // Always send complete formConfig with all fields
            onChange({ formConfig });
        }
    }, [formConfig]);

    const handleFieldChange = (fieldName, updates) => {
        setFormConfig(prev => {
            if (!prev) return prev;
            const newConfig = { ...prev };
            const fieldIndex = newConfig.fields.findIndex(f => f.name === fieldName);
            if (fieldIndex !== -1) {
                // Don't allow changes to locked fields
                if (newConfig.fields[fieldIndex].isLocked) {
                    addNotification({
                        title: 'Error',
                        message: 'Locked fields cannot be modified',
                        type: 'error'
                    });
                    return prev;
                }
                newConfig.fields[fieldIndex] = { ...newConfig.fields[fieldIndex], ...updates };
            }
            // Notify parent of complete config change
            onChange({ formConfig: newConfig });
            return newConfig;
        });
    };

    const handleStepChange = (stepId, updates) => {
        setFormConfig(prev => {
            if (!prev) return prev;
            const newConfig = { ...prev };
            const stepIndex = newConfig.steps.findIndex(s => s.id === stepId);
            if (stepIndex !== -1) {
                newConfig.steps[stepIndex] = { ...newConfig.steps[stepIndex], ...updates };
            }
            // Notify parent of complete config change
            onChange({ formConfig: newConfig });
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

        const updatedConfig = {
            ...formConfig,
            fields: [...formConfig.fields, { ...newField }].sort((a, b) => a.order - b.order)
        };
        
        // Add field to step if step is selected
        if (newField.step) {
            const step = updatedConfig.steps.find(s => s.id === newField.step);
            if (step) {
                step.fields = [...(step.fields || []), newField.name];
            }
        }
        
        setFormConfig(updatedConfig);
        // Notify parent of complete config change
        onChange({ formConfig: updatedConfig });

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
    };

    const handleDeleteField = (fieldName) => {
        if (!window.confirm(`Are you sure you want to delete the field "${fieldName}"?`)) {
            return;
        }

        const updatedConfig = {
            ...formConfig,
            fields: formConfig.fields.filter(f => f.name !== fieldName && !f.isLocked),
            steps: formConfig.steps.map(step => ({
                ...step,
                fields: step.fields.filter(f => f !== fieldName)
            }))
        };
        setFormConfig(updatedConfig);
        // Notify parent of complete config change
        onChange({ formConfig: updatedConfig });
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

        const updatedConfig = {
            ...formConfig,
            steps: [...formConfig.steps, { ...newStep }].sort((a, b) => a.order - b.order)
        };
        setFormConfig(updatedConfig);
        // Notify parent of complete config change
        onChange({ formConfig: updatedConfig });

        setNewStep({
            id: '',
            title: '',
            description: '',
            order: formConfig.steps.length,
            isActive: true,
            fields: []
        });
        setShowAddStep(false);
    };

    const handleDeleteStep = (stepId) => {
        if (!window.confirm(`Are you sure you want to delete this step? All fields in this step will be removed.`)) {
            return;
        }

        const updatedConfig = {
            ...formConfig,
            steps: formConfig.steps.filter(s => s.id !== stepId),
            fields: formConfig.fields.filter(f => f.step !== stepId && !f.isLocked)
        };
        setFormConfig(updatedConfig);
        // Notify parent of complete config change
        onChange({ formConfig: updatedConfig });
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
                <p className="form-config-description">
                    Configure the event creation form. Locked fields (marked with 🔒) are required system fields and cannot be modified.
                </p>
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
                                            remove
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
                                                        <Icon icon="mdi:lock" className="lock-icon" title="Locked field - cannot be modified" />
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
                                        {editingField === field.name && !field.isLocked && (
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
                                                    <button
                                                        className="delete-btn"
                                                        onClick={() => {
                                                            handleDeleteField(field.name);
                                                            setEditingField(null);
                                                        }}
                                                    >
                                                        Delete Field
                                                    </button>
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

            <Popup isOpen={showAddField} onClose={() => setShowAddField(false)} defaultStyling={true}>
                <div style={{ padding: '2rem', minWidth: '400px' }}>
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
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                        <button onClick={handleAddField}>Add Field</button>
                        <button onClick={() => setShowAddField(false)}>Cancel</button>
                    </div>
                </div>
            </Popup>

            <Popup isOpen={showAddStep} onClose={() => setShowAddStep(false)} defaultStyling={true}>
                <div style={{ padding: '2rem', minWidth: '400px' }}>
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
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                        <button onClick={handleAddStep}>Add Step</button>
                        <button onClick={() => setShowAddStep(false)}>Cancel</button>
                    </div>
                </div>
            </Popup>
        </div>
    );
}

export default FormConfig;

