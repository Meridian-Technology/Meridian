import React, { useEffect, useState } from 'react';
import './Profile.scss';
import Header from '../../components/Header/Header';
import Footer from '../../components/Footer/Footer.jsx';
import ProfileCard from '../../components/ProfileCard/ProfileCard';
import useAuth from '../../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

function Profile(){
    const{user} = useAuth();

    return (
        <div className="profile">
            {/* <Header/> */}
            {user &&   
                <div className="content-container">
                    <div className="profile-card">
                        <ProfileCard userInfo={user}/>
                    </div>
                </div>
            }
            <div className="footer">
                <Footer/>
            </div>
        </div>
    )
}


export default Profile;