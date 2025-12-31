import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Header from '../components/Header/Header';
import logo from '../assets/Brand Image/BEACON.svg';
import { useNotification } from '../NotificationContext';
import './Login.scss';

function ForgotPassword() {
    const [email, setEmail] = useState('');
    const [verificationCode, setVerificationCode] = useState(['', '', '', '', '', '']);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCodeSent, setIsCodeSent] = useState(false);
    const [isCodeVerified, setIsCodeVerified] = useState(false);
    const [error, setError] = useState('');
    const [verificationStatus, setVerificationStatus] = useState('idle'); // idle, verifying, success, error
    const { addNotification } = useNotification();
    const navigate = useNavigate();
    const inputRefs = useRef([]);

    // Initialize refs for each input field
    useEffect(() => {
        inputRefs.current = inputRefs.current.slice(0, 6);
    }, []);

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
            const response = await axios.post('/forgot-password', { email });
            
            if (response.data.success) {
                setIsCodeSent(true);
                addNotification({ 
                    title: 'Code Sent', 
                    message: 'Password reset code has been sent to your email.',
                    type: 'success' 
                });
                // Focus the first input after code is sent
                setTimeout(() => {
                    if (inputRefs.current[0]) {
                        inputRefs.current[0].focus();
                    }
                }, 100);
            }
        } catch (error) {
            console.error('Error requesting password reset code:', error);
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
        // Combine the verification code array into a single string
        const codeString = verificationCode.join('');
        
        // Don't verify if code is incomplete
        if (codeString.length !== 6) return;
        
        setIsSubmitting(true);
        setError('');
        setVerificationStatus('verifying');

        try {
            const response = await axios.post('/verify-code', { 
                email, 
                code: codeString
            });
            
            if (response.data.success) {
                setIsCodeVerified(true);
                setVerificationStatus('success');
                addNotification({ 
                    title: 'Code Verified', 
                    message: 'Verification code is valid. Please set your new password.',
                    type: 'success' 
                });
                
                // Add a delay before redirecting to give users time to see the success state
                setTimeout(() => {
                    // Redirect to reset password page with email and code as query params
                    navigate(`/reset-password?email=${encodeURIComponent(email)}&code=${encodeURIComponent(codeString)}`);
                }, 1000); // 1 second delay
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

    // Handle input change for verification code
    const handleCodeChange = (index, value) => {
        // Only allow numbers
        if (!/^\d*$/.test(value)) return;
        
        // Reset verification status when user starts typing again
        if (verificationStatus === 'error') {
            setVerificationStatus('idle');
            setError('');
        }
        
        const newCode = [...verificationCode];
        newCode[index] = value;
        setVerificationCode(newCode);
        
        // Auto-advance to next input if a digit was entered
        if (value && index < 5) {
            inputRefs.current[index + 1].focus();
        }
    };

    // Handle keydown events for verification code inputs
    const handleKeyDown = (index, e) => {
        // Handle backspace
        if (e.key === 'Backspace' && !verificationCode[index] && index > 0) {
            inputRefs.current[index - 1].focus();
        }
    };

    // Handle paste event for verification code
    const handlePaste = (e) => {
        e.preventDefault();
        const pastedData = e.clipboardData.getData('text').slice(0, 6);
        
        if (!/^\d*$/.test(pastedData)) return;
        
        // Reset verification status when user pastes a new code
        if (verificationStatus === 'error') {
            setVerificationStatus('idle');
            setError('');
        }
        
        const newCode = [...verificationCode];
        for (let i = 0; i < pastedData.length; i++) {
            newCode[i] = pastedData[i];
        }
        setVerificationCode(newCode);
        
        // Focus the appropriate input after paste
        if (pastedData.length < 6) {
            inputRefs.current[pastedData.length].focus();
        }
    };

    // Get the CSS class for each input based on verification status
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
        <div className="main-login" style={{justifyContent: 'center'}}>
            <div className="login-container">
                <img src={logo} alt="Study Compass Logo" className="logo" />
                
                {!isCodeSent ? (
                    <>
                        <h2 className="form-title">Forgot Password?</h2>
                        <p className="form-subtitle">
                            No worries! Enter your email address and we'll send you a verification code to reset your password.
                        </p>
                        
                        <form onSubmit={handleRequestCode} className="forgot-password-form form">
                            <div className="form-group">
                                <label htmlFor="email">Email Address</label>
                                <input
                                    type="email"
                                    id="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    placeholder="Enter your email"
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
                                        Code verified! Redirecting...
                                    </div>
                                )}
                            </div>
                            
                            {error && <div className="error-message">{error}</div>}
                        </div>
                    </>
                )}
                
                <div className="form-footer">
                    <Link to="/login" className="back-to-login">
                        Back to Login
                    </Link>
                </div>
            </div>
        </div>
    );
}

export default ForgotPassword; 