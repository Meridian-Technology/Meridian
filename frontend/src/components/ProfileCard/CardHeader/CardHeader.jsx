import React from 'react';
import './CardHeader.scss';
import WhiteSettings from "../../../assets/Icons/WhiteSettings.svg"
import defaultAvatar from "../../../assets/defaultAvatar.svg"
import Badges from '../../Badges/Badges';
import '../../ProfilePicture/ProfilePicture.scss';
import GrainTexture from '../../../assets/Grain-Texture.png';
import StudentCardGrad from '../../../assets/Gradients/StudentCardGrad.png';
import logo from '../../../assets/Logo.svg'

function CardHeader({userInfo, settings}){
    return (
        <div className="profile-card-header">
            {/* <div className="bar" style={{backgroundImage: `url(${GrainTexture}), -webkit-linear-gradient(135deg, #F9E298, #F2374C)`,}}>
                {settings ? <img src={WhiteSettings} alt="settings-icon" /> : <h2 className="watermark">study compass</h2> }
                
            </div> */}
            <img src={StudentCardGrad} alt="" className="grad" />
            <img src={logo} alt="" className="logo"/>
            <div className="personal">
                <div className="pfp">
                    <img src={userInfo.picture ? userInfo.picture : defaultAvatar} alt="profile-icon" />
                </div>
                <div className="profile-info">
                    <p className="name">{userInfo.name}</p>
                    <p className="user">@{userInfo.username}</p>
                    {/* <div className="tags">
                        <div className="badge" style={{backgroundColor:"#A0C4FF"}}>
                            <p>beta tester</p>
                        </div>
                        <div className="badge" style={{backgroundColor:"#A0C4FF"}}>
                            <p>jeremy</p>
                        </div>
                    </div> */}
                    <Badges badges={userInfo.tags ? userInfo.tags : []}/>
                </div>
            </div>
            
            <div className="stats">
                <p><p className="num">{userInfo.visited ? userInfo.visited.length : 0}</p>rooms visited</p>
                <p><p className="num">{userInfo.partners ? userInfo.partners : 0}</p>study partners</p>
                <p><p className="num">{userInfo.sessions ? userInfo.sessions.length : 0}</p>study sessions</p>
                <p><p className="num">{userInfo.hours ? userInfo.hours : 0}</p>hours studied</p>
                <p><p className="num">{userInfo.contributions ? userInfo.contributions : 0}</p>community contributions</p>
            </div>
        </div>
    )
}


export default CardHeader;