import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import Popup from '../../../../../../components/Popup/Popup';
import './AgendaBuilder.scss';

function AgendaItemEditor({ item, event, onSave, onCancel }) {
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        startTime: null,
        endTime: null,
        durationMinutes: '',
        type: 'Activity',
        location: '',
        isPublic: true
    });

    useEffect(() => {
        if (item) {
            // Normalize dates to Date objects if they're strings
            let startTime = null;
            let endTime = null;
            
            if (item.startTime) {
                startTime = typeof item.startTime === 'string' ? new Date(item.startTime) : item.startTime;
            }
            if (item.endTime) {
                endTime = typeof item.endTime === 'string' ? new Date(item.endTime) : item.endTime;
            }
            
            // Calculate durationMinutes if not present but startTime/endTime are
            let durationMinutes = item.durationMinutes || '';
            if (!durationMinutes && startTime && endTime) {
                const start = new Date(startTime);
                const end = new Date(endTime);
                const diffMinutes = Math.max(1, Math.round((end - start) / 60000));
                durationMinutes = diffMinutes;
            }
            
            setFormData({
                title: item.title || '',
                description: item.description || '',
                startTime: startTime,
                endTime: endTime,
                durationMinutes: durationMinutes,
                type: item.type || 'Activity',
                location: item.location || '',
                isPublic: item.isPublic !== undefined ? item.isPublic : true
            });
        } else if (event?.start_time) {
            // Set default times based on event start time for new items
            const eventStart = new Date(event.start_time);
            const defaultStart = new Date(eventStart);
            const defaultEnd = new Date(eventStart);
            defaultEnd.setMinutes(defaultEnd.getMinutes() + 30);
            
            setFormData(prev => ({
                ...prev,
                startTime: defaultStart,
                endTime: defaultEnd,
                durationMinutes: 30
            }));
        }
    }, [item, event]);

    const formatDateTimeLocal = (dateValue) => {
        if (!dateValue) return '';
        const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
        if (isNaN(date.getTime())) return '';
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    };

    const handleChange = (field, value) => {
        setFormData(prev => {
            const updated = { ...prev };
            
            if (field === 'startTime' || field === 'endTime') {
                // Handle datetime-local input format (YYYY-MM-DDTHH:mm)
                const dateValue = value ? new Date(value) : null;
                updated[field] = dateValue;
                
                // Auto-update durationMinutes if both times are set
                if (field === 'startTime' && updated.endTime) {
                    const start = new Date(dateValue);
                    const end = new Date(updated.endTime);
                    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start) {
                        const diffMinutes = Math.max(1, Math.round((end - start) / 60000));
                        updated.durationMinutes = diffMinutes;
                    }
                } else if (field === 'endTime' && updated.startTime) {
                    const start = new Date(updated.startTime);
                    const end = new Date(dateValue);
                    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start) {
                        const diffMinutes = Math.max(1, Math.round((end - start) / 60000));
                        updated.durationMinutes = diffMinutes;
                    }
                }
            } else if (field === 'durationMinutes' && value) {
                // If duration changes and startTime exists, update endTime
                updated[field] = value;
                const duration = parseInt(value, 10);
                if (duration > 0 && updated.startTime) {
                    const start = new Date(updated.startTime);
                    const end = new Date(start);
                    end.setMinutes(end.getMinutes() + duration);
                    updated.endTime = end;
                }
            } else {
                updated[field] = value;
            }
            
            return updated;
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        
        // Validate that either durationMinutes or startTime/endTime are provided
        const hasDuration = formData.durationMinutes && parseInt(formData.durationMinutes, 10) > 0;
        const hasTimes = formData.startTime && formData.endTime;
        
        if (!hasDuration && !hasTimes) {
            alert('Please provide either a duration or start/end times.');
            return;
        }

        // Validate that endTime is after startTime if both are provided
        if (hasTimes) {
            const start = new Date(formData.startTime);
            const end = new Date(formData.endTime);
            if (end <= start) {
                alert('End time must be after start time.');
                return;
            }
        }
        
        const itemData = {
            ...item,
            ...formData,
            durationMinutes: formData.durationMinutes ? parseInt(formData.durationMinutes, 10) : null,
            startTime: formData.startTime ? new Date(formData.startTime).toISOString() : null,
            endTime: formData.endTime ? new Date(formData.endTime).toISOString() : null
        };

        onSave(itemData);
    };

    const itemTypes = ['Activity', 'Break', 'Setup', 'Breakdown', 'Transition', 'Speaker', 'Custom'];

    return (
        <Popup
            isOpen={true}
            onClose={onCancel}
            customClassName="agenda-item-editor-popup"
        >
            <div className="agenda-item-editor">
                <div className="editor-header">
                    <h3>
                        <Icon icon="mdi:pencil" />
                        {item.id && !item.id.startsWith('item-') ? 'Edit' : 'Create'} Agenda Item
                    </h3>
                    <button className="close-btn" onClick={onCancel}>
                        <Icon icon="mdi:close" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="editor-form">
                    <div className="form-group">
                        <label>
                            Title <span className="required">*</span>
                        </label>
                        <input
                            type="text"
                            value={formData.title}
                            onChange={(e) => handleChange('title', e.target.value)}
                            required
                            placeholder="Agenda item title"
                        />
                    </div>

                    <div className="form-group">
                        <label>Description</label>
                        <textarea
                            value={formData.description}
                            onChange={(e) => handleChange('description', e.target.value)}
                            rows={4}
                            placeholder="Item description"
                        />
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label>Type</label>
                            <select
                                value={formData.type}
                                onChange={(e) => handleChange('type', e.target.value)}
                            >
                                {itemTypes.map(type => (
                                    <option key={type} value={type}>{type}</option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group">
                            <label>Location</label>
                            <input
                                type="text"
                                value={formData.location}
                                onChange={(e) => handleChange('location', e.target.value)}
                                placeholder="Location"
                            />
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label>Start Time</label>
                            <input
                                type="datetime-local"
                                value={formData.startTime ? formatDateTimeLocal(formData.startTime) : ''}
                                onChange={(e) => handleChange('startTime', e.target.value)}
                            />
                            <p className="help-text">When this item starts</p>
                        </div>
                        <div className="form-group">
                            <label>End Time</label>
                            <input
                                type="datetime-local"
                                value={formData.endTime ? formatDateTimeLocal(formData.endTime) : ''}
                                onChange={(e) => handleChange('endTime', e.target.value)}
                            />
                            <p className="help-text">When this item ends</p>
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label>Duration (minutes)</label>
                            <input
                                type="number"
                                min="1"
                                value={formData.durationMinutes}
                                onChange={(e) => handleChange('durationMinutes', e.target.value)}
                                placeholder="e.g., 30"
                            />
                            <p className="help-text">Auto-calculated from times, or set manually to update end time</p>
                        </div>
                    </div>

                    <div className="form-group checkbox-group">
                        <label>
                            <input
                                type="checkbox"
                                checked={formData.isPublic}
                                onChange={(e) => handleChange('isPublic', e.target.checked)}
                            />
                            <span>Public (visible to attendees)</span>
                        </label>
                        <p className="help-text">Uncheck to make this item internal-only</p>
                    </div>

                    <div className="form-actions">
                        <button type="button" className="btn-cancel" onClick={onCancel}>
                            Cancel
                        </button>
                        <button type="submit" className="btn-save">
                            <Icon icon="mdi:check" />
                            <span>Save Item</span>
                        </button>
                    </div>
                </form>
            </div>
        </Popup>
    );
}

export default AgendaItemEditor;
