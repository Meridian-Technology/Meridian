import React from 'react';
import RegisterForm from '../../components/Forms/RegisterForm/RegisterForm';
import './Register.scss';
import logo from '../../assets/Brand Image/BEACON.svg';
import AuthPagePreview from '../../components/AuthPagePreview/AuthPagePreview';

function Register(){
    return(
        <div className="main-register">
            <AuthPagePreview />
            <div className="register-container-container">
                <div className="register-container">
                    <img src={logo} alt="" className="logo"/>
                    <RegisterForm />
                </div>
            </div>
        </div>
    );
}

export default Register;