import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import { useNotification } from '../../NotificationContext';
import apiRequest from '../../utils/postRequest';
import './AgendaEditor.scss';

function AgendaEditor({ event, onUpdate }) {
    const { addNotification } = useNotification();
    const [agenda, setAgenda] = useState([]);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editingIndex, setEditingIndex] = useState(null);

    useEffect(() => {
        if (event?.agenda) {
            const normalized = [...event.agenda]
                .sort((a, b) => (a.order || 0) - (b.order || 0))
                .map(item => {
                    if (!item.durationMinutes && item.startTime && item.endTime) {
                        const start = new Date(item.startTime);
                        const end = new Date(item.endTime);
                        const diffMinutes = Math.max(1, Math.round((end - start) / 60000));
                        return { ...item, durationMinutes: diffMinutes };
                    }
                    return item;
                });
            setAgenda(normalized);
        } else {
            setAgenda([]);
        }
    }, [event]);

    const handleAddItem = () => {
        setAgenda([...agenda, {
            title: '',
            description: '',
            durationMinutes: 30,
            location: '',
            speaker: '',
            track: '',
            order: agenda.length
        }]);
        setEditingIndex(agenda.length);
        setIsEditing(true);
    };

    const handleEditItem = (index) => {
        setEditingIndex(index);
        setIsEditing(true);
    };

    const handleDeleteItem = (index) => {
        const newAgenda = agenda.filter((_, i) => i !== index);
        // Reorder items
        newAgenda.forEach((item, i) => {
            item.order = i;
        });
        setAgenda(newAgenda);
    };

    const handleUpdateItem = (index, field, value) => {
        const newAgenda = [...agenda];
        newAgenda[index] = {
            ...newAgenda[index],
            [field]: value
        };
        setAgenda(newAgenda);
    };

    const handleSave = async () => {
        for (let i = 0; i < agenda.length; i++) {
            const item = agenda[i];
            if (!item.title || item.title.trim() === '') {
                addNotification({
                    title: 'Validation Error',
                    message: `Agenda item ${i + 1} must have a title.`,
                    type: 'error'
                });
                return;
            }

            const duration = parseInt(item.durationMinutes, 10);
            if (!duration || duration <= 0) {
                addNotification({
                    title: 'Validation Error',
                    message: `Agenda item ${i + 1} must have a duration in minutes.`,
                    type: 'error'
                });
                return;
            }
        }

        setIsSaving(true);
        try {
            const sanitizedAgenda = agenda.map(({ startTime, endTime, durationMinutes, ...rest }) => ({
                ...rest,
                durationMinutes: durationMinutes ? parseInt(durationMinutes, 10) : null
            }));
            const response = await apiRequest(
                `/update-event-agenda/${event._id}`,
                { agenda: sanitizedAgenda },
                { method: 'POST' }
            );

            if (response.success) {
                addNotification({
                    title: 'Success',
                    message: 'Agenda updated successfully.',
                    type: 'success'
                });
                setIsEditing(false);
                setEditingIndex(null);
                if (onUpdate) {
                    onUpdate(response.event);
                }
            } else {
                addNotification({
                    title: 'Error',
                    message: response.message || 'Failed to update agenda.',
                    type: 'error'
                });
            }
        } catch (error) {
            addNotification({
                title: 'Error',
                message: error.error || 'Failed to update agenda.',
                type: 'error'
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        // Reset to original agenda
        if (event?.agenda) {
            setAgenda([...event.agenda].sort((a, b) => (a.order || 0) - (b.order || 0)));
        } else {
            setAgenda([]);
        }
        setIsEditing(false);
        setEditingIndex(null);
    };

    const formatTime = (dateValue) => {
        if (!dateValue) return '';
        const date = new Date(dateValue);
        return date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    };

    const computeAgendaTimes = () => {
        if (!event?.start_time) return {};
        const start = new Date(event.start_time);
        const ordered = [...agenda].sort((a, b) => (a.order || 0) - (b.order || 0));
        let cursor = new Date(start);
        const times = {};
        ordered.forEach((item, index) => {
            const duration = parseInt(item.durationMinutes, 10);
            if (!duration || duration <= 0) {
                times[index] = { start: null, end: null };
                return;
            }
            const itemStart = new Date(cursor);
            const itemEnd = new Date(cursor);
            itemEnd.setMinutes(itemEnd.getMinutes() + duration);
            times[index] = { start: itemStart, end: itemEnd };
            cursor = new Date(itemEnd);
        });
        return times;
    };

    const agendaTimes = computeAgendaTimes();

    if (!event) return null;

    return (
        <div className="agenda-editor">
            <div className="agenda-editor__header">
                <div className="agenda-editor__title">
                    <Icon icon="mdi:calendar-clock" />
                    <h3>Event Agenda</h3>
                </div>
                {!isEditing && (
                    <button 
                        className="agenda-editor__add-btn"
                        onClick={handleAddItem}
                    >
                        <Icon icon="mdi:plus" />
                        Add Item
                    </button>
                )}
            </div>

            {agenda.length === 0 && !isEditing ? (
                <div className="agenda-editor__empty">
                    <Icon icon="mdi:calendar-blank" />
                    <p>No agenda items yet. Click "Add Item" to get started.</p>
                </div>
            ) : (
                <div className="agenda-editor__list">
                    {agenda.map((item, index) => (
                        <div key={index} className="agenda-editor__item">
                            {editingIndex === index ? (
                                <div className="agenda-editor__item-edit">
                                    <div className="agenda-editor__form-group">
                                        <label>Title *</label>
                                        <input
                                            type="text"
                                            value={item.title || ''}
                                            onChange={(e) => handleUpdateItem(index, 'title', e.target.value)}
                                            placeholder="e.g., Welcome & Introductions"
                                        />
                                    </div>
                                    <div className="agenda-editor__form-group">
                                        <label>Description</label>
                                        <textarea
                                            value={item.description || ''}
                                            onChange={(e) => handleUpdateItem(index, 'description', e.target.value)}
                                            placeholder="Optional description"
                                            rows={3}
                                        />
                                    </div>
                                    <div className="agenda-editor__form-row">
                                        <div className="agenda-editor__form-group">
                                            <label>Duration (minutes) *</label>
                                            <input
                                                type="number"
                                                min="1"
                                                value={item.durationMinutes || ''}
                                                onChange={(e) => handleUpdateItem(index, 'durationMinutes', e.target.value)}
                                                placeholder="e.g., 30"
                                            />
                                            <p className="help-text">Times are calculated from the event start.</p>
                                        </div>
                                    </div>
                                    <div className="agenda-editor__form-row">
                                        <div className="agenda-editor__form-group">
                                            <label>Location</label>
                                            <input
                                                type="text"
                                                value={item.location || ''}
                                                onChange={(e) => handleUpdateItem(index, 'location', e.target.value)}
                                                placeholder="Optional location"
                                            />
                                        </div>
                                        <div className="agenda-editor__form-group">
                                            <label>Speaker</label>
                                            <input
                                                type="text"
                                                value={item.speaker || ''}
                                                onChange={(e) => handleUpdateItem(index, 'speaker', e.target.value)}
                                                placeholder="Optional speaker name"
                                            />
                                        </div>
                                    </div>
                                    <div className="agenda-editor__item-actions">
                                        <button
                                            className="agenda-editor__btn agenda-editor__btn--save"
                                            onClick={() => {
                                                setEditingIndex(null);
                                                if (agenda.length === 1) {
                                                    setIsEditing(false);
                                                }
                                            }}
                                        >
                                            Done
                                        </button>
                                        <button
                                            className="agenda-editor__btn agenda-editor__btn--delete"
                                            onClick={() => handleDeleteItem(index)}
                                        >
                                            <Icon icon="mdi:delete" />
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="agenda-editor__item-view">
                                    <div className="agenda-editor__item-content">
                                        <div className="agenda-editor__item-header">
                                            <h4>{item.title}</h4>
                                            {!isEditing && (
                                                <button
                                                    className="agenda-editor__edit-btn"
                                                    onClick={() => handleEditItem(index)}
                                                >
                                                    <Icon icon="mdi:pencil" />
                                                </button>
                                            )}
                                        </div>
                                        {item.description && (
                                            <p className="agenda-editor__item-description">{item.description}</p>
                                        )}
                                        <div className="agenda-editor__item-meta">
                                            {agendaTimes[index]?.start && (
                                                <div className="agenda-editor__meta-item">
                                                    <Icon icon="mdi:clock-outline" />
                                                    <span>
                                                        {formatTime(agendaTimes[index]?.start)}
                                                        {agendaTimes[index]?.end && ` - ${formatTime(agendaTimes[index]?.end)}`}
                                                    </span>
                                                </div>
                                            )}
                                            {item.durationMinutes && (
                                                <div className="agenda-editor__meta-item">
                                                    <Icon icon="mdi:timer-outline" />
                                                    <span>{item.durationMinutes} min</span>
                                                </div>
                                            )}
                                            {item.location && (
                                                <div className="agenda-editor__meta-item">
                                                    <Icon icon="mdi:map-marker" />
                                                    <span>{item.location}</span>
                                                </div>
                                            )}
                                            {item.speaker && (
                                                <div className="agenda-editor__meta-item">
                                                    <Icon icon="mdi:account" />
                                                    <span>{item.speaker}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {isEditing && (
                <div className="agenda-editor__actions">
                    <button
                        className="agenda-editor__btn agenda-editor__btn--primary"
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
                                Save Agenda
                            </>
                        )}
                    </button>
                    <button
                        className="agenda-editor__btn agenda-editor__btn--secondary"
                        onClick={handleCancel}
                        disabled={isSaving}
                    >
                        Cancel
                    </button>
                </div>
            )}
        </div>
    );
}

export default AgendaEditor;

