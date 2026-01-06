import React, { useEffect, useState} from 'react';
import './ClubDash.scss';
import useAuth from '../../hooks/useAuth';
import { useNavigate, useParams } from 'react-router-dom';
import logo from '../../assets/red_logo.svg';
import { getAllEvents } from '../../components/EventsViewer/EventHelpers';
import { useNotification } from '../../NotificationContext';
import {Icon} from '@iconify-icon/react';  
import Dash from './Dash/Dash';
import Members from './Members/Members';
import Roles from './Roles/Roles';
import Testing from './Testing/Testing';

import {useFetch} from '../../hooks/useFetch';
import OrgDropdown from './OrgDropdown/OrgDropdown';
import Dashboard from '../../components/Dashboard/Dashboard';
import orgLogo from '../../assets/Brand Image/ATLAS.svg';
import apiRequest from '../../utils/postRequest';
import { useLocation } from 'react-router-dom';
import EventsPanel from './EventsPanel/EventsPanel';
import EventsManagement from './EventsManagement/EventsManagement';
import ClubAnnouncements from './ClubAnnouncements/ClubAnnouncements';
import OrgMessageFeed from '../../components/OrgMessages/OrgMessageFeed';
import { 
    GeneralSettings, 
    AppearanceSettings, 
    RolesSettings, 
    DangerZone,
    MemberSettings
} from './OrgSettings/components';
import VerificationRequest from './Settings/VerificationRequest/VerificationRequest';

function ClubDash(){
    const [clubId, setClubId] = useState(useParams().id);
    const [expanded, setExpanded] = useState(false);
    const [expandedClass, setExpandedClass] = useState("");
    const{isAuthenticated, isAuthenticating, user} = useAuth();
    const navigate  = useNavigate();
    const [userInfo, setUserInfo] = useState(null);

    const [currentPage, setCurrentPage] = useState('dash');
    const { addNotification } = useNotification();
    const [showDrop, setShowDrop] = useState(false);
    const [userPermissions, setUserPermissions] = useState({
        canManageRoles: false,
        canManageMembers: false,
        canViewAnalytics: false
    });
    const [permissionsChecked, setPermissionsChecked] = useState(false);

    const orgData = useFetch(`/get-org-by-name/${clubId}?exhaustive=true`);
    const meetings = useFetch(`/get-meetings/${clubId}`);

    const location = useLocation();


    useEffect(()=>{
        if(isAuthenticating){
            return;
        }
        if(!isAuthenticated){
            navigate('/');
        }
        if(!user){
            return;
        } else {
            setUserInfo(user);
        }
        
    },[isAuthenticating, isAuthenticated, user]);

    useEffect(()=>{
        if(orgData){
            if(orgData.error){
                addNotification({title: "Error", message: orgData.error, type: "error"});
                navigate('/');
            }
            if(orgData.data){
                console.log(orgData.data);
                // Only check permissions once when org data is loaded
                if (!permissionsChecked && orgData.data && user) {
                    checkUserPermissions();
                }
            }
        }
    }
    ,[orgData, user, permissionsChecked]);

    const checkUserPermissions = async () => {
        if (!orgData.data || !user || permissionsChecked) return;

        try {
            const org = orgData.data.org.overview;
            
            // Check if user is the owner
            const isOwner = org.owner === user._id;
            
            if (isOwner) {
                setUserPermissions({
                    canManageRoles: true,
                    canManageMembers: true,
                    canViewAnalytics: true
                });
                setPermissionsChecked(true);
                return;
            }

            // Get user's role in this organization
            const response = await apiRequest(`/org-roles/${org._id}/members`, {}, {
                method: 'GET'
            });

            if (response.success) {
                const userMember = response.members.find(member => 
                    member.user_id._id === user._id
                );

                if (userMember) {
                    const userRoleData = org.positions.find(role => role.name === userMember.role);
                    
                    if (userRoleData) {
                        setUserPermissions({
                            canManageRoles: userRoleData.canManageRoles || userRoleData.permissions.includes('manage_roles') || userRoleData.permissions.includes('all'),
                            canManageMembers: userRoleData.canManageMembers || userRoleData.permissions.includes('manage_members') || userRoleData.permissions.includes('all'),
                            canViewAnalytics: userRoleData.canViewAnalytics || userRoleData.permissions.includes('view_analytics') || userRoleData.permissions.includes('all')
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Error checking user permissions:', error);
        } finally {
            setPermissionsChecked(true);
        }
    };
    

    useEffect(()=>{ 
        if(meetings){
            if(meetings.error){
                addNotification({title: "Error", message: meetings.error, type: "error"});
            }
            if(meetings.data){
                console.log(meetings.data);
            }
        }
    },[meetings]);


    useEffect(()=>{
        if(!userInfo){
            return;
        }
        if(userInfo.clubAssociations){
            if(userInfo.clubAssociations.find(club => club.org_name === clubId)){
                return;
            } else {
                addNotification({title: "Unauthorized", message: "you are not authorized to manage this club", type: "error"});
                navigate('/');
            }
        }
    },[userInfo]);

    const onExpand = () => {
        if(expanded){
            setExpandedClass("minimized");
            setTimeout(() => {
                setExpanded(false);
            }, 200);
        } else {
            setExpanded(true);
            setTimeout(() => {
                setExpandedClass("maximized");
            }, 200);

        }
    }

    function openMembers(){
        const newPath = `/club-dashboard/${clubId}?page=2`;
        navigate(newPath);
    }

    const onOrgChange = (org) => {
        const newPath = `/club-dashboard/${org.org_name}`;
        navigate(newPath);
    }

    const baseMenuItems = [
        { 
            label: 'Dashboard', 
            icon: 'ic:round-dashboard', 
            key: 'dash',
            element: <Dash expandedClass={expandedClass} openMembers={openMembers} clubName={clubId} meetings={meetings.data} org={orgData.data}/>
        },
        { 
            label: 'Events', 
            icon: 'mingcute:calendar-fill', 
            key: 'events',
            element: <EventsManagement expandedClass={expandedClass} orgId={clubId}/>
        },
        { 
            label: 'Announcements', 
            icon: 'mdi:message-text', 
            key: 'announcements',
            element: <ClubAnnouncements orgData={orgData} expandedClass={expandedClass}/>
        },
        { 
            label: 'Members', 
            icon: 'mdi:account-group', 
            key: 'members', 
            requiresPermission: 'canManageMembers',
            element: <Members expandedClass={expandedClass} org={orgData.data?.org?.overview}/>
        },
        // { 
        //     label: 'Roles', 
        //     icon: 'mdi:shield-account', 
        //     key: 'roles', 
        //     requiresPermission: 'canManageRoles',
        //     element: <Roles expandedClass={expandedClass} org={orgData.data?.org?.overview}/>
        // },
        { 
            label: 'Settings', 
            icon: 'mdi:cog', 
            key: 'settings',
            subItems: [
                {
                    label: 'General',
                    icon: 'mdi:cog',
                    element: <GeneralSettings org={orgData.data?.org?.overview} expandedClass={expandedClass} />
                },
                {
                    label: 'Appearance',
                    icon: 'mdi:palette',
                    element: <AppearanceSettings org={orgData.data?.org?.overview} expandedClass={expandedClass} />
                },
                {
                    label: 'Roles & Permissions',
                    icon: 'mdi:shield-account',
                    element:  <Roles expandedClass={expandedClass} org={orgData.data?.org?.overview} refetch={orgData.refetch}/>
                },
                {
                    label: 'Membership',
                    icon: 'mdi:account-group',
                    element: <MemberSettings org={orgData.data?.org?.overview} expandedClass={expandedClass} />
                },
                {
                    label: 'Verification Requests',
                    icon: 'mdi:shield-check',
                    element: <VerificationRequest org={orgData.data?.org?.overview} expandedClass={expandedClass} />
                },
                {
                    label: 'Danger Zone',
                    icon: 'mdi:alert-circle',
                    element: <DangerZone org={orgData.data?.org?.overview} expandedClass={expandedClass} />
                },
            ]
        },
        // { 
        //     label: 'Testing', 
        //     icon: 'mdi:test-tube', 
        //     key: 'testing',
        //     element: <Testing expandedClass={expandedClass} org={orgData.data?.org?.overview}/>
        // },
    ];
    // Filter menu items based on user permissions
    const menuItems = baseMenuItems.filter(item => {
        if (!item.requiresPermission) return true;
        return userPermissions[item.requiresPermission];
    });

    

    if(orgData.loading){
        return (
            <div></div>
        );
    }

    

    return (
        <Dashboard 
        menuItems={menuItems} 
        additionalClass='club-dash' 
        middleItem={<OrgDropdown showDrop={showDrop} setShowDrop={setShowDrop} user={user} currentOrgName={clubId} onOrgChange={onOrgChange}/>} 
        logo={orgLogo} 
        secondaryColor="#EDF6EE" 
        primaryColor="#4DAA57"
        enableSubSidebar={true}
        >
        </Dashboard>
    )
}


export default ClubDash;