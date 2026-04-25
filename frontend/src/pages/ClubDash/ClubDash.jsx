import React, { useEffect, useLayoutEffect, useState, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import './ClubDash.scss';
import useAuth from '../../hooks/useAuth';
import { analytics } from '../../services/analytics/analytics';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import logo from '../../assets/red_logo.svg';
import { getAllEvents } from '../../components/EventsViewer/EventHelpers';
import { useNotification } from '../../NotificationContext';
import {Icon} from '@iconify-icon/react';  
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
import OrgLifecycleBanner from '../../components/OrgLifecycleBanner/OrgLifecycleBanner';
import PendingApprovalOverlay from '../../components/PendingApprovalOverlay/PendingApprovalOverlay';
import AdminViewBanner from '../../components/AdminViewBanner/AdminViewBanner';
import { useOrgApprovalRoom } from '../../WebSocketContext';
import Popup from '../../components/Popup/Popup';
import ClubDashOnboarding from './ClubDashOnboarding/ClubDashOnboarding';
import GovernanceSettings from './OrgSettings/components/GovernanceSettings';
import BudgetSettings from './OrgSettings/components/BudgetSettings';
import LifecycleSettings from './OrgSettings/components/LifecycleSettings';
import {
    ORG_BETA_FEATURE_ORG_TASKS,
    ORG_BETA_FEATURE_ORG_BUDGETING,
    ORG_BETA_FEATURE_ORG_GOVERNANCE,
    ORG_BETA_FEATURE_ORG_LIFECYCLE,
    ORG_BETA_FEATURE_ORG_VERIFICATION_REQUESTS,
    ORG_BETA_DISABLED_MENU_BEHAVIOR_COMING_SOON,
    ORG_BETA_DISABLED_MENU_BEHAVIOR_HIDE,
    orgHasBetaFeature
} from '../../constants/orgBetaFeatures';

/** Set to true to always show the onboarding popup (ignores localStorage) */
const FORCE_CLUB_DASH_ONBOARDING = false;

const TasksHub = lazy(() => import('./TasksHub/TasksHub'));
const Dash = lazy(() => import('./Dash/Dash'));

function ClubDash(){
    const { id: clubIdParam } = useParams();
    const clubId = clubIdParam ?? '';
    const orgEnterShellRef = useRef(null);
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
        canViewAnalytics: false,
        canManageEvents: false,
        canAccessBudgets: false
    });
    const [permissionsChecked, setPermissionsChecked] = useState(false);
    const [showJustApprovedBanner, setShowJustApprovedBanner] = useState(false);
    const approvedBannerTimeoutRef = useRef(null);
    const [showOnboarding, setShowOnboarding] = useState(false);

    useEffect(() => {
        setPermissionsChecked(false);
        setUserPermissions({
            canManageRoles: false,
            canManageMembers: false,
            canViewAnalytics: false,
            canManageEvents: false,
            canAccessBudgets: false
        });
    }, [clubId]);

    const orgData = useFetch(`/get-org-by-name/${clubId}?exhaustive=true`);
    const meetings = useFetch(`/get-meetings/${clubId}`);
    const { data: configData } = useFetch('/org-management/config');
    const [searchParams, setSearchParams] = useSearchParams();
    const isAdminView = searchParams.get('adminView') === 'true';
    const isSiteAdmin = user?.roles?.includes('admin') || user?.roles?.includes('root');
    const adminBypass = isAdminView && isSiteAdmin;

    const location = useLocation();

    useLayoutEffect(() => {
        const el = orgEnterShellRef.current;
        if (orgData.loading) {
            if (el) el.classList.remove('club-dash-org-enter--animate');
            return;
        }
        if (
            typeof window !== 'undefined' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ) {
            return;
        }
        if (!el) return;
        el.classList.remove('club-dash-org-enter--animate');
        void el.offsetWidth;
        el.classList.add('club-dash-org-enter--animate');
    }, [clubId, orgData.loading]);

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
        const orgId = orgData?.data?.org?.overview?._id;
        if (orgId) {
            analytics.screen('Club Dashboard', { org_id: orgId });
        }
    }, [clubId, orgData?.data?.org?.overview?._id]);

    useEffect(()=>{
        if(orgData){
            if(orgData.error){
                addNotification({title: "Error", message: orgData.error, type: "error"});
                navigate('/');
            }
            if(orgData.data){
                console.log(orgData.data);
                const overview = orgData.data.org?.overview;
                if (
                    !permissionsChecked &&
                    user &&
                    overview?.org_name === clubId
                ) {
                    checkUserPermissions();
                }
            }
        }
    }
    ,[orgData, user, permissionsChecked, clubId]);

    const checkUserPermissions = async () => {
        if (!orgData.data || !user || permissionsChecked) return;
        const org = orgData.data.org?.overview;
        if (!org || org.org_name !== clubId) return;

        // Admin view: grant full permissions without checking org role
        if (isAdminView && isSiteAdmin) {
            setUserPermissions({
                canManageRoles: true,
                canManageMembers: true,
                canViewAnalytics: true,
                canManageEvents: true,
                canAccessBudgets: true
            });
            setPermissionsChecked(true);
            return;
        }

        try {
            // Check if user is the owner
            const isOwner = org.owner === user._id;
            
            if (isOwner) {
                setUserPermissions({
                    canManageRoles: true,
                    canManageMembers: true,
                    canViewAnalytics: true,
                    canManageEvents: true,
                    canAccessBudgets: true
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
                        const perms = userRoleData.permissions || [];
                        const all = perms.includes('all');
                        setUserPermissions({
                            canManageRoles: userRoleData.canManageRoles || perms.includes('manage_roles') || all,
                            canManageMembers: userRoleData.canManageMembers || perms.includes('manage_members') || all,
                            canViewAnalytics: userRoleData.canViewAnalytics || perms.includes('view_analytics') || all,
                            canManageEvents: userRoleData.canManageEvents || perms.includes('manage_events') || all,
                            canAccessBudgets:
                                all ||
                                perms.includes('view_finances') ||
                                perms.includes('manage_finances')
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
    },[userInfo, isAdminView, isSiteAdmin, clubId, navigate, addNotification]);

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

    const menuItemsRef = useRef([]);

    const openMembers = useCallback(() => {
        const idx = menuItemsRef.current.findIndex((item) => item.key === 'members');
        if (idx < 0) return;
        const basePath = `/club-dashboard/${encodeURIComponent(clubId)}`;
        const params = new URLSearchParams();
        params.set('page', String(idx));
        if (isAdminView && isSiteAdmin) params.set('adminView', 'true');
        navigate(`${basePath}?${params.toString()}`);
    }, [clubId, isAdminView, isSiteAdmin, navigate]);

    const onOrgChange = (org) => {
        const basePath = `/club-dashboard/${org.org_name}`;
        const newPath = isAdminView ? `${basePath}?adminView=true` : basePath;
        navigate(newPath);
    }

    const orgOverview = orgData.data?.org?.overview;
    const orgMongoId = orgOverview?._id;
    const tasksComingSoon =
        !adminBypass && !orgHasBetaFeature(orgOverview, ORG_BETA_FEATURE_ORG_TASKS);
    const budgetingComingSoon =
        !adminBypass && !orgHasBetaFeature(orgOverview, ORG_BETA_FEATURE_ORG_BUDGETING);
    const governanceComingSoon =
        !adminBypass && !orgHasBetaFeature(orgOverview, ORG_BETA_FEATURE_ORG_GOVERNANCE);
    const lifecycleComingSoon =
        !adminBypass && !orgHasBetaFeature(orgOverview, ORG_BETA_FEATURE_ORG_LIFECYCLE);
    const verificationRequestsComingSoon =
        !adminBypass &&
        !orgHasBetaFeature(orgOverview, ORG_BETA_FEATURE_ORG_VERIFICATION_REQUESTS);
    const disabledMenuBehaviorByKey =
        configData?.data?.betaFeatures?.disabledMenuBehaviorByKey || {};
    const getDisabledMenuBehavior = (featureKey) => {
        const mode = disabledMenuBehaviorByKey[featureKey];
        if (mode === ORG_BETA_DISABLED_MENU_BEHAVIOR_HIDE) return mode;
        return ORG_BETA_DISABLED_MENU_BEHAVIOR_COMING_SOON;
    };
    const tasksDisabledMenuBehavior = getDisabledMenuBehavior(ORG_BETA_FEATURE_ORG_TASKS);
    const budgetingDisabledMenuBehavior = getDisabledMenuBehavior(ORG_BETA_FEATURE_ORG_BUDGETING);
    const governanceDisabledMenuBehavior = getDisabledMenuBehavior(ORG_BETA_FEATURE_ORG_GOVERNANCE);
    const lifecycleDisabledMenuBehavior = getDisabledMenuBehavior(ORG_BETA_FEATURE_ORG_LIFECYCLE);
    const verificationRequestsDisabledMenuBehavior = getDisabledMenuBehavior(
        ORG_BETA_FEATURE_ORG_VERIFICATION_REQUESTS
    );
    const tasksHidden = tasksComingSoon && tasksDisabledMenuBehavior === ORG_BETA_DISABLED_MENU_BEHAVIOR_HIDE;
    const budgetingHidden =
        budgetingComingSoon && budgetingDisabledMenuBehavior === ORG_BETA_DISABLED_MENU_BEHAVIOR_HIDE;
    const governanceHidden =
        governanceComingSoon && governanceDisabledMenuBehavior === ORG_BETA_DISABLED_MENU_BEHAVIOR_HIDE;
    const lifecycleHidden =
        lifecycleComingSoon && lifecycleDisabledMenuBehavior === ORG_BETA_DISABLED_MENU_BEHAVIOR_HIDE;
    const verificationRequestsHidden =
        verificationRequestsComingSoon &&
        verificationRequestsDisabledMenuBehavior === ORG_BETA_DISABLED_MENU_BEHAVIOR_HIDE;

    useEffect(() => {
        if (orgData.loading) return;
        if (!tasksComingSoon) return;
        const page = parseInt(searchParams.get('page') ?? '0', 10);
        if (page !== 2) return;
        setSearchParams(
            (prev) => {
                const next = new URLSearchParams(prev);
                next.set('page', '0');
                return next;
            },
            { replace: true }
        );
    }, [orgData.loading, tasksComingSoon, searchParams, setSearchParams]);

    const menuItems = useMemo(() => {
        const baseMenuItems = [
            {
                label: 'Dashboard',
                icon: 'ic:round-dashboard',
                key: 'dash',
                element: (
                    <Suspense fallback={<div className="club-dash-tab-fallback">Loading dashboard…</div>}>
                        <Dash expandedClass={expandedClass} openMembers={openMembers} clubName={clubId} meetings={meetings.data} org={orgData.data} canManageEvents={userPermissions.canManageEvents}/>
                    </Suspense>
                )
            },
            {
                label: 'Events',
                icon: 'mingcute:calendar-fill',
                key: 'events',
                element: <EventsManagement expandedClass={expandedClass} orgId={clubId} orgData={orgData.data} adminBypass={adminBypass}/>
            },
            {
                label: 'Tasks',
                icon: 'mdi:check-all',
                key: 'tasks',
                hidden: tasksHidden,
                comingSoon: tasksComingSoon && !tasksHidden,
                element: tasksComingSoon ? null : (
                    <Suspense fallback={<div className="club-dash-tab-fallback">Loading tasks…</div>}>
                        <TasksHub expandedClass={expandedClass} orgId={orgMongoId} clubName={clubId} />
                    </Suspense>
                )
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
                element: <Members expandedClass={expandedClass} org={orgData.data?.org?.overview} adminBypass={adminBypass}/>
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
                        element: <GeneralSettings org={orgData.data?.org?.overview} expandedClass={expandedClass} adminBypass={adminBypass} />
                    },
                    {
                        label: 'Roles & Permissions',
                        icon: 'mdi:shield-account',
                        element:  <Roles expandedClass={expandedClass} org={orgData.data?.org?.overview} refetch={orgData.refetch} adminBypass={adminBypass}/>
                    },
                    {
                        label: 'Equipment',
                        icon: 'mdi:package-variant-closed',
                        comingSoon: true,
                        // Temporarily disabled - Equipment functionality commented out
                        // element: <OrgEquipment expandedClass={expandedClass} org={orgData.data?.org?.overview} />
                        element: null
                    },
                    {
                        label: 'Application Process',
                        icon: 'mdi:form-select',
                        element: <MemberSettings org={orgData.data?.org?.overview} expandedClass={expandedClass} adminBypass={adminBypass} />
                    },
                    {
                        label: 'Social Links',
                        icon: 'mdi:link-variant',
                        element: <SocialLinksSettings org={orgData.data?.org?.overview} expandedClass={expandedClass} adminBypass={adminBypass} />
                    },
                    {
                        label: 'Lifecycle',
                        icon: 'mdi:state-machine',
                        hidden: lifecycleHidden,
                        comingSoon: lifecycleComingSoon && !lifecycleHidden,
                        element: lifecycleComingSoon ? null : (
                            <LifecycleSettings
                                org={orgData.data?.org?.overview}
                                expandedClass={expandedClass}
                            />
                        )
                    },
                    {
                        label: 'Governance',
                        icon: 'mdi:file-document-outline',
                        hidden: governanceHidden,
                        comingSoon: governanceComingSoon && !governanceHidden,
                        element: governanceComingSoon ? null : (
                            <GovernanceSettings org={orgData.data?.org?.overview} expandedClass={expandedClass} />
                        )
                    },
                    {
                        label: 'Budgets',
                        icon: 'mdi:cash-multiple',
                        requiresFinances: true,
                        hidden: budgetingHidden,
                        comingSoon: budgetingComingSoon && !budgetingHidden,
                        element: budgetingComingSoon ? null : (
                            <BudgetSettings org={orgData.data?.org?.overview} expandedClass={expandedClass} />
                        )
                    },
                    {
                        label: 'Verification Requests',
                        icon: 'mdi:shield-check',
                        hidden: verificationRequestsHidden,
                        comingSoon: verificationRequestsComingSoon && !verificationRequestsHidden,
                        element: verificationRequestsComingSoon ? null : (
                            <VerificationRequest org={orgData.data?.org?.overview} expandedClass={expandedClass} />
                        )
                    },
                    {
                        label: 'Danger Zone',
                        icon: 'mdi:alert-circle',
                        element: <DangerZone org={orgData.data?.org?.overview} expandedClass={expandedClass} adminBypass={adminBypass} />
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
        const withFilteredSettings = baseMenuItems.map((item) => {
            if (item.key !== 'settings' || !item.subItems) return item;
            const showBudgets =
                adminBypass ||
                userPermissions.canAccessBudgets;
            return {
                ...item,
                subItems: item.subItems.filter(
                    (sub) => (!sub.requiresFinances || showBudgets) && !sub.hidden
                )
            };
        });
        return withFilteredSettings.filter((item) => {
            if (item.hidden) return false;
            if (isAdminView && isSiteAdmin) return true;
            if (!item.requiresPermission) return true;
            return userPermissions[item.requiresPermission];
        });
    }, [
        expandedClass,
        openMembers,
        clubId,
        meetings.data,
        orgData.data,
        orgData.refetch,
        orgMongoId,
        userPermissions,
        adminBypass,
        isAdminView,
        isSiteAdmin,
        tasksComingSoon,
        tasksHidden,
        budgetingComingSoon,
        budgetingHidden,
        governanceComingSoon,
        governanceHidden,
        lifecycleComingSoon,
        lifecycleHidden,
        verificationRequestsComingSoon,
        verificationRequestsHidden,
        configData
    ]);

    menuItemsRef.current = menuItems;

    

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

    if (orgData.loading) {
        return (
            <div className="club-dash-with-banner">
                <div ref={orgEnterShellRef} className="club-dash-org-enter" aria-busy="true" />
            </div>
        );
    }

    const org = orgData.data?.org?.overview;
    const isPending = org?.approvalStatus === 'pending';
    const allowedActions = configData?.orgApproval?.pendingOrgLimits?.allowedActions ?? ['view_page', 'edit_profile', 'manage_members'];

    const hasOrgTasksBeta =
        adminBypass ||
        orgHasBetaFeature(org, ORG_BETA_FEATURE_ORG_TASKS);

    const pageToAction = [
        'view_page',       // 0: Dashboard
        'create_events',   // 1: Events
        hasOrgTasksBeta ? 'create_events' : 'view_page', // 2: Tasks hub beta
        'post_messages',   // 3: Announcements
        'manage_members',  // 4: Members
        'edit_profile',    // 5: Settings
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
            <OrgLifecycleBanner lifecycleStatus={org?.lifecycleStatus} />
            <div ref={orgEnterShellRef} className="club-dash-org-enter">
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
        </div>
    )
}


export default ClubDash;