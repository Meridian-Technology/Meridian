import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import apiRequest from '../../utils/postRequest';
import useAuth from '../../hooks/useAuth';
import { Icon } from '@iconify-icon/react';
import './OrgInviteLanding.scss';

function OrgInviteLanding() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const navigate = useNavigate();
    const { isAuthenticated, isAuthenticating, user, logout } = useAuth();
    const [state, setState] = useState('loading'); // loading | invalid | not_logged_in | wrong_user | ready
    const [inviteData, setInviteData] = useState(null);
    const [actionLoading, setActionLoading] = useState(false);

    const redirectPath = token ? `/org-invites?token=${token}` : '/org-invites';
    const loginUrl = `/login?redirect=${encodeURIComponent(redirectPath)}`;
    const registerUrl = `/register?redirect=${encodeURIComponent(redirectPath)}`;

    useEffect(() => {
        if (!token) {
            setState('invalid');
            return;
        }

        apiRequest(`/org-invites/validate/${token}`, null, { method: 'GET' })
            .then((res) => {
                if (res.success && res.data) {
                    setInviteData(res.data);
                } else {
                    setState('invalid');
                }
            })
            .catch(() => setState('invalid'));
    }, [token]);

    useEffect(() => {
        if (!inviteData || isAuthenticating) return;
        if (!isAuthenticated) {
            setState('not_logged_in');
        } else {
            const userEmail = user?.email?.toLowerCase();
            const inviteEmail = inviteData.email?.toLowerCase();
            if (userEmail !== inviteEmail) {
                setState('wrong_user');
            } else {
                setState('ready');
            }
        }
    }, [isAuthenticated, isAuthenticating, user, inviteData]);

    const handleSwitchAccounts = async () => {
        await logout();
        navigate(loginUrl, { replace: true });
    };

    const handleAccept = async () => {
        if (!token) return;
        setActionLoading(true);
        try {
            const res = await apiRequest('/org-invites/accept-by-token', { token }, { method: 'POST' });
            if (res.success) {
                navigate('/events-dashboard', { replace: true });
            } else {
                setState('invalid');
            }
        } catch {
            setState('invalid');
        } finally {
            setActionLoading(false);
        }
    };

    const handleDecline = async () => {
        if (!token) return;
        setActionLoading(true);
        try {
            await apiRequest('/org-invites/decline-by-token', { token }, { method: 'POST' });
            navigate('/events-dashboard', { replace: true });
        } catch {
            setState('invalid');
        } finally {
            setActionLoading(false);
        }
    };

    if (state === 'loading') {
        return (
            <div className="org-invite-landing">
                <div className="org-invite-landing-card">
                    <div className="org-invite-landing__body">
                        <div className="org-invite-landing-loading">
                            <Icon icon="svg-spinners:90-ring-with-bg" className="spinner" />
                            <p>Loading invitation...</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (state === 'invalid') {
        return (
            <div className="org-invite-landing">
                <div className="org-invite-landing-card">
                    <div className="org-invite-landing__header">
                        <Icon icon="mdi:link-off" className="org-invite-landing-icon error" />
                        <h2>Invalid or Expired Invitation</h2>
                        <p>This invitation link is invalid or has expired. Please request a new invitation from the organization.</p>
                    </div>
                    <div className="org-invite-landing__body">
                        <Link to="/events-dashboard" className="org-invite-landing-btn primary">
                            Go to Dashboard
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    if (state === 'not_logged_in') {
        return (
            <div className="org-invite-landing">
                <div className="org-invite-landing-card">
                    <div className="org-invite-landing__header">
                        <h2>You're Invited</h2>
                        <p>Sign in or create an account to accept this invitation.</p>
                    </div>
                    <div className="org-invite-landing__body">
                        <div className="org-invite-landing__info-box">
                            <Icon icon="mdi:email-outline" className="org-invite-landing-icon" />
                            <div>
                                <p><strong>{inviteData?.orgName || 'An organization'}</strong> has invited you to join.</p>
                                {inviteData?.inviterName && (
                                    <p className="org-invite-landing-inviter">Invited by {inviteData.inviterName}</p>
                                )}
                            </div>
                        </div>
                        <div className="org-invite-landing-actions">
                            <Link to={loginUrl} className="org-invite-landing-btn primary">
                                Log in to accept
                            </Link>
                            <Link to={registerUrl} className="org-invite-landing-btn secondary">
                                Create account
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (state === 'wrong_user') {
        return (
            <div className="org-invite-landing">
                <div className="org-invite-landing-card">
                    <div className="org-invite-landing__header">
                        <h2>Wrong Account</h2>
                        <p>Please switch accounts to accept this invitation.</p>
                    </div>
                    <div className="org-invite-landing__body">
                        <div className="org-invite-landing__info-box">
                            <Icon icon="mdi:account-switch-outline" className="org-invite-landing-icon warning" />
                            <div>
                                <p>This invitation was sent to <strong>{inviteData?.email}</strong>.</p>
                                <p>You're signed in as <strong>{user?.email}</strong>.</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            className="org-invite-landing-btn primary"
                            onClick={handleSwitchAccounts}
                        >
                            Switch accounts
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (state === 'ready') {
        return (
            <div className="org-invite-landing">
                <div className="org-invite-landing-card">
                    <div className="org-invite-landing__header">
                        <h2>Join {inviteData?.orgName || 'the organization'}</h2>
                        {inviteData?.inviterName && (
                            <p className="org-invite-landing-inviter">Invited by {inviteData.inviterName}</p>
                        )}
                    </div>
                    <div className="org-invite-landing__body">
                        <div className="org-invite-landing-actions">
                            <button
                                type="button"
                                className="org-invite-landing-btn primary"
                                onClick={handleAccept}
                                disabled={actionLoading}
                            >
                                {actionLoading ? 'Accepting...' : 'Accept'}
                            </button>
                            <button
                                type="button"
                                className="org-invite-landing-btn secondary"
                                onClick={handleDecline}
                                disabled={actionLoading}
                            >
                                Decline
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return null;
}

export default OrgInviteLanding;
