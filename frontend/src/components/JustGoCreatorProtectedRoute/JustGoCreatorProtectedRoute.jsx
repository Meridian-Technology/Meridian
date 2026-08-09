import React, { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import { useNotification } from '../../NotificationContext';

/**
 * Auth gate stub for `/justgo/creator/*`.
 * Task 0.2: requires login only.
 * Task 1.2 will add `requirePivotCreator` grant checks (403 CREATOR_FORBIDDEN).
 */
const JustGoCreatorProtectedRoute = () => {
  const { isAuthenticated, isAuthenticating } = useAuth();
  const { addNotification } = useNotification();

  useEffect(() => {
    if (!isAuthenticating && !isAuthenticated) {
      addNotification({
        title: 'Sign in required',
        message: 'Sign in to open Just Go Creator.',
        type: 'error',
      });
    }
  }, [isAuthenticated, isAuthenticating, addNotification]);

  if (isAuthenticating) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return <Outlet />;
};

export default JustGoCreatorProtectedRoute;
