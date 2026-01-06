import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

function QR(){
    const {id} = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const handleQRScan = async () => {
            try {
                setLoading(true);
                
                // Check if user has visited before
                const visited = localStorage.getItem('hasVisited');
                const isRepeat = !!visited;
                
                // Log the QR scan
                const response = await axios.post('/qr-scan', {
                    name: id, 
                    repeat: isRepeat
                });
                
                if (response.data.success) {
                    // Mark as visited if this is first visit
                    if (!visited) {
                        localStorage.setItem('hasVisited', true);
                    }
                    
                    // Redirect to the configured URL
                    if (response.data.redirectUrl) {
                        window.location.href = response.data.redirectUrl;
                    } else {
                        // Fallback to home page
                        navigate('/');
                    }
                } else {
                    setError(response.data.error || 'Failed to process QR code');
                }
            } catch (err) {
                console.error('QR scan error:', err);
                if (err.response?.status === 404) {
                    setError('QR code not found');
                } else if (err.response?.status === 400) {
                    setError('QR code is inactive');
                } else {
                    setError('Failed to process QR code. Please try again.');
                }
            } finally {
                setLoading(false);
            }
        };

        handleQRScan();
    }, [id, navigate]);

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
                <div style={{ fontSize: '14px', color: '#666' }}>Please wait while we redirect you</div>
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

export default QR;