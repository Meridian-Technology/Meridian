import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Icon } from '@iconify-icon/react';
import './OrgInviteLanding.scss';

/**
 * Handles /org-invites/landing/:token for new users (no account yet).
 * The backend sets an httpOnly cookie and redirects to register.
 * Since the frontend SPA catches this route first, we fetch the backend
 * to set the cookie, then redirect to register.
 */
function OrgInviteLandingToken() {
    const { token } = useParams();
    const navigate = useNavigate();
    const [status, setStatus] = useState('loading'); // loading | error

    useEffect(() => {
        if (!token) {
            navigate('/register?error=invalid_invite', { replace: true });
            return;
        }

        fetch(`/org-invites/landing/${token}`, {
            method: 'GET',
            credentials: 'include',
            redirect: 'manual',
        })
            .then((res) => {
                // Backend sets cookie and returns 302 to /register?invite=token
                const location = res.headers.get('Location');
                if (location) {
                    try {
                        const url = new URL(location, window.location.origin);
                        navigate(url.pathname + url.search, { replace: true });
                        return;
                    } catch {
                        navigate(`/register?invite=${token}`, { replace: true });
                        return;
                    }
                }
                if (res.type === 'opaqueredirect' || res.status === 0) {
                    navigate(`/register?invite=${token}`, { replace: true });
                    return;
                }
                if (res.status === 302 || res.ok) {
                    navigate(`/register?invite=${token}`, { replace: true });
                    return;
                }
                setStatus('error');
            })
            .catch(() => {
                setStatus('error');
            });
    }, [token, navigate]);

    if (status === 'error') {
        return (
            <div className="org-invite-landing">
                <div className="org-invite-landing-card">
                    <div className="org-invite-landing__header">
                        <Icon icon="mdi:link-off" className="org-invite-landing-icon error" />
                        <h2>Invalid or Expired Invitation</h2>
                        <p>This invitation link is invalid or has expired. Please request a new invitation.</p>
                    </div>
                    <div className="org-invite-landing__body">
                        <button
                            type="button"
                            className="org-invite-landing-btn primary"
                            onClick={() => navigate('/register', { replace: true })}
                        >
                            Create account
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="org-invite-landing">
            <div className="org-invite-landing-card">
                <div className="org-invite-landing__body">
                    <div className="org-invite-landing-loading">
                        <Icon icon="svg-spinners:90-ring-with-bg" className="spinner" />
                        <p>Setting up your invitation...</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default OrgInviteLandingToken;
