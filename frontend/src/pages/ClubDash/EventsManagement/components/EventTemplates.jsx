import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch } from '../../../../hooks/useFetch';
import { useNotification } from '../../../../NotificationContext';
import apiRequest from '../../../../utils/postRequest';
import './EventTemplates.scss';

function EventTemplates({ orgId, orgName, refreshTrigger, onRefresh }) {
    const { addNotification } = useNotification();
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [templateForm, setTemplateForm] = useState({
        name: '',
        description: '',
        templateData: {
            name: '',
            type: 'meeting',
            location: '',
            description: '',
            expectedAttendance: 50,
            visibility: 'public',
            contact: '',
            rsvpEnabled: false,
            rsvpRequired: false,
            maxAttendees: null,
            externalLink: ''
        }
    });
    
    // Fetch templates data
    const { data: templatesData, loading, error, refetch } = useFetch(
        orgId ? `/org-event-management/${orgId}/event-templates` : null
    );

    // Refetch when refreshTrigger changes
    useEffect(() => {
        if (refreshTrigger > 0) {
            refetch();
        }
    }, [refreshTrigger, refetch]);

    const handleInputChange = (field, value) => {
        if (field.startsWith('templateData.')) {
            const templateField = field.replace('templateData.', '');
            setTemplateForm(prev => ({
                ...prev,
                templateData: {
                    ...prev.templateData,
                    [templateField]: value
                }
            }));
        } else {
            setTemplateForm(prev => ({
                ...prev,
                [field]: value
            }));
        }
    };

    const handleCreateTemplate = async () => {
        try {
            const response = await apiRequest(
                `/org-event-management/${orgId}/event-templates`,
                templateForm,
                { method: 'POST' }
            );

            if (response.success) {
                addNotification({
                    title: 'Success',
                    message: 'Event template created successfully',
                    type: 'success'
                });
                setShowCreateModal(false);
                resetForm();
                onRefresh();
            } else {
                throw new Error(response.message || 'Failed to create template');
            }
        } catch (error) {
            addNotification({
                title: 'Error',
                message: error.message || 'Failed to create template',
                type: 'error'
            });
        }
    };

    const handleUpdateTemplate = async () => {
        try {
            const response = await apiRequest(
                `/org-event-management/${orgId}/event-templates/${editingTemplate._id}`,
                templateForm,
                { method: 'PUT' }
            );

            if (response.success) {
                addNotification({
                    title: 'Success',
                    message: 'Event template updated successfully',
                    type: 'success'
                });
                setEditingTemplate(null);
                resetForm();
                onRefresh();
            } else {
                throw new Error(response.message || 'Failed to update template');
            }
        } catch (error) {
            addNotification({
                title: 'Error',
                message: error.message || 'Failed to update template',
                type: 'error'
            });
        }
    };

    const handleDeleteTemplate = async (templateId) => {
        if (!window.confirm('Are you sure you want to delete this template?')) {
            return;
        }

        try {
            const response = await apiRequest(
                `/org-event-management/${orgId}/event-templates/${templateId}`,
                {},
                { method: 'DELETE' }
            );

            if (response.success) {
                addNotification({
                    title: 'Success',
                    message: 'Event template deleted successfully',
                    type: 'success'
                });
                onRefresh();
            } else {
                throw new Error(response.message || 'Failed to delete template');
            }
        } catch (error) {
            addNotification({
                title: 'Error',
                message: error.message || 'Failed to delete template',
                type: 'error'
            });
        }
    };

    const handleCreateEventFromTemplate = async (templateId) => {
        // This would open a modal to set the event date/time
        // For now, we'll just show a notification
        addNotification({
            title: 'Feature Coming Soon',
            message: 'Creating events from templates will be available soon',
            type: 'info'
        });
    };

    const resetForm = () => {
        setTemplateForm({
            name: '',
            description: '',
            templateData: {
                name: '',
                type: 'meeting',
                location: '',
                description: '',
                expectedAttendance: 50,
                visibility: 'public',
                contact: '',
                rsvpEnabled: false,
                rsvpRequired: false,
                maxAttendees: null,
                externalLink: ''
            }
        });
    };

    const openEditModal = (template) => {
        setEditingTemplate(template);
        setTemplateForm({
            name: template.name,
            description: template.description,
            templateData: { ...template.templateData }
        });
        setShowCreateModal(true);
    };

    const closeModal = () => {
        setShowCreateModal(false);
        setEditingTemplate(null);
        resetForm();
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (loading) {
        return (
            <div className="event-templates loading">
                <div className="loading-spinner">
                    <Icon icon="mdi:loading" className="spinner" />
                    <p>Loading templates...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="event-templates error">
                <Icon icon="mdi:alert-circle" />
                <p>Error loading templates: {error}</p>
            </div>
        );
    }

    const templates = templatesData?.data || [];

    return (
        <div className="event-templates">
            <div className="templates-header">
                <div className="header-content">
                    <h2>Event Templates</h2>
                    <p>Create reusable templates for your organization's events</p>
                </div>
                <div className="header-actions">
                    <button 
                        className="create-btn"
                        onClick={() => setShowCreateModal(true)}
                    >
                        <Icon icon="mingcute:add-fill" />
                        <span>Create Template</span>
                    </button>
                </div>
            </div>

            {/* Templates Grid */}
            <div className="templates-grid">
                {templates.map((template) => (
                    <div key={template._id} className="template-card">
                        <div className="template-header">
                            <h3>{template.name}</h3>
                            <div className="template-actions">
                                <button 
                                    className="action-btn edit"
                                    onClick={() => openEditModal(template)}
                                    title="Edit Template"
                                >
                                    <Icon icon="mdi:pencil" />
                                </button>
                                <button 
                                    className="action-btn delete"
                                    onClick={() => handleDeleteTemplate(template._id)}
                                    title="Delete Template"
                                >
                                    <Icon icon="mdi:delete" />
                                </button>
                            </div>
                        </div>
                        
                        <div className="template-content">
                            {template.description && (
                                <p className="template-description">{template.description}</p>
                            )}
                            
                            <div className="template-details">
                                <div className="detail-item">
                                    <Icon icon="mingcute:calendar-fill" />
                                    <span>Type: {template.templateData.type}</span>
                                </div>
                                <div className="detail-item">
                                    <Icon icon="fluent:location-28-filled" />
                                    <span>Location: {template.templateData.location}</span>
                                </div>
                                <div className="detail-item">
                                    <Icon icon="mingcute:group-fill" />
                                    <span>Expected: {template.templateData.expectedAttendance} people</span>
                                </div>
                                <div className="detail-item">
                                    <Icon icon="mdi:eye" />
                                    <span>Visibility: {template.templateData.visibility}</span>
                                </div>
                            </div>

                            <div className="template-stats">
                                <div className="stat">
                                    <span className="stat-label">Used:</span>
                                    <span className="stat-value">{template.usageCount} times</span>
                                </div>
                                <div className="stat">
                                    <span className="stat-label">Created:</span>
                                    <span className="stat-value">{formatDate(template.createdAt)}</span>
                                </div>
                            </div>
                        </div>

                        <div className="template-footer">
                            <button 
                                className="use-template-btn"
                                onClick={() => handleCreateEventFromTemplate(template._id)}
                            >
                                <Icon icon="mingcute:calendar-add-fill" />
                                <span>Create Event</span>
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Empty State */}
            {templates.length === 0 && (
                <div className="empty-state">
                    <Icon icon="mingcute:file-template-fill" />
                    <h3>No Templates Yet</h3>
                    <p>Create your first event template to streamline event creation</p>
                    <button 
                        className="create-btn"
                        onClick={() => setShowCreateModal(true)}
                    >
                        <Icon icon="mingcute:add-fill" />
                        <span>Create Your First Template</span>
                    </button>
                </div>
            )}

            {/* Create/Edit Modal */}
            {showCreateModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h3>{editingTemplate ? 'Edit Template' : 'Create Template'}</h3>
                            <button className="close-btn" onClick={closeModal}>
                                <Icon icon="mdi:close" />
                            </button>
                        </div>

                        <div className="modal-body">
                            <div className="form-group">
                                <label>Template Name</label>
                                <input
                                    type="text"
                                    value={templateForm.name}
                                    onChange={(e) => handleInputChange('name', e.target.value)}
                                    placeholder="Enter template name"
                                />
                            </div>

                            <div className="form-group">
                                <label>Template Description</label>
                                <textarea
                                    value={templateForm.description}
                                    onChange={(e) => handleInputChange('description', e.target.value)}
                                    placeholder="Enter template description"
                                    rows="3"
                                />
                            </div>

                            <div className="form-section">
                                <h4>Event Details</h4>
                                
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Event Name Template</label>
                                        <input
                                            type="text"
                                            value={templateForm.templateData.name}
                                            onChange={(e) => handleInputChange('templateData.name', e.target.value)}
                                            placeholder="e.g., Weekly Meeting"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Event Type</label>
                                        <select
                                            value={templateForm.templateData.type}
                                            onChange={(e) => handleInputChange('templateData.type', e.target.value)}
                                        >
                                            <option value="meeting">Meeting</option>
                                            <option value="campus">Campus</option>
                                            <option value="study">Study</option>
                                            <option value="sports">Sports</option>
                                            <option value="alumni">Alumni</option>
                                            <option value="arts">Arts</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label>Location</label>
                                    <input
                                        type="text"
                                        value={templateForm.templateData.location}
                                        onChange={(e) => handleInputChange('templateData.location', e.target.value)}
                                        placeholder="Enter default location"
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Description Template</label>
                                    <textarea
                                        value={templateForm.templateData.description}
                                        onChange={(e) => handleInputChange('templateData.description', e.target.value)}
                                        placeholder="Enter default description"
                                        rows="3"
                                    />
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Expected Attendance</label>
                                        <input
                                            type="number"
                                            value={templateForm.templateData.expectedAttendance}
                                            onChange={(e) => handleInputChange('templateData.expectedAttendance', parseInt(e.target.value))}
                                            min="1"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Visibility</label>
                                        <select
                                            value={templateForm.templateData.visibility}
                                            onChange={(e) => handleInputChange('templateData.visibility', e.target.value)}
                                        >
                                            <option value="public">Public</option>
                                            <option value="private">Private</option>
                                            <option value="members">Members Only</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label>Contact Information</label>
                                    <input
                                        type="text"
                                        value={templateForm.templateData.contact}
                                        onChange={(e) => handleInputChange('templateData.contact', e.target.value)}
                                        placeholder="Enter contact information"
                                    />
                                </div>

                                <div className="form-row">
                                    <div className="form-group checkbox">
                                        <label>
                                            <input
                                                type="checkbox"
                                                checked={templateForm.templateData.rsvpEnabled}
                                                onChange={(e) => handleInputChange('templateData.rsvpEnabled', e.target.checked)}
                                            />
                                            Enable RSVP
                                        </label>
                                    </div>
                                    <div className="form-group checkbox">
                                        <label>
                                            <input
                                                type="checkbox"
                                                checked={templateForm.templateData.rsvpRequired}
                                                onChange={(e) => handleInputChange('templateData.rsvpRequired', e.target.checked)}
                                            />
                                            Require RSVP
                                        </label>
                                    </div>
                                </div>

                                {templateForm.templateData.rsvpEnabled && (
                                    <div className="form-group">
                                        <label>Max Attendees</label>
                                        <input
                                            type="number"
                                            value={templateForm.templateData.maxAttendees || ''}
                                            onChange={(e) => handleInputChange('templateData.maxAttendees', e.target.value ? parseInt(e.target.value) : null)}
                                            min="1"
                                            placeholder="Leave empty for unlimited"
                                        />
                                    </div>
                                )}

                                <div className="form-group">
                                    <label>External Link</label>
                                    <input
                                        type="url"
                                        value={templateForm.templateData.externalLink}
                                        onChange={(e) => handleInputChange('templateData.externalLink', e.target.value)}
                                        placeholder="Enter external link (optional)"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="modal-footer">
                            <button className="cancel-btn" onClick={closeModal}>
                                Cancel
                            </button>
                            <button 
                                className="save-btn"
                                onClick={editingTemplate ? handleUpdateTemplate : handleCreateTemplate}
                            >
                                {editingTemplate ? 'Update Template' : 'Create Template'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default EventTemplates;
