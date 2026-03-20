import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useLocation, useSearchParams, Navigate } from 'react-router-dom';
import '../Forms.scss';
import { generalIcons } from '../../../Icons';
import useAuth from '../../../hooks/useAuth';
import circleWarning from '../../../assets/circle-warning.svg';
import { useGoogleLogin } from '@react-oauth/google';
import axios from 'axios';
import Flag from '../../Flag/Flag';
import SAMLLoginButton from '../SAMLLoginButton/SAMLLoginButton';
import { isSAMLEnabled, getUniversityDisplayName, getUniversityLogo, getUniversityClassName } from '../../../config/universities';
import { isWww } from '../../../config/tenantRedirect';
import TenantSelectorBanner from '../TenantSelectorBanner/TenantSelectorBanner';
import {Icon} from '@iconify-icon/react/dist/iconify.mjs';
import { startAuthentication } from '@simplewebauthn/browser';

function LoginForm() {
    const { isAuthenticated, login, googleLogin, appleLogin, verifyAdminMfaTotp, getAdminMfaPasskeyOptions, verifyAdminMfaPasskey } = useAuth();
    let navigate =  useNavigate();
    const [valid, setValid] = useState(false);
    const [formData, setFormData] = useState({
        email: '',
        password: ''
    });
    const [errorText, setErrorText] = useState("");
    const [loadContent, setLoadContent] = useState(false);
    const [email, setEmail] = useState(false);
    const [mfaRequired, setMfaRequired] = useState(false);
    const [mfaMethods, setMfaMethods] = useState([]);
    const [mfaToken, setMfaToken] = useState(null);
    const [totpCode, setTotpCode] = useState('');
    const [mfaBusy, setMfaBusy] = useState(false);
    
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const redirectPathRef = useRef(null);
    const [isGoogleLoginInProgress, setIsGoogleLoginInProgress] = useState(false);
    
    const googleLogo = generalIcons.google;
    
    // Resolve redirect: prefer ?redirect= param (for invite links), then sessionStorage (OAuth return), then location.state.from
    // If redirect is org-invite URL, use dashboard instead - the OrgInviteModal popup will show the invite (avoids double display)
    const redirectFromUrl = searchParams.get('redirect');
    const storedRedirect = typeof window !== 'undefined' ? sessionStorage.getItem('login_redirect') : null;
    const rawFrom = redirectFromUrl || storedRedirect || redirectPathRef.current || location.state?.from?.pathname || '/events-dashboard';
    const from = rawFrom?.startsWith('/org-invites') ? '/events-dashboard' : rawFrom;
    
    // Store the redirect path when component mounts (for OAuth callbacks - URL is lost on return)
    useEffect(() => {
        if (redirectFromUrl) {
            redirectPathRef.current = redirectFromUrl;
            sessionStorage.setItem('login_redirect', redirectFromUrl);
        } else if (location.state?.from?.pathname) {
            redirectPathRef.current = location.state.from.pathname;
            sessionStorage.setItem('login_redirect', location.state.from.pathname);
        }
    }, [redirectFromUrl, location.state]);

    // Get university info for SAML
    const universityName = getUniversityDisplayName();
    const universityLogo = getUniversityLogo();
    const universityClassName = getUniversityClassName();
    const samlEnabled = isSAMLEnabled();

    useEffect(() => {
      if (isAuthenticated && !isGoogleLoginInProgress){
        sessionStorage.removeItem('login_redirect');
        navigate(from, { replace: true });
      }
    },[isAuthenticated, navigate, from, isGoogleLoginInProgress]);

    useEffect(() => {
        async function loadPendingMfa() {
            if (searchParams.get('mfa') !== 'required') return;
            try {
                const response = await axios.get('/mfa/pending', { withCredentials: true });
                const data = response?.data?.data || {};
                if (data.requiresMfa) {
                    setMfaRequired(true);
                    setMfaMethods(data.methods || []);
                }
            } catch (err) {
                setErrorText('Your MFA session expired. Please log in again.');
            }
        }
        loadPendingMfa();
    }, [searchParams]);

    useEffect(() => {
        // const token = localStorage.getItem('token'); // or sessionStorage
        if (formData.email !== '' && formData.password !== ''){
            setValid(true);
        } else {
            setValid(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    },[formData.email, formData.password]);
    
    
    const handleChange = (e) => {
      setFormData({ ...formData, [e.target.name]: e.target.value });
    }
  
    const handleSubmit = async (e) => {
      e.preventDefault();
      try {
        const result = await login(formData);
        if (result && result.requiresMfa) {
            setMfaRequired(true);
            setMfaMethods(result.methods || []);
            setMfaToken(result.mfaToken || null);
            setErrorText('');
            return;
        }
        sessionStorage.removeItem('login_redirect');
        navigate(from, { replace: true });
      } catch (error) {
        console.error('Login failed:', error);
        setErrorText("Invalid Username/Email or Password. Please try again");
      }
    }

    const handleTotpVerification = async (e) => {
        e.preventDefault();
        if (!totpCode) return;
        try {
            setMfaBusy(true);
            await verifyAdminMfaTotp(totpCode, mfaToken);
            sessionStorage.removeItem('login_redirect');
            navigate(from, { replace: true });
        } catch (error) {
            setErrorText(error?.response?.data?.message || 'Invalid authenticator code. Please try again.');
        } finally {
            setMfaBusy(false);
        }
    };

    const handlePasskeyVerification = async () => {
        try {
            setMfaBusy(true);
            const options = await getAdminMfaPasskeyOptions(mfaToken);
            const credential = await startAuthentication({ optionsJSON: options });
            await verifyAdminMfaPasskey(credential, mfaToken);
            sessionStorage.removeItem('login_redirect');
            navigate(from, { replace: true });
        } catch (error) {
            setErrorText(error?.response?.data?.message || 'Passkey verification failed. Please try again.');
        } finally {
            setMfaBusy(false);
        }
    };

    function debounce(func, wait) { //move logic to other file
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }


    useEffect(() => {
        async function googleLog(code) {
            try{
                setIsGoogleLoginInProgress(true);
                const school = sessionStorage.getItem('login_school');
                const opts = school ? { school } : {};
                const codeResponse = await googleLogin(code, false, undefined, undefined, opts);
                if (codeResponse && codeResponse.requiresMfa) {
                    setMfaRequired(true);
                    setMfaMethods(codeResponse.methods || []);
                    setMfaToken(codeResponse.mfaToken || null);
                    setIsGoogleLoginInProgress(false);
                    return;
                }
                sessionStorage.removeItem('login_redirect');
                sessionStorage.removeItem('login_school');
                navigate(redirectPathRef.current || from, { replace: true });
            } catch (error){
                setIsGoogleLoginInProgress(false);
                if(error.response.status  === 409){
                    failed("Email already exists");
                } else {
                    console.error("Google login failed:", error);
                    failed("Google login failed. Please try again");
                }
            }
        }
        // Extract the code from the URL
        console.log(location);
        const queryParams = new URLSearchParams(location.search);
        const code = queryParams.get('code');
        const debouncedGoogle = debounce(googleLog, 500);
        if (code) {
            setLoadContent(false);
            debouncedGoogle(code); 
            console.log("code: " + code);
        } else {
            setLoadContent(true);
        }

    }, [location, navigate, from]);

    const google = useGoogleLogin({
        onSuccess: () => { console.log("succeeded") },
        flow: 'auth-code',
        ux_mode: 'redirect',
        onFailure: () => {failed("Google login failed. Please try again")},
    });

    const handleGoogleClick = () => {
        google();
    };

    const handleAppleClick = () => {
        handleAppleSignIn();
    };

    // Initialize Apple Sign In
    useEffect(() => {
        if (window.AppleID) {
            window.AppleID.auth.init({
                clientId: 'com.meridian.auth',
                scope: 'name email',
                redirectURI: window.location.origin + '/auth/apple/callback',
                usePopup: false // Use redirect mode
            });
        }
    }, []);

    const handleAppleSignIn = () => {
        if (!window.AppleID) {
            failed("Apple Sign In is not available. Please check your browser compatibility.");
            return;
        }

        // Store redirect path in state for callback to use
        const redirectState = JSON.stringify({ redirect: redirectPathRef.current || from });
        
        // Initiate Apple Sign In - will redirect to callback URL
        window.AppleID.auth.signIn({
            state: redirectState
        });
    };

    function failed(message){
        navigate('/login');
        setErrorText(message);
    }
    function register(){
        navigate('/register');
    }

    if (!loadContent) {
        return ("");
    }

    if (isWww() && !(process.env.NODE_ENV !== 'production' && typeof window !== 'undefined' && localStorage.getItem('devTenantOverride'))) {
        return <Navigate to="/select-school" replace />;
    }
  
    return (
      <div className='form'>
          <TenantSelectorBanner />
          <h1>Welcome Back!</h1>
        {errorText !== "" && 
            <Flag text={errorText} img={circleWarning} color={"#FD5858"} primary={"rgba(250, 117, 109, 0.16)"} accent={"#FD5858"} /> 
        }

        {/* SAML Login Button - Show first if enabled */}
        {/* {samlEnabled && (
            <SAMLLoginButton
                universityName={universityName}
                universityLogo={universityLogo}
                className={universityClassName}
                onError={setErrorText}
                relayState={from}
            />
        )} */}

        {!mfaRequired && (
            <>
                {/* Google Login Button */}
                <button type="button" className="button google" onClick={handleGoogleClick}>
                <img src={googleLogo} alt="google"/>
                    Continue with Google
                    </button>

                {/* Apple Login Button */}
                <button 
                    type="button" 
                    className="button apple" 
                    onClick={handleAppleClick}
                >
                    <Icon icon="mdi:apple" />
                    Continue with Apple
                </button>

                <div className="divider">
                    <hr/>
                    <p>or</p>
                    <hr/>
                </div>
            </>
        )}

        <div className={`email-form ${email ? "disappear-show" : ""}`}>
            {mfaRequired && (
                <div className="form-content" style={{ marginBottom: '1rem' }}>
                    <div className="email">
                        <p>Admin Verification Required</p>
                        <p style={{ opacity: 0.8, fontSize: '0.9rem' }}>
                            Complete MFA to access admin features in this tenant.
                        </p>
                    </div>
                    {mfaMethods.includes('passkey') && (
                        <button
                            type="button"
                            className="button active"
                            onClick={handlePasskeyVerification}
                            disabled={mfaBusy}
                        >
                            {mfaBusy ? 'Verifying...' : 'Use Passkey'}
                        </button>
                    )}
                    {mfaMethods.includes('totp') && (
                        <form onSubmit={handleTotpVerification}>
                            <div className="email">
                                <p>Authenticator Code</p>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    value={totpCode}
                                    onChange={(event) => setTotpCode(event.target.value)}
                                    placeholder="123456"
                                    required
                                />
                            </div>
                            <button type="submit" className="button active" disabled={mfaBusy}>
                                {mfaBusy ? 'Verifying...' : 'Verify Code'}
                            </button>
                        </form>
                    )}
                    {mfaMethods.length === 0 && (
                        <p style={{ opacity: 0.8 }}>No configured MFA method found for this challenge. Please log in again.</p>
                    )}
                </div>
            )}
            
            {!mfaRequired && (
                <>
                    <div className="login-button">
                        <button type="button" className={`show-email button active ${email ? "disappear-show" : ""}`} onClick={(e)=>{e.preventDefault();setEmail(true)}}>
                            Login with Email
                        </button>
                        <p className={`already ${email ? "disappear-show" : ""}`}>Don't have an account? <Link to={from !== '/events-dashboard' ? `/register?redirect=${encodeURIComponent(from)}` : '/register'} state={{ from: { pathname: from } }} replace>Register</Link></p>
                    </div>

                    <form  onSubmit={handleSubmit}  className="form-content" >
                        <div className="email">
                            <p>Username/Email</p>
                            <input type="text" name="email" value={formData.email} onChange={handleChange} placeholder="Valid username/email..." required />
                        </div>
                        <div className="password">
                            <p>Password</p>
                            <input type="password" name="password" value={formData.password} onChange={handleChange} placeholder="Enter your password..." required />
                        </div>
                        <button type="submit" className={`button ${valid ? "active":""}`}>Log In</button>
                        <div className="form-footer">
                            <p className="already">Don't have an account? <Link to={from !== '/events-dashboard' ? `/register?redirect=${encodeURIComponent(from)}` : '/register'} state={{ from: { pathname: from } }}>Register</Link></p>
                            <Link to="/forgot-password" className="forgot-password-link">
                                Forgot Password?
                            </Link>
                        </div>
                    </form>
                </>
            )}
        </div>

      </div>
    );
  }
  
  export default LoginForm;