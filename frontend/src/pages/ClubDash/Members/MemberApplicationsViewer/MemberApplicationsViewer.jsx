import React, { useState, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import './MemberApplicationsViewer.scss';
import HeaderContainer from '../../../../components/HeaderContainer/HeaderContainer';
import FormResponseViewer from '../../../../components/FormResponseViewer/FormResponseViewer';
import pfp from '../../../../assets/defaultAvatar.svg';
import apiRequest from '../../../../utils/postRequest';
import { useFetch } from '../../../../hooks/useFetch';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';

const formatDate = (date) => {
    return `${date.toLocaleString('default', { weekday: 'long' })}, ${date.toLocaleString('default', { month: 'long' })} ${date.getDate()}`;
};

const ApplicationCard = ({ application, isSelected, onSelect }) => {
    const { user_id: user, createdAt } = application;
    
    return (
        <div 
            className={`user ${isSelected ? 'selected' : ''}`}
            onClick={() => onSelect(application._id)}
        >
            <div className="row">
                <img src={user.picture || pfp} alt={`${user.name}'s profile`} />
                <div className="user-info">
                    <h4>{user.name}</h4>
                    <p>{user.email}</p>
                </div>
            </div>
            {/* <div className="row apply-info">
                <p>Applied on {formatDate(new Date(createdAt))}</p>
            </div> */}
        </div>
    );
};


const ApplicationViewer = ({ application, onAction, loading, error }) => {
    const { status, createdAt, formResponse } = application;
    
    const handleAction = useCallback(async (action) => {
        await onAction(action);
    }, [onAction]);

    return (
        <div className="application-viewer">
            <div className="application-header">
                <div className="status-badge">
                    Status: <span className={`status ${status}`}>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                    </span>
                </div>
                <div className="application-date">
                    Applied on {formatDate(new Date(createdAt))}
                </div>
            </div>
            
            {error && <div className="error-message">{error}</div>}
            
            {status === 'pending' && (
                <div className="action-buttons">
                    <button 
                        className="approve-btn" 
                        onClick={() => handleAction('approve')} 
                        disabled={loading}
                    >
                        {loading ? 'Processing...' : 'Approve'}
                    </button>
                    <button 
                        className="reject-btn" 
                        onClick={() => handleAction('reject')} 
                        disabled={loading}
                    >
                        {loading ? 'Processing...' : 'Reject'}
                    </button>
                </div>
            )}
            
            {formResponse ? (
                <div className="form-response-section">
                    <h3>Application Form Response</h3>
                    <FormResponseViewer formResponse={formResponse} />
                </div>
            ) : (
                <div className="no-form-message">
                    <p>No form response submitted with this application.</p>
                </div>
            )}
        </div>
    );
};


const EmptyState = () => (
    <div className="empty-state">
        <div className="empty-content">
                <Icon icon="mingcute:inbox-fill" />
                <p>There are currently no member applications to review.<br></br>Get recruiting!</p>
        </div>
    </div>
);

const LoadingState = () => (
    <div className="loading-state">
        <div className="loading-content">
            <p>Loading applications...</p>
        </div>
    </div>
);

const ErrorState = ({ error, onRetry }) => (
    <div className="error-state">
        <div className="error-content">
            <h3>Error Loading Applications</h3>
            <p>{error}</p>
            {onRetry && (
                <button onClick={onRetry} className="retry-btn">
                    Try Again
                </button>
            )}
        </div>
    </div>
);

ErrorState.propTypes = {
    error: PropTypes.string.isRequired,
    onRetry: PropTypes.func
};

function MemberApplicationsViewer({ org }) {
    const [selectedApplicationId, setSelectedApplicationId] = useState(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [actionError, setActionError] = useState(null);
    const [selectedTab, setSelectedTab] = useState('current');

    const { 
        data: applicationsData, 
        isLoading: applicationsLoading, 
        error: applicationsError,
        refetch: refetchApplications
    } = useFetch(`/org-roles/${org._id}/applications`);

    // Memoize applications to avoid unnecessary re-renders
    const applications = useMemo(() => {
        return applicationsData?.applications || [];
    }, [applicationsData]);

    // Memoize selected application
    const selectedApplication = useMemo(() => {
        return applications.find(app => app._id === selectedApplicationId) || null;
    }, [applications, selectedApplicationId]);

    // Filter applications by status for tabs
    const pendingApplications = useMemo(() => {
        return applications.filter(app => app.status === 'pending');
    }, [applications]);

    const processedApplications = useMemo(() => {
        return applications.filter(app => app.status !== 'pending');
    }, [applications]);

    const handleApplicationSelect = useCallback((applicationId) => {
        setSelectedApplicationId(applicationId);
        setActionError(null); // Clear any previous action errors
    }, []);

    const handleAction = useCallback(async (action) => {
        if (!selectedApplication) return;
        
        setActionLoading(true);
        setActionError(null);
        
        try {
            const orgId = selectedApplication.org_id;
            const applicationId = selectedApplication._id;
            const url = `/org-roles/${orgId}/applications/${applicationId}/${action}`;
            
            const response = await apiRequest(url, {}, { method: 'POST' });
            
            if (response.success) {
                // Refetch applications to get updated data from server
                await refetchApplications();
                // Clear selection after successful action
                setSelectedApplicationId(null);
            } else {
                setActionError(response.message || 'Action failed');
            }
        } catch (err) {
            setActionError('Action failed. Please try again.');
        } finally {
            setActionLoading(false);
        }
    }, [selectedApplication, refetchApplications]);

    // Handle loading state
    if (applicationsLoading) {
        return (
            <div className="member-applications-viewer">
                <HeaderContainer 
                    header='Member applications'
                    icon='mdi:account-group'
                >
                    <LoadingState />
                </HeaderContainer>
            </div>
        );
    }

    // Handle error state
    if (applicationsError) {
        return (
            <div className="member-applications-viewer">
                    <ErrorState 
                        error={applicationsError} 
                        onRetry={refetchApplications}
                    />
            </div>
        );
    }

    // Handle empty state
    if (applications.length === 0) {
        return (
            <div className="member-applications-viewer">
                <EmptyState />
            </div>
        );
    }

    return (
        <div className="member-applications-viewer">
                <div className="tab-head">
                    <div className={`tab-header ${selectedTab === 'current' ? 'selected' : ''}`} onClick={() => setSelectedTab('current')}>
                        <p>Current Applications</p>
                    </div>
                    <div className={`tab-header ${selectedTab === 'past' ? 'selected' : ''}`} onClick={() => setSelectedTab('past')}>
                        <p>Past Applications</p>
                    </div>
                </div>
                <div className="member-applications-content">
                    <div className="applicants">
                        {selectedTab === 'current' && (     
                            pendingApplications.length > 0 ? (
                                pendingApplications.map(application => (
                                    <ApplicationCard
                                        key={application._id}
                                        application={application}
                                        isSelected={selectedApplicationId === application._id}
                                        onSelect={handleApplicationSelect}
                                    />
                                ))
                            ) : (
                                <div className="no-applications">
                                    <Icon icon="mingcute:inbox-fill" />
                                    <p>No pending applications</p>
                                </div>
                            )
                        )}
                        {selectedTab === 'past' && (
                            processedApplications.length > 0 ? (
                                processedApplications.map(application => (
                                    <ApplicationCard
                                        key={application._id}
                                        application={application}
                                        isSelected={selectedApplicationId === application._id}
                                        onSelect={handleApplicationSelect}
                                    />
                                ))
                            ) : (
                                <div className="no-applications">
                                    <Icon icon="mingcute:inbox-fill" />
                                    <p>No past applications</p>
                                </div>
                            )
                        )}
                    </div>
                    
                    <div className="workspace">
                        {selectedApplication && (
                            <ApplicationViewer
                                application={selectedApplication}
                                onAction={handleAction}
                                loading={actionLoading}
                                error={actionError}
                            />
                        ) }
                    </div>
                </div>
        </div>
    );
}

MemberApplicationsViewer.propTypes = {
    org: PropTypes.shape({
        _id: PropTypes.string.isRequired
    }).isRequired
};

export default MemberApplicationsViewer;