import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useFetch } from '../../../../../../hooks/useFetch';
import { useNotification } from '../../../../../../NotificationContext';
import useUnsavedChanges from '../../../../../../hooks/useUnsavedChanges';
import DynamicFormField from '../../../../../../components/DynamicFormField/DynamicFormField';
import ImageUpload from '../../../../../../components/ImageUpload/ImageUpload';
import UnsavedChangesBanner from '../../../../../../components/UnsavedChangesBanner/UnsavedChangesBanner';
import DateTimePicker from '../../../../../../pages/CreateEventV2/Components/DateTimePicker/DateTimePicker';
import LocationAutocomplete from '../../../../../../pages/CreateEventV2/Components/LocationAutocomplete/LocationAutocomplete';
import EventPreview from '../EventPreview';
import EventCollaborationSection from './EventCollaborationSection';
import apiRequest from '../../../../../../utils/postRequest';
import { extractResourceId, buildResourcePreflightPayload } from '../../../../../CreateEvent/shared/resourcePreflight';
import './EventEditorTab.scss';

function EventEditorTab({ event, agenda, orgId, onRefresh }) {
    const { addNotification } = useNotification();

    const formConfigData = useFetch('/api/event-system-config/form-config');

    // Form data: details only (registration/check-in are in their respective tabs)
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        type: '',
        visibility: '',
        expectedAttendance: 0,
        contact: '',
        externalLink: '',
        image: null,
        start_time: null,
        end_time: null,
        location: '',
        classroom_id: null,
        selectedRoomIds: []
    });

    const [originalData, setOriginalData] = useState(null);
    const [resourcePreflightError, setResourcePreflightError] = useState('');
    const preflightTimerRef = useRef(null);
    const lastConflictKeyRef = useRef('');

    // Initialize form data from event prop (details only; no rsvp/hosting/registration/check-in)
    useEffect(() => {
        if (event) {
            const initialData = {
                name: event.name || '',
                description: event.description || '',
                type: event.type || '',
                visibility: event.visibility || '',
                expectedAttendance: event.expectedAttendance || 0,
                contact: event.contact || '',
                externalLink: event.externalLink || '',
                image: null,
                start_time: event.start_time ? new Date(event.start_time) : null,
                end_time: event.end_time ? new Date(event.end_time) : null,
                location: event.location || '',
                classroom_id: event.classroom_id || null,
                selectedRoomIds: event.classroom_id ? [event.classroom_id] : []
            };
            if (event.customFields) {
                Object.keys(event.customFields).forEach((key) => {
                    initialData[key] = event.customFields[key];
                });
            }
            setFormData(initialData);
            setOriginalData(JSON.parse(JSON.stringify(initialData)));
        }
    }, [event]);

    const handleFieldChange = (fieldName, value) => {
        setFormData((prev) => ({
            ...prev,
            [fieldName]: value
        }));
    };

    useEffect(() => {
        if (!event?._id) return undefined;
        const resourceId = extractResourceId(formData);
        const startTime = formData.start_time;
        const endTime = formData.end_time;
        if (preflightTimerRef.current) {
            clearTimeout(preflightTimerRef.current);
            preflightTimerRef.current = null;
        }
        if (!resourceId || !startTime || !endTime) {
            setResourcePreflightError('');
            setFormData((prev) =>
                prev.resourcePreflightError ? { ...prev, resourcePreflightError: '' } : prev
            );
            lastConflictKeyRef.current = '';
            return undefined;
        }
        const key = `${event._id}|${resourceId}|${new Date(startTime).toISOString()}|${new Date(endTime).toISOString()}`;
        preflightTimerRef.current = setTimeout(async () => {
            const preflight = await apiRequest('/resource-preflight', buildResourcePreflightPayload({
                resourceId,
                startTime,
                endTime,
                excludeEventId: event._id
            }), { method: 'POST' });
            if (!preflight.success) {
                const msg = preflight.message || 'Resource is unavailable for this time';
                setResourcePreflightError(msg);
                setFormData((prev) =>
                    prev.resourcePreflightError === msg ? prev : { ...prev, resourcePreflightError: msg }
                );
                if (lastConflictKeyRef.current !== key) {
                    lastConflictKeyRef.current = key;
                }
                return;
            }
            setResourcePreflightError('');
            setFormData((prev) =>
                prev.resourcePreflightError ? { ...prev, resourcePreflightError: '' } : prev
            );
            lastConflictKeyRef.current = '';
        }, 350);
        return () => {
            if (preflightTimerRef.current) clearTimeout(preflightTimerRef.current);
        };
    }, [formData.start_time, formData.end_time, formData.classroom_id, formData.classroomId, event?._id, addNotification]);

    const validateForm = () => {
        const errors = {};

        if (!formData.name || formData.name.trim() === '') {
            errors.name = 'Event name is required';
        }

        if (!formData.type) {
            errors.type = 'Event type is required';
        }

        if (!formData.visibility) {
            errors.visibility = 'Visibility is required';
        }

        if (!formData.start_time || !formData.end_time) {
            errors.time = 'Date and time are required';
        }

        const hasRoom = formData.selectedRoomIds && formData.selectedRoomIds.length > 0;
        const hasLocationText = formData.location && formData.location.trim() !== '';
        if (!hasRoom && !hasLocationText) {
            errors.location = 'Location is required (select a room from suggestions or enter a place)';
        }

        return errors;
    };

    const handleSave = async () => {
        const errors = validateForm();
        if (Object.keys(errors).length > 0) {
            addNotification({
                title: 'Validation Error',
                message: 'Please fix all errors before saving',
                type: 'error'
            });
            return false;
        }
        try {
            const resourceId = extractResourceId(formData);
            const updateData = {
                name: formData.name,
                description: formData.description,
                type: formData.type,
                visibility: formData.visibility,
                expectedAttendance: formData.expectedAttendance,
                contact: formData.contact || '',
                externalLink: formData.externalLink || '',
                start_time: formData.start_time.toISOString(),
                end_time: formData.end_time.toISOString(),
                classroom_id: resourceId,
                resourceId,
                location: formData.location
            };

            if (resourcePreflightError) throw new Error(resourcePreflightError);

            const customFields = {};
            if (formConfigData.data?.data?.fields) {
                const reserved = [
                    'name',
                    'description',
                    'type',
                    'visibility',
                    'expectedAttendance',
                    'contact',
                    'externalLink',
                    'start_time',
                    'end_time',
                    'location',
                    'classroom_id',
                    'resourceId',
                    'selectedRoomIds',
                    'image',
                    'hostingId',
                    'hostingType',
                    'rsvpEnabled',
                    'rsvpRequired',
                    'rsvpDeadline'
                ];
                formConfigData.data.data.fields.forEach((field) => {
                    if (!reserved.includes(field.name) && formData[field.name] !== undefined) {
                        customFields[field.name] = formData[field.name];
                    }
                });
            }
            if (Object.keys(customFields).length > 0) {
                updateData.customFields = customFields;
            }

            const endpoint = orgId
                ? `/org-event-management/${orgId}/events/${event._id}`
                : `/update-event/${event._id}`;

            const response = await apiRequest(endpoint, updateData, { method: 'PUT' });

            if (response.success) {
                if (formData.image instanceof File) {
                    const imageFormData = new FormData();
                    imageFormData.append('image', formData.image);
                    imageFormData.append('eventId', event._id);

                    await apiRequest('/upload-event-image', imageFormData, { method: 'POST' });
                }

                addNotification({
                    title: 'Success',
                    message: 'Event updated successfully',
                    type: 'success'
                });
                setOriginalData(JSON.parse(JSON.stringify(formData)));
                if (onRefresh) onRefresh();
                return true;
            }
            throw new Error(response.message || 'Failed to update event');
        } catch (error) {
            addNotification({
                title: 'Error',
                message: error.message || 'Failed to update event',
                type: 'error'
            });
            return false;
        }
    };

    const handleDiscard = () => {
        if (originalData) setFormData(JSON.parse(JSON.stringify(originalData)));
    };
    const { hasChanges, saving, handleSave: performSave, handleDiscard: discardChanges } = useUnsavedChanges(
        originalData,
        formData,
        handleSave,
        handleDiscard
    );

    const formConfig = formConfigData.data?.data;
    const regularFields = useMemo(() => {
        if (!formConfig?.fields) return [];

        const excludedFields = [
            'name',
            'description',
            'type',
            'visibility',
            'expectedAttendance',
            'image',
            'start_time',
            'end_time',
            'location',
            'classroom_id',
            'resourceId',
            'selectedRoomIds',
            'contact',
            'externalLink',
            'hostingId',
            'hostingType',
            'rsvpEnabled',
            'rsvpRequired',
            'rsvpDeadline',
            'registrationEnabled',
            'registrationRequired',
            'registrationDeadline',
            'registrationFormId',
            'maxAttendees'
        ];

        const excludedSteps = ['location', 'date-time'];

        return formConfig.fields.filter(
            (field) =>
                field.isActive && !excludedSteps.includes(field.step) && !excludedFields.includes(field.name)
        );
    }, [formConfig]);

    const eventWithAgenda = event
        ? {
              ...event,
              eventAgenda: {
                  items: agenda?.items || [],
                  isPublished: agenda?.isPublished
              }
          }
        : null;

    if (!event) {
        return <div className="event-editor-tab">Loading...</div>;
    }

    return (
        <div className="event-editor-tab">
            <UnsavedChangesBanner
                hasChanges={hasChanges}
                onSave={performSave}
                onDiscard={discardChanges}
                saving={saving}
                saveText="Save"
                discardText="Discard"
            />
            {eventWithAgenda && <EventPreview event={eventWithAgenda} onRefetch={onRefresh} />}
            <div className="editor-header">
                <h2>Details</h2>
            </div>

            <div className="editor-content create-event-v3-form">
                <div className="form-section">
                    <DynamicFormField
                        field={{
                            name: 'name',
                            label: 'Event Name',
                            inputType: 'text',
                            placeholder: 'Event name',
                            validation: {}
                        }}
                        value={formData.name}
                        onChange={handleFieldChange}
                        formData={formData}
                        errors={{}}
                        color="var(--primary-color)"
                    />
                </div>

                <div className="form-section">
                    <DynamicFormField
                        field={{
                            name: 'description',
                            label: 'Description',
                            inputType: 'markdown-textarea',
                            placeholder: 'Event description',
                            validation: {},
                            allowExpand: true
                        }}
                        value={formData.description || ''}
                        onChange={handleFieldChange}
                        formData={formData}
                        errors={{}}
                        color="var(--primary-color)"
                    />
                </div>

                <div className="form-section">
                    <DynamicFormField
                        field={{
                            name: 'type',
                            label: 'Event Type',
                            inputType: 'select',
                            validation: {
                                options: ['study', 'workshop', 'campus', 'social', 'club', 'meeting', 'sports']
                            }
                        }}
                        value={formData.type}
                        onChange={handleFieldChange}
                        formData={formData}
                        errors={{}}
                        color="var(--primary-color)"
                    />
                </div>

                <div className="form-section">
                    <DynamicFormField
                        field={{ name: 'visibility', label: 'Visibility', inputType: 'select', validation: {} }}
                        value={formData.visibility}
                        onChange={handleFieldChange}
                        formData={formData}
                        errors={{}}
                        color="var(--primary-color)"
                    />
                </div>

                <div className="form-section">
                    <DynamicFormField
                        field={{
                            name: 'expectedAttendance',
                            label: 'Expected Attendance',
                            inputType: 'number',
                            placeholder: '1',
                            validation: { min: 1 }
                        }}
                        value={formData.expectedAttendance}
                        onChange={handleFieldChange}
                        formData={formData}
                        errors={{}}
                        color="var(--primary-color)"
                    />
                </div>

                <div className="form-section">
                    <label className="section-label">Event Image</label>
                    <ImageUpload
                        uploadText="Drag your image here"
                        onFileSelect={(file) => handleFieldChange('image', file)}
                        onFileClear={() => handleFieldChange('image', null)}
                        showPrompt={false}
                        showActions={false}
                        initialImageUrl={event?.image}
                        color="var(--primary-color)"
                    />
                </div>

                <div className="form-section event-editor-tab__datetime">
                    <DateTimePicker formData={formData} setFormData={setFormData} />
                </div>

                <div className="form-section">
                    <label className="section-label">Add Event Location</label>
                    <LocationAutocomplete
                        formData={formData}
                        setFormData={setFormData}
                        preflightError={resourcePreflightError}
                    />
                </div>

                <div className="form-section">
                    <DynamicFormField
                        field={{
                            name: 'contact',
                            label: 'Contact',
                            inputType: 'text',
                            placeholder: 'Contact information',
                            validation: {}
                        }}
                        value={formData.contact || ''}
                        onChange={handleFieldChange}
                        formData={formData}
                        errors={{}}
                        color="var(--primary-color)"
                    />
                </div>

                <div className="form-section">
                    <DynamicFormField
                        field={{
                            name: 'externalLink',
                            label: 'External Link',
                            inputType: 'url',
                            placeholder: 'https://...',
                            validation: {}
                        }}
                        value={formData.externalLink || ''}
                        onChange={handleFieldChange}
                        formData={formData}
                        errors={{}}
                        color="var(--primary-color)"
                    />
                </div>

                {regularFields.length > 0 && (
                    <div className="form-section">
                        <label className="section-label">Additional Information</label>
                        {regularFields.map((field) => (
                            <div key={field.name} className="field-group">
                                <label className="section-label">
                                    {field.label}
                                    {field.isRequired && <span className="required">*</span>}
                                </label>
                                <DynamicFormField
                                    field={field}
                                    value={formData[field.name]}
                                    onChange={handleFieldChange}
                                    formData={formData}
                                    color="var(--primary-color)"
                                />
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <EventCollaborationSection event={event} orgId={orgId} onRefresh={onRefresh} />
        </div>
    );
}

export default EventEditorTab;
