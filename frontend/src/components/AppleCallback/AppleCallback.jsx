import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import './AppleCallback.scss';

const AppleCallback = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { appleLogin, validateToken, user } = useAuth();
    const [status, setStatus] = useState('processing');
    const [error, setError] = useState(null);

    useEffect(() => {
        const handleAppleCallback = async () => {
            try {
                setStatus('processing');
                
                // Extract Apple Sign In response from URL parameters
                const urlParams = new URLSearchParams(location.search);
                const idToken = urlParams.get('id_token');
                const code = urlParams.get('code');
                const userParam = urlParams.get('user'); // JSON string with user info
                const state = urlParams.get('state'); // Can contain redirect destination
                
                // Parse user info if provided
                let userInfo = null;
                if (userParam) {
                    try {
                        userInfo = JSON.parse(decodeURIComponent(userParam));
                    } catch (e) {
                        console.error('Failed to parse user info:', e);
                    }
                }
                
                if (!idToken && !code) {
                    throw new Error('No authentication token received from Apple');
                }
                
                // If we have a code, we need to exchange it for an ID token
                // But Apple Sign In web flow typically returns id_token directly
                if (code && !idToken) {
                    throw new Error('Authorization code received but ID token exchange not implemented. Please use id_token flow.');
                }
                
                // Call the backend with the ID token
                await appleLogin(idToken, userInfo);
                
                // Validate token to ensure authentication succeeded
                await validateToken();
                
                setStatus('success');
                
                // Determine redirect destination
                let redirectTo = '/events-dashboard';
                
                // Check if state contains redirect path
                if (state) {
                    try {
                        const stateData = JSON.parse(decodeURIComponent(state));
                        if (stateData.redirect) {
                            redirectTo = stateData.redirect;
                        }
                    } catch (e) {
                        // If state is just a path, use it directly
                        if (state.startsWith('/')) {
                            redirectTo = state;
                        }
                    }
                }
                
                // If user is admin, redirect to admin dashboard
                if (user && user.roles && user.roles.includes('admin')) {
                    redirectTo = '/admin';
                }
                
                setTimeout(() => {
                    navigate(redirectTo, { replace: true });
                }, 1000);
                
            } catch (error) {
                console.error('Apple callback error:', error);
                setError(error.message || 'Apple authentication failed');
                setStatus('error');
                
                // Redirect to login after error
                setTimeout(() => {
                    navigate('/login', { 
                        replace: true,
                        state: { error: 'Apple Sign In failed. Please try again.' }
                    });
                }, 3000);
            }
        };

        handleAppleCallback();
    }, [location, navigate, appleLogin, validateToken, user]);

    if (status === 'processing') {
        return (
            <div className="apple-callback">
                <div className="callback-container">
                    <div className="loading-spinner">
                        <div className="spinner"></div>
                    </div>
                    <h2>Completing Authentication</h2>
                    <p>Please wait while we complete your login...</p>
                </div>
            </div>
        );
    }

    if (status === 'success') {
        return (
            <div className="apple-callback">
                <div className="callback-container">
                    <div className="success-icon">✓</div>
                    <h2>Authentication Successful</h2>
                    <p>Redirecting you to Meridian...</p>
                </div>
            </div>
        );
    }

    if (status === 'error') {
        return (
            <div className="apple-callback">
                <div className="callback-container">
                    <div className="error-icon">✗</div>
                    <h2>Authentication Failed</h2>
                    <p>{error || 'An error occurred during authentication.'}</p>
                    <p>Redirecting to login page...</p>
                </div>
            </div>
        );
    }

    return null;
};

export default AppleCallback;


