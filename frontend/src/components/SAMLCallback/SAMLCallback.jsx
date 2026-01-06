import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import './SAMLCallback.scss';

const SAMLCallback = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { validateToken, user } = useAuth();
    const [status, setStatus] = useState('processing');
    const [error, setError] = useState(null);

    useEffect(() => {
        const handleSAMLCallback = async () => {
            try {
                setStatus('processing');
                
                // Get relayState from URL parameters (passed by backend after SAML processing)
                const urlParams = new URLSearchParams(location.search);
                const relayState = urlParams.get('relayState');
                
                // The SAML response has already been processed by the backend
                // and cookies should be set. Let's validate the token.
                await validateToken();
                
                setStatus('success');
                
                // Determine redirect destination
                let redirectTo = relayState || '/room/none';
                
                // If user is admin, redirect to admin dashboard
                if (user && user.roles && user.roles.includes('admin')) {
                    redirectTo = '/admin';
                }
                
                setTimeout(() => {
                    navigate(redirectTo, { replace: true });
                }, 1000);
                
            } catch (error) {
                console.error('SAML callback error:', error);
                setError(error.message || 'SAML authentication failed');
                setStatus('error');
                
                // Redirect to login after error
                setTimeout(() => {
                    navigate('/login', { 
                        replace: true,
                        state: { error: 'SAML authentication failed. Please try again.' }
                    });
                }, 3000);
            }
        };

        handleSAMLCallback();
    }, [location, navigate, validateToken, user]);

    if (status === 'processing') {
        return (
            <div className="saml-callback">
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
            <div className="saml-callback">
                <div className="callback-container">
                    <div className="success-icon">✓</div>
                    <h2>Authentication Successful</h2>
                    <p>Redirecting you to Study Compass...</p>
                </div>
            </div>
        );
    }

    if (status === 'error') {
        return (
            <div className="saml-callback">
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

export default SAMLCallback; 