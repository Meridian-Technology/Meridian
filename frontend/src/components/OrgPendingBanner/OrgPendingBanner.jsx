import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@iconify-icon/react';
import './OrgPendingBanner.scss';

function OrgPendingBanner({ org, orgName }) {
    const [dismissed, setDismissed] = useState(false);
    const navigate = useNavigate();

    const handleViewDetails = () => {
        navigate(`/club-dashboard/${orgName}/pending-approval`);
    };

    if (dismissed) return null;

    return (
        <div className="org-pending-banner">
            <div className="org-pending-banner__content">
                <Icon icon="mdi:clock-outline" className="org-pending-banner__icon" />
                <span className="org-pending-banner__text">
                    Your organization is pending approval. You have limited access until it's approved.
                </span>
                <button
                    type="button"
                    className="org-pending-banner__link"
                    onClick={handleViewDetails}
                >
                    View details
                </button>
            </div>
            <button
                type="button"
                className="org-pending-banner__dismiss"
                onClick={() => setDismissed(true)}
                aria-label="Dismiss"
            >
                <Icon icon="mdi:close" />
            </button>
        </div>
    );
}

export default OrgPendingBanner;
