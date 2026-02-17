import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@iconify-icon/react';
import './AdminViewBanner.scss';

function AdminViewBanner() {
    const navigate = useNavigate();

    return (
        <div className="admin-view-banner" role="banner">
            <Icon icon="mdi:shield-account" className="admin-view-banner__icon" />
            <span className="admin-view-banner__text">
                You are viewing this organization as an administrator
            </span>
            <button
                className="admin-view-banner__exit"
                onClick={() => navigate('/org-management')}
            >
                <Icon icon="mdi:arrow-left" />
                Back to Org Management
            </button>
        </div>
    );
}

export default AdminViewBanner;
