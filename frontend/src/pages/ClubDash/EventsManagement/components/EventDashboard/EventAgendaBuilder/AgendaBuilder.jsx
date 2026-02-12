import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../../../hooks/useFetch';
import { useNotification } from '../../../../../../NotificationContext';
import apiRequest from '../../../../../../utils/postRequest';
import DraggableList from '../../../../../../components/DraggableList/DraggableList';
import AgendaItem from './AgendaItem';
import AgendaItemEditor from './AgendaItemEditor';
import AgendaEditor from '../../../../../../components/AgendaEditor/AgendaEditor';
import PublishConfirmModal from './PublishConfirmModal';
import DeleteConfirmModal from '../../../../../../components/DeleteConfirmModal/DeleteConfirmModal';
import './AgendaBuilder.scss';

function AgendaBuilder({ event, orgId, onRefresh }) {
    const { addNotification } = useNotification();
    const [items, setItems] = useState([]);
    const [editingItem, setEditingItem] = useState(null);
    const [saving, setSaving] = useState(false);
    const [isPublished, setIsPublished] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [showPublishModal, setShowPublishModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [agendaMode, setAgendaMode] = useState('sequential'); // 'sequential' or 'timeline'

    // Fetch agenda
    const { data: agendaData, loading, refetch } = useFetch(
        event?._id && orgId ? `/org-event-management/${orgId}/events/${event._id}/agenda` : null
    );

    useEffect(() => {
        if (agendaData?.success && agendaData.data?.agenda) {
            const agenda = agendaData.data.agenda;
            setIsPublished(agenda.isPublished || false);
            const agendaItems = (agenda.items || []).map(item => {
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
            setItems(agendaItems);
            
            // Auto-detect mode: if any item has explicit startTime/endTime, use timeline mode
            const hasExplicitTimes = agendaItems.some(item => item.startTime && item.endTime);
            if (hasExplicitTimes) {
                setAgendaMode('timeline');
            }
        }
    }, [agendaData]);

    const handleReorder = (newItems) => {
        // Update order numbers
        const reorderedItems = newItems.map((item, index) => ({
            ...item,
            order: index
        }));
        setItems(reorderedItems);
        saveAgenda(reorderedItems);
    };

    const saveAgenda = async (itemsToSave = items) => {
        if (!event?._id || !orgId) {
            return { success: false, message: 'Missing event ID or org ID' };
        }

        setSaving(true);
        try {
            const sanitizedItems = itemsToSave.map(item => {
                const sanitized = { ...item };
                
                if (agendaMode === 'sequential') {
                    // In sequential mode, remove startTime/endTime and only keep duration
                    delete sanitized.startTime;
                    delete sanitized.endTime;
                } else {
                    // In timeline mode, include startTime/endTime if they exist
                    if (item.startTime) {
                        sanitized.startTime = typeof item.startTime === 'string' 
                            ? item.startTime 
                            : new Date(item.startTime).toISOString();
                    }
                    if (item.endTime) {
                        sanitized.endTime = typeof item.endTime === 'string'
                            ? item.endTime
                            : new Date(item.endTime).toISOString();
                    }
                }
                return sanitized;
            });
            const response = await apiRequest(
                `/org-event-management/${orgId}/events/${event._id}/agenda`,
                { items: sanitizedItems },
                { method: 'POST' }
            );

            if (response.success) {
                // When items are saved, agenda becomes unpublished
                setIsPublished(false);
                if (onRefresh) onRefresh();
                return { success: true };
            } else {
                throw new Error(response.message || 'Failed to save agenda');
            }
        } catch (error) {
            addNotification({
                title: 'Error',
                message: error.message || 'Failed to save agenda',
                type: 'error'
            });
            return { success: false, message: error.message || 'Failed to save agenda' };
        } finally {
            setSaving(false);
        }
    };

    const handleAddItem = () => {
        const newItem = {
            id: `item-${Date.now()}`,
            title: 'New Agenda Item',
            description: '',
            durationMinutes: 30,
            type: 'Activity',
            location: '',
            assignedRoles: [],
            isPublic: true,
            order: items.length
        };
        
        // Only set startTime/endTime in timeline mode
        if (agendaMode === 'timeline' && event?.start_time) {
            const eventStart = new Date(event.start_time);
            newItem.startTime = new Date(eventStart);
            newItem.endTime = new Date(eventStart);
            newItem.endTime.setMinutes(newItem.endTime.getMinutes() + 30);
        }
        
        setEditingItem(newItem);
    };

    const handleEditItem = (item) => {
        setEditingItem(item);
    };

    const handleDeleteItem = (itemId) => {
        setItemToDelete(itemId);
        setShowDeleteModal(true);
    };

    const confirmDeleteItem = async () => {
        if (!itemToDelete || !event?._id || !orgId) return;

        try {
            const response = await apiRequest(
                `/org-event-management/${orgId}/events/${event._id}/agenda/items/${itemToDelete}`,
                {},
                { method: 'DELETE' }
            );

            if (response.success) {
                setItems(items.filter(item => item.id !== itemToDelete));
                // When items are deleted, agenda becomes unpublished
                setIsPublished(false);
                if (onRefresh) onRefresh();
                addNotification({
                    title: 'Success',
                    message: 'Agenda item deleted',
                    type: 'success'
                });
            } else {
                throw new Error(response.message || 'Failed to delete item');
            }
        } catch (error) {
            addNotification({
                title: 'Error',
                message: error.message || 'Failed to delete agenda item',
                type: 'error'
            });
        } finally {
            setShowDeleteModal(false);
            setItemToDelete(null);
        }
    };

    const handleSaveItem = async (itemData) => {
        const existingIndex = items.findIndex(item => item.id === itemData.id);
        let updatedItems;

        if (existingIndex >= 0) {
            // Update existing item
            updatedItems = [...items];
            updatedItems[existingIndex] = { ...itemData, order: updatedItems[existingIndex].order };
        } else {
            // Add new item
            updatedItems = [...items, { ...itemData, order: items.length }];
        }

        setItems(updatedItems);
        setEditingItem(null);
        await saveAgenda(updatedItems);
    };

    // Calculate agenda duration and compare with event time
    const calculateTimeDifference = () => {
        if (!event?.start_time || !event?.end_time || items.length === 0) {
            return null;
        }

        // Calculate agenda duration from items with explicit times or duration
        const agendaDuration = items.reduce((total, item) => {
            // If item has startTime and endTime, use those
            if (item.startTime && item.endTime) {
                const start = new Date(item.startTime);
                const end = new Date(item.endTime);
                const duration = Math.round((end - start) / 60000);
                return total + duration;
            }
            // Otherwise use durationMinutes
            const duration = parseInt(item.durationMinutes, 10) || 0;
            return total + duration;
        }, 0);

        const eventStart = new Date(event.start_time);
        const eventEnd = new Date(event.end_time);
        const eventDuration = Math.round((eventEnd - eventStart) / 60000); // Convert to minutes

        const difference = agendaDuration - eventDuration;
        return {
            agendaDuration,
            eventDuration,
            difference,
            isOver: difference > 0,
            isUnder: difference < 0,
            isExact: difference === 0
        };
    };

    const handlePublish = () => {
        if (!event?._id || !orgId) return;
        if (items.length === 0) {
            addNotification({
                title: 'Error',
                message: 'Cannot publish an empty agenda',
                type: 'error'
            });
            return;
        }

        // Show modal if there's a time difference, otherwise publish directly
        const timeDiff = calculateTimeDifference();
        if (timeDiff && !timeDiff.isExact) {
            setShowPublishModal(true);
        } else {
            publishAgenda();
        }
    };

    const publishAgenda = async (newEndTime = null) => {
        if (!event?._id || !orgId) return;

        setPublishing(true);
        try {
            const requestBody = newEndTime ? { newEndTime } : {};
            const response = await apiRequest(
                `/org-event-management/${orgId}/events/${event._id}/agenda/publish`,
                requestBody,
                { method: 'POST' }
            );

            if (response.success) {
                setIsPublished(true);
                setShowPublishModal(false);
                if (onRefresh) onRefresh();
                addNotification({
                    title: 'Success',
                    message: newEndTime 
                        ? 'Agenda published and event time adjusted successfully'
                        : 'Agenda published successfully',
                    type: 'success'
                });
            } else {
                throw new Error(response.message || 'Failed to publish agenda');
            }
        } catch (error) {
            addNotification({
                title: 'Error',
                message: error.message || 'Failed to publish agenda',
                type: 'error'
            });
        } finally {
            setPublishing(false);
        }
    };

    const handlePublishConfirm = (newEndTime) => {
        publishAgenda(newEndTime);
    };

    const handlePublishWithoutAdjusting = () => {
        publishAgenda();
    };

    if (loading) {
        return (
            <div className="agenda-builder loading">
                <Icon icon="mdi:loading" className="spinner" />
                <p>Loading agenda...</p>
            </div>
        );
    }

    const computeAgendaTimes = () => {
        if (!event?.start_time) return {};
        const start = new Date(event.start_time);
        const ordered = [...items].sort((a, b) => (a.order || 0) - (b.order || 0));
        let cursor = new Date(start);
        const times = {};
        
        ordered.forEach(item => {
            if (agendaMode === 'sequential') {
                // In sequential mode, always compute times from duration
                const duration = parseInt(item.durationMinutes, 10);
                if (!duration || duration <= 0) {
                    times[item.id] = { start: null, end: null };
                    return;
                }
                const itemStart = new Date(cursor);
                const itemEnd = new Date(cursor);
                itemEnd.setMinutes(itemEnd.getMinutes() + duration);
                times[item.id] = { start: itemStart, end: itemEnd };
                cursor = new Date(itemEnd);
            } else {
                // In timeline mode, use explicit times if available, otherwise compute sequentially
                if (item.startTime && item.endTime) {
                    times[item.id] = {
                        start: new Date(item.startTime),
                        end: new Date(item.endTime)
                    };
                } else {
                    const duration = parseInt(item.durationMinutes, 10);
                    if (!duration || duration <= 0) {
                        times[item.id] = { start: null, end: null };
                        return;
                    }
                    const itemStart = new Date(cursor);
                    const itemEnd = new Date(cursor);
                    itemEnd.setMinutes(itemEnd.getMinutes() + duration);
                    times[item.id] = { start: itemStart, end: itemEnd };
                    cursor = new Date(itemEnd);
                }
            }
        });
        return times;
    };

    const agendaTimes = computeAgendaTimes();
    const timeDiff = calculateTimeDifference();

    return (
        <div className="agenda-builder">
            <div className="agenda-header">
                <div className="header-left">
                    <h3>
                        <Icon icon="mdi:calendar-clock" />
                        Event Agenda
                    </h3>
                    <div className="header-meta">
                        <p>{items.length} item{items.length !== 1 ? 's' : ''}</p>
                        {timeDiff && !timeDiff.isExact && (
                            <span className={`time-warning ${timeDiff.isOver ? 'over' : 'under'}`}>
                                <Icon icon={timeDiff.isOver ? "mdi:alert-circle" : "mdi:alert-circle-outline"} />
                                {timeDiff.isOver 
                                    ? `${Math.abs(timeDiff.difference)} min over`
                                    : `${Math.abs(timeDiff.difference)} min under`
                                }
                            </span>
                        )}
                        {isPublished ? (
                            <span className="publish-status published">
                                <Icon icon="mdi:check-circle" />
                                Published
                            </span>
                        ) : (
                            <span className="publish-status pending">
                                <Icon icon="mdi:clock-outline" />
                                Pending
                            </span>
                        )}
                    </div>
                </div>
                <div className="header-actions">
                    <div className="mode-toggle">
                        <label className="mode-label">Mode:</label>
                        <button
                            className={`mode-btn ${agendaMode === 'sequential' ? 'active' : ''}`}
                            onClick={() => {
                                // Clear startTime/endTime when switching to sequential mode
                                if (agendaMode !== 'sequential') {
                                    const cleanedItems = items.map(item => {
                                        const cleaned = { ...item };
                                        delete cleaned.startTime;
                                        delete cleaned.endTime;
                                        return cleaned;
                                    });
                                    setItems(cleanedItems);
                                    saveAgenda(cleanedItems);
                                }
                                setAgendaMode('sequential');
                            }}
                            title="Sequential Mode - Items placed one after another"
                        >
                            <Icon icon="mdi:format-list-numbered" />
                            <span>Sequential</span>
                        </button>
                        <button
                            className={`mode-btn ${agendaMode === 'timeline' ? 'active' : ''}`}
                            onClick={() => {
                                // Initialize times for items without them when switching to timeline mode
                                if (agendaMode !== 'timeline' && event?.start_time) {
                                    const eventStart = new Date(event.start_time);
                                    let cursor = new Date(eventStart);
                                    const updatedItems = items.map((item, index) => {
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
                                    setItems(updatedItems);
                                    saveAgenda(updatedItems);
                                }
                                setAgendaMode('timeline');
                            }}
                            title="Timeline Mode - Items can overlap and run concurrently"
                        >
                            <Icon icon="mdi:view-timeline" />
                            <span>Timeline</span>
                        </button>
                    </div>
                    <button 
                        className="btn-primary"
                        onClick={handleAddItem}
                    >
                        <Icon icon="mdi:plus" />
                        <span>Add Item</span>
                    </button>
                    {!isPublished && items.length > 0 && (
                        <button 
                            className="btn-publish"
                            onClick={handlePublish}
                            disabled={publishing}
                        >
                            <Icon icon={publishing ? "mdi:loading" : "mdi:publish"} className={publishing ? "spinner" : ""} />
                            <span>{publishing ? 'Publishing...' : 'Publish'}</span>
                        </button>
                    )}
                    {saving && (
                        <span className="saving-indicator">
                            <Icon icon="mdi:loading" className="spinner" />
                            Saving...
                        </span>
                    )}
                </div>
            </div>

            {agendaMode === 'timeline' ? (
                <div className="timeline-agenda-wrapper">
                    <AgendaEditor
                        key="timeline-editor"
                        forceTimelineMode={true}
                        event={{
                            ...event,
                            agenda: items.map(item => ({
                                ...item,
                                // Convert EventAgenda format to AgendaEditor format
                                startTime: item.startTime ? (typeof item.startTime === 'string' ? item.startTime : item.startTime.toISOString()) : null,
                                endTime: item.endTime ? (typeof item.endTime === 'string' ? item.endTime : item.endTime.toISOString()) : null
                            }))
                        }}
                        customSaveHandler={async (sanitizedAgenda) => {
                            // Convert AgendaEditor format back to EventAgenda format
                            const convertedItems = sanitizedAgenda.map((item, index) => {
                                const converted = {
                                    id: item.id || `item-${Date.now()}-${index}`,
                                    title: item.title,
                                    description: item.description || '',
                                    durationMinutes: item.durationMinutes,
                                    type: item.type || 'Activity',
                                    location: item.location || '',
                                    isPublic: item.isPublic !== undefined ? item.isPublic : true,
                                    order: item.order !== undefined ? item.order : index,
                                    assignedRoles: item.assignedRoles || []
                                };
                                
                                // Add startTime/endTime if they exist
                                if (item.startTime) {
                                    converted.startTime = typeof item.startTime === 'string' 
                                        ? new Date(item.startTime) 
                                        : item.startTime;
                                }
                                if (item.endTime) {
                                    converted.endTime = typeof item.endTime === 'string'
                                        ? new Date(item.endTime)
                                        : item.endTime;
                                }
                                
                                return converted;
                            });
                            
                            setItems(convertedItems);
                            const result = await saveAgenda(convertedItems);
                            if (onRefresh) onRefresh();
                            return { success: true };
                        }}
                        onUpdate={async (updatedEvent) => {
                            // Refresh data after update
                            if (onRefresh) onRefresh();
                        }}
                    />
                </div>
            ) : items.length === 0 ? (
                <div className="empty-agenda">
                    <Icon icon="mdi:calendar-blank" />
                    <h4>No agenda items yet</h4>
                    <p>Start building your event agenda by adding items</p>

                </div>
            ) : (
                <div className="agenda-items-container">
                    <DraggableList
                        items={items}
                        onReorder={handleReorder}
                        getItemId={(item) => item.id}
                        renderItem={(item) => (
                            <AgendaItem
                                item={item}
                                computedStart={agendaTimes[item.id]?.start}
                                computedEnd={agendaTimes[item.id]?.end}
                                onEdit={() => handleEditItem(item)}
                                onDelete={() => handleDeleteItem(item.id)}
                            />
                        )}
                        gap="1rem"
                    />
                </div>
            )}

            {editingItem && (
                <AgendaItemEditor
                    item={editingItem}
                    event={event}
                    onSave={handleSaveItem}
                    onCancel={() => setEditingItem(null)}
                />
            )}

            {showPublishModal && timeDiff && (
                <PublishConfirmModal
                    event={event}
                    orgId={orgId}
                    timeDifference={timeDiff}
                    onConfirm={handlePublishConfirm}
                    onCancel={() => setShowPublishModal(false)}
                    onPublishWithoutAdjusting={handlePublishWithoutAdjusting}
                />
            )}

            <DeleteConfirmModal
                isOpen={showDeleteModal}
                onConfirm={confirmDeleteItem}
                onCancel={() => {
                    setShowDeleteModal(false);
                    setItemToDelete(null);
                }}
                title="Delete Agenda Item"
                message="Are you sure you want to delete this agenda item? This will remove the item from the agenda."
                warningDetails="This action cannot be undone."
            />

        </div>
    );
}

export default AgendaBuilder;
