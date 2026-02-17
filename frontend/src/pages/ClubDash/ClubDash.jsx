import React, { useEffect, useState, useRef, useCallback } from 'react';
import './ClubDash.scss';
import useAuth from '../../hooks/useAuth';
import { analytics } from '../../services/analytics/analytics';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
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
import ClubForms from './ClubForms/ClubForms';
import ClubAnnouncements from './ClubAnnouncements/ClubAnnouncements';
import OrgMessageFeed from '../../components/OrgMessages/OrgMessageFeed';
// Temporarily disabled - Equipment functionality commented out
// import OrgEquipment from './Equipment/OrgEquipment';
import { 
    GeneralSettings, 
    RolesSettings, 
    DangerZone,
    MemberSettings,
    SocialLinksSettings
} from './OrgSettings/components';
import VerificationRequest from './Settings/VerificationRequest/VerificationRequest';
import OrgPendingBanner from '../../components/OrgPendingBanner/OrgPendingBanner';
import PendingApprovalOverlay from '../../components/PendingApprovalOverlay/PendingApprovalOverlay';
import AdminViewBanner from '../../components/AdminViewBanner/AdminViewBanner';
import { useOrgApprovalRoom } from '../../WebSocketContext';
import Popup from '../../components/Popup/Popup';
import ClubDashOnboarding from './ClubDashOnboarding/ClubDashOnboarding';

/** Set to true to always show the onboarding popup (ignores localStorage) */
const FORCE_CLUB_DASH_ONBOARDING = false;

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
    const [showJustApprovedBanner, setShowJustApprovedBanner] = useState(false);
    const approvedBannerTimeoutRef = useRef(null);
    const [showOnboarding, setShowOnboarding] = useState(false);

    const orgData = useFetch(`/get-org-by-name/${clubId}?exhaustive=true`);
    const meetings = useFetch(`/get-meetings/${clubId}`);
    const { data: configData } = useFetch('/org-management/config');
    const [searchParams] = useSearchParams();
    const isAdminView = searchParams.get('adminView') === 'true';
    const isSiteAdmin = user?.roles?.includes('admin') || user?.roles?.includes('root');

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

    useEffect(() => {
        if (clubId) {
            analytics.screen('Club Dashboard', { org_id: clubId });
        }
    }, [clubId]);

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

        // Admin view: grant full permissions without checking org role
        if (isAdminView && isSiteAdmin) {
            setUserPermissions({
                canManageRoles: true,
                canManageMembers: true,
                canViewAnalytics: true
            });
            setPermissionsChecked(true);
            return;
        }

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
        // Admin view: bypass clubAssociations check for site admins
        if (isAdminView && isSiteAdmin) {
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
    },[userInfo, isAdminView, isSiteAdmin]);

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
        const basePath = `/club-dashboard/${encodeURIComponent(clubId)}`;
        const params = new URLSearchParams();
        params.set('page', '3');
        if (isAdminView && isSiteAdmin) params.set('adminView', 'true');
        navigate(`${basePath}?${params.toString()}`);
    }

    const onOrgChange = (org) => {
        const basePath = `/club-dashboard/${org.org_name}`;
        const newPath = isAdminView ? `${basePath}?adminView=true` : basePath;
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
        //     label: 'Forms', 
        //     icon: 'mdi:file-document', 
        //     key: 'forms',
        //     element: <ClubForms expandedClass={expandedClass} org={orgData.data?.org?.overview}/>
        // },
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
                    label: 'Roles & Permissions',
                    icon: 'mdi:shield-account',
                    element:  <Roles expandedClass={expandedClass} org={orgData.data?.org?.overview} refetch={orgData.refetch}/>
                },
                {
                    label: 'Equipment',
                    icon: 'mdi:package-variant-closed',
                    comingSoon: true,
                    element: null
                    // Temporarily disabled - Equipment functionality commented out
                    // element: <OrgEquipment expandedClass={expandedClass} org={orgData.data?.org?.overview} />
                },
                {
                    label: 'Application Process',
                    icon: 'mdi:form-select',
                    element: <MemberSettings org={orgData.data?.org?.overview} expandedClass={expandedClass} />
                },
                {
                    label: 'Social Links',
                    icon: 'mdi:link-variant',
                    element: <SocialLinksSettings org={orgData.data?.org?.overview} expandedClass={expandedClass} />
                },
                // {
                //     label: 'Verification Requests',
                //     icon: 'mdi:shield-check',
                //     element: <VerificationRequest org={orgData.data?.org?.overview} expandedClass={expandedClass} />
                // },
                {
                    label: 'Danger Zone',
                    icon: 'mdi:alert-circle',
                    element: <DangerZone org={orgData.data?.org?.overview} expandedClass={expandedClass} />
                },
                {
                    label: 'Audit Log',
                    icon: 'mdi:clipboard-text-clock',
                    comingSoon: true,
                    element: null
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
    // Filter menu items based on user permissions (show all when admin view)
    const menuItems = baseMenuItems.filter(item => {
        if (isAdminView && isSiteAdmin) return true;
        if (!item.requiresPermission) return true;
        return userPermissions[item.requiresPermission];
    });

    

    const orgForApproval = orgData.data?.org?.overview;
    useOrgApprovalRoom(
        orgForApproval?.approvalStatus === 'pending' ? orgForApproval?._id : null,
        () => {
            addNotification({
                title: 'Organization approved',
                message: 'Your organization has been approved. You now have full access.',
                type: 'success'
            });
            setShowJustApprovedBanner(true);
            if (approvedBannerTimeoutRef.current) clearTimeout(approvedBannerTimeoutRef.current);
            approvedBannerTimeoutRef.current = setTimeout(() => setShowJustApprovedBanner(false), 4500);
            orgData.refetch();
        }
    );

    useEffect(() => () => {
        if (approvedBannerTimeoutRef.current) clearTimeout(approvedBannerTimeoutRef.current);
    }, []);

    useEffect(() => {
        if (orgData.loading || !orgData.data || orgData.error) return;
        const urlParams = new URLSearchParams(window.location.search);
        const isTestMode = urlParams.get('test-club-onboarding') === 'true';
        const hasSeen = localStorage.getItem('clubDashOnboardingSeen');
        if (FORCE_CLUB_DASH_ONBOARDING || isTestMode || !hasSeen) {
            setShowOnboarding(true);
        }
    }, [orgData.loading, orgData.data, orgData.error]);

    const handleOnboardingClose = useCallback(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const isTestMode = urlParams.get('test-club-onboarding') === 'true';
        if (!FORCE_CLUB_DASH_ONBOARDING && !isTestMode) {
            localStorage.setItem('clubDashOnboardingSeen', 'true');
        }
        setShowOnboarding(false);
    }, []);

    if(orgData.loading){
        return (
            <div></div>
        );
    }

    const org = orgData.data?.org?.overview;
    const isPending = org?.approvalStatus === 'pending';
    const allowedActions = configData?.orgApproval?.pendingOrgLimits?.allowedActions ?? ['view_page', 'edit_profile', 'manage_members'];

    const pageToAction = [
        'view_page',      // 0: Dashboard
        'create_events',  // 1: Events
        'post_messages',  // 2: Announcements
        'manage_members', // 3: Members
        'edit_profile',   // 4: Forms
        'edit_profile',   // 5: Settings
    ];
    const pageParam = parseInt(searchParams.get('page') ?? '0', 10);
    const requiredAction = pageToAction[Math.min(pageParam, pageToAction.length - 1)] ?? 'view_page';
    const isRestricted = isPending && !allowedActions.includes(requiredAction);
    const memberCount = orgData.data?.org?.members?.length ?? 0;

    return (
        <div className="club-dash-with-banner">
            <Popup
                isOpen={showOnboarding}
                onClose={handleOnboardingClose}
                customClassName="club-dash-onboarding-popup"
            >
                <ClubDashOnboarding handleClose={handleOnboardingClose} />
            </Popup>
            {isAdminView && isSiteAdmin && (
                <AdminViewBanner />
            )}
            {showJustApprovedBanner && (
                <div className="club-dash-approved-notice" role="alert">
                    <Icon icon="mdi:check-circle" className="club-dash-approved-notice__icon" />
                    <span className="club-dash-approved-notice__text">Your organization was just approved!</span>
                </div>
            )}
            {isPending && (
                <OrgPendingBanner org={org} orgName={clubId} />
            )}
            <Dashboard
                menuItems={menuItems}
                additionalClass='club-dash'
                middleItem={isAdminView && isSiteAdmin ? (
                    <div className="org-dropdown org-dropdown--admin-view">
                        <img src={org?.org_profile_image || '/Logo.svg'} alt="" />
                        <span className="org-dropdown__viewing-label">Viewing: {clubId}</span>
                    </div>
                ) : (
                    <OrgDropdown showDrop={showDrop} setShowDrop={setShowDrop} user={user} currentOrgName={clubId} onOrgChange={onOrgChange}/>
                )}
                logo={orgLogo}
                secondaryColor="#EDF6EE"
                primaryColor="#4DAA57"
                enableSubSidebar={true}
                onBack={() => navigate(isAdminView && isSiteAdmin ? '/org-management' : '/events-dashboard')}
                contentOverlay={isRestricted ? (
                    <PendingApprovalOverlay
                        org={org}
                        orgName={clubId}
                        config={configData}
                        memberCount={memberCount}
                    />
                ) : null}
            />
        </div>
    )
}


export default ClubDash;