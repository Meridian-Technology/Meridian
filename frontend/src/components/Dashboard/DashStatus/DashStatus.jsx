import React, { useState, useEffect } from 'react';
import './DashStatus.scss';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import { useFetch } from '../../../hooks/useFetch';

function DashStatus({status, action, actionText, color, backgroundColor, icon="tabler:exclamation-circle", orgId, applicationsCount}) {
    const [displayStatus, setDisplayStatus] = useState(status);
    
    // Fetch applications data if orgId is provided
    const { 
        data: applicationsData, 
        isLoading: applicationsLoading, 
        error: applicationsError 
    } = useFetch(orgId ? `/org-roles/${orgId}/applications?status=pending` : null);

    useEffect(() => {
        if (orgId) {
            if (applicationsLoading) {
                setDisplayStatus("Loading applications...");
            } else if (applicationsError) {
                setDisplayStatus(null); // Don't show component when error loading applications
            } else if (applicationsData) {
                const pendingCount = applicationsData.applications?.length || 0;
                
                if (pendingCount === 0) {
                    setDisplayStatus(null); // Don't show component when no applications
                } else if (pendingCount === 1) {
                    setDisplayStatus("You have 1 unreviewed officer or member application");
                } else {
                    setDisplayStatus(`You have ${pendingCount} unreviewed officer and member applications`);
                }
            }
        } else if (applicationsCount !== undefined) {
            // Use provided count if no orgId
            if (applicationsCount === 0) {
                setDisplayStatus(null); // Don't show component when no applications
            } else if (applicationsCount === 1) {
                setDisplayStatus("You have 1 unreviewed officer or member application");
            } else {
                setDisplayStatus(`You have ${applicationsCount} unreviewed officer and member applications`);
            }
        } else {
            // Fallback to provided status
            setDisplayStatus(status);
        }
    }, [orgId, applicationsData, applicationsLoading, applicationsError, status, applicationsCount]);

    // Don't render component if no applications to show
    if (displayStatus === null) {
        return null;
    }

    return (
        <div className="dash-status" style={{
            "--color": color,
            "--background-color": backgroundColor
        }}>
            <div className="status-container">
                {icon && <Icon icon={icon} />}
                {displayStatus}
            </div>
            <button onClick={action}>{actionText} <Icon icon="heroicons:chevron-right" /></button>
        </div>
    );
}

export default DashStatus;