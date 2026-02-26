import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Icon } from '@iconify-icon/react';
import { useGoogleLogin } from '@react-oauth/google';
import useAuth from '../../hooks/useAuth';
import { generalIcons } from '../../Icons';
import './RegistrationPrompt.scss';

/**
 * Shown after an anonymous user completes event registration, or to prompt sign-up before an action (e.g. create club).
 * Offers Google/Apple sign-up in place, or link to full register page.
 * @param {string} [title] - Override default title (e.g. "Create your account")
 * @param {string} [subtitle] - Override default subtitle
 * @param {string} [dismissButtonText] - Override "Maybe later" button text (e.g. "Cancel")
 */
const RegistrationPrompt = ({ onSignUp, onSignUpSuccess, onDismiss, eventName, title: titleProp, subtitle: subtitleProp, dismissButtonText = 'Maybe later' }) => {
    const location = useLocation();
    const { googleLogin } = useAuth();
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const redirectPath = location.pathname || '/events-dashboard';
    const googleLogo = generalIcons?.google;

    // Google: use popup so we stay on the event page; redirect_uri must be 'postmessage' for popup auth-code flow
    const google = useGoogleLogin({
        flow: 'auth-code',
        ux_mode: 'popup',
        redirect_uri: 'postmessage',
        onSuccess: async (codeResponse) => {
            setError('');
            setLoading(true);
            try {
                const codeVerifier = codeResponse.code_verifier || null;
                await googleLogin(codeResponse.code, true, codeVerifier, 'postmessage');
                onSignUpSuccess?.();
            } catch (err) {
                if (err.response?.status === 409) {
                    setError('An account with this email already exists. Try logging in instead.');
                } else {
                    setError('Google sign-up failed. Please try again.');
                }
            } finally {
                setLoading(false);
            }
        },
        onFailure: () => {
            setError('Google sign-up was cancelled or failed.');
            setLoading(false);
        },
    });

    // Apple: init same as RegisterForm; redirect with state so callback sends user back here
    useEffect(() => {
        if (typeof window !== 'undefined' && window.AppleID) {
            window.AppleID.auth.init({
                clientId: 'com.meridian.auth',
                scope: 'name email',
                redirectURI: window.location.origin + '/auth/apple/callback',
                usePopup: false,
            });
        }
    }, []);

    const handleAppleSignIn = () => {
        setError('');
        if (!window.AppleID) {
            setError('Apple Sign In is not available in this browser.');
            return;
        }
        const state = JSON.stringify({ redirect: redirectPath });
        window.AppleID.auth.signIn({ state });
    };

    return (
        <div className="registration-prompt">
            <div className="registration-prompt-content">
                <div className="registration-prompt-header">
                    <div className="registration-prompt-success-icon">
                        <Icon icon="mdi:check-circle" />
                    </div>
                    <h2 className="registration-prompt-title">
                        {titleProp != null ? titleProp : (eventName ? `You're registered for ${eventName}` : "You're registered for this event.")}
                    </h2>
                    <p className="registration-prompt-subtitle">
                        {subtitleProp != null ? subtitleProp : 'Create a free account to manage your events in one place and register with one click next time.'}
                    </p>
                </div>
                <div className="registration-prompt-actions">
                    {error && (
                        <p className="registration-prompt-error" role="alert">
                            {error}
                        </p>
                    )}
                    <button
                        type="button"
                        className="registration-prompt-btn registration-prompt-btn-google"
                        onClick={() => google()}
                        disabled={loading}
                    >
                        {loading ? (
                            <span className="registration-prompt-btn-loading">Signing up…</span>
                        ) : (
                            <>
                                {googleLogo && <img src={googleLogo} alt="" />}
                                Continue with Google
                            </>
                        )}
                    </button>
                    <button
                        type="button"
                        className="registration-prompt-btn registration-prompt-btn-apple"
                        onClick={handleAppleSignIn}
                        disabled={loading}
                    >
                        <Icon icon="mdi:apple" />
                        Continue with Apple
                    </button>
                    <button
                        type="button"
                        className="registration-prompt-btn registration-prompt-btn-email"
                        onClick={onSignUp}
                    >
                        <Icon icon="mdi:email-outline" />
                        Register with email
                    </button>
                    <button type="button" className="registration-prompt-btn secondary" onClick={onDismiss}>
                        {dismissButtonText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RegistrationPrompt;
