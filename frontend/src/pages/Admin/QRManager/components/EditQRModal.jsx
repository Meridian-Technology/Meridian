import React, { useState, useEffect } from 'react';
import apiRequest from '../../../../utils/postRequest';
import './ModalContent.scss';

const EditQRModal = ({ qrCode, onClose, onSuccess }) => {
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

    // Initialize form data when qrCode changes
    useEffect(() => {
        if (qrCode) {
            setFormData({
                name: qrCode.name,
                description: qrCode.description || '',
                redirectUrl: qrCode.redirectUrl,
                isActive: qrCode.isActive,
                tags: qrCode.tags || [],
                location: qrCode.location || '',
                campaign: qrCode.campaign || ''
            });
        }
    }, [qrCode]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const response = await apiRequest(`/api/qr/${qrCode.name}`, formData, { method: 'PUT' });
            if (response.error) {
                setError(response.error);
            } else {
                onSuccess();
                onClose();
            }
        } catch (err) {
            setError('Failed to update QR code');
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        if (!loading) {
            onClose();
        }
    };

    if (!qrCode) return null;

    return (
        <div className="qr-modal-content">
            <h2>Edit QR Code</h2>
            {error && (
                <div className="error-message">
                    {error}
                    <button onClick={() => setError(null)}>×</button>
                </div>
            )}
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label>Name</label>
                    <input
                        type="text"
                        value={formData.name}
                        disabled
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
                    <button type="button" onClick={handleClose} disabled={loading}>
                        Cancel
                    </button>
                    <button type="submit" disabled={loading}>
                        {loading ? 'Updating...' : 'Update'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default EditQRModal;
