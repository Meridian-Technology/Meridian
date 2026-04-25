import React from 'react';
import './General.scss';
import { useGradient } from '../../../hooks/useGradient';
import SiteHealth from './SiteHealth/SiteHealth';
import AdminPlatformAnalytics from './AdminPlatformAnalytics/AdminPlatformAnalytics';

function General() {
    const { AdminGrad } = useGradient();
    return (
        <div className="general dash">
            <img src={AdminGrad} alt="" className="grad" />
            <header className="header">
                <h1>Administrator</h1>
                <p>Manage your platform and track key metrics</p>
            </header>
            <div className="general-content">
                <div style={{ marginTop: 16 }}>
                    <AdminPlatformAnalytics />
                </div>
            </div>
        </div>
    );
}

export default General;