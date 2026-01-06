import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import { useFetch } from '../../hooks/useFetch';
import postRequest from '../../utils/postRequest';
import './ApprovalPreview.scss';

const ApprovalPreview = ({ formData }) => {
    const [previewData, setPreviewData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        // Only fetch if we have minimum required data
        if (formData && formData.location && formData.type && formData.start_time) {
            fetchApprovalPreview();
        }
    }, [formData?.location, formData?.type, formData?.start_time, formData?.end_time, formData?.expectedAttendance]);

    const fetchApprovalPreview = async () => {
        setLoading(true);
        setError(null);
        
        try {
            // Prepare event data for preview
            const eventPreview = {
                location: formData.location,
                type: formData.type,
                start_time: formData.start_time,
                end_time: formData.end_time,
                expectedAttendance: formData.expectedAttendance || 0,
                name: formData.name,
                description: formData.description,
                visibility: formData.visibility,
                customFields: formData.customFields || {}
            };

            const response = await postRequest('/preview-approvals', eventPreview);
            
            if (response.success) {
                setPreviewData(response.data);
            } else {
                setError(response.message || 'Failed to load approval preview');
            }
        } catch (err) {
            console.error('Error fetching approval preview:', err);
            setError('Failed to load approval preview');
        } finally {
            setLoading(false);
        }
    };

    const renderStakeholderRole = (role) => (
        <div key={role._id} className="stakeholder-role-item">
            <div className="role-header">
                <div className="role-info">
                    <h4>{role.stakeholderName}</h4>
                    <span className="role-domain">{role.domainId?.name || 'Unknown Domain'}</span>
                </div>
                <span className={`role-type-badge ${role.stakeholderType}`}>
                    <Icon icon={
                        role.stakeholderType === 'approver' ? 'mdi:shield-check' :
                        role.stakeholderType === 'acknowledger' ? 'mdi:check-circle' :
                        'mdi:bell'
                    } />
                    {role.stakeholderType}
                </span>
            </div>
            <div className="role-members">
                {role.members && role.members.filter(m => m.isActive).length > 0 ? (
                    <div className="members-list">
                        <span className="members-label">
                            {role.members.filter(m => m.isActive).length} member(s):
                        </span>
                        {role.members.filter(m => m.isActive).map((member, idx) => (
                            <span key={idx} className="member-name">
                                {member.userId?.name || 'Unknown User'}
                            </span>
                        ))}
                    </div>
                ) : (
                    <span className="no-members">No members assigned</span>
                )}
            </div>
            {role.description && (
                <p className="role-description">{role.description}</p>
            )}
        </div>
    );

    if (loading) {
        return (
            <div className="approval-preview loading">
                <Icon icon="mdi:loading" className="spinning" />
                <span>Checking required approvals...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="approval-preview error">
                <Icon icon="mdi:alert-circle" />
                <span>{error}</span>
            </div>
        );
    }

    if (!previewData) {
        return (
            <div className="approval-preview empty">
                <Icon icon="mdi:information" />
                <span>Complete event details to see required approvals</span>
            </div>
        );
    }

    const { approvals, acknowledgements, notifications, total } = previewData;

    if (total === 0) {
        return (
            <div className="approval-preview no-approvals">
                <Icon icon="mdi:check-circle" className="success-icon" />
                <h3>No Approvals Required</h3>
                <p>This event does not require any approvals, acknowledgements, or notifications. It will be published immediately.</p>
            </div>
        );
    }

    return (
        <div className="approval-preview">
            <div className="preview-header">
                <h3>Required Approvals & Notifications</h3>
                <p className="preview-subtitle">
                    The following stakeholder roles will need to {approvals.length > 0 ? 'approve' : ''} 
                    {approvals.length > 0 && acknowledgements.length > 0 ? ', acknowledge' : acknowledgements.length > 0 ? 'acknowledge' : ''}
                    {notifications.length > 0 ? (approvals.length > 0 || acknowledgements.length > 0 ? ', or be notified about' : 'be notified about') : ''} 
                    {' '}this event before it can be published.
                </p>
            </div>

            {approvals.length > 0 && (
                <div className="approval-section">
                    <div className="section-header">
                        <Icon icon="mdi:shield-check" className="section-icon approver" />
                        <h4>Required Approvals ({approvals.length})</h4>
                        <span className="section-description">These roles must approve the event</span>
                    </div>
                    <div className="roles-list">
                        {approvals.map(role => renderStakeholderRole(role))}
                    </div>
                </div>
            )}

            {acknowledgements.length > 0 && (
                <div className="approval-section">
                    <div className="section-header">
                        <Icon icon="mdi:check-circle" className="section-icon acknowledger" />
                        <h4>Acknowledgements ({acknowledgements.length})</h4>
                        <span className="section-description">These roles must acknowledge the event</span>
                    </div>
                    <div className="roles-list">
                        {acknowledgements.map(role => renderStakeholderRole(role))}
                    </div>
                </div>
            )}

            {notifications.length > 0 && (
                <div className="approval-section">
                    <div className="section-header">
                        <Icon icon="mdi:bell" className="section-icon notifiee" />
                        <h4>Notifications ({notifications.length})</h4>
                        <span className="section-description">These roles will be notified about the event</span>
                    </div>
                    <div className="roles-list">
                        {notifications.map(role => renderStakeholderRole(role))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ApprovalPreview;

