import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import Popup from '../../../../../../components/Popup/Popup';
import './AgendaBuilder.scss';

function AgendaItemEditor({ item, event, latestItemEnd, onSave, onCancel }) {
    const [inputMode, setInputMode] = useState('duration'); // 'duration' | 'endTime'
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        startTime: null,
        endTime: null,
        durationMinutes: 30,
        type: 'Activity',
        location: '',
        isPublic: true
    });

    useEffect(() => {
        if (item) {
            let startTime = null;
            let endTime = null;

            if (item.startTime) {
                startTime = typeof item.startTime === 'string' ? new Date(item.startTime) : item.startTime;
            }
            if (item.endTime) {
                endTime = typeof item.endTime === 'string' ? new Date(item.endTime) : item.endTime;
            }

            if (!startTime || !endTime) {
                const fallbackStart = latestItemEnd
                    ? (latestItemEnd instanceof Date ? latestItemEnd : new Date(latestItemEnd))
                    : event?.start_time
                        ? new Date(event.start_time)
                        : new Date();
                const fallbackEnd = new Date(fallbackStart);
                fallbackEnd.setMinutes(fallbackEnd.getMinutes() + 30);
                startTime = startTime || fallbackStart;
                endTime = endTime || fallbackEnd;
            }

            const durationMinutes = startTime && endTime
                ? Math.max(1, Math.round((endTime - startTime) / 60000))
                : 30;

            setFormData({
                title: item.title || '',
                description: item.description || '',
                startTime,
                endTime,
                durationMinutes,
                type: item.type || 'Activity',
                location: item.location || '',
                isPublic: item.isPublic !== undefined ? item.isPublic : true
            });
        } else if (event?.start_time || latestItemEnd) {
            const defaultStart = latestItemEnd
                ? (latestItemEnd instanceof Date ? latestItemEnd : new Date(latestItemEnd))
                : new Date(event.start_time);
            const defaultEnd = new Date(defaultStart);
            defaultEnd.setMinutes(defaultEnd.getMinutes() + 30);

            setFormData((prev) => ({
                ...prev,
                startTime: defaultStart,
                endTime: defaultEnd,
                durationMinutes: 30
            }));
        }
    }, [item, event, latestItemEnd]);

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
        setFormData((prev) => {
            const updated = { ...prev };

            if (field === 'startTime') {
                const dateValue = value ? new Date(value) : null;
                updated.startTime = dateValue;
                if (dateValue && updated.endTime) {
                    const end = new Date(updated.endTime);
                    if (end > dateValue) {
                        updated.durationMinutes = Math.max(1, Math.round((end - dateValue) / 60000));
                    }
                }
            } else if (field === 'endTime') {
                const dateValue = value ? new Date(value) : null;
                updated.endTime = dateValue;
                if (dateValue && updated.startTime) {
                    const start = new Date(updated.startTime);
                    if (dateValue > start) {
                        updated.durationMinutes = Math.max(1, Math.round((dateValue - start) / 60000));
                    }
                }
            } else if (field === 'durationMinutes') {
                const duration = parseInt(value, 10);
                if (duration > 0 && updated.startTime) {
                    updated.durationMinutes = duration;
                    const start = new Date(updated.startTime);
                    const end = new Date(start);
                    end.setMinutes(end.getMinutes() + duration);
                    updated.endTime = end;
                } else {
                    updated.durationMinutes = value;
                }
            } else {
                updated[field] = value;
            }

            return updated;
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        if (!formData.title || formData.title.trim() === '') {
            alert('Please enter a title.');
            return;
        }

        let startTime = formData.startTime;
        let endTime = formData.endTime;

        if (inputMode === 'duration') {
            const duration = parseInt(formData.durationMinutes, 10);
            if (!duration || duration <= 0) {
                alert('Please enter a valid duration.');
                return;
            }
            startTime = formData.startTime ? new Date(formData.startTime) : null;
            endTime = startTime ? new Date(startTime) : null;
            if (endTime) endTime.setMinutes(endTime.getMinutes() + duration);
        } else {
            if (!startTime || !endTime) {
                alert('Please enter a start time and end time.');
                return;
            }
            startTime = new Date(startTime);
            endTime = new Date(endTime);
            if (endTime <= startTime) {
                alert('End time must be after start time.');
                return;
            }
        }

        const itemData = {
            ...item,
            ...formData,
            startTime: startTime instanceof Date ? startTime : new Date(startTime),
            endTime: endTime instanceof Date ? endTime : new Date(endTime)
        };
        delete itemData.durationMinutes;

        onSave(itemData);
    };

    const itemTypes = ['Activity', 'Break', 'Setup', 'Breakdown', 'Transition', 'Speaker', 'Custom'];

    return (
        <Popup isOpen={true} onClose={onCancel} customClassName="agenda-item-editor-popup" hideCloseButton>
            <div className="agenda-item-editor">
                <div className="editor-header">
                    <h3>
                        <Icon icon="mdi:pencil" />
                        {item?.id && !item.id.startsWith('item-') ? 'Edit' : 'Create'} Agenda Item
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
                                {itemTypes.map((type) => (
                                    <option key={type} value={type}>
                                        {type}
                                    </option>
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

                    <div className="form-group">
                        <label>How to specify time</label>
                        <div className="input-mode-toggle">
                            <button
                                type="button"
                                className={`mode-btn ${inputMode === 'duration' ? 'active' : ''}`}
                                onClick={() => setInputMode('duration')}
                            >
                                <Icon icon="mdi:timer-outline" />
                                <span>Duration</span>
                            </button>
                            <button
                                type="button"
                                className={`mode-btn ${inputMode === 'endTime' ? 'active' : ''}`}
                                onClick={() => setInputMode('endTime')}
                            >
                                <Icon icon="mdi:clock-outline" />
                                <span>End Time</span>
                            </button>
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label>Start Time</label>
                            <input
                                type="datetime-local"
                                value={formData.startTime ? formatDateTimeLocal(formData.startTime) : ''}
                                onChange={(e) => handleChange('startTime', e.target.value)}
                                required
                            />
                        </div>

                        {inputMode === 'duration' ? (
                            <div className="form-group">
                                <label>Duration (minutes)</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={formData.durationMinutes}
                                    onChange={(e) => handleChange('durationMinutes', e.target.value)}
                                    placeholder="e.g., 30"
                                    required
                                />
                                <p className="help-text">End time is calculated from start + duration</p>
                            </div>
                        ) : (
                            <div className="form-group">
                                <label>End Time</label>
                                <input
                                    type="datetime-local"
                                    value={formData.endTime ? formatDateTimeLocal(formData.endTime) : ''}
                                    onChange={(e) => handleChange('endTime', e.target.value)}
                                    required
                                />
                            </div>
                        )}
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
