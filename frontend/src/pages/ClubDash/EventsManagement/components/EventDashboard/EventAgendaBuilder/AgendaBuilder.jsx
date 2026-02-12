import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../../../hooks/useFetch';
import { useNotification } from '../../../../../../NotificationContext';
import apiRequest from '../../../../../../utils/postRequest';
import AgendaItem from './AgendaItem';
import AgendaItemEditor from './AgendaItemEditor';
import AgendaDailyCalendar from './AgendaDailyCalendar/AgendaDailyCalendar';
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
    const [viewMode, setViewMode] = useState('creator'); // 'creator' | 'calendar'

    const { data: agendaData, loading, refetch } = useFetch(
        event?._id && orgId ? `/org-event-management/${orgId}/events/${event._id}/agenda` : null
    );

    useEffect(() => {
        if (agendaData?.success && agendaData.data?.agenda) {
            const agenda = agendaData.data.agenda;
            setIsPublished(agenda.isPublished || false);
            const eventStart = event?.start_time ? new Date(event.start_time) : new Date();
            let cursor = new Date(eventStart);
            const agendaItems = (agenda.items || []).map((item, index) => {
                const normalizedItem = { ...item };
                if (item.startTime && typeof item.startTime === 'string') {
                    normalizedItem.startTime = new Date(item.startTime);
                }
                if (item.endTime && typeof item.endTime === 'string') {
                    normalizedItem.endTime = new Date(item.endTime);
                }
                if (!normalizedItem.startTime || !normalizedItem.endTime) {
                    const duration = parseInt(item.durationMinutes, 10) || 30;
                    normalizedItem.startTime = new Date(cursor);
                    normalizedItem.endTime = new Date(cursor);
                    normalizedItem.endTime.setMinutes(normalizedItem.endTime.getMinutes() + duration);
                    cursor = new Date(normalizedItem.endTime);
                } else {
                    cursor = new Date(normalizedItem.endTime);
                }
                return normalizedItem;
            });
            setItems(agendaItems);
        }
    }, [agendaData, event?.start_time]);

    const saveAgenda = async (itemsToSave = items) => {
        if (!event?._id || !orgId) {
            return { success: false, message: 'Missing event ID or org ID' };
        }

        setSaving(true);
        try {
            const sanitizedItems = itemsToSave.map((item) => {
                const { durationMinutes, ...rest } = item;
                const sanitized = { ...rest };
                if (item.startTime) {
                    sanitized.startTime =
                        typeof item.startTime === 'string'
                            ? item.startTime
                            : new Date(item.startTime).toISOString();
                }
                if (item.endTime) {
                    sanitized.endTime =
                        typeof item.endTime === 'string'
                            ? item.endTime
                            : new Date(item.endTime).toISOString();
                }
                return sanitized;
            });
            const response = await apiRequest(
                `/org-event-management/${orgId}/events/${event._id}/agenda`,
                { items: sanitizedItems },
                { method: 'POST' }
            );

            if (response.success) {
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

    const getLatestItemEnd = () => {
        if (items.length === 0) {
            return event?.start_time ? new Date(event.start_time) : new Date();
        }
        const ordered = [...items].sort((a, b) => (a.order || 0) - (b.order || 0));
        const last = ordered[ordered.length - 1];
        return last.endTime ? new Date(last.endTime) : new Date(event?.start_time || Date.now());
    };

    const handleAddItem = () => {
        const latestEnd = getLatestItemEnd();
        const startTime = new Date(latestEnd);
        const endTime = new Date(latestEnd);
        endTime.setMinutes(endTime.getMinutes() + 30);

        const newItem = {
            id: `item-${Date.now()}`,
            title: 'New Agenda Item',
            description: '',
            startTime,
            endTime,
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
                setItems(items.filter((item) => item.id !== itemToDelete));
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
        const { durationMinutes, ...rest } = itemData;
        const sanitized = { ...rest };
        if (itemData.startTime) {
            sanitized.startTime =
                itemData.startTime instanceof Date
                    ? itemData.startTime
                    : new Date(itemData.startTime);
        }
        if (itemData.endTime) {
            sanitized.endTime =
                itemData.endTime instanceof Date ? itemData.endTime : new Date(itemData.endTime);
        }

        const existingIndex = items.findIndex((item) => item.id === sanitized.id);
        let updatedItems;

        if (existingIndex >= 0) {
            updatedItems = [...items];
            updatedItems[existingIndex] = { ...sanitized, order: updatedItems[existingIndex].order };
        } else {
            updatedItems = [...items, { ...sanitized, order: items.length }];
        }

        setItems(updatedItems);
        setEditingItem(null);
        await saveAgenda(updatedItems);
    };

    const calculateTimeDifference = () => {
        if (!event?.start_time || !event?.end_time || items.length === 0) {
            return null;
        }

        const agendaDuration = items.reduce((total, item) => {
            if (item.startTime && item.endTime) {
                const start = new Date(item.startTime);
                const end = new Date(item.endTime);
                return total + Math.round((end - start) / 60000);
            }
            return total;
        }, 0);

        const eventStart = new Date(event.start_time);
        const eventEnd = new Date(event.end_time);
        const eventDuration = Math.round((eventEnd - eventStart) / 60000);
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
                                <Icon icon={timeDiff.isOver ? 'mdi:alert-circle' : 'mdi:alert-circle-outline'} />
                                {timeDiff.isOver
                                    ? `${Math.abs(timeDiff.difference)} min over`
                                    : `${Math.abs(timeDiff.difference)} min under`}
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
                    <div className="view-toggle">
                        <label className="view-label">View:</label>
                        <button
                            className={`view-btn ${viewMode === 'creator' ? 'active' : ''}`}
                            onClick={() => setViewMode('creator')}
                            title="Creator View - Sequential list of items"
                        >
                            <Icon icon="mdi:format-list-numbered" />
                            <span>List</span>
                        </button>
                        <button
                            className={`view-btn ${viewMode === 'calendar' ? 'active' : ''}`}
                            onClick={() => setViewMode('calendar')}
                            title="Calendar View - Google-style timeline"
                        >
                            <Icon icon="mdi:view-timeline" />
                            <span>Calendar</span>
                        </button>
                    </div>
                    <button className="btn-primary" onClick={handleAddItem}>
                        <Icon icon="mdi:plus" />
                        <span>Add Item</span>
                    </button>
                    {!isPublished && items.length > 0 && (
                        <button
                            className="btn-publish"
                            onClick={handlePublish}
                            disabled={publishing}
                        >
                            <Icon
                                icon={publishing ? 'mdi:loading' : 'mdi:publish'}
                                className={publishing ? 'spinner' : ''}
                            />
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

            {viewMode === 'calendar' ? (
                <div className="agenda-calendar-wrapper">
                    <AgendaDailyCalendar
                        agendaItems={items}
                        event={event}
                        minuteHeight={4}
                        onEditItem={handleEditItem}
                        height="600px"
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
                    {[...items]
                        .sort((a, b) => (a.order || 0) - (b.order || 0))
                        .map((item) => (
                            <AgendaItem
                                key={item.id}
                                item={item}
                                onEdit={() => handleEditItem(item)}
                                onDelete={() => handleDeleteItem(item.id)}
                            />
                        ))}
                </div>
            )}

            {editingItem && (
                <AgendaItemEditor
                    item={editingItem}
                    event={event}
                    latestItemEnd={items.length > 0 ? getLatestItemEnd() : null}
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
