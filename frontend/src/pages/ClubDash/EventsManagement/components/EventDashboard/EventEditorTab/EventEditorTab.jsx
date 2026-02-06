import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../../../hooks/useFetch';
import { useNotification } from '../../../../../../NotificationContext';
import DynamicFormField from '../../../../../../components/DynamicFormField/DynamicFormField';
import ImageUpload from '../../../../../../components/ImageUpload/ImageUpload';
import Popup from '../../../../../../components/Popup/Popup';
import RoomSelectorV2 from '../../../../../../pages/CreateEventV2/Steps/Where/RoomSelectorV2/RoomSelectorV2';
import When from '../../../../../../pages/CreateEventV2/Steps/When/When';
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

function EventEditorTab({ event, orgId, onRefresh }) {
    const { addNotification } = useNotification();
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showLocationTimePopup, setShowLocationTimePopup] = useState(false);
    const [popupStep, setPopupStep] = useState('location'); // 'location' or 'time'
    const [tempLocationData, setTempLocationData] = useState(null);
    
    // Form configuration
    const formConfigData = useFetch('/api/event-system-config/form-config');
    
    // Initialize form data from event
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        type: '',
        visibility: '',
        expectedAttendance: 0,
        contact: '',
        externalLink: '',
        rsvpEnabled: false,
        rsvpRequired: false,
        rsvpDeadline: null,
        maxAttendees: null,
        checkInEnabled: false,
        checkInMethod: 'both',
        checkInRequireRsvp: false,
        checkInAutoCheckIn: false,
        checkInAllowOnPage: true,
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

    // Initialize form data from event prop
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
                rsvpEnabled: event.rsvpEnabled || false,
                rsvpRequired: event.rsvpRequired || false,
                rsvpDeadline: event.rsvpDeadline ? new Date(event.rsvpDeadline) : null,
                maxAttendees: event.maxAttendees || null,
                checkInEnabled: event.checkInEnabled || false,
                checkInMethod: event.checkInSettings?.method || 'both',
                checkInRequireRsvp: event.checkInSettings?.requireRsvp || false,
                checkInAutoCheckIn: event.checkInSettings?.autoCheckIn || false,
                checkInAllowOnPage: event.checkInSettings?.allowOnPageCheckIn !== false,
                image: null, // Will handle image separately
                start_time: event.start_time ? new Date(event.start_time) : null,
                end_time: event.end_time ? new Date(event.end_time) : null,
                location: event.location || '',
                classroom_id: event.classroom_id || null,
                selectedRoomIds: event.classroom_id ? [event.classroom_id] : []
            };
            
            // Map custom fields if they exist
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

    const handleEdit = () => {
        setIsEditing(true);
    };

    const handleCancel = () => {
        // Reset to original data
        if (originalData) {
            setFormData(JSON.parse(JSON.stringify(originalData)));
        }
        setIsEditing(false);
    };

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
            console.log(errors);
            addNotification({
                title: 'Validation Error',
                message: 'Please fix all errors before saving',
                type: 'error'
            });
            return;
        }

        setSaving(true);
        try {
            // Prepare update data
            const updateData = {
                name: formData.name,
                description: formData.description,
                type: formData.type,
                visibility: formData.visibility,
                expectedAttendance: formData.expectedAttendance,
                contact: formData.contact || '',
                externalLink: formData.externalLink || '',
                rsvpEnabled: formData.rsvpEnabled,
                rsvpRequired: formData.rsvpRequired,
                rsvpDeadline: formData.rsvpDeadline ? formData.rsvpDeadline.toISOString() : null,
                maxAttendees: formData.maxAttendees || null,
                checkInEnabled: formData.checkInEnabled,
                checkInSettings: {
                    method: formData.checkInMethod,
                    requireRsvp: formData.checkInRequireRsvp,
                    autoCheckIn: formData.checkInAutoCheckIn,
                    allowOnPageCheckIn: formData.checkInAllowOnPage
                },
                start_time: formData.start_time.toISOString(),
                end_time: formData.end_time.toISOString(),
                classroom_id: formData.classroom_id,
                location: formData.location
            };

            // Add custom fields if any
            const customFields = {};
            if (formConfigData.data?.data?.fields) {
                formConfigData.data.data.fields.forEach(field => {
                    if (!['name', 'description', 'type', 'visibility', 'expectedAttendance', 
                          'contact', 'externalLink', 'rsvpEnabled', 'rsvpRequired', 'rsvpDeadline', 
                          'maxAttendees', 'start_time', 'end_time', 'location', 'classroom_id', 
                          'selectedRoomIds', 'image'].includes(field.name)) {
                        if (formData[field.name] !== undefined) {
                            customFields[field.name] = formData[field.name];
                        }
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
                
                // Update original data
                setOriginalData(JSON.parse(JSON.stringify(formData)));
                setIsEditing(false);
                
                if (onRefresh) {
                    onRefresh();
                }
            } else {
                throw new Error(response.message || 'Failed to update event');
            }
        } catch (error) {
            addNotification({
                title: 'Error',
                message: error.message || 'Failed to update event',
                type: 'error'
            });
        } finally {
            setSaving(false);
        }
    };

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
        
        // Fields already shown in other sections
        const excludedFields = [
            // Basic Information
            'name', 'description', 'type', 'visibility', 'expectedAttendance', 'image',
            // Date & Time
            'start_time', 'end_time',
            // Location
            'location', 'classroom_id', 'selectedRoomIds',
            // Contact & Links
            'contact', 'externalLink',
            // RSVP Settings
            'rsvpEnabled', 'rsvpRequired', 'rsvpDeadline', 'maxAttendees'
        ];
        
        // Special steps that are handled separately
        const excludedSteps = ['location', 'date-time'];
        
        return formConfig.fields.filter(field => 
            field.isActive && 
            !excludedSteps.includes(field.step) &&
            !excludedFields.includes(field.name)
        );
    }, [formConfig]);

    if (!event) {
        return <div className="event-editor-tab">Loading...</div>;
    }

    return (
        <div className={`event-editor-tab ${isEditing ? 'editing' : 'locked'}`}>
            <div className="editor-header">
                <h2>Event Details</h2>
                {!isEditing ? (
                    <button className="edit-button" onClick={handleEdit}>
                        <Icon icon="mdi:pencil" />
                        Edit
                    </button>
                ) : (
                    <div className="editor-actions">
                        <button className="cancel-button" onClick={handleCancel} disabled={saving}>
                            Cancel
                        </button>
                        <button className="save-button" onClick={handleSave} disabled={saving}>
                            {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                )}
            </div>

            <div className="editor-content">
                {/* Basic Information Section */}
                <div className="editor-section">
                    <h3>Basic Information</h3>
                    <div className="section-content">
                        <div className="field-group">
                            <label>Event Name</label>
                            {isEditing ? (
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => handleFieldChange('name', e.target.value)}
                                    placeholder="Event name"
                                />
                            ) : (
                                <div className="read-only-value">{formData.name || 'Not set'}</div>
                            )}
                        </div>

                        <div className="field-group">
                            <label>Description</label>
                            {isEditing ? (
                                <textarea
                                    value={formData.description || ''}
                                    onChange={(e) => handleFieldChange('description', e.target.value)}
                                    placeholder="Event description"
                                    rows={4}
                                />
                            ) : (
                                <div className="read-only-value">{formData.description || 'Not set'}</div>
                            )}
                        </div>

                        <div className="field-row">
                            <div className="field-group">
                                <label>Event Type</label>
                                {isEditing ? (
                                    <select
                                        value={formData.type}
                                        onChange={(e) => handleFieldChange('type', e.target.value)}
                                    >
                                        <option value="">Select type</option>
                                        <option value="study">Study Event</option>
                                        <option value="workshop">Workshop</option>
                                        <option value="campus">Campus Event</option>
                                        <option value="social">Social Event</option>
                                        <option value="club">Club Event</option>
                                        <option value="meeting">Club Meeting</option>
                                        <option value="sports">Sports Event</option>
                                    </select>
                                ) : (
                                    <div className="read-only-value">{formData.type || 'Not set'}</div>
                                )}
                            </div>

                            <div className="field-group">
                                <label>Visibility</label>
                                {isEditing ? (
                                    <select
                                        value={formData.visibility}
                                        onChange={(e) => handleFieldChange('visibility', e.target.value)}
                                    >
                                        <option value="">Select visibility</option>
                                        <option value="public">Public</option>
                                        <option value="internal">Internal</option>
                                        <option value="inviteOnly">Invite Only</option>
                                    </select>
                                ) : (
                                    <div className="read-only-value">{formData.visibility || 'Not set'}</div>
                                )}
                            </div>
                        </div>

                        <div className="field-group">
                            <label>Expected Attendance</label>
                            {isEditing ? (
                                <input
                                    type="number"
                                    value={formData.expectedAttendance}
                                    onChange={(e) => handleFieldChange('expectedAttendance', parseInt(e.target.value) || 0)}
                                    min="1"
                                />
                            ) : (
                                <div className="read-only-value">{formData.expectedAttendance || 0}</div>
                            )}
                        </div>

                        <div className="field-group">
                            <label>Event Image</label>
                            {isEditing ? (
                                <ImageUpload
                                    uploadText="Drag your image here"
                                    onFileSelect={(file) => handleFieldChange('image', file)}
                                    onFileClear={() => handleFieldChange('image', null)}
                                    showPrompt={false}
                                />
                            ) : (
                                <div className="read-only-value">
                                    {event.image ? (
                                        <img src={event.image} alt="Event" style={{ maxWidth: '200px', maxHeight: '200px' }} />
                                    ) : (
                                        'No image'
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Date, Time & Location Section */}
                <div className="editor-section">
                    <h3>Date, Time & Location</h3>
                    <div className="section-content">
                        <div className="field-row">
                            <div className="field-group">
                                <label>Event Time</label>
                                <div className="read-only-value">
                                    {formatDateTime(formData.start_time)} - {formatTime(formData.end_time)}
                                </div>
                            </div>
                            <div className="field-group">
                                <label>Location</label>
                                {isEditing ? (
                                    <input
                                        type="text"
                                        value={formData.location || ''}
                                        onChange={(e) => handleFieldChange('location', e.target.value)}
                                        placeholder="e.g. Room 101, Off-campus, or address"
                                    />
                                ) : (
                                    <div className="read-only-value">{formData.location || 'Not set'}</div>
                                )}
                            </div>
                        </div>
                        {isEditing && (
                            <div className="field-group">
                                <button 
                                    type="button" 
                                    className="change-location-time-button"
                                    onClick={handleLocationTimePopupOpen}
                                >
                                    <Icon icon="mdi:calendar-clock" />
                                    Change Location & Time
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Contact & Links Section */}
                <div className="editor-section">
                    <h3>Contact & Links</h3>
                    <div className="section-content">
                        <div className="field-group">
                            <label>Contact</label>
                            {isEditing ? (
                                <input
                                    type="text"
                                    value={formData.contact || ''}
                                    onChange={(e) => handleFieldChange('contact', e.target.value)}
                                    placeholder="Contact information"
                                />
                            ) : (
                                <div className="read-only-value">{formData.contact || 'Not set'}</div>
                            )}
                        </div>

                        <div className="field-group">
                            <label>External Link</label>
                            {isEditing ? (
                                <input
                                    type="url"
                                    value={formData.externalLink || ''}
                                    onChange={(e) => handleFieldChange('externalLink', e.target.value)}
                                    placeholder="https://..."
                                />
                            ) : (
                                <div className="read-only-value">
                                    {formData.externalLink ? (
                                        <a href={formData.externalLink} target="_blank" rel="noopener noreferrer">
                                            {formData.externalLink}
                                        </a>
                                    ) : (
                                        'Not set'
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* RSVP Settings Section */}
                <div className="editor-section">
                    <h3>RSVP Settings</h3>
                    <div className="section-content">
                        <div className="field-group">
                            <label className="checkbox-label">
                                {isEditing ? (
                                    <>
                                        <input
                                            type="checkbox"
                                            checked={formData.rsvpEnabled}
                                            onChange={(e) => handleFieldChange('rsvpEnabled', e.target.checked)}
                                        />
                                        <span>Enable RSVP</span>
                                    </>
                                ) : (
                                    <div className="read-only-value">
                                        RSVP {formData.rsvpEnabled ? 'Enabled' : 'Disabled'}
                                    </div>
                                )}
                            </label>
                        </div>

                        {formData.rsvpEnabled && (
                            <>
                                <div className="field-group">
                                    <label className="checkbox-label">
                                        {isEditing ? (
                                            <>
                                                <input
                                                    type="checkbox"
                                                    checked={formData.rsvpRequired}
                                                    onChange={(e) => handleFieldChange('rsvpRequired', e.target.checked)}
                                                />
                                                <span>Require RSVP</span>
                                            </>
                                        ) : (
                                            <div className="read-only-value">
                                                RSVP {formData.rsvpRequired ? 'Required' : 'Optional'}
                                            </div>
                                        )}
                                    </label>
                                </div>

                                <div className="field-row">
                                    <div className="field-group">
                                        <label>RSVP Deadline</label>
                                        {isEditing ? (
                                            <input
                                                type="datetime-local"
                                                value={formData.rsvpDeadline ? new Date(formData.rsvpDeadline).toISOString().slice(0, 16) : ''}
                                                onChange={(e) => handleFieldChange('rsvpDeadline', e.target.value ? new Date(e.target.value) : null)}
                                            />
                                        ) : (
                                            <div className="read-only-value">
                                                {formData.rsvpDeadline ? formatDateTime(formData.rsvpDeadline) : 'Not set'}
                                            </div>
                                        )}
                                    </div>

                                    <div className="field-group">
                                        <label>Max Attendees</label>
                                        {isEditing ? (
                                            <input
                                                type="number"
                                                value={formData.maxAttendees || ''}
                                                onChange={(e) => handleFieldChange('maxAttendees', e.target.value ? parseInt(e.target.value) : null)}
                                                placeholder="No limit"
                                                min="1"
                                            />
                                        ) : (
                                            <div className="read-only-value">
                                                {formData.maxAttendees || 'No limit'}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Check-In Settings Section */}
                <div className="editor-section checkin-settings-section">
                    <h3>Check-In</h3>
                    <p className="section-description">
                        Let attendees mark that they&apos;re here using a QR code, link, or a button on the event page.
                    </p>
                    <div className="section-content">
                        <div className="field-group checkin-master-toggle">
                            <label className="checkbox-label">
                                {isEditing ? (
                                    <>
                                        <input
                                            type="checkbox"
                                            checked={formData.checkInEnabled}
                                            onChange={(e) => handleFieldChange('checkInEnabled', e.target.checked)}
                                        />
                                        <span>Enable check-in for this event</span>
                                    </>
                                ) : (
                                    <div className="read-only-value">
                                        Check-in {formData.checkInEnabled ? 'enabled' : 'disabled'}
                                    </div>
                                )}
                            </label>
                        </div>

                        {formData.checkInEnabled && (
                            <>
                                <div className="checkin-subsection">
                                    <h4 className="subsection-title">Ways to check in</h4>
                                    <div className="field-group">
                                        <label className="field-label">QR code & link</label>
                                        {isEditing ? (
                                            <div className="radio-group">
                                                <label className="radio-label">
                                                    <input
                                                        type="radio"
                                                        name="checkInMethod"
                                                        value="qr"
                                                        checked={formData.checkInMethod === 'qr'}
                                                        onChange={(e) => handleFieldChange('checkInMethod', e.target.value)}
                                                    />
                                                    <span>QR code only</span>
                                                </label>
                                                <label className="radio-label">
                                                    <input
                                                        type="radio"
                                                        name="checkInMethod"
                                                        value="link"
                                                        checked={formData.checkInMethod === 'link'}
                                                        onChange={(e) => handleFieldChange('checkInMethod', e.target.value)}
                                                    />
                                                    <span>Link only</span>
                                                </label>
                                                <label className="radio-label">
                                                    <input
                                                        type="radio"
                                                        name="checkInMethod"
                                                        value="both"
                                                        checked={formData.checkInMethod === 'both'}
                                                        onChange={(e) => handleFieldChange('checkInMethod', e.target.value)}
                                                    />
                                                    <span>Both</span>
                                                </label>
                                            </div>
                                        ) : (
                                            <div className="read-only-value">
                                                {formData.checkInMethod === 'qr' ? 'QR code only' :
                                                 formData.checkInMethod === 'link' ? 'Link only' : 'Both'}
                                            </div>
                                        )}
                                    </div>
                                    <div className="field-group">
                                        <label className="checkbox-label">
                                            {isEditing ? (
                                                <>
                                                    <input
                                                        type="checkbox"
                                                        checked={formData.checkInAllowOnPage}
                                                        onChange={(e) => handleFieldChange('checkInAllowOnPage', e.target.checked)}
                                                    />
                                                    <span>Allow check-in from event page</span>
                                                </>
                                            ) : (
                                                <div className="read-only-value">
                                                    Event page check-in: {formData.checkInAllowOnPage ? 'Yes' : 'No'}
                                                </div>
                                            )}
                                        </label>
                                        <p className="field-hint">Show a &quot;Check in&quot; button on the event page (web &amp; app) during the event.</p>
                                    </div>
                                </div>

                                <div className="checkin-subsection">
                                    <h4 className="subsection-title">Options</h4>
                                    <div className="field-group">
                                        <label className="checkbox-label">
                                            {isEditing ? (
                                                <>
                                                    <input
                                                        type="checkbox"
                                                        checked={formData.checkInRequireRsvp}
                                                        onChange={(e) => handleFieldChange('checkInRequireRsvp', e.target.checked)}
                                                    />
                                                    <span>Require RSVP to check in</span>
                                                </>
                                            ) : (
                                                <div className="read-only-value">
                                                    Require RSVP: {formData.checkInRequireRsvp ? 'Yes' : 'No'}
                                                </div>
                                            )}
                                        </label>
                                        <p className="field-hint">Attendees must RSVP (Going or Maybe) before they can check in.</p>
                                    </div>
                                    <div className="field-group">
                                        <label className="checkbox-label">
                                            {isEditing ? (
                                                <>
                                                    <input
                                                        type="checkbox"
                                                        checked={formData.checkInAutoCheckIn}
                                                        onChange={(e) => handleFieldChange('checkInAutoCheckIn', e.target.checked)}
                                                    />
                                                    <span>Auto check-in when using link or QR</span>
                                                </>
                                            ) : (
                                                <div className="read-only-value">
                                                    Auto check-in: {formData.checkInAutoCheckIn ? 'On' : 'Off'}
                                                </div>
                                            )}
                                        </label>
                                        <p className="field-hint">Skip the confirmation page and check in immediately when they open the link or scan the QR.</p>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Custom Fields Section */}
                {regularFields.length > 0 && (
                    <div className="editor-section">
                        <h3>Additional Information</h3>
                        <div className="section-content">
                            {regularFields.map(field => (
                                <div key={field.name} className="field-group">
                                    <label>
                                        {field.label}
                                        {field.isRequired && <span className="required">*</span>}
                                    </label>
                                    {isEditing ? (
                                        <DynamicFormField
                                            field={field}
                                            value={formData[field.name]}
                                            onChange={handleFieldChange}
                                            formData={formData}
                                        />
                                    ) : (
                                        <div className="read-only-value">
                                            {formData[field.name] !== null && formData[field.name] !== undefined
                                                ? String(formData[field.name])
                                                : 'Not set'}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
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
