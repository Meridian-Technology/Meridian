import React from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';

/**
 * Redirects /org-invites/accept and /org-invites/decline to the unified landing page.
 * Preserves the token query param for backward compatibility with existing email links.
 */
function OrgInviteRedirect() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const to = token ? `/org-invites?token=${token}` : '/org-invites';
    return <Navigate to={to} replace />;
}

export default OrgInviteRedirect;
