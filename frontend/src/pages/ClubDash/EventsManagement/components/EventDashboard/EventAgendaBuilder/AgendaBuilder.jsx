import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../../../hooks/useFetch';
import { useNotification } from '../../../../../../NotificationContext';
import apiRequest from '../../../../../../utils/postRequest';
import DraggableList from '../../../../../../components/DraggableList/DraggableList';
import AgendaItem from './AgendaItem';
import AgendaItemEditor from './AgendaItemEditor';
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

    // Fetch agenda
    const { data: agendaData, loading, refetch } = useFetch(
        event?._id && orgId ? `/org-event-management/${orgId}/events/${event._id}/agenda` : null
    );

    useEffect(() => {
        if (agendaData?.success && agendaData.data?.agenda) {
            const agenda = agendaData.data.agenda;
            setIsPublished(agenda.isPublished || false);
            const agendaItems = (agenda.items || []).map(item => {
                if (!item.durationMinutes && item.startTime && item.endTime) {
                    const start = new Date(item.startTime);
                    const end = new Date(item.endTime);
                    const diffMinutes = Math.max(1, Math.round((end - start) / 60000));
                    return { ...item, durationMinutes: diffMinutes };
                }
                return item;
            });
            setItems(agendaItems);
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
        if (!event?._id || !orgId) return;

        setSaving(true);
        try {
            const sanitizedItems = itemsToSave.map(({ startTime, endTime, ...rest }) => rest);
            const response = await apiRequest(
                `/org-event-management/${orgId}/events/${event._id}/agenda`,
                { items: sanitizedItems },
                { method: 'POST' }
            );

            if (response.success) {
                // When items are saved, agenda becomes unpublished
                setIsPublished(false);
                if (onRefresh) onRefresh();
            } else {
                throw new Error(response.message || 'Failed to save agenda');
            }
        } catch (error) {
            addNotification({
                title: 'Error',
                message: error.message || 'Failed to save agenda',
                type: 'error'
            });
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

        const agendaDuration = items.reduce((total, item) => {
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

            {items.length === 0 ? (
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
