import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import apiRequest from '../../utils/postRequest';
import useAuth from '../../hooks/useAuth';

function OrgInviteAccept() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const navigate = useNavigate();
    const { isAuthenticated, isAuthenticating } = useAuth();
    const [status, setStatus] = useState('loading');

    useEffect(() => {
        if (isAuthenticating) return;
        if (!isAuthenticated) {
            navigate(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
            return;
        }
        if (!token) {
            setStatus('error');
            setTimeout(() => navigate('/events-dashboard'), 2000);
            return;
        }
        apiRequest('/org-invites/accept-by-token', { token }, { method: 'POST' })
            .then((res) => {
                if (res.success) {
                    setStatus('success');
                    setTimeout(() => navigate('/events-dashboard'), 1500);
                } else {
                    setStatus('error');
                    setTimeout(() => navigate('/events-dashboard'), 2000);
                }
            })
            .catch(() => {
                setStatus('error');
                setTimeout(() => navigate('/events-dashboard'), 2000);
            });
    }, [token, isAuthenticated, isAuthenticating, navigate]);

    return (
        <div style={{ padding: 40, textAlign: 'center' }}>
            {status === 'loading' && <p>Accepting invitation...</p>}
            {status === 'success' && <p>Invitation accepted! Redirecting...</p>}
            {status === 'error' && <p>Invalid or expired invitation. Redirecting...</p>}
        </div>
    );
}

export default OrgInviteAccept;
