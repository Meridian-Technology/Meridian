import React, { useState } from 'react';
import { Icon } from '@iconify-icon/react';
import './ResourceEditorModal.scss';

function ResourceEditorModal({ 
  resource, 
  onSave, 
  onCancel 
}) {
  const isEditing = !!resource;
  
  const [formData, setFormData] = useState({
    id: resource?.id || '',
    title: resource?.title || '',
    description: resource?.description || '',
    icon: resource?.icon || '',
    color: resource?.color || '#6D8EFA',
    type: resource?.type || 'link',
    url: resource?.url || '',
    subtitle: resource?.subtitle || '',
    action: resource?.action || '',
    details: {
      hours: resource?.details?.hours || '',
      location: resource?.details?.location || '',
      capacity: resource?.details?.capacity || '',
      features: resource?.details?.features || []
    }
  });

  const [formErrors, setFormErrors] = useState({});

  const validateForm = () => {
    const errors = {};
    
    if (!formData.id.trim()) {
      errors.id = 'ID is required';
    }
    if (!formData.title.trim()) {
      errors.title = 'Title is required';
    }
    if (!formData.description.trim()) {
      errors.description = 'Description is required';
    }
    if (!formData.icon.trim()) {
      errors.icon = 'Icon is required';
    }
    
    if (formData.type === 'link' && !formData.url.trim()) {
      errors.url = 'URL is required for link resources';
    }
    if (formData.type === 'subpage' && !formData.subtitle.trim()) {
      errors.subtitle = 'Subtitle is required for subpage resources';
    }
    if (formData.type === 'action' && !formData.action.trim()) {
      errors.action = 'Action is required for action resources';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = () => {
    if (!validateForm()) return;
    
    const resourceData = {
      id: formData.id.trim(),
      title: formData.title.trim(),
      description: formData.description.trim(),
      icon: formData.icon.trim(),
      color: formData.color,
      type: formData.type
    };
    
    if (formData.type === 'link') {
      resourceData.url = formData.url.trim();
    } else if (formData.type === 'subpage') {
      resourceData.subtitle = formData.subtitle.trim();
      resourceData.subResources = resource?.type === 'subpage' && resource.subResources
        ? resource.subResources
        : [];
    } else if (formData.type === 'action') {
      resourceData.action = formData.action.trim();
    }
    
    if (formData.details.hours || formData.details.location || formData.details.capacity || formData.details.features.length > 0) {
      resourceData.details = {
        ...(formData.details.hours && { hours: formData.details.hours }),
        ...(formData.details.location && { location: formData.details.location }),
        ...(formData.details.capacity && { capacity: formData.details.capacity }),
        ...(formData.details.features.length > 0 && { features: formData.details.features.filter(f => f.trim()) })
      };
    }
    
    onSave(resourceData);
  };

  return (
    <div className="resource-editor-modal">
      {/* Header */}
      <div className="resource-editor-header">
        <div className="resource-editor-header-content">
          <div className="resource-editor-header-icon">
            <Icon icon={isEditing ? "mdi:pencil" : "mdi:plus"} />
          </div>
          <div className="resource-editor-header-text">
            <h2>{isEditing ? 'Edit Resource' : 'New Resource'}</h2>
            <p>{isEditing 
              ? 'Update the resource configuration' 
              : 'Configure a new resource for the mobile app'}</p>
          </div>
        </div>
      </div>

      {/* Form Body */}
      <div className="resource-editor-body">
        {/* Basic Information Section */}
        <div className="resource-editor-section">
          <div className="resource-editor-section-label">
            <span className="resource-editor-section-number">01</span>
            <span className="resource-editor-section-title">Basic Information</span>
          </div>
          <div className="resource-editor-grid">
            <div className="resource-editor-field">
              <label className="resource-editor-label">
                Resource ID <span className="resource-editor-required">*</span>
              </label>
              <input
                type="text"
                className={`resource-editor-input ${formErrors.id ? 'resource-editor-input-error' : ''}`}
                value={formData.id}
                onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                placeholder="e.g., shuttle-schedule"
              />
              {formErrors.id && <div className="resource-editor-error">{formErrors.id}</div>}
            </div>

            <div className="resource-editor-field">
              <label className="resource-editor-label">
                Title <span className="resource-editor-required">*</span>
              </label>
              <input
                type="text"
                className={`resource-editor-input ${formErrors.title ? 'resource-editor-input-error' : ''}`}
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., RPI Shuttle Schedule"
              />
              {formErrors.title && <div className="resource-editor-error">{formErrors.title}</div>}
            </div>

            <div className="resource-editor-field resource-editor-field-full">
              <label className="resource-editor-label">
                Description <span className="resource-editor-required">*</span>
              </label>
              <textarea
                className={`resource-editor-input resource-editor-textarea ${formErrors.description ? 'resource-editor-input-error' : ''}`}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of what this resource provides"
                rows={3}
              />
              {formErrors.description && <div className="resource-editor-error">{formErrors.description}</div>}
            </div>

            <div className="resource-editor-field">
              <label className="resource-editor-label">
                Icon <span className="resource-editor-required">*</span>
              </label>
              <div className="resource-editor-icon-field">
                <div className="resource-editor-icon-preview">
                  <Icon icon={`ionicons:${formData.icon || 'help-circle-outline'}`} />
                </div>
                <input
                  type="text"
                  className={`resource-editor-input ${formErrors.icon ? 'resource-editor-input-error' : ''}`}
                  value={formData.icon}
                  onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                  placeholder="bus-outline"
                />
              </div>
              {formErrors.icon && <div className="resource-editor-error">{formErrors.icon}</div>}
              <div className="resource-editor-help">Ionicons name (e.g., bus-outline, restaurant-outline)</div>
            </div>

            <div className="resource-editor-field">
              <label className="resource-editor-label">Color</label>
              <div className="resource-editor-color-field">
                <div className="resource-editor-color-preview-wrapper">
                  <div 
                    className="resource-editor-color-preview" 
                    style={{ backgroundColor: formData.color }}
                  />
                  <input
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="resource-editor-color-picker"
                  />
                </div>
                <input
                  type="text"
                  className="resource-editor-input"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  placeholder="#6D8EFA"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Resource Type Section */}
        <div className="resource-editor-section">
          <div className="resource-editor-section-label">
            <span className="resource-editor-section-number">02</span>
            <span className="resource-editor-section-title">Resource Type</span>
          </div>
          <div className="resource-editor-grid">
            <div className="resource-editor-field resource-editor-field-full">
              <label className="resource-editor-label">
                Type <span className="resource-editor-required">*</span>
              </label>
              <div className="resource-editor-type-selector">
                <button
                  type="button"
                  className={`resource-editor-type-card ${formData.type === 'link' ? 'resource-editor-type-active' : ''}`}
                  onClick={() => setFormData({ ...formData, type: 'link' })}
                >
                  <div className="resource-editor-type-icon">
                    <Icon icon="mdi:link-variant" />
                  </div>
                  <div className="resource-editor-type-content">
                    <div className="resource-editor-type-name">Link</div>
                    <div className="resource-editor-type-desc">Opens external URL</div>
                  </div>
                </button>
                <button
                  type="button"
                  className={`resource-editor-type-card ${formData.type === 'subpage' ? 'resource-editor-type-active' : ''}`}
                  onClick={() => setFormData({ ...formData, type: 'subpage' })}
                >
                  <div className="resource-editor-type-icon">
                    <Icon icon="mdi:folder-multiple-outline" />
                  </div>
                  <div className="resource-editor-type-content">
                    <div className="resource-editor-type-name">Subpage</div>
                    <div className="resource-editor-type-desc">Contains sub-resources</div>
                  </div>
                </button>
                <button
                  type="button"
                  className={`resource-editor-type-card ${formData.type === 'action' ? 'resource-editor-type-active' : ''}`}
                  onClick={() => setFormData({ ...formData, type: 'action' })}
                >
                  <div className="resource-editor-type-icon">
                    <Icon icon="mdi:gesture-tap-button" />
                  </div>
                  <div className="resource-editor-type-content">
                    <div className="resource-editor-type-name">Action</div>
                    <div className="resource-editor-type-desc">Triggers app action</div>
                  </div>
                </button>
              </div>
            </div>

            {formData.type === 'link' && (
              <div className="resource-editor-field resource-editor-field-full">
                <label className="resource-editor-label">
                  URL <span className="resource-editor-required">*</span>
                </label>
                <input
                  type="url"
                  className={`resource-editor-input ${formErrors.url ? 'resource-editor-input-error' : ''}`}
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  placeholder="https://example.com"
                />
                {formErrors.url && <div className="resource-editor-error">{formErrors.url}</div>}
              </div>
            )}

            {formData.type === 'subpage' && (
              <div className="resource-editor-field resource-editor-field-full">
                <label className="resource-editor-label">
                  Subtitle <span className="resource-editor-required">*</span>
                </label>
                <input
                  type="text"
                  className={`resource-editor-input ${formErrors.subtitle ? 'resource-editor-input-error' : ''}`}
                  value={formData.subtitle}
                  onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                  placeholder="e.g., Choose a dining location"
                />
                {formErrors.subtitle && <div className="resource-editor-error">{formErrors.subtitle}</div>}
              </div>
            )}

            {formData.type === 'action' && (
              <div className="resource-editor-field resource-editor-field-full">
                <label className="resource-editor-label">
                  Action <span className="resource-editor-required">*</span>
                </label>
                <select
                  className={`resource-editor-input resource-editor-select ${formErrors.action ? 'resource-editor-input-error' : ''}`}
                  value={formData.action}
                  onChange={(e) => setFormData({ ...formData, action: e.target.value })}
                >
                  <option value="">Select an action</option>
                  <option value="navigate_to_study_rooms">Navigate to Study Rooms</option>
                  <option value="open_campus_map">Open Campus Map</option>
                  <option value="contact_support">Contact Support</option>
                  <option value="report_issue">Report Issue</option>
                </select>
                {formErrors.action && <div className="resource-editor-error">{formErrors.action}</div>}
              </div>
            )}
          </div>
        </div>

        {/* Additional Details Section */}
        <div className="resource-editor-section">
          <div className="resource-editor-section-label">
            <span className="resource-editor-section-number">03</span>
            <span className="resource-editor-section-title">Additional Details</span>
            <span className="resource-editor-optional">Optional</span>
          </div>
          <div className="resource-editor-grid">
            <div className="resource-editor-field resource-editor-field-full">
              <label className="resource-editor-label">Hours</label>
              <input
                type="text"
                className="resource-editor-input"
                value={formData.details.hours}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  details: { ...formData.details, hours: e.target.value }
                })}
                placeholder="e.g., Mon-Fri: 8:00 AM - 5:00 PM"
              />
            </div>
            <div className="resource-editor-field">
              <label className="resource-editor-label">Location</label>
              <input
                type="text"
                className="resource-editor-input"
                value={formData.details.location}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  details: { ...formData.details, location: e.target.value }
                })}
                placeholder="Building name"
              />
            </div>
            <div className="resource-editor-field">
              <label className="resource-editor-label">Capacity</label>
              <input
                type="text"
                className="resource-editor-input"
                value={formData.details.capacity}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  details: { ...formData.details, capacity: e.target.value }
                })}
                placeholder="e.g., 500+ seats"
              />
            </div>
            <div className="resource-editor-field resource-editor-field-full">
              <label className="resource-editor-label">Features</label>
              <input
                type="text"
                className="resource-editor-input"
                value={formData.details.features.join(', ')}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  details: { 
                    ...formData.details, 
                    features: e.target.value.split(',').map(f => f.trim()).filter(f => f)
                  }
                })}
                placeholder="Comma-separated list"
              />
              <div className="resource-editor-help">Separate multiple features with commas</div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="resource-editor-footer">
        <button 
          className="resource-editor-btn resource-editor-btn-secondary" 
          onClick={onCancel}
        >
          Cancel
        </button>
        <button 
          className="resource-editor-btn resource-editor-btn-primary" 
          onClick={handleSave}
        >
          {isEditing ? 'Save Changes' : 'Create Resource'}
        </button>
      </div>
    </div>
  );
}

export default ResourceEditorModal;

