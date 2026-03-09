import React from 'react';
// import Register from '../components/Forms/Register/Register';
import LoginForm from '../components/Forms/LoginForm/LoginForm';
import Header from '../components/Header/Header';
import './Login.scss';
import logo from '../assets/Brand Image/BEACON.svg'
import AuthPagePreview from '../components/AuthPagePreview/AuthPagePreview';

function Login(){
    return(
        <div className="main-login">
            <AuthPagePreview />
            <div className="login-container-container">         
                <div className="login-container">

                    <img src={logo} alt="" className="logo"/>
                
                    <LoginForm />
                </div>
            </div>
            
        </div>
    );
}

export default Login;