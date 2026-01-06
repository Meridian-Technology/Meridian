import React, { useState } from 'react';
import useAuth from '../../../hooks/useAuth';
import './SAMLLoginButton.scss';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';

const SAMLLoginButton = ({ 
    universityName = 'University', 
    className = '', 
    onError = null,
    relayState = null 
}) => {
    const { samlLogin } = useAuth();
    const [isLoading, setIsLoading] = useState(false);

    const handleSAMLLogin = async () => {
        setIsLoading(true);
        try {
            await samlLogin(relayState);
        } catch (error) {
            console.error('SAML login failed:', error);
            if (onError) {
                onError('SAML login failed. Please try again.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <button 
            type="button" 
            className={`saml-login-button ${className} ${isLoading ? 'loading' : ''}`}
            onClick={handleSAMLLogin}
            disabled={isLoading}
        >
            {isLoading ? (
                <div className="loading-spinner">
                    <div className="spinner"></div>
                </div>
            ) : (
                <>
                    <Icon icon="map:university" className="university-logo" />
                    <span className="button-text">
                        Continue with {universityName}
                    </span>
                </>
            )}
        </button>
    );
};

export default SAMLLoginButton; 