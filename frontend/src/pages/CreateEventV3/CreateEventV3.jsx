import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Icon } from '@iconify-icon/react';
import { analytics } from '../../services/analytics/analytics';
import apiRequest from '../../utils/postRequest';
import DynamicFormField from '../../components/DynamicFormField/DynamicFormField';
import { useFetch } from '../../hooks/useFetch';
import { useNotification } from '../../NotificationContext';
import useAuth from '../../hooks/useAuth';
import HostOrgDropdown from '../CreateEventV2/Components/HostOrgDropdown/HostOrgDropdown';
import LocationAutocomplete from '../CreateEventV2/Components/LocationAutocomplete/LocationAutocomplete';
import DateTimePicker from '../CreateEventV2/Components/DateTimePicker/DateTimePicker';
import RegistrationSection from '../CreateEventV2/Components/RegistrationSection/RegistrationSection';
import ApprovalPreview from '../../components/ApprovalPreview/ApprovalPreview';
import ImageUpload from '../../components/ImageUpload/ImageUpload';
import Header from '../../components/Header/Header';
import './CreateEventV3.scss';

const DEFAULT_FIELDS = [
    { name: 'name', type: 'string', label: 'Event Name', inputType: 'text', step: 'basic-info', isActive: true, order: 0, validation: { required: true }, placeholder: 'Event Name' },
    { name: 'description', type: 'textarea', label: 'Description', inputType: 'textarea', step: 'basic-info', isActive: true, order: 1, validation: { required: true }, placeholder: 'Tell us about your event', allowExpand: true },
    { name: 'type', type: 'select', label: 'Event Type', inputType: 'select', step: 'basic-info', isActive: true, order: 2, validation: { required: true, options: ['study', 'workshop', 'campus', 'social', 'club', 'meeting', 'sports'] } },
    { name: 'visibility', type: 'select', label: 'Visibility', inputType: 'select', step: 'basic-info', isActive: true, order: 3, validation: { required: true, options: ['public', 'unlisted', 'members_only'] } },
    { name: 'expectedAttendance', type: 'number', label: 'Expected Attendance', inputType: 'number', step: 'basic-info', isActive: true, order: 4, validation: { required: true, min: 1, max: 10000, defaultValue: 1 }, placeholder: '1' },
    { name: 'contact', type: 'string', label: 'Contact', inputType: 'text', step: 'additional', isActive: true, order: 0, validation: { required: false }, placeholder: 'Email or phone' },
];
const DEFAULT_STEPS = [
    { id: 'basic-info', isActive: true, order: 0 },
    { id: 'location', isActive: true, order: 1 },
    { id: 'date-time', isActive: true, order: 2 },
    { id: 'additional', isActive: true, order: 3 },
];

const CreateEventV3 = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const { addNotification } = useNotification();
    const formConfigData = useFetch('/api/event-system-config/form-config');
    const eligibilityData = useFetch(user ? '/api/event-system-config/event-creation-eligibility' : null);
    const formConfig = formConfigData.data?.data ?? formConfigData.data;
    const eligibility = eligibilityData.data?.data;

    const initialStateHost = location.state?.selectedOrg
        ? { id: location.state.selectedOrg._id, type: 'Org' }
        : null;
    const [selectedHost, setSelectedHost] = useState(initialStateHost);

    useEffect(() => {
        if (!eligibility || !user) return;
        const { allowIndividualUserHosting, orgsWithEventPermission } = eligibility;
        setSelectedHost(prev => {
            if (prev) {
                if (prev.type === 'User') return allowIndividualUserHosting ? prev : null;
                if (prev.type === 'Org') {
                    const isOrgAllowed = orgsWithEventPermission?.some(o => o._id === prev.id);
                    return isOrgAllowed ? prev : null;
                }
            }
            if (allowIndividualUserHosting) return { id: user._id, type: 'User' };
            if (orgsWithEventPermission?.length > 0) return { id: orgsWithEventPermission[0]._id, type: 'Org' };
            return null;
        });
    }, [eligibility, user]);
    const [formData, setFormData] = useState({
        name: '',
        type: '',
        hostingId: null,
        hostingType: '',
        going: [],
        location: '',
        start_time: null,
        end_time: null,
        description: '',
        image: null,
        classroom_id: null,
        visibility: '',
        expectedAttendance: 1,
        contact: '',
        selectedRoomIds: [],
        registrationEnabled: false,
        registrationRequired: false,
        registrationDeadline: null,
        maxAttendees: null,
        registrationFormId: null,
        rsvpEnabled: false,
        rsvpRequired: false,
        rsvpDeadline: null,
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        document.body.classList.add('create-event-v3-page');
        return () => document.body.classList.remove('create-event-v3-page');
    }, []);

    useEffect(() => {
        analytics.screen('Create Event');
    }, []);

    useEffect(() => {
        if (selectedHost) {
            setFormData(prev => ({
                ...prev,
                hostingId: selectedHost.id,
                hostingType: selectedHost.type
            }));
        }
    }, [selectedHost]);

    useEffect(() => {
        const fields = formConfig?.fields?.length ? formConfig.fields : DEFAULT_FIELDS;
        const defaultValues = {};
        fields.forEach(field => {
            if (field.validation?.defaultValue !== undefined && field.validation?.defaultValue !== null) {
                defaultValues[field.name] = field.validation.defaultValue;
            }
        });
        if (Object.keys(defaultValues).length > 0) {
            setFormData(prev => ({ ...prev, ...defaultValues }));
        }
    }, [formConfig]);

    const getMissingFields = useCallback((data, config) => {
        const missing = [];
        if (!config?.fields) return missing;

        config.fields.forEach(field => {
            if (!field.isActive) return;
            if (field.step === 'location' || field.step === 'date-time') return;
            const isRequired = field.isRequired || field.validation?.required;
            if (!isRequired) return;

            const value = data[field.name];
            let isMissing = false;
            if (field.name === 'selectedRoomIds') {
                isMissing = false;
            } else if (field.name === 'start_time' || field.name === 'end_time') {
                isMissing = false;
            } else if (typeof value === 'string') {
                isMissing = !value?.trim();
            } else if (typeof value === 'number') {
                isMissing = value === undefined || value === null || value <= 0;
            } else {
                isMissing = value === undefined || value === null || value === '';
            }

            if (isMissing) {
                missing.push({
                    fieldName: field.name,
                    label: field.label,
                    step: field.step,
                    stepTitle: config.steps?.find(s => s.id === field.step)?.title || 'Unknown'
                });
            }
        });
        return missing;
    }, []);

    const handleSubmit = async (asDraft) => {
        if (!selectedHost) {
            addNotification({
                title: 'Select a host',
                message: 'Please select who is hosting this event.',
                type: 'error'
            });
            return;
        }
        const missing = getMissingFields(formData, formConfig);
        if (missing.length > 0) {
            addNotification({
                title: 'Missing required fields',
                message: `Please complete: ${missing.map(m => m.label).join(', ')}`,
                type: 'error'
            });
            return;
        }

        setIsSubmitting(true);
        try {
            const submitData = new FormData();
            const data = {
                name: formData.name,
                type: formData.type,
                hostingId: selectedHost?.id || formData.hostingId || user?._id,
                hostingType: selectedHost?.type || formData.hostingType || (user ? 'User' : ''),
                going: formData.going || [],
                location: formData.location,
                start_time: formData.start_time,
                end_time: formData.end_time,
                description: formData.description,
                classroom_id: formData.classroom_id || formData.classroomId,
                visibility: formData.visibility,
                expectedAttendance: formData.expectedAttendance,
                contact: formData.contact,
                registrationEnabled: formData.registrationEnabled ?? formData.rsvpEnabled ?? false,
                registrationRequired: formData.registrationRequired ?? formData.rsvpRequired ?? false,
                registrationDeadline: formData.registrationDeadline ?? formData.rsvpDeadline,
                maxAttendees: formData.maxAttendees,
                registrationFormId: formData.registrationFormId,
                orgId: selectedHost?.type === 'Org' ? selectedHost.id : null,
                asDraft: asDraft ? 'true' : 'false'
            };

            Object.keys(data).forEach(key => {
                if (data[key] !== null && data[key] !== undefined) {
                    if (data[key] instanceof Date) {
                        submitData.append(key, data[key].toISOString());
                    } else if (Array.isArray(data[key])) {
                        submitData.append(key, JSON.stringify(data[key]));
                    } else if (typeof data[key] === 'object') {
                        submitData.append(key, JSON.stringify(data[key]));
                    } else {
                        submitData.append(key, data[key]);
                    }
                }
            });

            if (formData.image) {
                submitData.append('image', formData.image);
            }

            const response = await apiRequest('/create-event', submitData, { method: 'POST' });

            if (response.success) {
                analytics.track('event_create_submitted', {
                    event_id: response.eventId,
                    as_draft: !!asDraft,
                    hosting_type: selectedHost?.type
                });
                addNotification({
                    title: asDraft ? 'Draft Saved' : 'Event Created',
                    message: asDraft
                        ? 'Draft saved. Add an agenda, configure registration, assign roles, and publish when ready.'
                        : "Your event has been created successfully!",
                    type: 'success'
                });
                const { eventId, orgId, orgName } = response;
                if (eventId && orgId && orgName) {
                    navigate(`/club-dashboard/${orgName}?page=1&overlay=event-dashboard&eventId=${eventId}&orgId=${orgId}`);
                } else {
                    navigate('/events-dashboard');
                }
            } else {
                throw new Error(response.message || response.error || 'Failed to create event');
            }
        } catch (error) {
            addNotification({
                title: 'Create Event Error',
                message: error.message || 'Something went wrong. Please try again.',
                type: 'error'
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleFieldChange = (fieldName, value) => {
        setFormData(prev => ({ ...prev, [fieldName]: value }));
    };

    const rsvpFieldNames = ['rsvpEnabled', 'rsvpRequired', 'rsvpDeadline', 'maxAttendees'];

    const getFieldsForStep = (stepId) => {
        const fields = formConfig?.fields?.length ? formConfig.fields : DEFAULT_FIELDS;
        return fields
            .filter(f => f.step === stepId && f.isActive !== false)
            .sort((a, b) => (a.order || 0) - (b.order || 0));
    };

    const getActiveSteps = () => {
        const steps = formConfig?.steps?.length ? formConfig.steps : DEFAULT_STEPS;
        return steps
            .filter(s => s.isActive !== false)
            .sort((a, b) => (a.order || 0) - (b.order || 0));
    };

    const steps = getActiveSteps();

    if (formConfigData.loading && !formConfigData.data && !formConfigData.error) {
        return (
            <div className="create-event-v3 create-event-v3-loading">
                <div>Loading form configuration...</div>
            </div>
        );
    }

    return (
        <div className="create-event-v3">
            <Header />
            <div className="create-event-v3-content">
                <div className="create-event-v3-left">
                    <div className="event-image-section">
                        <ImageUpload
                            uploadText="Add event image"
                            onFileSelect={(file) => handleFieldChange('image', file)}
                            onFileClear={() => handleFieldChange('image', null)}
                            showPrompt={true}
                            showActions={false}
                        />
                    </div>
                </div>

                <div className="create-event-v3-right">
                    <div className="create-event-v3-header-row">
                        {user && (
                            <HostOrgDropdown
                                selectedHost={selectedHost}
                                onHostChange={setSelectedHost}
                                allowIndividualUserHosting={eligibility?.allowIndividualUserHosting ?? true}
                                orgsWithEventPermission={eligibility?.orgsWithEventPermission}
                            />
                        )}
                        {getFieldsForStep('basic-info')
                            .filter(f => f.name === 'visibility')
                            .map(field => (
                                <div key={field.name} className="create-event-v3-visibility-wrap">
                                    <DynamicFormField
                                        field={field}
                                        value={formData[field.name]}
                                        onChange={handleFieldChange}
                                        formData={formData}
                                        errors={{}}
                                        hideLabel
                                    />
                                </div>
                            ))}
                    </div>

                    <div className="create-event-v3-form">
                        {getFieldsForStep('basic-info')
                            .filter(f => f.name === 'name')
                            .map(field => (
                                <div key={field.name} className="form-section">
                                    <DynamicFormField
                                        field={field}
                                        value={formData[field.name]}
                                        onChange={handleFieldChange}
                                        formData={formData}
                                        errors={{}}
                                        specialStyling="event-name-field"
                                    />
                                </div>
                            ))}

                        {steps.some(s => s.id === 'date-time') && (
                            <div className="form-section">
                                <DateTimePicker formData={formData} setFormData={setFormData} />
                            </div>
                        )}

                        {steps.some(s => s.id === 'location') && (
                            <div className="form-section">
                                <label className="section-label">Add Event Location</label>
                                <LocationAutocomplete formData={formData} setFormData={setFormData} />
                            </div>
                        )}

                        {getFieldsForStep('basic-info')
                            .filter(f => f.name === 'description')
                            .map(field => (
                                <div key={field.name} className="form-section">
                                    <DynamicFormField
                                        field={{ ...field, allowExpand: true }}
                                        value={formData[field.name]}
                                        onChange={handleFieldChange}
                                        formData={formData}
                                        errors={{}}
                                    />
                                </div>
                            ))}

                        {getFieldsForStep('basic-info')
                            .filter(f => ['type', 'expectedAttendance'].includes(f.name))
                            .map(field => {
                                const fieldToRender = field.name === 'expectedAttendance'
                                    ? { ...field, inputType: 'number', placeholder: field.placeholder || '1' }
                                    : field;
                                return (
                                    <div key={field.name} className="form-section">
                                        <DynamicFormField
                                            field={fieldToRender}
                                            value={formData[field.name]}
                                            onChange={handleFieldChange}
                                            formData={formData}
                                            errors={{}}
                                        />
                                    </div>
                                );
                            })}

                        <div className="form-section">
                            <RegistrationSection
                                formData={formData}
                                setFormData={setFormData}
                                selectedHost={selectedHost}
                            />
                        </div>

                        <div className="form-section approval-preview-section">
                            <ApprovalPreview formData={formData} hideUnlessRequired />
                        </div>

                        {getFieldsForStep('additional')
                            .filter(f => !rsvpFieldNames.includes(f.name))
                            .map(field => (
                                <div key={field.name} className="form-section">
                                    <DynamicFormField
                                        field={field}
                                        value={formData[field.name]}
                                        onChange={handleFieldChange}
                                        formData={formData}
                                        errors={{}}
                                    />
                                </div>
                            ))}
                    </div>

                    <div className="create-event-v3-actions">
                        <p className="create-event-v3-draft-note">
                            Save as Draft to keep building your event in the dashboard—add an agenda, tweak registration settings, assign roles, and refine details. Only organizers can see drafts until you publish.
                        </p>
                        <div className="create-event-v3-buttons">
                            <button
                                className="create-event-v3-submit create-event-v3-draft"
                                onClick={() => handleSubmit(true)}
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? 'Saving...' : 'Save Draft & Continue Later'}
                            </button>
                            <button
                                className="create-event-v3-submit"
                                onClick={() => handleSubmit(false)}
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? 'Creating...' : 'Create & Publish'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CreateEventV3;
