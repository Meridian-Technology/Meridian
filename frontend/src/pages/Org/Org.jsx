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
import './Org.scss';
import { useNavigate } from 'react-router-dom';

const Org = ({ orgData, refetch }) => {

    const [isMember, setIsMember] = useState(false);
    const { overview, members, followers } = orgData.org;
    const [showForm, setShowForm] = useState(false);
    const {user} = useAuth();
    const [activeTab, setActiveTab] = useState('home');
    const navigate = useNavigate();
    console.log(orgData);

    const handleApply = async (formAnswers) => {
        const response = await apiRequest(`/${overview._id}/apply-to-org`, {
            formResponse: formAnswers
        });
        console.log(response);
        refetch();
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
                // setIsMember(true);
                //pending approval
                handleApply();

            }
        } else {
            setIsMember(true);
        }
    }

    const handleFormSubmit = (answers) => {
        handleApply(answers);
    }
    
    return (
        <div className="org-page page">
            <Popup isOpen={showForm} onClose={() => setShowForm(false)}>
                <FormViewer form={overview.memberForm} onSubmit={handleFormSubmit} /> 
            </Popup>
            <div className='org-content'>
                <div className="top-header-box">
                    <div className="org-logo">
                        <div className="img-container">
                            <img src={overview.org_profile_image ? overview.org_profile_image : rpiLogo} alt=""/>
                        </div>
                    </div>
                </div>

                <div className="org-info">
                    <div className="col">
                        <div className="org-header">
                            <h2 className="name">{overview.org_name}</h2>
                            {/* <h2 className="name"> Name </h2> */}
                            <div className="verification-badge">
                                <Icon icon="material-symbols:verified-rounded" />
                                <p>Union Recognized</p>
                            </div>
                        </div>

                        <p className="description">
                            {overview.org_description}
                        </p>
                    </div>
                    
                    <p className="stats">
                        <img src = {person} alt =""/>
                        <p>
                            {orgData?.org?.followers?.length} {orgData?.org?.followers?.length === 1 ? "follower" : "followers"} • {orgData?.org?.members?.length} {orgData?.org?.members?.length === 1 ? "member" : "members"}
                        </p>
                        
                        {

                        }
                        <img src = {profile} className='mutuals' alt =""/>
                        <img src = {profile} alt =""/>
                        Friend and 1 other are members
                    </p>
                    {/* 2 base states: joined, not joined */}
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
                                <button className="no-action"><Icon icon="material-symbols:check-rounded" />Joined</button>
                            ) : orgData.org.isPending ? (
                                <button disabled={true}>Pending...</button>
                            ) : overview.requireApprovalForJoin ? (
                                <button onClick={initiateApply}>Apply</button>
                            ) : (
                                <button onClick={initiateApply}>Join</button>
                            )
                        }
                        <button>Follow</button>
                        {
                            user.clubAssociations.find(club => club.org_name === overview.org_name) && (
                                <button onClick={()=>{
                                    navigate(`/club-dashboard/${overview.org_name}`);
                                }}>To Dashboard</button>
                            ) 
                        }
                    </div>

                </div>

                <div className="org-dashboard">
                    <div className="org-content-header">
                        <div className="header-option">
                            <h2 className={activeTab === 'home' ? 'active' : ''} onClick={() => setActiveTab('home')}>Home</h2>
                        </div>
                        <div className="header-option">
                            <h2 className={activeTab === 'events' ? 'active' : ''} onClick={() => setActiveTab('events')}>Events</h2>
                        </div>
                        <div className="header-option">
                            <h2 className={activeTab === 'members' ? 'active' : ''} onClick={() => setActiveTab('members')}>Members</h2>
                        </div>
                        <div className="header-option">
                            <h2 className={activeTab === 'announcements' ? 'active' : ''} onClick={() => setActiveTab('announcements')}>Announcements</h2>
                        </div>
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
