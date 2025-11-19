import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import { useNotification } from '../../NotificationContext';
import apiRequest from '../../utils/postRequest';
import './EventEditor.scss';

function EventEditor({ event, onUpdate }) {
    const { addNotification } = useNotification();
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        contact: '',
        externalLink: '',
        type: '',
        visibility: '',
        expectedAttendance: 0,
        rsvpEnabled: false,
        rsvpRequired: false,
        rsvpDeadline: null,
        maxAttendees: null
    });

    useEffect(() => {
        if (event) {
            setFormData({
                name: event.name || '',
                description: event.description || '',
                contact: event.contact || '',
                externalLink: event.externalLink || '',
                type: event.type || '',
                visibility: event.visibility || 'public',
                expectedAttendance: event.expectedAttendance || 0,
                rsvpEnabled: event.rsvpEnabled || false,
                rsvpRequired: event.rsvpRequired || false,
                rsvpDeadline: event.rsvpDeadline ? new Date(event.rsvpDeadline).toISOString().slice(0, 16) : null,
                maxAttendees: event.maxAttendees || null
            });
        }
    }, [event]);

    const handleInputChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleSave = async () => {
        // Validate required fields
        if (!formData.name || formData.name.trim() === '') {
            addNotification({
                title: 'Validation Error',
                message: 'Event name is required.',
                type: 'error'
            });
            return;
        }

        setIsSaving(true);
        try {
            const updateData = {
                ...formData,
                rsvpDeadline: formData.rsvpDeadline ? new Date(formData.rsvpDeadline).toISOString() : null,
                expectedAttendance: parseInt(formData.expectedAttendance) || 0,
                maxAttendees: formData.maxAttendees ? parseInt(formData.maxAttendees) : null
            };

            const response = await apiRequest(
                `/update-event/${event._id}`,
                updateData,
                { method: 'PUT' }
            );

            if (response.success) {
                addNotification({
                    title: 'Success',
                    message: 'Event updated successfully.',
                    type: 'success'
                });
                setIsEditing(false);
                if (onUpdate) {
                    onUpdate(response.event);
                }
            } else {
                addNotification({
                    title: 'Error',
                    message: response.message || 'Failed to update event.',
                    type: 'error'
                });
            }
        } catch (error) {
            addNotification({
                title: 'Error',
                message: error.error || 'Failed to update event.',
                type: 'error'
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        // Reset to original event data
        if (event) {
            setFormData({
                name: event.name || '',
                description: event.description || '',
                contact: event.contact || '',
                externalLink: event.externalLink || '',
                type: event.type || '',
                visibility: event.visibility || 'public',
                expectedAttendance: event.expectedAttendance || 0,
                rsvpEnabled: event.rsvpEnabled || false,
                rsvpRequired: event.rsvpRequired || false,
                rsvpDeadline: event.rsvpDeadline ? new Date(event.rsvpDeadline).toISOString().slice(0, 16) : null,
                maxAttendees: event.maxAttendees || null
            });
        }
        setIsEditing(false);
    };

    if (!event) return null;

    return (
        <div className="event-editor">
            <div className="event-editor__header">
                <div className="event-editor__title">
                    <Icon icon="mdi:pencil" />
                    <h3>Event Details</h3>
                </div>
                {!isEditing && (
                    <button 
                        className="event-editor__edit-btn"
                        onClick={() => setIsEditing(true)}
                    >
                        <Icon icon="mdi:pencil" />
                        Edit
                    </button>
                )}
            </div>

            {isEditing ? (
                <div className="event-editor__form">
                    <div className="event-editor__form-group">
                        <label>Event Name *</label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => handleInputChange('name', e.target.value)}
                            placeholder="Event name"
                        />
                    </div>

                    <div className="event-editor__form-group">
                        <label>Description</label>
                        <textarea
                            value={formData.description || ''}
                            onChange={(e) => handleInputChange('description', e.target.value)}
                            placeholder="Event description"
                            rows={4}
                        />
                    </div>

                    <div className="event-editor__form-row">
                        <div className="event-editor__form-group">
                            <label>Type</label>
                            <select
                                value={formData.type}
                                onChange={(e) => handleInputChange('type', e.target.value)}
                            >
                                <option value="campus">Campus</option>
                                <option value="study">Study</option>
                                <option value="meeting">Meeting</option>
                                <option value="workshop">Workshop</option>
                                <option value="social">Social</option>
                                <option value="sports">Sports</option>
                                <option value="arts">Arts</option>
                                <option value="alumni">Alumni</option>
                            </select>
                        </div>

                        <div className="event-editor__form-group">
                            <label>Visibility</label>
                            <select
                                value={formData.visibility}
                                onChange={(e) => handleInputChange('visibility', e.target.value)}
                            >
                                <option value="public">Public</option>
                                <option value="private">Private</option>
                            </select>
                        </div>
                    </div>

                    <div className="event-editor__form-row">
                        <div className="event-editor__form-group">
                            <label>Contact</label>
                            <input
                                type="text"
                                value={formData.contact || ''}
                                onChange={(e) => handleInputChange('contact', e.target.value)}
                                placeholder="Contact information"
                            />
                        </div>

                        <div className="event-editor__form-group">
                            <label>Expected Attendance</label>
                            <input
                                type="number"
                                value={formData.expectedAttendance}
                                onChange={(e) => handleInputChange('expectedAttendance', e.target.value)}
                                placeholder="0"
                                min="0"
                            />
                        </div>
                    </div>

                    <div className="event-editor__form-group">
                        <label>External Link</label>
                        <input
                            type="url"
                            value={formData.externalLink || ''}
                            onChange={(e) => handleInputChange('externalLink', e.target.value)}
                            placeholder="https://..."
                        />
                    </div>

                    <div className="event-editor__section">
                        <h4>RSVP Settings</h4>
                        <div className="event-editor__form-group">
                            <label className="event-editor__checkbox-label">
                                <input
                                    type="checkbox"
                                    checked={formData.rsvpEnabled}
                                    onChange={(e) => handleInputChange('rsvpEnabled', e.target.checked)}
                                />
                                <span>Enable RSVP</span>
                            </label>
                        </div>

                        {formData.rsvpEnabled && (
                            <>
                                <div className="event-editor__form-group">
                                    <label className="event-editor__checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={formData.rsvpRequired}
                                            onChange={(e) => handleInputChange('rsvpRequired', e.target.checked)}
                                        />
                                        <span>Require RSVP</span>
                                    </label>
                                </div>

                                <div className="event-editor__form-row">
                                    <div className="event-editor__form-group">
                                        <label>RSVP Deadline</label>
                                        <input
                                            type="datetime-local"
                                            value={formData.rsvpDeadline || ''}
                                            onChange={(e) => handleInputChange('rsvpDeadline', e.target.value)}
                                        />
                                    </div>

                                    <div className="event-editor__form-group">
                                        <label>Max Attendees</label>
                                        <input
                                            type="number"
                                            value={formData.maxAttendees || ''}
                                            onChange={(e) => handleInputChange('maxAttendees', e.target.value || null)}
                                            placeholder="No limit"
                                            min="1"
                                        />
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    <div className="event-editor__read-only">
                        <h4>Locked Fields</h4>
                        <div className="event-editor__read-only-fields">
                            <div className="event-editor__read-only-field">
                                <label>Date & Time</label>
                                <div className="event-editor__read-only-value">
                                    {new Date(event.start_time).toLocaleString()} - {new Date(event.end_time).toLocaleString()}
                                </div>
                            </div>
                            <div className="event-editor__read-only-field">
                                <label>Location</label>
                                <div className="event-editor__read-only-value">
                                    {event.location || 'Location TBD'}
                                    {event.classroom_id && (
                                        <span className="event-editor__room-badge">
                                            <Icon icon="mdi:lock" />
                                            Room locked
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="event-editor__actions">
                        <button
                            className="event-editor__btn event-editor__btn--primary"
                            onClick={handleSave}
                            disabled={isSaving}
                        >
                            {isSaving ? (
                                <>
                                    <Icon icon="mdi:loading" className="spinner" />
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <Icon icon="mdi:content-save" />
                                    Save Changes
                                </>
                            )}
                        </button>
                        <button
                            className="event-editor__btn event-editor__btn--secondary"
                            onClick={handleCancel}
                            disabled={isSaving}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            ) : (
                <div className="event-editor__view">
                    <div className="event-editor__view-section">
                        <div className="event-editor__view-item">
                            <label>Name</label>
                            <p>{event.name}</p>
                        </div>
                        {event.description && (
                            <div className="event-editor__view-item">
                                <label>Description</label>
                                <p>{event.description}</p>
                            </div>
                        )}
                        <div className="event-editor__view-row">
                            <div className="event-editor__view-item">
                                <label>Type</label>
                                <p>{event.type || 'N/A'}</p>
                            </div>
                            <div className="event-editor__view-item">
                                <label>Visibility</label>
                                <p>{event.visibility || 'N/A'}</p>
                            </div>
                        </div>
                        {event.contact && (
                            <div className="event-editor__view-item">
                                <label>Contact</label>
                                <p>{event.contact}</p>
                            </div>
                        )}
                        {event.externalLink && (
                            <div className="event-editor__view-item">
                                <label>External Link</label>
                                <a href={event.externalLink} target="_blank" rel="noopener noreferrer">
                                    {event.externalLink}
                                    <Icon icon="mdi:open-in-new" />
                                </a>
                            </div>
                        )}
                        <div className="event-editor__view-item">
                            <label>Expected Attendance</label>
                            <p>{event.expectedAttendance || 0}</p>
                        </div>
                    </div>

                    {event.rsvpEnabled && (
                        <div className="event-editor__view-section">
                            <h4>RSVP Settings</h4>
                            <div className="event-editor__view-item">
                                <label>RSVP Required</label>
                                <p>{event.rsvpRequired ? 'Yes' : 'No'}</p>
                            </div>
                            {event.rsvpDeadline && (
                                <div className="event-editor__view-item">
                                    <label>RSVP Deadline</label>
                                    <p>{new Date(event.rsvpDeadline).toLocaleString()}</p>
                                </div>
                            )}
                            {event.maxAttendees && (
                                <div className="event-editor__view-item">
                                    <label>Max Attendees</label>
                                    <p>{event.maxAttendees}</p>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="event-editor__view-section event-editor__view-section--locked">
                        <h4>Locked Fields</h4>
                        <div className="event-editor__view-item">
                            <label>Date & Time</label>
                            <p>
                                {new Date(event.start_time).toLocaleString()} - {new Date(event.end_time).toLocaleString()}
                            </p>
                        </div>
                        <div className="event-editor__view-item">
                            <label>Location</label>
                            <p>
                                {event.location || 'Location TBD'}
                                {event.classroom_id && (
                                    <span className="event-editor__room-badge">
                                        <Icon icon="mdi:lock" />
                                        Room locked
                                    </span>
                                )}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default EventEditor;

