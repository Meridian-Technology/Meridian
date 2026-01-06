import React from 'react';
// import Register from '../components/Forms/Register/Register';
import LoginForm from '../components/Forms/LoginForm/LoginForm';
import Header from '../components/Header/Header';
import './Login.scss';
import logo from '../assets/Brand Image/BEACON.svg'
import OrgTeaser from '../assets/OrgTeaser.png';
import OrgTeaserGrad from '../assets/OrgTeaserGrad.png';

function Login(){
    return(
        <div className="main-login">
            <div className="block">
                <div className="org-teaser-container">
                    <div className="org-teaser-img">
                        <div className="teaser-text">
                            <h2><b>organizations</b> on the way</h2>
                            <p>A powerful new way to connect with student organizations. Share updates, manage membership, and plan events - all in one place</p>
                        </div>
                        <img src={OrgTeaser} alt="" className="org-teaser"/>
                    </div>
                    <img src={OrgTeaserGrad} alt="" className="org-teaser-grad"/>
                </div>
            </div>
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