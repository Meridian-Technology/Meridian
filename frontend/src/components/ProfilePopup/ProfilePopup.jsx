import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@iconify-icon/react';
import { Squircle } from '@squircle-js/react';
import useAuth from '../../hooks/useAuth';
import useOutsideClick from '../../hooks/useClickOutside';
import { useNotification } from '../../NotificationContext';
import Badges from '../Badges/Badges';
import defaultAvatar from '../../assets/defaultAvatar.svg';
import ProfileIcon from '../../assets/Icons/Profile.svg';
import Settings from '../../assets/Icons/Settings.svg';
import Logout from '../../assets/Icons/Logout.svg';
import './ProfilePopup.scss';

function ProfilePopup({ 
    trigger, 
    position = 'bottom-right', 
    className = '',
    showTrigger = true,
    sidebarOpen = true,
    mobileMenuOpen = true
}) {
    const [showPopup, setShowPopup] = useState(false);
    const { logout, user } = useAuth();
    const ref = useRef();
    const { addNotification } = useNotification();

    // Close popup when sidebar closes or mobile menu closes
    useEffect(() => {
        if (!sidebarOpen || !mobileMenuOpen) {
            setShowPopup(false);
        }
    }, [sidebarOpen, mobileMenuOpen]);

    const notYet = () => {
        addNotification({
            title: "This feature is not yet implemented", 
            message: "The settings feature is coming soon, stay tuned!", 
            type: "error"
        });
    }
    
    useOutsideClick(ref, () => {
        setShowPopup(false);
    }, ["profile"]);

    // Safety check - don't render if user is not loaded
    if (!user) {
        return null;
    }

    const handleTriggerMouseDown = (e) => {
        console.log('ProfilePopup trigger clicked!');
        e.preventDefault();
        e.stopPropagation();
        setShowPopup(!showPopup);
    };

    return (
        <div className={`profile-popup ${className}`}>
            {showTrigger && (
                <div className="trigger">
                    {React.cloneElement(trigger, {
                        onMouseDown: handleTriggerMouseDown
                    })}
                </div>
            )}
            
            <div ref={ref} className={`popup-container ${showPopup ? "popup-active" : ""} ${position}`}>
                <Squircle cornerRadius={15} cornerSmoothing={0} className="popup">
                    <div className="popup-content">
                        <img className="profile" src={user.picture ? user.picture : defaultAvatar} alt="Profile" />
                        <div className="profile-info">
                            <h3>{user.name ? user.name : user.username}</h3>
                            <Badges badges={user.tags ? user.tags : []} />
                        </div>
                    </div>
                    <hr />
                    <p className="section">GENERAL</p>
                    <Link to="/profile">
                        <div className="menu-item">
                            <img className="icon" src={ProfileIcon} alt="profile" />
                            <p>Profile</p>
                        </div>
                    </Link>
                    <Link to="/settings">
                        <div className="menu-item">
                            <img className="icon" src={Settings} alt="settings" />
                            <p>Settings</p>
                        </div>
                    </Link>
                    {user && user.roles && (user.roles.includes('admin')) && 
                        <Link to="/create-org">
                            <div className="menu-item">
                                <Icon icon="mdi:account-group" />
                                <p>Create an Org</p>
                            </div>
                        </Link>
                    }
                    {user && user.roles && (user.roles.includes('admin')||user.roles.includes('oie')) && 
                        <>
                            <hr />
                            <p className="section">ADMINISTRATION</p>
                        </>
                    }
                    
                    {
                        user && user.roles && user.roles.includes('admin') && 
                        <>
                            <Link to="/admin">
                                <div className="menu-item">
                                    <Icon icon="mdi:shield-account" />
                                    <p>Admin Dashboard</p>
                                </div>
                            </Link>
                        </>
                    }
                    {
                        user && user.roles && user.approvalRoles.includes('root') && 
                        <>
                            <Link to="/root-dashboard">
                                <div className="menu-item">
                                    <Icon icon="streamline-plump:wrench-circle-solid" />
                                    <p>Root Dashboard</p>
                                </div>
                            </Link>
                        </>
                    }
                    {
                        user && user.clubAssociations && user.clubAssociations.length > 0 && 
                        <>
                            <hr/>
                            <p className="section">ORGS</p>
                            {user.clubAssociations.map(
                                (org, index) => {
                                    const url = `/club-dashboard/${org.org_name}`
                                    return(
                                        <Link to={`${url}`} key={`${org.org_name}-${index}`}>
                                            <div className="menu-item">
                                                <img className="icon org-icon" src={org.org_profile_image} alt="" />
                                                <p>{org.org_name}</p>
                                            </div>
                                        </Link>
                                    )
                                }
                            )}
                        </>
                    }
                    {
                        user && user.approvalRoles && user.approvalRoles.length > 0 && 
                        <>
                            <hr/>
                            <p className="section">APPROVALS</p>
                            {user.approvalRoles.map(
                                (role) => {
                                    const url = role === 'root' ? '/root-dashboard' : `/approval-dashboard/${role}` 
                                    if(role === 'root'){
                                        return null;
                                    }
                                    return(
                                        <Link to={`${url}`} key={role}>
                                            <div className="menu-item">
                                                <Icon icon="fluent:flowchart-24-filled" />
                                                <p>{role}</p>
                                            </div>
                                        </Link>
                                    )
                                }
                            )}
                        </>
                    }

                    <hr />
                    <Link to="">
                        <div className="menu-item" onClick={logout}>
                            <img className="icon" src={Logout} alt="log out" />
                            <p>Logout</p>
                        </div>
                    </Link>
                </Squircle>
            </div>
        </div>
    );
}

export default ProfilePopup;
