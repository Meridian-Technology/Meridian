import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import { JUSTGO_CREATOR_ROUTES } from '../../pages/JustGoCreator/justGoCreatorRoutes';

/**
 * Auth gate for `/justgo/creator/*`.
 * Task 0.2: requires login only.
 * Task 1.2 will add `requirePivotCreator` grant checks (403 CREATOR_FORBIDDEN).
 *
 * Sends people to the Just Go sign-in rather than Meridian's, and carries the attempted path in
 * router state so they land where they were headed — the login page reads `state.from`, and
 * without it every creator would be dropped into ClubDash by that form's default redirect.
 * The page states the requirement itself, so there is no toast.
 */
const JustGoCreatorProtectedRoute = () => {
  const { isAuthenticated, isAuthenticating } = useAuth();
  const location = useLocation();

  if (isAuthenticating) return null;
  if (!isAuthenticated) {
    return <Navigate to={JUSTGO_CREATOR_ROUTES.login} state={{ from: location }} replace />;
  }

  return <Outlet />;
};

export default JustGoCreatorProtectedRoute;
