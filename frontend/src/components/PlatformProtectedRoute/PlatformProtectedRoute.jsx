import React, { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import { useNotification } from '../../NotificationContext';

function isPlatformAdmin(user) {
  const roles = user?.platformRoles || [];
  return roles.includes('platform_admin') || roles.includes('root');
}

const PlatformProtectedRoute = () => {
  const { isAuthenticated, isAuthenticating, user } = useAuth();
  const { addNotification } = useNotification();

  useEffect(() => {
    if (!isAuthenticating && isAuthenticated && !isPlatformAdmin(user)) {
      addNotification({
        title: 'Unauthorized',
        message: 'Platform admin access is required.',
        type: 'error',
      });
    }
  }, [isAuthenticated, isAuthenticating, user, addNotification]);

  if (isAuthenticating) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!isPlatformAdmin(user)) return <Navigate to="/unauthorized" replace />;

  return <Outlet />;
};

export default PlatformProtectedRoute;
