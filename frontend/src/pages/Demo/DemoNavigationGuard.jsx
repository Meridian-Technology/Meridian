import React, { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { analytics } from '../../services/analytics/analytics';
import { DEMO_ROUTE_PREFIX, isDemoAllowedPath } from '../../utils/demoTenant';

/**
 * Keeps demo sandbox sessions on /events-demo routes.
 * Uses location redirect (BrowserRouter-compatible) instead of useBlocker (data router only).
 */
function DemoNavigationGuard({ children }) {
    const location = useLocation();
    const navigate = useNavigate();
    const lastTrackedPath = useRef('');

    useEffect(() => {
        const path = location.pathname;
        if (isDemoAllowedPath(path)) return;

        if (lastTrackedPath.current !== path) {
            lastTrackedPath.current = path;
            analytics.track('demo_escape_blocked', { attemptedPath: path });
        }
        navigate(DEMO_ROUTE_PREFIX, { replace: true });
    }, [location.pathname, navigate]);

    return children;
}

export default DemoNavigationGuard;
