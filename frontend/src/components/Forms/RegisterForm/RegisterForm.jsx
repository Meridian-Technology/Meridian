import React, { useEffect, useState } from 'react';
import axios from 'axios';
import '../Forms.scss';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import useAuth from '../../../hooks/useAuth';
import { useGoogleLogin } from '@react-oauth/google';
import circleWarning from '../../../assets/circle-warning.svg';
import { generalIcons } from '../../../Icons';
import Flag from '../../Flag/Flag';

function RegisterForm() {
    const { isAuthenticated, googleLogin, appleLogin, login } = useAuth();
    const [valid, setValid] = useState(false);
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: ''
    });
    const [sent, setSent] = useState(false);
    const [loadContent, setLoadContent] = useState(false);
    const [errorText, setErrorText] = useState("");
    const [email, setEmail] = useState(false);
    const [isAppleLoginInProgress, setIsAppleLoginInProgress] = useState(false);

    const googleLogo = generalIcons.google;

    let navigate = useNavigate();

    const location = useLocation();
    const from = location.state?.from?.pathname || '/room/none';

    useEffect(() => {
        async function google(code) {
            try{
                const codeResponse = await googleLogin(code, true);
                console.log("codeResponse: " + codeResponse);
            } catch (error){
                if(error.response.status  === 409){
                    failed("Email already exists");
                } else {
                    console.error("Google login failed:", error);
                    failed("Google login failed. Please try again");
                }
            }
        }
        // Extract the code from the URL
        const queryParams = new URLSearchParams(location.search);
        const code = queryParams.get('code');
        if (code) {
            setLoadContent(false);
            if (!sent) {
                google(code); //failsafe for double querying, still double querying, but it's fine
            }
            setSent(true);
            console.log("code: " + code);
        } else {
            setLoadContent(true);
        }
    }, [location]);


    useEffect(() => {
        if (isAuthenticated && isAuthenticated !== null) {
            // console.log("logged in already");
            // const redirectto = localStorage.getItem('redirectto');
            // if(redirectto){
                // navigate(redirectto, { replace: true });
            // } else {
                navigate('/events-dashboard', { replace: true });
            // }
        }
    }, [isAuthenticated, navigate]);

    useEffect(() => {
        if (formData.email !== '' && formData.password !== '' && formData.username !== '') {
            setValid(true);
        } else {
            setValid(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formData.email, formData.password, formData.username]);


    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        try{
            const response = await axios.post('/verify-email', { email: formData.email });
            if(response.data.data && response.data.data.result === "undeliverable"){
                setErrorText("Invalid Email. Please try again");
                return;
            }
        } catch (error){
            console.error("Email verification failed:", error);
            setErrorText("Invalid Username/Email or Password. Please try again");
            return;
        }
        try {
            const response = await axios.post('/register', formData);
            console.log(response.data);
            // Handle success (e.g., redirect to login page or auto-login)
            await login(formData);
            // navigate('/onboard', { state: {from:location.state?.from} });
            navigate('/events-dashboard');
        } catch (error) {
            if(error.response.status === 400){
                setErrorText("Username or Email already exists");
            } else {
                setErrorText(error.response.data.message);
            }
            // console.error('Registration failed:', error);
            // Handle errors (e.g., display error message)
        }
    }
    // codeResponse => responseGoogle1(codeResponse)
    const google = useGoogleLogin({
        onSuccess: () => { console.log("succeeded") },
        flow: 'auth-code',
        ux_mode: 'redirect',
        onFailure: () => { console.log("failed") },
    });

    // Initialize Apple Sign In
    useEffect(() => {
        if (window.AppleID) {
            window.AppleID.auth.init({
                clientId: 'com.meridian.auth',
                scope: 'name email',
                redirectURI: window.location.origin + '/register',
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
                console.log("Apple registration successful");
                navigate('/events-dashboard', { replace: true });
            } else {
                throw new Error("No ID token received from Apple");
            }
        } catch (error) {
            setIsAppleLoginInProgress(false);
            if (error.error === 'popup_closed_by_user') {
                // User cancelled, don't show error
                return;
            }
            console.error("Apple registration failed:", error);
            if (error.response && error.response.status === 409) {
                failed("Email already exists");
            } else {
                failed("Apple registration failed. Please try again");
            }
        }
    };

    function failed(message){
        navigate('/register');
        setErrorText(message);
    }

    function goToLogin() {
        navigate('/login');
    }

    if (!loadContent) {
        return ("");
    }

    return (
        <form onSubmit={handleSubmit} className='form'>
            <h1>Register</h1>
            {errorText !== "" && 
                <Flag text={errorText} img={circleWarning} color={"#FD5858"} primary={"rgba(250, 117, 109, 0.16)"} accent={"#FD5858"} /> 
            }
            <button type="button" className="button google" onClick={() => google()}>Continue with Google<img src={googleLogo} alt="google" /></button>
            
            {/* Apple Login Button */}
            <button 
                type="button" 
                className="button apple" 
                onClick={handleAppleSignIn}
                disabled={isAppleLoginInProgress}
            >
                Continue with Apple
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginLeft: '8px' }}>
                    <path d="M13.5625 0C13.6875 0.9375 13.5 1.875 13.0625 2.625C12.5625 3.4375 11.625 4.125 10.6875 4.0625C10.5625 3.1875 10.75 2.25 11.1875 1.5C11.75 0.75 12.625 0.1875 13.5625 0ZM13.5 4.875C14.4375 4.875 15.5625 4.125 16.125 4.125C16.75 4.125 17.4375 4.6875 17.4375 4.6875C17.4375 4.6875 16.875 5.25 16.3125 6C15.9375 6.5625 15.5 7.5 16.125 8.4375C16.75 9.375 17.25 9.75 17.25 10.5C17.25 11.25 16.75 11.8125 16.25 12.375C15.75 12.9375 15.1875 13.5 14.4375 13.5C13.6875 13.5 13.5 13.125 12.5625 13.125C11.625 13.125 11.4375 13.5 10.6875 13.5C9.9375 13.5 9.375 12.9375 8.8125 12.375C8.0625 11.625 7.3125 10.3125 7.3125 9.1875C7.3125 8.0625 7.875 7.3125 8.4375 6.75C8.8125 6.375 9.1875 6 9.5625 5.625C10.125 5.0625 10.875 4.875 11.4375 4.875C12.1875 4.875 12.75 4.875 13.5 4.875Z" fill="currentColor"/>
                </svg>
            </button>
            
            <div className="divider">
                <hr />
                <p>or</p>
                <hr />
            </div>

            <div className={`email-form ${email ? "disappear-show" : ""}`}>

            <div className="login-button">
                <button className={`show-email button active ${email ? "disappear-show" : ""}`} onClick={(e)=>{e.preventDefault();setEmail(true)}}>
                    Register with Email
                </button>
                <p className={`already ${email ? "disappear-show" : ""}`}>Already have an account? <Link to="/Login" >Login</Link></p>
            </div>

            <div className="form-content" >
                <div className="username">
                    <p>Username</p>
                    <input type="text" name="username" value={formData.username} onChange={handleChange} placeholder="Username" required />
                </div>
                <div className="email">
                    <p>Email</p>
                    <input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="Email" required />
                </div>
                <div className="password">
                    <p>Password</p>
                    <input type="password" name="password" value={formData.password} onChange={handleChange} placeholder="Password" required />
                </div>
                <button type="submit" className={`button ${valid ? "active" : ""}`}>Register</button>
                <p className="already">Already have an account? <Link to="/login">Login</Link></p>

            </div>
            </div>
        </form>
    );
}

export default RegisterForm;


