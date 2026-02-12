import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '@iconify-icon/react';
import { useNotification } from '../../NotificationContext';
import apiRequest from '../../utils/postRequest';
import DailyCalendar from '../../pages/OIEDash/EventsCalendar/Day/DailyCalendar/DailyCalendar';
import './AgendaEditor.scss';

function AgendaEditor({ event, onUpdate, customSaveHandler, forceTimelineMode = false }) {
    const { addNotification } = useNotification();
    const [agenda, setAgenda] = useState([]);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editingIndex, setEditingIndex] = useState(null);
    const [viewMode, setViewMode] = useState('timeline'); // 'timeline' or 'list'
    const [agendaMode, setAgendaMode] = useState(forceTimelineMode ? 'timeline' : 'sequential'); // 'sequential' or 'timeline'

    useEffect(() => {
        if (event?.agenda) {
            const normalized = [...event.agenda]
                .map(item => {
                    // Normalize dates to Date objects if they're strings
                    const normalizedItem = { ...item };
                    if (item.startTime && typeof item.startTime === 'string') {
                        normalizedItem.startTime = new Date(item.startTime);
                    }
                    if (item.endTime && typeof item.endTime === 'string') {
                        normalizedItem.endTime = new Date(item.endTime);
                    }
                    // Calculate durationMinutes if not present but startTime/endTime are
                    if (!normalizedItem.durationMinutes && normalizedItem.startTime && normalizedItem.endTime) {
                        const start = new Date(normalizedItem.startTime);
                        const end = new Date(normalizedItem.endTime);
                        const diffMinutes = Math.max(1, Math.round((end - start) / 60000));
                        normalizedItem.durationMinutes = diffMinutes;
                    }
                    return normalizedItem;
                });
            setAgenda(normalized);
            
            // Auto-detect mode: if any item has explicit startTime/endTime, use timeline mode
            const hasExplicitTimes = normalized.some(item => item.startTime && item.endTime);
            if (hasExplicitTimes) {
                setAgendaMode('timeline');
            }
        } else {
            setAgenda([]);
        }
    }, [event]);

    const handleAddItem = () => {
        const newItem = {
            title: '',
            description: '',
            durationMinutes: 30,
            location: '',
            speaker: '',
            track: '',
            order: agenda.length
        };

        // Only set startTime/endTime in timeline mode
        if (agendaMode === 'timeline') {
            const eventStart = event?.start_time ? new Date(event.start_time) : new Date();
            const defaultStart = new Date(eventStart);
            const defaultEnd = new Date(eventStart);
            defaultEnd.setMinutes(defaultEnd.getMinutes() + 30);
            newItem.startTime = defaultStart;
            newItem.endTime = defaultEnd;
        }

        setAgenda([...agenda, newItem]);
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
        const item = { ...newAgenda[index] };
        
        if (agendaMode === 'sequential') {
            // In sequential mode, only allow duration changes, ignore time fields
            if (field === 'durationMinutes') {
                item[field] = parseInt(value, 10);
            } else if (field !== 'startTime' && field !== 'endTime') {
                item[field] = value;
            }
            // Remove any existing startTime/endTime in sequential mode
            delete item.startTime;
            delete item.endTime;
        } else {
            // Timeline mode: handle time fields
            if (field === 'startTime' || field === 'endTime') {
                // Handle datetime-local input format (YYYY-MM-DDTHH:mm)
                const dateValue = value ? new Date(value) : null;
                item[field] = dateValue;
                
                // Auto-update durationMinutes if both times are set
                if (field === 'startTime' && item.endTime) {
                    const start = new Date(dateValue);
                    const end = new Date(item.endTime);
                    const diffMinutes = Math.max(1, Math.round((end - start) / 60000));
                    item.durationMinutes = diffMinutes;
                } else if (field === 'endTime' && item.startTime) {
                    const start = new Date(item.startTime);
                    const end = new Date(dateValue);
                    const diffMinutes = Math.max(1, Math.round((end - start) / 60000));
                    item.durationMinutes = diffMinutes;
                }
            } else if (field === 'durationMinutes' && value) {
                // If duration changes and startTime exists, update endTime
                item[field] = parseInt(value, 10);
                if (item.startTime) {
                    const start = new Date(item.startTime);
                    const end = new Date(start);
                    end.setMinutes(end.getMinutes() + item.durationMinutes);
                    item.endTime = end;
                }
            } else {
                item[field] = value;
            }
        }
        
        newAgenda[index] = item;
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

            if (agendaMode === 'sequential') {
                // In sequential mode, only validate duration
                const duration = parseInt(item.durationMinutes, 10);
                if (!duration || duration <= 0) {
                    addNotification({
                        title: 'Validation Error',
                        message: `Agenda item ${i + 1} must have a duration in minutes.`,
                        type: 'error'
                    });
                    return;
                }
            } else {
                // In timeline mode, validate times
                const hasDuration = item.durationMinutes && parseInt(item.durationMinutes, 10) > 0;
                const hasTimes = item.startTime && item.endTime;
                
                if (!hasDuration && !hasTimes) {
                    addNotification({
                        title: 'Validation Error',
                        message: `Agenda item ${i + 1} must have either a duration or start/end times.`,
                        type: 'error'
                    });
                    return;
                }

                // Validate that endTime is after startTime if both are provided
                if (hasTimes) {
                    const start = new Date(item.startTime);
                    const end = new Date(item.endTime);
                    if (end <= start) {
                        addNotification({
                            title: 'Validation Error',
                            message: `Agenda item ${i + 1}: end time must be after start time.`,
                            type: 'error'
                        });
                        return;
                    }
                }
            }
        }

        setIsSaving(true);
        try {
            const sanitizedAgenda = agenda.map((item, index) => {
                const sanitized = {
                    ...item,
                    order: item.order !== undefined ? item.order : index
                };
                
                if (agendaMode === 'sequential') {
                    // In sequential mode, remove startTime/endTime and only keep duration
                    delete sanitized.startTime;
                    delete sanitized.endTime;
                    sanitized.durationMinutes = parseInt(item.durationMinutes, 10);
                } else {
                    // In timeline mode, include startTime/endTime if they exist
                    if (item.startTime) {
                        sanitized.startTime = new Date(item.startTime).toISOString();
                    }
                    if (item.endTime) {
                        sanitized.endTime = new Date(item.endTime).toISOString();
                    }
                    if (item.durationMinutes) {
                        sanitized.durationMinutes = parseInt(item.durationMinutes, 10);
                    }
                }
                
                return sanitized;
            });
            
            // Use custom save handler if provided, otherwise use default endpoint
            if (customSaveHandler) {
                const result = await customSaveHandler(sanitizedAgenda);
                if (result.success) {
                    addNotification({
                        title: 'Success',
                        message: 'Agenda updated successfully.',
                        type: 'success'
                    });
                    setIsEditing(false);
                    setEditingIndex(null);
                    if (onUpdate) {
                        onUpdate({ ...event, agenda: sanitizedAgenda });
                    }
                } else {
                    addNotification({
                        title: 'Error',
                        message: result.message || 'Failed to update agenda.',
                        type: 'error'
                    });
                }
            } else {
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
            setAgenda([...event.agenda].map(item => {
                const normalized = { ...item };
                if (item.startTime && typeof item.startTime === 'string') {
                    normalized.startTime = new Date(item.startTime);
                }
                if (item.endTime && typeof item.endTime === 'string') {
                    normalized.endTime = new Date(item.endTime);
                }
                return normalized;
            }));
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

    const formatDateTimeLocal = (dateValue) => {
        if (!dateValue) return '';
        const date = new Date(dateValue);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    };

    // Note: layoutAgendaItems removed - using DailyCalendar component instead

    // Get items without times for list view
    const itemsWithoutTimes = useMemo(() => {
        return agenda
            .map((item, index) => ({ ...item, originalIndex: index }))
            .filter(item => !item.startTime || !item.endTime);
    }, [agenda]);

    // Compute sequential times for items without explicit times
    const computeSequentialTimes = () => {
        if (!event?.start_time) return {};
        const start = new Date(event.start_time);
        let cursor = new Date(start);
        const times = {};
        
        agenda.forEach((item, index) => {
            if (agendaMode === 'sequential') {
                // In sequential mode, always compute times from duration
                const duration = parseInt(item.durationMinutes, 10);
                if (duration && duration > 0) {
                    const itemStart = new Date(cursor);
                    const itemEnd = new Date(cursor);
                    itemEnd.setMinutes(itemEnd.getMinutes() + duration);
                    times[index] = { start: itemStart, end: itemEnd };
                    cursor = new Date(itemEnd);
                } else {
                    times[index] = { start: null, end: null };
                }
            } else {
                // In timeline mode, use explicit times if available, otherwise compute sequentially
                if (item.startTime && item.endTime) {
                    times[index] = {
                        start: new Date(item.startTime),
                        end: new Date(item.endTime)
                    };
                } else {
                    const duration = parseInt(item.durationMinutes, 10);
                    if (duration && duration > 0) {
                        const itemStart = new Date(cursor);
                        const itemEnd = new Date(cursor);
                        itemEnd.setMinutes(itemEnd.getMinutes() + duration);
                        times[index] = { start: itemStart, end: itemEnd };
                        cursor = new Date(itemEnd);
                    } else {
                        times[index] = { start: null, end: null };
                    }
                }
            }
        });
        return times;
    };

    const agendaTimes = computeSequentialTimes();

    if (!event) return null;

    return (
        <div className="agenda-editor">
            {!forceTimelineMode && (
                <div className="agenda-editor__header">
                    <div className="agenda-editor__title">
                        <Icon icon="mdi:calendar-clock" />
                        <h3>Event Agenda</h3>
                    </div>
                    <div className="agenda-editor__header-actions">
                        {!isEditing && (
                            <div className="agenda-editor__mode-toggle">
                            <label className="agenda-editor__mode-label">Mode:</label>
                            <button
                                className={`agenda-editor__mode-btn ${agendaMode === 'sequential' ? 'active' : ''}`}
                                onClick={() => {
                                    // Clear startTime/endTime when switching to sequential mode
                                    if (agendaMode !== 'sequential') {
                                        const cleanedAgenda = agenda.map(item => {
                                            const cleaned = { ...item };
                                            delete cleaned.startTime;
                                            delete cleaned.endTime;
                                            return cleaned;
                                        });
                                        setAgenda(cleanedAgenda);
                                    }
                                    setAgendaMode('sequential');
                                }}
                                title="Sequential Mode - Items placed one after another"
                            >
                                <Icon icon="mdi:format-list-numbered" />
                                <span>Sequential</span>
                            </button>
                            <button
                                className={`agenda-editor__mode-btn ${agendaMode === 'timeline' ? 'active' : ''}`}
                                onClick={() => {
                                    // Initialize times for items without them when switching to timeline mode
                                    if (agendaMode !== 'timeline' && event?.start_time) {
                                        const eventStart = new Date(event.start_time);
                                        let cursor = new Date(eventStart);
                                        const updatedAgenda = agenda.map((item, index) => {
                                            if (!item.startTime || !item.endTime) {
                                                const duration = parseInt(item.durationMinutes, 10) || 30;
                                                const itemStart = new Date(cursor);
                                                const itemEnd = new Date(cursor);
                                                itemEnd.setMinutes(itemEnd.getMinutes() + duration);
                                                cursor = new Date(itemEnd);
                                                return {
                                                    ...item,
                                                    startTime: itemStart,
                                                    endTime: itemEnd
                                                };
                                            }
                                            return item;
                                        });
                                        setAgenda(updatedAgenda);
                                    }
                                    setAgendaMode('timeline');
                                }}
                                title="Timeline Mode - Items can overlap and run concurrently"
                            >
                                <Icon icon="mdi:view-timeline" />
                                <span>Timeline</span>
                            </button>
                        </div>
                    )}
                    {agenda.length > 0 && agendaMode === 'timeline' && (
                        <div className="agenda-editor__view-toggle">
                            <button
                                className={`agenda-editor__view-btn ${viewMode === 'timeline' ? 'active' : ''}`}
                                onClick={() => setViewMode('timeline')}
                                title="Timeline View"
                            >
                                <Icon icon="mdi:view-timeline" />
                            </button>
                            <button
                                className={`agenda-editor__view-btn ${viewMode === 'list' ? 'active' : ''}`}
                                onClick={() => setViewMode('list')}
                                title="List View"
                            >
                                <Icon icon="mdi:view-list" />
                            </button>
                        </div>
                    )}
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
            </div>
            )}

            {agenda.length === 0 && !isEditing ? (
                <div className="agenda-editor__empty">
                    <Icon icon="mdi:calendar-blank" />
                    <p>No agenda items yet. Click "Add Item" to get started.</p>
                </div>
            ) : agendaMode === 'timeline' && viewMode === 'timeline' ? (
                <div className="agenda-editor__timeline">
                    {(() => {
                        // Convert agenda items to DailyCalendar event format
                        const calendarEvents = agenda
                            .filter(item => item.startTime && item.endTime)
                            .map((item, index) => ({
                                _id: item.id || `agenda-item-${index}`,
                                name: item.title,
                                start_time: typeof item.startTime === 'string' ? item.startTime : item.startTime.toISOString(),
                                end_time: typeof item.endTime === 'string' ? item.endTime : item.endTime.toISOString(),
                                type: item.type || 'Activity',
                                location: item.location || '',
                                description: item.description || '',
                                // Add agenda item data for reference
                                agendaItem: item,
                                agendaIndex: index
                            }));

                        const eventDate = event?.start_time ? new Date(event.start_time) : new Date();
                        eventDate.setHours(0, 0, 0, 0);

                        return (
                            <DailyCalendar
                                selectedDay={eventDate}
                                events={calendarEvents}
                                height="600px"
                            />
                        );
                    })()}
                    {itemsWithoutTimes.length > 0 && (
                        <div className="agenda-editor__list">
                            <div className="agenda-editor__section-title">Items without specific times</div>
                            {itemsWithoutTimes.map((item) => (
                                <div key={item.originalIndex} className="agenda-editor__item">
                                    <div className="agenda-editor__item-view">
                                        <div className="agenda-editor__item-content">
                                            <div className="agenda-editor__item-header">
                                                <h4>{item.title}</h4>
                                                {!isEditing && (
                                                    <button
                                                        className="agenda-editor__edit-btn"
                                                        onClick={() => handleEditItem(item.originalIndex)}
                                                    >
                                                        <Icon icon="mdi:pencil" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
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
                                    {agendaMode === 'timeline' ? (
                                        <>
                                            <div className="agenda-editor__form-row">
                                                <div className="agenda-editor__form-group">
                                                    <label>Start Time</label>
                                                    <input
                                                        type="datetime-local"
                                                        value={item.startTime ? formatDateTimeLocal(item.startTime) : ''}
                                                        onChange={(e) => handleUpdateItem(index, 'startTime', e.target.value)}
                                                    />
                                                    <p className="help-text">When this item starts</p>
                                                </div>
                                                <div className="agenda-editor__form-group">
                                                    <label>End Time</label>
                                                    <input
                                                        type="datetime-local"
                                                        value={item.endTime ? formatDateTimeLocal(item.endTime) : ''}
                                                        onChange={(e) => handleUpdateItem(index, 'endTime', e.target.value)}
                                                    />
                                                    <p className="help-text">When this item ends</p>
                                                </div>
                                            </div>
                                            <div className="agenda-editor__form-row">
                                                <div className="agenda-editor__form-group">
                                                    <label>Duration (minutes)</label>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        value={item.durationMinutes || ''}
                                                        onChange={(e) => handleUpdateItem(index, 'durationMinutes', e.target.value)}
                                                        placeholder="e.g., 30"
                                                    />
                                                    <p className="help-text">Auto-calculated from times, or set manually to update end time</p>
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="agenda-editor__form-row">
                                            <div className="agenda-editor__form-group">
                                                <label>Duration (minutes) *</label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={item.durationMinutes || ''}
                                                    onChange={(e) => handleUpdateItem(index, 'durationMinutes', e.target.value)}
                                                    placeholder="e.g., 30"
                                                    required
                                                />
                                                <p className="help-text">Times are calculated sequentially from the event start.</p>
                                            </div>
                                        </div>
                                    )}
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
