import React, { useEffect, useState } from 'react';
import './Banner.scss';
import { useNavigate } from 'react-router-dom';
import useAuth from '../../hooks/useAuth.js';
import x_white from '../../assets/x_white.svg';

function Banner({visible, setVisible, bannerType}) {
    const { isAuthenticating, isAuthenticated, checkedIn } = useAuth();
    const navigate = useNavigate();
    const [checkedInClassroom, setCheckedInClassroom] = useState(null);

    useEffect(() => {
        if (!isAuthenticating && !isAuthenticated) {
            setVisible(true);
        } else if (checkedIn) {
            setCheckedInClassroom(checkedIn);
            setVisible(true);
        }
    }, [isAuthenticating, isAuthenticated, checkedIn, setVisible]);

    const handleCheckInClick = (e) => {
        // Prevent event bubbling if clicking on the exit button
        if (e.target.closest('.exit')) {
            return;
        }
        
        if (checkedIn && checkedIn.name) {
            // Navigate to EventsDash Rooms tab (page index 2)
            // The Room component in embedded mode expects room names via roomid query parameter
            const encodedRoomName = encodeURIComponent(checkedIn.name);
            navigate(`/events-dashboard?page=2&roomid=${encodedRoomName}`);
        }
    }


    if(checkedInClassroom !== null && checkedIn){
        return(
            <div className={`banner ${visible && "visible checked-in"}`} onClick={handleCheckInClick}>
                you are checked in to {checkedIn.name}
                <div className="exit" onClick={(e) => {
                    e.stopPropagation();
                    setVisible(false);
                }}>
                    <img src={x_white} alt="close" />
                </div>
            </div>
        )
    } 
    else{
        return null;
    }
}

export default Banner;