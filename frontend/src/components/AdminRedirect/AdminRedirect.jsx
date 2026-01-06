import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';

const AdminRedirect = () => {
    const { user, isAuthenticated, isAuthenticating } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        // Only redirect if user is authenticated and not currently authenticating
        if (isAuthenticated && !isAuthenticating && user) {
            // Check if user has admin role
            if (user.roles && user.roles.includes('admin')) {
                // Don't redirect if already on admin page or if coming from a specific redirect
                const isOnAdminPage = location.pathname === '/admin';
                const isFromLogin = location.state?.from?.pathname === '/login';
                const isFromRoot = location.pathname === '/';
                const isFromLanding = location.pathname === '/landing';
                
                // List of pages where admin users should be redirected to admin dashboard
                const shouldRedirectFrom = [
                    '/',
                    '/landing',
                    '/events-dashboard',
                    '/profile',
                    '/settings'
                ];
                
                // Redirect to admin dashboard if:
                // 1. Not already on admin page
                // 2. Coming from a page where admin users should be redirected
                // 3. Not coming from a specific protected route
                if (!isOnAdminPage && shouldRedirectFrom.includes(location.pathname)) {
                    // Add a small delay to ensure the page has loaded properly
                    setTimeout(() => {
                        navigate('/admin', { replace: true });
                    }, 100);
                }
            }
        }
    }, [isAuthenticated, isAuthenticating, user, navigate, location]);

    // This component doesn't render anything
    return null;
};

export default AdminRedirect;
