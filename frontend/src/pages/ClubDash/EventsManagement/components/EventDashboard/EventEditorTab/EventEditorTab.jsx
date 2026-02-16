import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../../../hooks/useFetch';
import { useNotification } from '../../../../../../NotificationContext';
import useUnsavedChanges from '../../../../../../hooks/useUnsavedChanges';
import DynamicFormField from '../../../../../../components/DynamicFormField/DynamicFormField';
import ImageUpload from '../../../../../../components/ImageUpload/ImageUpload';
import Popup from '../../../../../../components/Popup/Popup';
import RoomSelectorV2 from '../../../../../../pages/CreateEventV2/Steps/Where/RoomSelectorV2/RoomSelectorV2';
import When from '../../../../../../pages/CreateEventV2/Steps/When/When';
import EventPreview from '../EventPreview';
import apiRequest from '../../../../../../utils/postRequest';
import './EventEditorTab.scss';

// Separate component for popup content to receive handleClose prop from Popup
function LocationTimePopupContent({ 
    popupStep, 
    popupFormData, 
    setPopupFormData, 
    onLocationSelected, 
    onTimeSelected, 
    onClose,
    onBack,
    handleClose 
}) {
    // Use handleClose from Popup if available, otherwise use onClose
    const closePopup = handleClose || onClose;

    return (
        <div className="location-time-popup-content">
            <div className="popup-header">
                <h3>
                    {popupStep === 'location' ? 'Select Location' : 'Select Time'}
                </h3>
                <button className="popup-close" onClick={closePopup}>
                    <Icon icon="mdi:close" />
                </button>
            </div>
            
            <div className="popup-body">
                {popupStep === 'location' ? (
                    <div>
                        <RoomSelectorV2
                            formData={popupFormData}
                            setFormData={setPopupFormData}
                            onComplete={(isValid) => {
                                // RoomSelectorV2 automatically updates location and classroom_id in popupFormData
                            }}
                        />
                        <div className="popup-actions">
                            <button 
                                className="popup-button secondary" 
                                onClick={closePopup}
                            >
                                Cancel
                            </button>
                            <button 
                                className="popup-button primary" 
                                onClick={onLocationSelected}
                                disabled={(!popupFormData.selectedRoomIds || popupFormData.selectedRoomIds.length === 0) && (!popupFormData.location || !popupFormData.location.trim())}
                            >
                                Next: Select Time
                            </button>
                        </div>
                    </div>
                ) : (
                    <div>
                        <When
                            formData={popupFormData}
                            setFormData={setPopupFormData}
                            onComplete={(isValid) => {
                                // Validation handled by When component
                            }}
                        />
                        <div className="popup-actions">
                            <button 
                                className="popup-button secondary" 
                                onClick={onBack}
                            >
                                Back
                            </button>
                            <button 
                                className="popup-button primary" 
                                onClick={onTimeSelected}
                                disabled={!popupFormData.start_time || !popupFormData.end_time}
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function EventEditorTab({ event, agenda, orgId, onRefresh }) {
    const { addNotification } = useNotification();
    const [showLocationTimePopup, setShowLocationTimePopup] = useState(false);
    const [popupStep, setPopupStep] = useState('location'); // 'location' or 'time'
    const [tempLocationData, setTempLocationData] = useState(null);
    
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
    const [popupFormData, setPopupFormData] = useState({
        selectedRoomIds: [],
        start_time: null,
        end_time: null
    });

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
                Object.keys(event.customFields).forEach(key => {
                    initialData[key] = event.customFields[key];
                });
            }
            setFormData(initialData);
            setOriginalData(JSON.parse(JSON.stringify(initialData)));
        }
    }, [event]);

    // Initialize popup form data when opening popup
    useEffect(() => {
        if (showLocationTimePopup && popupStep === 'location') {
            setPopupFormData({
                selectedRoomIds: formData.selectedRoomIds || [],
                location: formData.location,
                classroom_id: formData.classroom_id,
                start_time: formData.start_time,
                end_time: formData.end_time
            });
        }
    }, [showLocationTimePopup, popupStep]);

    const handleFieldChange = (fieldName, value) => {
        setFormData(prev => ({
            ...prev,
            [fieldName]: value
        }));
    };

    const handleLocationTimePopupOpen = () => {
        setPopupStep('location');
        setShowLocationTimePopup(true);
    };

    const handleLocationTimePopupClose = () => {
        setShowLocationTimePopup(false);
        setPopupStep('location');
        setTempLocationData(null);
    };

    const handleLocationSelected = () => {
        // Move to time selection step
        // RoomSelectorV2 has already updated popupFormData with location and classroom_id
        setPopupStep('time');
        setTempLocationData({
            selectedRoomIds: popupFormData.selectedRoomIds,
            location: popupFormData.location,
            classroom_id: popupFormData.classroom_id
        });
    };

    const handleTimeSelected = () => {
        // Update time always when set; update location/room only if user selected a room
        if (popupFormData.start_time && popupFormData.end_time) {
            setFormData(prev => {
                const hasRoom = popupFormData.selectedRoomIds && popupFormData.selectedRoomIds.length > 0;
                return {
                    ...prev,
                    start_time: popupFormData.start_time,
                    end_time: popupFormData.end_time,
                    ...(hasRoom ? {
                        selectedRoomIds: popupFormData.selectedRoomIds,
                        classroom_id: popupFormData.classroom_id || popupFormData.selectedRoomIds[0],
                        location: popupFormData.location || prev.location
                    } : {})
                };
            });
        }
        handleLocationTimePopupClose();
    };

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
        
        // Location can be a selected room OR free text (e.g. external events)
        const hasRoom = formData.selectedRoomIds && formData.selectedRoomIds.length > 0;
        const hasLocationText = formData.location && formData.location.trim() !== '';
        if (!hasRoom && !hasLocationText) {
            errors.location = 'Location is required (select a room or enter an address/place)';
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
                classroom_id: formData.classroom_id,
                location: formData.location
            };

            // Add custom fields if any
            const customFields = {};
            if (formConfigData.data?.data?.fields) {
                const reserved = ['name', 'description', 'type', 'visibility', 'expectedAttendance',
                    'contact', 'externalLink', 'start_time', 'end_time', 'location', 'classroom_id',
                    'selectedRoomIds', 'image', 'hostingId', 'hostingType', 'rsvpEnabled', 'rsvpRequired', 'rsvpDeadline'];
                formConfigData.data.data.fields.forEach(field => {
                    if (!reserved.includes(field.name) && formData[field.name] !== undefined) {
                        customFields[field.name] = formData[field.name];
                    }
                });
            }
            if (Object.keys(customFields).length > 0) {
                updateData.customFields = customFields;
            }

            // Use org-event-management endpoint for org events
            const endpoint = orgId 
                ? `/org-event-management/${orgId}/events/${event._id}`
                : `/update-event/${event._id}`;
            
            const response = await apiRequest(endpoint, updateData, { method: 'PUT' });

            if (response.success) {
                // Handle image upload separately if image was changed
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
            } else {
                throw new Error(response.message || 'Failed to update event');
            }
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

    const formatDate = (date) => {
        if (!date) return 'Not set';
        return new Date(date).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const formatTime = (date) => {
        if (!date) return '';
        return new Date(date).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatDateTime = (date) => {
        if (!date) return 'Not set';
        return `${formatDate(date)} at ${formatTime(date)}`;
    };

    // Get form config fields (excluding fields already shown in other sections)
    const formConfig = formConfigData.data?.data;
    const regularFields = useMemo(() => {
        if (!formConfig?.fields) return [];
        
        const excludedFields = [
            'name', 'description', 'type', 'visibility', 'expectedAttendance', 'image',
            'start_time', 'end_time', 'location', 'classroom_id', 'selectedRoomIds',
            'contact', 'externalLink',
            'hostingId', 'hostingType', 'rsvpEnabled', 'rsvpRequired', 'rsvpDeadline',
            'registrationEnabled', 'registrationRequired', 'registrationDeadline', 'registrationFormId', 'maxAttendees'
        ];
        
        // Special steps that are handled separately
        const excludedSteps = ['location', 'date-time'];
        
        return formConfig.fields.filter(field => 
            field.isActive && 
            !excludedSteps.includes(field.step) &&
            !excludedFields.includes(field.name)
        );
    }, [formConfig]);

    const eventWithAgenda = event ? {
        ...event,
        eventAgenda: {
            items: agenda?.items || [],
            isPublished: agenda?.isPublished
        }
    } : null;

    if (!event) {
        return <div className="event-editor-tab">Loading...</div>;
    }

    return (
        <div className="event-editor-tab">
            {eventWithAgenda && (
                <EventPreview event={eventWithAgenda} onRefetch={onRefresh} />
            )}
            <div className="editor-header">
                <h2>Details</h2>
                {hasChanges && (
                    <div className="editor-actions">
                        <button type="button" className="cancel-button" onClick={discardChanges} disabled={saving}>
                            Discard
                        </button>
                        <button type="button" className="save-button" onClick={performSave} disabled={saving}>
                            {saving ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                )}
            </div>

            <div className="editor-content create-event-v3-form">
                <div className="form-section">
                    <DynamicFormField
                        field={{ name: 'name', label: 'Event Name', inputType: 'text', placeholder: 'Event name', validation: {} }}
                        value={formData.name}
                        onChange={handleFieldChange}
                        formData={formData}
                        errors={{}}
                        color="var(--primary-color)"
                    />
                </div>

                <div className="form-section">
                    <DynamicFormField
                        field={{ name: 'description', label: 'Description', inputType: 'markdown-textarea', placeholder: 'Event description', validation: {}, allowExpand: true }}
                        value={formData.description || ''}
                        onChange={handleFieldChange}
                        formData={formData}
                        errors={{}}
                        color="var(--primary-color)"
                    />
                </div>

                <div className="form-section">
                    <DynamicFormField
                        field={{ name: 'type', label: 'Event Type', inputType: 'select', validation: { options: ['study', 'workshop', 'campus', 'social', 'club', 'meeting', 'sports'] }}}
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
                        field={{ name: 'expectedAttendance', label: 'Expected Attendance', inputType: 'number', placeholder: '1', validation: { min: 1 } }}
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

                <div className="form-section">
                    <label className="section-label">Date & Time</label>
                    <div className="read-only-value">
                        {formatDateTime(formData.start_time)} – {formatTime(formData.end_time)}
                    </div>
                    <button
                        type="button"
                        className="change-location-time-button"
                        onClick={handleLocationTimePopupOpen}
                    >
                        <Icon icon="mdi:calendar-clock" />
                        Change Location & Time
                    </button>
                </div>

                <div className="form-section">
                    <DynamicFormField
                        field={{ name: 'location', label: 'Location', inputType: 'text', placeholder: 'e.g. Room 101, Off-campus, or address', validation: {} }}
                        value={formData.location || ''}
                        onChange={handleFieldChange}
                        formData={formData}
                        errors={{}}
                        color="var(--primary-color)"
                    />
                </div>

                <div className="form-section">
                    <DynamicFormField
                        field={{ name: 'contact', label: 'Contact', inputType: 'text', placeholder: 'Contact information', validation: {} }}
                        value={formData.contact || ''}
                        onChange={handleFieldChange}
                        formData={formData}
                        errors={{}}
                        color="var(--primary-color)"
                    />
                </div>

                <div className="form-section">
                    <DynamicFormField
                        field={{ name: 'externalLink', label: 'External Link', inputType: 'url', placeholder: 'https://...', validation: {} }}
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
                        {regularFields.map(field => (
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

            {/* Location & Time Popup */}
            {showLocationTimePopup && (
                <Popup isOpen={showLocationTimePopup} onClose={handleLocationTimePopupClose} customClassName="location-time-popup">
                    <LocationTimePopupContent
                        popupStep={popupStep}
                        popupFormData={popupFormData}
                        setPopupFormData={setPopupFormData}
                        onLocationSelected={handleLocationSelected}
                        onTimeSelected={handleTimeSelected}
                        onClose={handleLocationTimePopupClose}
                        onBack={() => setPopupStep('location')}
                    />
                </Popup>
            )}
        </div>
    );
}

export default EventEditorTab;
