import React, { useState } from 'react';
import apiRequest from '../../../../utils/postRequest';
import './ModalContent.scss';

const CreateQRModal = ({ onClose, onSuccess, handleClose }) => {
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        redirectUrl: '',
        isActive: true,
        tags: [],
        location: '',
        campaign: ''
    });
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const response = await apiRequest('/api/qr', formData, { method: 'POST' });
            if (response.error) {
                setError(response.error);
            } else {
                onSuccess();
                onClose();
            }
        } catch (err) {
            setError('Failed to create QR code');
        } finally {
            setLoading(false);
        }
    };

    const onCloseClick = () => {
        handleClose();
        if (!loading) {
            onClose();
        }
    };

    return (
        <div className="qr-modal-content">
            <h2>Create New QR Code</h2>
            {error && (
                <div className="error-message">
                    {error}
                    <button onClick={() => setError(null)}>×</button>
                </div>
            )}
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label>Name *</label>
                    <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        required
                        disabled={loading}
                    />
                </div>
                <div className="form-group">
                    <label>Description</label>
                    <textarea
                        value={formData.description}
                        onChange={(e) => setFormData({...formData, description: e.target.value})}
                        disabled={loading}
                    />
                </div>
                <div className="form-group">
                    <label>Redirect URL *</label>
                    <input
                        type="text"
                        value={formData.redirectUrl}
                        onChange={(e) => setFormData({...formData, redirectUrl: e.target.value})}
                        placeholder="e.g., /room/none or https://example.com"
                        required
                        disabled={loading}
                    />
                    <small className="form-help">
                        Enter a relative URL (e.g., /room/none, /events) or absolute URL (e.g., https://example.com)
                    </small>
                </div>
                <div className="form-group">
                    <label>Location</label>
                    <input
                        type="text"
                        value={formData.location}
                        onChange={(e) => setFormData({...formData, location: e.target.value})}
                        disabled={loading}
                    />
                </div>
                <div className="form-group">
                    <label>Campaign</label>
                    <input
                        type="text"
                        value={formData.campaign}
                        onChange={(e) => setFormData({...formData, campaign: e.target.value})}
                        disabled={loading}
                    />
                </div>
                <div className="form-group">
                    <label>
                        <input
                            type="checkbox"
                            checked={formData.isActive}
                            onChange={(e) => setFormData({...formData, isActive: e.target.checked})}
                            disabled={loading}
                        />
                        Active
                    </label>
                </div>
                <div className="modal-actions">
                    <button type="button" onClick={onCloseClick} disabled={loading}>
                        Cancel
                    </button>
                    <button type="submit" disabled={loading}>
                        {loading ? 'Creating...' : 'Create'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default CreateQRModal;
