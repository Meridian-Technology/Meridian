import React from 'react';
import { Navigate } from 'react-router-dom';
import { useFetch } from '../../hooks/useFetch';
import useAuth from '../../hooks/useAuth';

const ROOT_DASH_ROLES = ['admin', 'developer', 'beta'];

/**
 * When the institution is in Community organizer mode, legacy Compass/Atlas/Beacon URLs
 * redirect to the unified root dashboard for users who can open `/root-dashboard`.
 * OIE-only users keep access to these routes (they are not on the root-dash role gate).
 */
function CommunityOrganizerFeatureAdminRedirect({ children }) {
    const { user } = useAuth();
    const { data, loading } = useFetch('/org-management/config');
    const mode = data?.data?.operatorDashboardMode;
    const canUseRootDashboard = ROOT_DASH_ROLES.some((r) => user?.roles?.includes(r));

    if (!loading && mode === 'engagement_hub' && canUseRootDashboard) {
        return <Navigate to="/root-dashboard" replace />;
    }

    return children;
}

export default CommunityOrganizerFeatureAdminRedirect;
