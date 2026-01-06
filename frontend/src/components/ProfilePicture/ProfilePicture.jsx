import React from 'react'
import './ProfilePicture.scss'
import pfp from '../../assets/defaultAvatar.svg'
import useAuth from '../../hooks/useAuth';
import '../../assets/fonts.css'
import ProfilePopup from '../ProfilePopup/ProfilePopup'

function ProfilePicture(){
    const { user } = useAuth();

    // Safety check - don't render if user is not loaded
    if (!user) {
        return null;
    }

    return(
        <div className="profile-picture">
            <ProfilePopup 
                position="bottom-right"
                trigger={
                    <img className="profile" src={user.picture ? user.picture : pfp} alt="Profile" />
                }
            />
        </div>
    )
}

export default ProfilePicture;