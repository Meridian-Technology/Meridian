import React, { useState, useEffect } from 'react';
import apiRequest from '../../../../utils/postRequest';
import './ModalContent.scss';

const AnalyticsModal = ({ qrCode, onClose }) => {
    const [analyticsData, setAnalyticsData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString();
    };

    useEffect(() => {
        const fetchAnalytics = async () => {
            if (!qrCode) return;
            
            setLoading(true);
            setError(null);
            
            try {
                const response = await apiRequest(`/api/qr/${qrCode.name}/analytics`, null, { method: 'GET' });
                if (response.error) {
                    setError(response.error);
                } else {
                    setAnalyticsData(response);
                }
            } catch (err) {
                setError('Failed to fetch analytics');
            } finally {
                setLoading(false);
            }
        };

        fetchAnalytics();
    }, [qrCode]);

    if (!qrCode) return null;

    if (loading) {
        return (
            <div className="qr-modal-content">
                <h2>Analytics - {qrCode.name}</h2>
                <div className="loading">Loading analytics...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="qr-modal-content">
                <h2>Analytics - {qrCode.name}</h2>
                <div className="error-message">
                    {error}
                    <button onClick={() => onClose()}>×</button>
                </div>
            </div>
        );
    }

    return (
        <div className="qr-modal-content">
            <h2>Analytics - {qrCode.name}</h2>
            <div className="analytics-content">
                <div className="analytics-summary">
                    <div className="summary-item">
                        <span>Total Scans:</span>
                        <span>{analyticsData?.qrCode?.totalScans}</span>
                    </div>
                    <div className="summary-item">
                        <span>Unique Scans:</span>
                        <span>{analyticsData?.qrCode?.uniqueScans}</span>
                    </div>
                    <div className="summary-item">
                        <span>Repeat Scans:</span>
                        <span>{analyticsData?.qrCode?.repeatScans}</span>
                    </div>
                    <div className="summary-item">
                        <span>Created:</span>
                        <span>{formatDate(analyticsData?.qrCode?.createdAt)}</span>
                    </div>
                    {analyticsData?.qrCode?.lastScanned && (
                        <div className="summary-item">
                            <span>Last Scanned:</span>
                            <span>{formatDate(analyticsData.qrCode.lastScanned)}</span>
                        </div>
                    )}
                </div>
                
                {analyticsData?.analytics?.length > 0 ? (
                    <div className="analytics-chart">
                        <h3>Scan Activity</h3>
                        <div className="chart-container">
                            {analyticsData.analytics.map((data, index) => (
                                <div key={index} className="chart-bar">
                                    <div className="bar-label">{formatDate(data.date)}</div>
                                    <div className="bar-container">
                                        <div 
                                            className="bar unique" 
                                            style={{width: `${(data.unique / Math.max(...analyticsData.analytics.map(d => d.unique))) * 100}%`}}
                                        >
                                            {data.unique}
                                        </div>
                                        <div 
                                            className="bar repeat" 
                                            style={{width: `${(data.repeat / Math.max(...analyticsData.analytics.map(d => d.repeat))) * 100}%`}}
                                        >
                                            {data.repeat}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="no-data">No scan data available</div>
                )}
            </div>
        </div>
    );
};

export default AnalyticsModal;
