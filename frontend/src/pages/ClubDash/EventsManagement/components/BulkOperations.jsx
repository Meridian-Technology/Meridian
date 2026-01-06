import React, { useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { useNotification } from '../../../../NotificationContext';
import apiRequest from '../../../../utils/postRequest';
import './BulkOperations.scss';

function BulkOperations({ orgId, selectedEvents, onClose, onSuccess }) {
    const { addNotification } = useNotification();
    const [action, setAction] = useState('');
    const [loading, setLoading] = useState(false);

    const handleBulkAction = async () => {
        if (!action) {
            addNotification({
                title: 'No Action Selected',
                message: 'Please select an action to perform',
                type: 'warning'
            });
            return;
        }

        setLoading(true);
        try {
            const response = await apiRequest(
                `/org-event-management/${orgId}/events/bulk-action`,
                {
                    action,
                    eventIds: selectedEvents
                },
                { method: 'POST' }
            );

            if (response.success) {
                addNotification({
                    title: 'Success',
                    message: response.message,
                    type: 'success'
                });
                onSuccess();
                onClose();
            } else {
                throw new Error(response.message || 'Action failed');
            }
        } catch (error) {
            addNotification({
                title: 'Error',
                message: error.message || 'Failed to perform bulk action',
                type: 'error'
            });
        } finally {
            setLoading(false);
        }
    };

    const getActionIcon = (actionType) => {
        const icons = {
            'approve': 'mdi:check',
            'reject': 'mdi:close',
            'delete': 'mdi:delete',
            'archive': 'mdi:archive'
        };
        return icons[actionType] || 'mdi:cog';
    };

    const getActionColor = (actionType) => {
        const colors = {
            'approve': '#28a745',
            'reject': '#dc3545',
            'delete': '#dc3545',
            'archive': '#6c757d'
        };
        return colors[actionType] || '#6c757d';
    };

    const getActionDescription = (actionType) => {
        const descriptions = {
            'approve': 'Approve all selected events',
            'reject': 'Reject all selected events',
            'delete': 'Delete all selected events (cannot be undone)',
            'archive': 'Archive all selected events'
        };
        return descriptions[actionType] || 'Perform action on selected events';
    };

    return (
        <div className="bulk-operations-panel">
            <div className="bulk-header">
                <div className="header-content">
                    <h3>Bulk Operations</h3>
                    <p>{selectedEvents.length} events selected</p>
                </div>
                <button className="close-btn" onClick={onClose}>
                    <Icon icon="mdi:close" />
                </button>
            </div>

            <div className="bulk-content">
                <div className="action-selection">
                    <h4>Select Action</h4>
                    <div className="action-options">
                        <button
                            className={`action-option ${action === 'approve' ? 'selected' : ''}`}
                            onClick={() => setAction('approve')}
                        >
                            <Icon icon="mdi:check" />
                            <span>Approve</span>
                        </button>
                        <button
                            className={`action-option ${action === 'reject' ? 'selected' : ''}`}
                            onClick={() => setAction('reject')}
                        >
                            <Icon icon="mdi:close" />
                            <span>Reject</span>
                        </button>
                        <button
                            className={`action-option ${action === 'archive' ? 'selected' : ''}`}
                            onClick={() => setAction('archive')}
                        >
                            <Icon icon="mdi:archive" />
                            <span>Archive</span>
                        </button>
                        <button
                            className={`action-option ${action === 'delete' ? 'selected' : ''}`}
                            onClick={() => setAction('delete')}
                        >
                            <Icon icon="mdi:delete" />
                            <span>Delete</span>
                        </button>
                    </div>
                </div>

                {action && (
                    <div className="action-preview">
                        <div className="preview-header">
                            <Icon 
                                icon={getActionIcon(action)} 
                                style={{ color: getActionColor(action) }}
                            />
                            <h4>Action Preview</h4>
                        </div>
                        <p>{getActionDescription(action)}</p>
                        <div className="preview-details">
                            <div className="detail-item">
                                <span className="label">Action:</span>
                                <span className="value">{action.charAt(0).toUpperCase() + action.slice(1)}</span>
                            </div>
                            <div className="detail-item">
                                <span className="label">Events:</span>
                                <span className="value">{selectedEvents.length}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="bulk-footer">
                <button className="cancel-btn" onClick={onClose}>
                    Cancel
                </button>
                <button 
                    className="execute-btn"
                    onClick={handleBulkAction}
                    disabled={!action || loading}
                    style={{ backgroundColor: action ? getActionColor(action) : '#6c757d' }}
                >
                    {loading ? (
                        <>
                            <Icon icon="mdi:loading" className="spinner" />
                            <span>Processing...</span>
                        </>
                    ) : (
                        <>
                            <Icon icon={getActionIcon(action)} />
                            <span>Execute Action</span>
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}

export default BulkOperations;
