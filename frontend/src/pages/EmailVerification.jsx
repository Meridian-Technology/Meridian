import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '../components/Header/Header';
import logo from '../assets/red_logo.svg';
import { useNotification } from '../NotificationContext';
import './Login.scss';
import postRequest from '../utils/postRequest';
import useAuth from '../hooks/useAuth';

function EmailVerification() {
    const [email, setEmail] = useState('');
    const [verificationCode, setVerificationCode] = useState(['', '', '', '', '', '']);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCodeSent, setIsCodeSent] = useState(false);
    const [isCodeVerified, setIsCodeVerified] = useState(false);
    const [error, setError] = useState('');
    const [verificationStatus, setVerificationStatus] = useState('idle');
    const { addNotification } = useNotification();
    const navigate = useNavigate();
    const inputRefs = useRef([]);
    const { validateToken, user } = useAuth();
    // Initialize refs for each input field
    useEffect(() => {
        inputRefs.current = inputRefs.current.slice(0, 6);
    }, []);

    useEffect(() => {
        if (user.affiliatedEmailVerified) {
            navigate('/settings');
        }
    }, [user.affiliatedEmailVerified, navigate]);

    // Auto-verify when all digits are entered
    useEffect(() => {
        const isComplete = verificationCode.every(digit => digit !== '');
        if (isComplete && isCodeSent && verificationStatus === 'idle') {
            handleVerifyCode();
        }
    }, [verificationCode, isCodeSent]);

    const handleRequestCode = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError('');

        try {
            const response = await postRequest('/verify-affiliated-email/request', { email });
            console.log(response);
            if (!response.error) {
                setIsCodeSent(true);
                addNotification({ 
                    title: 'Code Sent', 
                    message: 'Verification code has been sent to your .edu email.',
                    type: 'success' 
                });
                // Focus the first input after code is sent
                setTimeout(() => {
                    if (inputRefs.current[0]) {
                        inputRefs.current[0].focus();
                    }
                }, 100);
            } else {
                addNotification({
                    title: 'Error',
                    message: response.message,
                    type: 'error'
                });
            }
        } catch (error) {
            console.error('Error requesting verification code:', error);
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

    const handleVerifyCode = async () => {
        const codeString = verificationCode.join('');
        
        if (codeString.length !== 6) return;
        
        setIsSubmitting(true);
        setError('');
        setVerificationStatus('verifying');

        try {
            const response = await postRequest('/verify-affiliated-email/verify', { 
                email, 
                code: codeString
            });
            
            if (!response.error) {
                setIsCodeVerified(true);
                setVerificationStatus('success');
                addNotification({ 
                    title: 'Email Verified', 
                    message: 'Your .edu email has been successfully verified.',
                    type: 'success' 
                });
                
                validateToken();
                setTimeout(() => {
                    navigate('/settings'); // Redirect to profile page after verification
                }, 1000);
            }
        } catch (error) {
            console.error('Error verifying code:', error);
            setError(error.response?.data?.message || 'An error occurred. Please try again.');
            setVerificationStatus('error');
            addNotification({ 
                title: 'Error', 
                message: error.response?.data?.message || 'An error occurred. Please try again.',
                type: 'error' 
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCodeChange = (index, value) => {
        if (!/^\d*$/.test(value)) return;
        
        if (verificationStatus === 'error') {
            setVerificationStatus('idle');
            setError('');
        }
        
        const newCode = [...verificationCode];
        newCode[index] = value;
        setVerificationCode(newCode);
        
        if (value && index < 5) {
            inputRefs.current[index + 1].focus();
        }
    };

    const handleKeyDown = (index, e) => {
        if (e.key === 'Backspace' && !verificationCode[index] && index > 0) {
            inputRefs.current[index - 1].focus();
        }
    };

    const handlePaste = (e) => {
        e.preventDefault();
        const pastedData = e.clipboardData.getData('text').slice(0, 6);
        
        if (!/^\d*$/.test(pastedData)) return;
        
        if (verificationStatus === 'error') {
            setVerificationStatus('idle');
            setError('');
        }
        
        const newCode = [...verificationCode];
        for (let i = 0; i < pastedData.length; i++) {
            newCode[i] = pastedData[i];
        }
        setVerificationCode(newCode);
        
        if (pastedData.length < 6) {
            inputRefs.current[pastedData.length].focus();
        }
    };

    const getInputClass = (index) => {
        const baseClass = 'verification-code-digit';
        
        if (verificationStatus === 'verifying') {
            return `${baseClass} verifying`;
        } else if (verificationStatus === 'success') {
            return `${baseClass} success`;
        } else if (verificationStatus === 'error') {
            return `${baseClass} error`;
        }
        
        return baseClass;
    };

    return (
        <div className="main-login verify-email">
            <div className="login-container">
                <img src={logo} alt="Study Compass Logo" className="logo" />
                
                {!isCodeSent ? (
                    <>
                        <h2 className="form-title">Verify Your .edu Email</h2>
                        <p className="form-subtitle">
                            Enter your .edu email address to verify your school affiliation.
                        </p>
                        
                        <form onSubmit={handleRequestCode} className="email-verification-form form">
                            <div className="form-group">
                                <label htmlFor="email">.edu Email Address</label>
                                <input
                                    type="email"
                                    id="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    placeholder="Enter your .edu email"
                                    pattern="[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$"
                                />
                            </div>
                            
                            {error && <div className="error-message">{error}</div>}
                            
                            <button 
                                type="submit" 
                                className="active button submit-button"
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? 'Sending...' : 'Send Verification Code'}
                            </button>
                        </form>
                    </>
                ) : (
                    <>
                        <h2 className="form-title">Enter Verification Code</h2>
                        <p className="form-subtitle">
                            We've sent a verification code to <strong>{email}</strong>. Please enter it below.
                        </p>
                        
                        <div className="verify-code-form">
                            <div className="form-group">
                                <label htmlFor="verificationCode">Verification Code</label>
                                <div className="verification-code-container" onPaste={handlePaste}>
                                    {verificationCode.map((digit, index) => (
                                        <input
                                            key={index}
                                            ref={el => inputRefs.current[index] = el}
                                            type="text"
                                            maxLength={1}
                                            value={digit}
                                            onChange={(e) => handleCodeChange(index, e.target.value)}
                                            onKeyDown={(e) => handleKeyDown(index, e)}
                                            className={getInputClass(index)}
                                            required
                                            disabled={verificationStatus === 'verifying' || verificationStatus === 'success'}
                                        />
                                    ))}
                                </div>
                                {verificationStatus === 'verifying' && (
                                    <div className="verification-status verifying">
                                        Verifying code...
                                    </div>
                                )}
                                {verificationStatus === 'success' && (
                                    <div className="verification-status success">
                                        Email verified! Redirecting...
                                    </div>
                                )}
                            </div>
                            
                            {error && <div className="error-message">{error}</div>}
                        </div>
                    </>
                )}
                
                <div className="form-footer">
                    <Link to="/settings" className="back-to-profile">
                        Back to Settings
                    </Link>
                </div>
            </div>
        </div>
    );
}

export default EmailVerification; 