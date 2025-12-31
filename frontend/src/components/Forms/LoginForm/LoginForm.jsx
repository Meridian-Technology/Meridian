import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
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
    const redirectPathRef = useRef(null);
    const [isGoogleLoginInProgress, setIsGoogleLoginInProgress] = useState(false);
    const [isAppleLoginInProgress, setIsAppleLoginInProgress] = useState(false);
    
    const googleLogo = generalIcons.google;
    
    // Store the redirect path when component mounts or location changes
    useEffect(() => {
        if (location.state?.from?.pathname) {
            redirectPathRef.current = location.state.from.pathname;
            console.log('LoginForm - stored redirect path:', redirectPathRef.current);
        }
    }, [location.state]);
    
    const from = redirectPathRef.current || location.state?.from?.pathname || '/events-dashboard';
    console.log('LoginForm - location.state:', location.state);
    console.log('LoginForm - from pathname:', from);

    // Get university info for SAML
    const universityName = getUniversityDisplayName();
    const universityLogo = getUniversityLogo();
    const universityClassName = getUniversityClassName();
    const samlEnabled = isSAMLEnabled();

    useEffect(() => {
      if (isAuthenticated && !isGoogleLoginInProgress && !isAppleLoginInProgress){
        console.log("logged in already");
        console.log("auto-redirecting to:", from);
        navigate(from, { replace: true })
      }
    },[isAuthenticated, navigate, from, isGoogleLoginInProgress, isAppleLoginInProgress]);

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
        console.log("logged in");
        console.log("redirecting to:", from);
        navigate(from,{ replace: true })
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
                console.log("Google login successful, redirecting to:", redirectPathRef.current || from);
                // Navigate after successful Google login
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
                redirectURI: 'https://meridian.study/login',
                usePopup: false
            });
        }
    }, []);

    const handleAppleSignIn = async () => {
        if (!window.AppleID) {
            failed("Apple Sign In is not available. Please check your browser compatibility.");
            return;
        }

        try {
            setIsAppleLoginInProgress(true);
            const response = await window.AppleID.auth.signIn();
            
            if (response && response.id_token) {
                // Extract user info if provided (only on first sign-in)
                const user = response.user || null;
                
                await appleLogin(response.id_token, user);
                console.log("Apple login successful, redirecting to:", redirectPathRef.current || from);
                navigate(redirectPathRef.current || from, { replace: true });
            } else {
                throw new Error("No ID token received from Apple");
            }
        } catch (error) {
            setIsAppleLoginInProgress(false);
            if (error.error === 'popup_closed_by_user') {
                // User cancelled, don't show error
                return;
            }
            console.error("Apple login failed:", error);
            if (error.response && error.response.status === 409) {
                failed("Email already exists");
            } else {
                failed("Apple login failed. Please try again");
            }
        }
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
            disabled={isAppleLoginInProgress}
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
                <p className={`already ${email ? "disappear-show" : ""}`}>Don't have an account? <Link to="/register" state={{from:location.state?.from || "/room/none"}} replace>Register</Link></p>
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
                    <p className="already">Don't have an account? <Link to="/register" state={{from:location.state?.from || "/room/none"}}>Register</Link></p>
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