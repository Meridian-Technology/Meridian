import React, {useState, useEffect} from 'react';
import rpiLogo from "../../assets/Icons/rpiLogo.svg";
import person from "../../assets/Icons/Profile.svg";
import calendar from "../../assets/Icons/Calendar.svg";
import locate from "../../assets/Icons/Locate.svg";
import profile from "../../assets/Icons/Profile2.svg";
import FormViewer from '../../components/FormViewer/FormViewer';
import Header from '../../components/Header/Header';
import Popup from '../../components/Popup/Popup';
import OrgEvents from '../../components/OrgEvents/OrgEvents';
import OrgMessageFeed from '../../components/OrgMessages/OrgMessageFeed';
import apiRequest from '../../utils/postRequest';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import useAuth from '../../hooks/useAuth';
import { useNotification } from '../../NotificationContext';
import './Org.scss';
import { useNavigate } from 'react-router-dom';

const Org = ({ orgData, refetch }) => {

    const [isMember, setIsMember] = useState(false);
    const { overview, members, followers } = orgData.org;
    const [showForm, setShowForm] = useState(false);
    const {user} = useAuth();
    const [activeTab, setActiveTab] = useState('home');
    const navigate = useNavigate();
    const { addNotification } = useNotification();
    const [isLoading, setIsLoading] = useState({ join: false, follow: false, leave: false });
    const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
    console.log(orgData);

    const handleApply = async (formAnswers = null) => {
        try {
            setIsLoading({ ...isLoading, join: true });
            // Only include formResponse in request body if formAnswers is provided
            const requestBody = formAnswers ? { formResponse: formAnswers } : {};
            const response = await apiRequest(`/${overview._id}/apply-to-org`, requestBody);
            
            if (response.error) {
                addNotification({
                    title: 'Error',
                    message: response.error,
                    type: 'error'
                });
            } else {
                addNotification({
                    title: 'Success',
                    message: response.message || (overview.requireApprovalForJoin ? 'Application submitted successfully' : 'You are now a member'),
                    type: 'success'
                });
                refetch();
            }
        } catch (error) {
            addNotification({
                title: 'Error',
                message: 'Failed to submit application. Please try again.',
                type: 'error'
            });
        } finally {
            setIsLoading({ ...isLoading, join: false });
        }
    }
    
    useEffect(()=>{
        console.log(user.clubAssociations);
        console.log(overview.org_name);
    }, [user]);

    const initiateApply = () => {
        if(overview.requireApprovalForJoin) {
            if(overview.memberForm) {
                setShowForm(true);
            } else {
                // No form but approval required - apply without form
                handleApply(null);
            }
        } else {
            // No approval needed - join directly
            handleApply(null);
        }
    }

    const handleFormSubmit = (answers) => {
        setShowForm(false);
        handleApply(answers);
    }

    const handleFollow = async () => {
        // Optimistically update the UI immediately
        orgData.org.isFollower = true;
        
        try {
            const response = await apiRequest(`/follow-org/${overview._id}`);
            
            if (response.error) {
                // Revert on error
                orgData.org.isFollower = false;
                addNotification({
                    title: 'Error',
                    message: response.error,
                    type: 'error'
                });
                // Refetch to sync state
                setTimeout(() => refetch(), 100);
            } else {
                addNotification({
                    title: 'Success',
                    message: 'You are now following this organization',
                    type: 'success'
                });
                // Refetch in background to sync state
                setTimeout(() => refetch(), 100);
            }
        } catch (error) {
            // Revert on error
            orgData.org.isFollower = false;
            addNotification({
                title: 'Error',
                message: 'Failed to follow organization. Please try again.',
                type: 'error'
            });
            // Refetch to sync state
            setTimeout(() => refetch(), 100);
        }
    }

    const handleUnfollow = async () => {
        // Optimistically update the UI immediately
        orgData.org.isFollower = false;
        
        try {
            const response = await apiRequest(`/unfollow-org/${overview._id}`);
            
            if (response.error) {
                // Revert on error
                orgData.org.isFollower = true;
                addNotification({
                    title: 'Error',
                    message: response.error,
                    type: 'error'
                });
                // Refetch to sync state
                setTimeout(() => refetch(), 100);
            } else {
                addNotification({
                    title: 'Success',
                    message: 'You have unfollowed this organization',
                    type: 'success'
                });
                // Refetch in background to sync state
                setTimeout(() => refetch(), 100);
            }
        } catch (error) {
            // Revert on error
            orgData.org.isFollower = true;
            addNotification({
                title: 'Error',
                message: 'Failed to unfollow organization. Please try again.',
                type: 'error'
            });
            // Refetch to sync state
            setTimeout(() => refetch(), 100);
        }
    }

    const handleFollowToggle = () => {
        if (orgData.org.isFollower) {
            handleUnfollow();
        } else {
            handleFollow();
        }
    }

    const handleLeave = async () => {
        try {
            setIsLoading({ ...isLoading, leave: true });
            const response = await apiRequest(`/leave-org/${overview._id}`);
            
            if (response.error) {
                addNotification({
                    title: 'Error',
                    message: response.error,
                    type: 'error'
                });
            } else {
                addNotification({
                    title: 'Success',
                    message: response.message || 'You have left the organization',
                    type: 'success'
                });
                refetch();
            }
        } catch (error) {
            addNotification({
                title: 'Error',
                message: 'Failed to leave organization. Please try again.',
                type: 'error'
            });
        } finally {
            setIsLoading({ ...isLoading, leave: false });
            setShowLeaveConfirm(false);
        }
    }

    const handleLeaveClick = () => {
        if (window.confirm(`Are you sure you want to leave ${overview.org_name}?`)) {
            handleLeave();
        }
    }
    
    return (
        <div className="org-page page">
            <Popup isOpen={showForm} onClose={() => setShowForm(false)}>
                <FormViewer form={overview.memberForm} onSubmit={handleFormSubmit} /> 
            </Popup>
            <div className='org-content'>
                <div className="org-header-container">
                    <div className="top-header-box">
                    </div>

                    <div className="org-info">
                        <div className="org-logo">
                            <div className="img-container">
                                <img src={overview.org_profile_image ? overview.org_profile_image : rpiLogo} alt=""/>
                            </div>
                        </div>
                        <div className="org-content-section">
                            <div className="org-header-row">
                                <div className="title-row">
                                    <h2 className="name">{overview.org_name}</h2>
                                    <div className="verification-badge">
                                        <Icon icon="material-symbols:verified-rounded" />
                                    </div>
                                </div>
                                <div className="header-stats">
                                    <img src = {person} alt =""/>
                                    <span>{orgData?.org?.members?.length}</span>
                                </div>
                            </div>
                            <p className="description desktop-description">
                                {overview.org_description}
                            </p>
                        </div>
                    </div>
                </div>

                <div 
                    className={`mobile-description-box ${isDescriptionExpanded ? 'expanded' : 'collapsed'}`}
                    onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                >
                    <div className="mobile-description-header">
                        <span>Description</span>
                        <Icon 
                            icon={isDescriptionExpanded ? "material-symbols:expand-less" : "material-symbols:expand-more"} 
                            className="expand-icon"
                        />
                    </div>
                    <div className="mobile-description-wrapper">
                        <p className="description mobile-description">
                            {overview.org_description}
                        </p>
                    </div>
                </div>

                {/* 2 base states: joined, not joined */}
                <div className="actions-container">
                    <div className="actions">
                        {/* {
                            overview.requireApprovalForJoin ? (
                                <button onClick={initiateApply}>Apply</button>
                            ) : (
                                <button>Join</button>
                            )
                        } */}
                        {
                            orgData.org.isMember ? (
                                <button 
                                    className="no-action joined" 
                                    onClick={handleLeaveClick}
                                    disabled={isLoading.leave}
                                >
                                    <Icon icon="material-symbols:check-rounded" />
                                    {isLoading.leave ? 'Leaving...' : 'Joined'}
                                </button>
                            ) : orgData.org.isPending ? (
                                <button disabled={true}>Pending...</button>
                            ) : overview.requireApprovalForJoin ? (
                                <button onClick={initiateApply} disabled={isLoading.join}>
                                    {isLoading.join ? 'Applying...' : 'Apply'}
                                </button>
                            ) : (
                                <button onClick={initiateApply} disabled={isLoading.join}>
                                    {isLoading.join ? 'Joining...' : 'Join'}
                                </button>
                            )
                        }
                        <button 
                            onClick={handleFollowToggle} 
                            className={`follow-button ${orgData.org.isFollower ? 'following' : 'not-following'}`}
                            title={orgData.org.isFollower ? 'Unfollow' : 'Follow'}
                        >
                            <Icon icon={orgData.org.isFollower ? "material-symbols:notifications-active" : "material-symbols:notifications-outline"} />
                        </button>
                    </div>
                    {
                        user.clubAssociations.find(club => club.org_name === overview.org_name) && (
                            <button 
                                className="dashboard-button"
                                onClick={()=>{
                                    navigate(`/club-dashboard/${overview.org_name}`);
                                }}
                            >
                                <Icon icon="material-symbols:admin-panel-settings" />
                                Dashboard
                            </button>
                        ) 
                    }
                </div>

                {!orgData.org.isMember && (
                    <p className="mutuals-stats">
                        <img src = {profile} className='mutuals' alt =""/>
                        <img src = {profile} alt =""/>
                        Friend and 1 other are members
                    </p>
                )}

                <div className="org-dashboard">
                    <div className="filter-buttons">
                        <button
                            className={`filter-button ${activeTab === 'home' ? 'active' : ''}`}
                            onClick={() => setActiveTab('home')}
                        >
                            Home
                        </button>
                        <button
                            className={`filter-button ${activeTab === 'events' ? 'active' : ''}`}
                            onClick={() => setActiveTab('events')}
                        >
                            Events
                        </button>
                        <button
                            className={`filter-button ${activeTab === 'members' ? 'active' : ''}`}
                            onClick={() => setActiveTab('members')}
                        >
                            Members
                        </button>
                        <button
                            className={`filter-button ${activeTab === 'announcements' ? 'active' : ''}`}
                            onClick={() => setActiveTab('announcements')}
                        >
                            Announcements
                        </button>
                    </div>
                </div>
                {
                    activeTab === 'events' ? (
                        <div className="events-content">
                            <h1>Upcoming Events for {overview.org_name}</h1>
                            <OrgEvents orgId={overview?._id} />
                        </div>
                    ) : activeTab === 'members' ? (
                        <div className="members-content">
                            <h1>Members</h1>
                        </div>
                    ) : activeTab === 'home' ? (
                        <div className="announcements-content">
                            <OrgMessageFeed orgId={overview._id} orgData={orgData} />
                        </div>
                    ) : null
                }
                {/* <div className="meeting-schedule">
                    <h3>meetings schedule</h3>
                    <div className="meeting-card">
                        <div className='title'>
                            <img src={rpiLogo} alt="" className='logo'/>
                            <h4>YDSA Weekly GBM</h4>
                        </div>
                        <div className='info'>
                            <div className='item'> 
                                <img src={calendar} alt="" />
                                <p>Weekly on Thursday at 5:00</p>
                                <img src={locate} alt="" />
                                <p>Phalanx</p>
                            </div>

                        </div>
                    </div>
                </div> */}
            </div>
        </div>
    );
};

export default Org;
