import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { isWww } from '../config/tenantRedirect';
import axios from 'axios';
import logo from '../assets/red_logo.svg';
import { useNotification } from '../NotificationContext';
import './Login.scss';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';

function ResetPassword() {
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [isReset, setIsReset] = useState(false);
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const { addNotification } = useNotification();
    const navigate = useNavigate();
    const location = useLocation();

    // Get email and code from URL query parameters
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const emailParam = params.get('email');
        const codeParam = params.get('code');
        
        if (!emailParam || !codeParam) {
            addNotification({ 
                title: 'Error', 
                message: 'Missing required information. Please try the forgot password process again.',
                type: 'error' 
            });
            navigate('/forgot-password');
            return;
        }
        
        setEmail(emailParam);
        setCode(codeParam);
    }, [location, navigate, addNotification]);

    if (isWww() && !(process.env.NODE_ENV !== 'production' && typeof window !== 'undefined' && localStorage.getItem('devTenantOverride'))) {
        const path = '/reset-password' + (location.search || '');
        return <Navigate to={`/select-school?next=${encodeURIComponent(path)}`} replace />;
    }

    // Validate passwords match
    const passwordsMatch = newPassword === confirmPassword;
    const isPasswordValid = newPassword.length >= 6;

    const handleResetPassword = async (e) => {
        e.preventDefault();
        
        if (!passwordsMatch) {
            setError('Passwords do not match');
            return;
        }
        
        if (!isPasswordValid) {
            setError('Password must be at least 6 characters long');
            return;
        }
        
        setIsSubmitting(true);
        setError('');

        try {
            const response = await axios.post('/reset-password', { 
                email, 
                code, 
                newPassword 
            });
            
            if (response.data.success) {
                setIsReset(true);
                addNotification({ 
                    title: 'Password Reset', 
                    message: 'Your password has been reset successfully.',
                    type: 'success' 
                });
                
                // Redirect to login after 3 seconds
                setTimeout(() => {
                    navigate('/login');
                }, 2000);
            }
        } catch (error) {
            console.error('Error resetting password:', error);
            setError(error.response?.data?.message || 'An error occurred. Please try again.');
            addNotification({ 
                title: 'Error', 
                message: error.response?.data?.message || 'An error occurred. Please try again.',
                type: 'error' 
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isReset) {
        return (
            <div className="main-login">
                <div className="block"></div>
                <div className="login-container">
                    <img src={logo} alt="Study Compass Logo" className="logo" />
                    <div className="success-message">
                        <h2><Icon icon="icon-park-solid:check-one"/> All done!</h2>
                        <p>Your password has been reset successfully.</p>
                        <p>You will be redirected to the login page in a few seconds.</p>
                        <Link to="/login" className="submit-button button active">
                            Go to Login
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="main-login">
            <div className="block"></div>

            <div className="login-container">
                <img src={logo} alt="Study Compass Logo" className="logo" />
                
                <h2 className="form-title">Reset Password</h2>
                <p className="form-subtitle">
                    Please enter your new password below.
                </p>
                
                <form onSubmit={handleResetPassword} className="reset-password-form form">
                    <div className="form-group">
                        <label htmlFor="newPassword">New Password</label>
                        <input
                            type="password"
                            id="newPassword"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            required
                            placeholder="Enter new password"
                        />
                    </div>
                    
                    <div className="form-group">
                        <label htmlFor="confirmPassword">Confirm Password</label>
                        <input
                            type="password"
                            id="confirmPassword"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            placeholder="Confirm new password"
                        />
                    </div>
                    
                    {error && <div className="error-message">{error}</div>}
                    
                    <button 
                        type="submit" 
                        className="submit-button button active"
                        disabled={isSubmitting || !passwordsMatch || !isPasswordValid}
                    >
                        {isSubmitting ? 'Resetting...' : 'Reset Password'}
                    </button>
                </form>
                
                <div className="form-footer">
                    <Link to="/login" className="back-to-login">
                        Back to Login
                    </Link>
                </div>
            </div>
        </div>
    );
}

export default ResetPassword; 