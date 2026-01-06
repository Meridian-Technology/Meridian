import React, { useState } from 'react';
import { useFetch } from '../../../../hooks/useFetch';
import apiRequest from '../../../../utils/postRequest';
import { Icon } from '@iconify-icon/react';
import './VerificationRequest.scss';

function VerificationRequest({ org, expandedClass }) {
    const [requestData, setRequestData] = useState({
        requestType: 'verification',
        verificationType: 'basic',
        priority: 'medium',
        requestData: {},
        tags: []
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const { data: existingRequests, loading, refetch } = useFetch(
        org?._id ? `/org-management/verification-requests?orgId=${org._id}&status=pending` : null
    );

    // Fetch verification tiers configuration
    const { data: configData } = useFetch('/org-management/config');
    const verificationTiers = configData?.data?.verificationTiers || {};

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            const response = await apiRequest('/org-management/verification-requests', {
                orgId: org._id,
                ...requestData,
            }, {
                method: 'POST'
            });

            if (response.success) {
                setSubmitted(true);
                refetch();
            }
        } catch (error) {
            console.error('Error submitting verification request:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'pending': return '#ff9800';
            case 'approved': return '#4caf50';
            case 'rejected': return '#f44336';
            case 'conditionally_approved': return '#2196f3';
            case 'under_review': return '#9c27b0';
            case 'escalated': return '#f44336';
            default: return '#757575';
        }
    };

    const getRequestTypeLabel = (type) => {
        const labels = {
            verification: 'Verification',
            feature_access: 'Feature Access',
            funding: 'Funding Request',
            space_reservation: 'Space Reservation',
            event_approval: 'Event Approval',
            status_upgrade: 'Status Upgrade'
        };
        return labels[type] || type;
    };

    const getVerificationTypeLabel = (type) => {
        if (verificationTiers[type]) {
            return verificationTiers[type].name;
        }
        return type;
    };

    if (loading) {
        return (
            <div className="verification-request">
                <div className="loading">Loading...</div>
            </div>
        );
    }

    return (
        <div className={`verification-request ${expandedClass}`}>
            <header className="header">
                <h1>Verification Requests</h1>
                <p>Submit requests for verification and special permissions</p>
            </header>

            <div className="content">
                {/* Current Status */}
                <div className="status-section">
                    <h2>Current Status</h2>
                    <div className="status-card">
                        <div className="status-info">
                            <div className="verification-status">
                                <Icon 
                                    icon={org.verified ? "mdi:shield-check" : "mdi:shield-outline"} 
                                    className={org.verified ? "verified" : "unverified"}
                                />
                                <div>
                                    <h3>Verification Status</h3>
                                    <p>
                                        {org.verified 
                                            ? `Your organization is verified (${getVerificationTypeLabel(org.verificationType || 'basic')})`
                                            : 'Your organization is not verified'
                                        }
                                    </p>
                                </div>
                            </div>
                            {org.verified && (
                                <div className="verification-details">
                                    <p><strong>Verified on:</strong> {new Date(org.verifiedAt).toLocaleDateString()}</p>
                                    <p><strong>Verification Type:</strong> {getVerificationTypeLabel(org.verificationType || 'basic')}</p>
                                    {org.verificationStatus && org.verificationStatus !== 'approved' && (
                                        <p><strong>Status:</strong> {org.verificationStatus.replace('_', ' ')}</p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Existing Requests */}
                {existingRequests?.data?.length > 0 && (
                    <div className="existing-requests">
                        <h2>Pending Requests</h2>
                        <div className="requests-list">
                            {existingRequests.data.map((request) => (
                                <div key={request._id} className="request-item">
                                    <div className="request-info">
                                        <h4>{getRequestTypeLabel(request.requestType)}</h4>
                                        <p>Submitted: {new Date(request.submittedAt).toLocaleDateString()}</p>
                                    </div>
                                    <div className="request-status">
                                        <span 
                                            className="status-badge"
                                            style={{ backgroundColor: getStatusColor(request.status) }}
                                        >
                                            {request.status}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* New Request Form */}
                {!submitted && (
                    <div className="request-form-section">
                        <h2>Submit New Request</h2>
                        <form onSubmit={handleSubmit} className="request-form">
                            <div className="form-group">
                                <label>Request Type:</label>
                                <select 
                                    value={requestData.requestType}
                                    onChange={(e) => setRequestData({...requestData, requestType: e.target.value})}
                                    required
                                >
                                    <option value="verification">Organization Verification</option>
                                    <option value="status_upgrade">Status Upgrade</option>
                                    <option value="feature_access">Feature Access Request</option>
                                    <option value="funding">Funding Request</option>
                                    <option value="space_reservation">Space Reservation</option>
                                    <option value="event_approval">Event Approval</option>
                                </select>
                            </div>

                            {(requestData.requestType === 'verification' || requestData.requestType === 'status_upgrade') && (
                                <div className="form-group">
                                    <label>Verification Type:</label>
                                    <select 
                                        value={requestData.verificationType}
                                        onChange={(e) => setRequestData({...requestData, verificationType: e.target.value})}
                                        required
                                    >
                                        {Object.keys(verificationTiers).length > 0 ? (
                                            Object.entries(verificationTiers).map(([key, config]) => (
                                                <option key={key} value={key}>
                                                    {config.name || key}
                                                </option>
                                            ))
                                        ) : (
                                            <option value="basic">Basic Verification</option>
                                        )}
                                    </select>
                                </div>
                            )}

                            <div className="form-group">
                                <label>Priority:</label>
                                <select 
                                    value={requestData.priority}
                                    onChange={(e) => setRequestData({...requestData, priority: e.target.value})}
                                    required
                                >
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                    <option value="urgent">Urgent</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label>Additional Information:</label>
                                <textarea 
                                    value={requestData.requestData.description || ''}
                                    onChange={(e) => setRequestData({
                                        ...requestData, 
                                        requestData: {...requestData.requestData, description: e.target.value}
                                    })}
                                    placeholder="Please provide any additional details about your request..."
                                    rows={4}
                                />
                            </div>

                            <div className="form-group">
                                <label>Tags (optional):</label>
                                <input 
                                    type="text"
                                    value={requestData.tags.join(', ')}
                                    onChange={(e) => setRequestData({
                                        ...requestData, 
                                        tags: e.target.value.split(',').map(tag => tag.trim()).filter(Boolean)
                                    })}
                                    placeholder="Enter tags separated by commas (e.g., urgent, funding, event)"
                                />
                            </div>

                            <button 
                                type="submit" 
                                className="submit-btn"
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? 'Submitting...' : 'Submit Request'}
                            </button>
                        </form>
                    </div>
                )}

                {/* Success Message */}
                {submitted && (
                    <div className="success-message">
                        <Icon icon="mdi:check-circle" className="success-icon" />
                        <h3>Request Submitted Successfully!</h3>
                        <p>Your verification request has been submitted and is under review. You will be notified once a decision has been made.</p>
                        <button 
                            className="new-request-btn"
                            onClick={() => {
                                setSubmitted(false);
                                const verificationTierKeys = Object.keys(verificationTiers);
                                const firstVerificationType = verificationTierKeys.length > 0 ? verificationTierKeys[0] : 'basic';
                                setRequestData({
                                    requestType: 'verification',
                                    verificationType: firstVerificationType,
                                    priority: 'medium',
                                    requestData: {},
                                    tags: []
                                });
                            }}
                        >
                            Submit Another Request
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default VerificationRequest;
