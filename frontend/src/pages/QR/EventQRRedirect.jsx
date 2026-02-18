import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

/**
 * Event QR redirect page. User scans QR -> lands here -> backend logs scan and returns redirect URL.
 * Full redirect to event page with ?source=qr&qr_id=shortId for attribution.
 */
function EventQRRedirect() {
    const { shortId } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!shortId) {
            setError('Invalid QR code');
            setLoading(false);
            return;
        }

        const handleScan = async () => {
            try {
                setLoading(true);
                const response = await axios.post('/qr-scan-event', { shortId });
                if (response.data?.success && response.data?.redirectUrl) {
                    window.location.href = response.data.redirectUrl;
                    return;
                }
                setError(response.data?.error || 'Failed to process QR code');
            } catch (err) {
                console.error('Event QR scan error:', err);
                if (err.response?.status === 404) {
                    setError('QR code not found');
                } else if (err.response?.status === 400) {
                    setError('Invalid request');
                } else {
                    setError('Failed to process QR code. Please try again.');
                }
            } finally {
                setLoading(false);
            }
        };

        handleScan();
    }, [shortId]);

    if (loading) {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh',
                flexDirection: 'column'
            }}>
                <div style={{ fontSize: '18px', marginBottom: '10px' }}>Processing QR code...</div>
                <div style={{ fontSize: '14px', color: '#666' }}>Redirecting you to the event</div>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh',
                flexDirection: 'column'
            }}>
                <div style={{ fontSize: '18px', marginBottom: '10px', color: '#e74c3c' }}>Error</div>
                <div style={{ fontSize: '14px', color: '#666', marginBottom: '20px' }}>{error}</div>
                <button
                    onClick={() => navigate('/')}
                    style={{
                        padding: '10px 20px',
                        backgroundColor: '#3498db',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer'
                    }}
                >
                    Go to Home
                </button>
            </div>
        );
    }

    return null;
}

export default EventQRRedirect;
