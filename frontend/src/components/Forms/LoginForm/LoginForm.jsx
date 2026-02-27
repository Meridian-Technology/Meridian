import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useLocation, useSearchParams } from 'react-router-dom';
import '../Forms.scss';
import { generalIcons } from '../../../Icons';
import useAuth from '../../../hooks/useAuth';
import circleWarning from '../../../assets/circle-warning.svg';
import { useGoogleLogin } from '@react-oauth/google';
import axios from 'axios';
import Flag from '../../Flag/Flag';
import SAMLLoginButton from '../SAMLLoginButton/SAMLLoginButton';
import { isSAMLEnabled, getUniversityDisplayName, getUniversityLogo, getUniversityClassName } from '../../../config/universities';
import {Icon} from '@iconify-icon/react/dist/iconify.mjs';

function LoginForm() {
    const { isAuthenticated, login, googleLogin, appleLogin } = useAuth();
    let navigate =  useNavigate();
    const [valid, setValid] = useState(false);
    const [formData, setFormData] = useState({
        email: '',
        password: ''
    });
    const [errorText, setErrorText] = useState("");
    const [loadContent, setLoadContent] = useState(false);
    const [email, setEmail] = useState(false);
    
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
        await login(formData);
        sessionStorage.removeItem('login_redirect');
        navigate(from, { replace: true });
        // Handle success (e.g., store the token and redirect to a protected page)
      } catch (error) {
        console.error('Login failed:', error);
        setErrorText("Invalid Username/Email or Password. Please try again");
        // Handle errors (e.g., display error message)
      }
    }

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
                const codeResponse = await googleLogin(code, false);
                console.log("codeResponse: " + codeResponse);
                sessionStorage.removeItem('login_redirect');
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
    })

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
  
    
    
    return (
      <div className='form'>
          <h1>Welcome Back!</h1>
        {errorText !== "" && 
            <Flag text={errorText} img={circleWarning} color={"#FD5858"} primary={"rgba(250, 117, 109, 0.16)"} accent={"#FD5858"} /> 
        }

        {/* SAML Login Button - Show first if enabled */}
        {samlEnabled && (
            <SAMLLoginButton
                universityName={universityName}
                universityLogo={universityLogo}
                className={universityClassName}
                onError={setErrorText}
                relayState={from}
            />
        )}

        {/* Google Login Button */}
        <button type="button" className="button google" onClick={() => google()}>
        <img src={googleLogo} alt="google"/>
            Continue with Google
            </button>

        {/* Apple Login Button */}
        <button 
            type="button" 
            className="button apple" 
            onClick={handleAppleSignIn}
        >
            <Icon icon="mdi:apple" />
            Continue with Apple
        </button>

        <div className="divider">
            <hr/>
            <p>or</p>
            <hr/>
        </div>

        <div className={`email-form ${email ? "disappear-show" : ""}`}>
            
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
        </div>

      </div>
    );
  }
  
  export default LoginForm;