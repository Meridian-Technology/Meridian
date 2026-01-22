import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify-icon/react';
import Popup from '../../../../../../components/Popup/Popup';
import './AgendaBuilder.scss';

function AgendaItemEditor({ item, onSave, onCancel }) {
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        durationMinutes: '',
        type: 'Activity',
        location: '',
        isPublic: true
    });

    useEffect(() => {
        if (item) {
            setFormData({
                title: item.title || '',
                description: item.description || '',
                durationMinutes: item.durationMinutes || '',
                type: item.type || 'Activity',
                location: item.location || '',
                isPublic: item.isPublic !== undefined ? item.isPublic : true
            });
        }
    }, [item]);

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        
        const itemData = {
            ...item,
            ...formData,
            durationMinutes: formData.durationMinutes ? parseInt(formData.durationMinutes, 10) : null
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
                            <label>
                                Duration (minutes) <span className="required">*</span>
                            </label>
                            <input
                                type="number"
                                min="1"
                                value={formData.durationMinutes}
                                onChange={(e) => handleChange('durationMinutes', e.target.value)}
                                placeholder="e.g., 30"
                                required
                            />
                            <p className="help-text">Start/end times are auto-calculated from the event start.</p>
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
