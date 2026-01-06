import React from 'react';
import './ProfileCard.scss';
import CardHeader from './CardHeader/CardHeader';
import SavedClassrooms from './SavedClassrooms/SavedClassrooms';
import StudyHistory from './StudyHistory/StudyHistory';




function ProfileCard({userInfo}){
    return (
        <div className="profile-card">
            <div className="left-profile">
                <div className="header">
                    <CardHeader userInfo={userInfo} settings={true}/>
                </div>
                <SavedClassrooms userInfo={userInfo}/>
            </div>
            <StudyHistory userInfo={userInfo}/>
        </div>
    )
}


export default ProfileCard;