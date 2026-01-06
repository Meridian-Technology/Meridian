import React, { useState, useEffect } from 'react';
import { useFetch } from '../../../../hooks/useFetch';
import { useGradient } from '../../../../hooks/useGradient';
import apiRequest from '../../../../utils/postRequest';
import { Icon } from '@iconify-icon/react';
import Modal from '../../../../components/Modal/Modal';
import './VerificationRequests.scss';

function VerificationRequests() {
    const [filters, setFilters] = useState({
        status: '',
        requestType: '',
        priority: '',
        page: 1
    });
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [reviewData, setReviewData] = useState({
        status: 'approved',
        reviewNotes: ''
    });
    const { AtlasMain } = useGradient();

    const queryParams = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
        if (value !== '' && value !== null && value !== undefined) {
            queryParams.append(key, value);
        }
    });
    
    const { data: requests, loading, error, refetch } = useFetch(
        `/org-management/verification-requests?${queryParams.toString()}`
    );

    // Fetch verification tiers configuration
    const { data: configData } = useFetch('/org-management/config');
    const verificationTiers = configData?.data?.verificationTiers || {};

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

    const getPriorityColor = (priority) => {
        switch (priority) {
            case 'urgent': return '#f44336';
            case 'high': return '#ff9800';
            case 'medium': return '#2196f3';
            case 'low': return '#4caf50';
            default: return '#757575';
        }
    };

    const getRequestTypeLabel = (type) => {
        const labels = {
            verification: 'Verification',
            status_upgrade: 'Status Upgrade',
            feature_access: 'Feature Access',
            funding: 'Funding Request',
            space_reservation: 'Space Reservation',
            event_approval: 'Event Approval'
        };
        return labels[type] || type;
    };

    const getVerificationTypeLabel = (type) => {
        if (verificationTiers[type]) {
            return verificationTiers[type].name;
        }
        return type;
    };

    const handleReview = async () => {
        if (!selectedRequest) return;

        try {
            const response = await apiRequest(
                `/org-management/verification-requests/${selectedRequest._id}`,
                reviewData,
                { method: 'PUT' }
            );

            if (response.success) {
                setShowModal(false);
                setSelectedRequest(null);
                setReviewData({ status: 'approved', reviewNotes: '' });
                refetch();
            }
        } catch (error) {
            console.error('Error reviewing request:', error);
        }
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
            <div className="verification-requests">
                <div className="loading">Loading verification requests...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="verification-requests">
                <div className="error">Error loading verification requests: {error}</div>
            </div>
        );
    }

    return (
        <div className="verification-requests dash">
            <header className="header">
                <h1>Verification Requests</h1>
                <p>Review and manage organization verification requests</p>
                <img src={AtlasMain} alt="Verification Requests Grad" />
            </header>

            <div className="content">
                {/* Filters */}
                <div className="filters">
                    <div className="filter-group">
                        <label>Status:</label>
                        <select 
                            value={filters.status} 
                            onChange={(e) => setFilters({...filters, status: e.target.value, page: 1})}
                        >
                            <option value="">All Statuses</option>
                            <option value="pending">Pending</option>
                            <option value="approved">Approved</option>
                            <option value="rejected">Rejected</option>
                        </select>
                    </div>

                    <div className="filter-group">
                        <label>Type:</label>
                        <select 
                            value={filters.requestType} 
                            onChange={(e) => setFilters({...filters, requestType: e.target.value, page: 1})}
                        >
                            <option value="">All Types</option>
                            <option value="verification">Verification</option>
                            <option value="feature_access">Feature Access</option>
                            <option value="funding">Funding</option>
                            <option value="space_reservation">Space Reservation</option>
                            <option value="event_approval">Event Approval</option>
                        </select>
                    </div>

                    <div className="filter-group">
                        <label>Priority:</label>
                        <select 
                            value={filters.priority} 
                            onChange={(e) => setFilters({...filters, priority: e.target.value, page: 1})}
                        >
                            <option value="">All Priorities</option>
                            <option value="urgent">Urgent</option>
                            <option value="high">High</option>
                            <option value="medium">Medium</option>
                            <option value="low">Low</option>
                        </select>
                    </div>
                </div>

                {/* Requests List */}
                <div className="requests-list">
                    {requests?.data?.length === 0 ? (
                        <div className="empty-state">
                            <Icon icon="mdi:shield-check" />
                            <h3>No verification requests found</h3>
                            <p>There are no requests matching your current filters.</p>
                        </div>
                    ) : (
                        requests?.data?.map((request) => (
                            <div key={request._id} className="request-card">
                                <div className="request-header">
                                    <div className="org-info">
                                        <img 
                                            src={request.orgId?.org_profile_image || '/Logo.svg'} 
                                            alt={request.orgId?.org_name}
                                            className="org-avatar"
                                        />
                                        <div>
                                            <h3>{request.orgId?.org_name}</h3>
                                            <p>Requested by {request.requestedBy?.name || request.requestedBy?.username}</p>
                                        </div>
                                    </div>
                                    <div className="request-meta">
                                        <span 
                                            className="status-badge"
                                            style={{ backgroundColor: getStatusColor(request.status) }}
                                        >
                                            {request.status}
                                        </span>
                                        <span 
                                            className="priority-badge"
                                            style={{ backgroundColor: getPriorityColor(request.priority) }}
                                        >
                                            {request.priority}
                                        </span>
                                    </div>
                                </div>

                                <div className="request-details">
                                    <div className="detail-row">
                                        <span className="label">Type:</span>
                                        <span className="value">{getRequestTypeLabel(request.requestType)}</span>
                                    </div>
                                    {(request.requestType === 'verification' || request.requestType === 'status_upgrade') && request.verificationType && (
                                        <div className="detail-row">
                                            <span className="label">Verification Type:</span>
                                            <span className="value">{getVerificationTypeLabel(request.verificationType)}</span>
                                        </div>
                                    )}
                                    <div className="detail-row">
                                        <span className="label">Submitted:</span>
                                        <span className="value">{formatDate(request.submittedAt)}</span>
                                    </div>
                                    {request.tags && request.tags.length > 0 && (
                                        <div className="detail-row">
                                            <span className="label">Tags:</span>
                                            <div className="tags">
                                                {request.tags.map((tag, index) => (
                                                    <span key={index} className="tag">{tag}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {request.status === 'pending' && (
                                    <div className="request-actions">
                                        <button 
                                            className="action-btn review"
                                            onClick={() => {
                                                setSelectedRequest(request);
                                                setShowModal(true);
                                            }}
                                        >
                                            <Icon icon="mdi:eye" />
                                            Review Request
                                        </button>
                                    </div>
                                )}

                                {request.status !== 'pending' && request.reviewNotes && (
                                    <div className="review-notes">
                                        <h4>Review Notes:</h4>
                                        <p>{request.reviewNotes}</p>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>

                {/* Pagination */}
                {requests?.pagination && requests.pagination.totalPages > 1 && (
                    <div className="pagination">
                        <button 
                            className="page-btn"
                            disabled={filters.page <= 1}
                            onClick={() => setFilters({...filters, page: filters.page - 1})}
                        >
                            Previous
                        </button>
                        <span className="page-info">
                            Page {filters.page} of {requests.pagination.totalPages}
                        </span>
                        <button 
                            className="page-btn"
                            disabled={filters.page >= requests.pagination.totalPages}
                            onClick={() => setFilters({...filters, page: filters.page + 1})}
                        >
                            Next
                        </button>
                    </div>
                )}
            </div>

            {/* Review Modal */}
            <Modal 
                isOpen={showModal} 
                onClose={() => setShowModal(false)}
                title="Review Request"
                size="medium"
            >
                {selectedRequest && (
                    <>
                        <div className="summary-section">
                            <h3>{selectedRequest.orgId?.org_name}</h3>
                            <p><strong>Type:</strong> {getRequestTypeLabel(selectedRequest.requestType)}</p>
                            {(selectedRequest.requestType === 'verification' || selectedRequest.requestType === 'status_upgrade') && selectedRequest.verificationType && (
                                <p><strong>Verification Type:</strong> {getVerificationTypeLabel(selectedRequest.verificationType)}</p>
                            )}
                            <p><strong>Priority:</strong> {selectedRequest.priority}</p>
                            <p><strong>Submitted:</strong> {formatDate(selectedRequest.submittedAt)}</p>
                        </div>

                        <div className="review-form">
                            <div className="form-group">
                                <label>Decision:</label>
                                <select 
                                    value={reviewData.status}
                                    onChange={(e) => setReviewData({...reviewData, status: e.target.value})}
                                >
                                    <option value="approved">Approve</option>
                                    <option value="conditionally_approved">Conditionally Approve</option>
                                    <option value="under_review">Under Review</option>
                                    <option value="escalated">Escalate</option>
                                    <option value="rejected">Reject</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label>Review Notes:</label>
                                <textarea 
                                    value={reviewData.reviewNotes}
                                    onChange={(e) => setReviewData({...reviewData, reviewNotes: e.target.value})}
                                    placeholder="Add notes about your decision..."
                                    rows={4}
                                />
                            </div>
                        </div>

                        <div className="modal-actions">
                            <button 
                                className="btn secondary"
                                onClick={() => setShowModal(false)}
                            >
                                Cancel
                            </button>
                            <button 
                                className="btn primary"
                                onClick={handleReview}
                            >
                                Submit Review
                            </button>
                        </div>
                    </>
                )}
            </Modal>
        </div>
    );
}

export default VerificationRequests;
