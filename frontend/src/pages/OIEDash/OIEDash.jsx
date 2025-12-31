import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import './OIEDash.scss';
import ApprovalConfig from './ApprovalConfig/ApprovalConfig';
import EventsCalendar from './EventsCalendar/EventsCalendar';
import Dashboard from '../../components/Dashboard/Dashboard';
import { useFetch } from '../../hooks/useFetch';
import useAuth from '../../hooks/useAuth';
import { useNotification } from '../../NotificationContext';
import apiRequest from '../../utils/postRequest';

// Reuse ClubDash components
import Members from '../ClubDash/Members/Members';
import Roles from '../ClubDash/Roles/Roles';
import { 
    GeneralSettings, 
    AppearanceSettings, 
    DangerZone,
    MemberSettings
} from '../ClubDash/OrgSettings/components';

import Dash from './Dash/Dash';
import ManageEvents from './ManageEvents/ManageEvents';
import Approval from '../RootDash/ManageFlow/Approval/Approval';
import Automation from './Automation/Automation';
import eventsLogo from '../../assets/Brand Image/EventsLogo.svg';


function OIEDash(){
    const [approvalId, setApprovalId] = useState(useParams().id);
    const [expanded, setExpanded] = useState(false);
    const [expandedClass, setExpandedClass] = useState("");
    const { isAuthenticated, isAuthenticating, user } = useAuth();
    const navigate = useNavigate();
    const { addNotification } = useNotification();
    const [userInfo, setUserInfo] = useState(null);
    const [userPermissions, setUserPermissions] = useState({
        canManageRoles: false,
        canManageMembers: false,
        canViewAnalytics: false
    });
    const [permissionsChecked, setPermissionsChecked] = useState(false);
    const [hasAccess, setHasAccess] = useState(false);

    // Fetch approval group data
    const approvalGroupsData = useFetch('/approval-groups');
    const [approvalGroup, setApprovalGroup] = useState(null);

    // Authentication and basic validation
    useEffect(() => {
        if (isAuthenticating) {
            return;
        }
        if (!isAuthenticated) {
            navigate('/');
        }
        if (!user) {
            return;
        } else {
            setUserInfo(user);
        }
    }, [isAuthenticating, isAuthenticated, user, navigate]);

    // Check if approval group exists and user has access
    useEffect(() => {
        if (approvalGroupsData.data?.data) {
            const group = approvalGroupsData.data.data.find(
                group => group.org_name === approvalId
            );
            
            if (!group) {
                addNotification({
                    title: "Error", 
                    message: "Approval group not found", 
                    type: "error"
                });
                navigate('/');
                return;
            }
            
            setApprovalGroup(group);
        }
        
        if (approvalGroupsData.error) {
            addNotification({
                title: "Error", 
                message: approvalGroupsData.error, 
                type: "error"
            });
            navigate('/');
        }
    }, [approvalGroupsData.data, approvalGroupsData.error, approvalId, addNotification, navigate]);

    // Check user permissions for the approval group
    useEffect(() => {
        if (approvalGroup && user && !permissionsChecked) {
            checkUserPermissions();
        }
    }, [approvalGroup, user, permissionsChecked]);

    // Verify user has access to this approval group
    useEffect(() => {
        if (!userInfo || !approvalGroup) {
            return;
        }
        
        // Check if user is a site admin (admin or root role)
        const isSiteAdmin = userInfo.roles?.includes('admin') || userInfo.roles?.includes('root');
        
        // Check if user is the owner
        const isOwner = approvalGroup.owner === userInfo._id;
        
        // Check if user is a member of this approval group
        const isMember = userInfo.clubAssociations?.find(
            club => club._id === approvalGroup._id || club.org_name === approvalId
        );
        
        if (!isSiteAdmin && !isOwner && !isMember) {
            addNotification({
                title: "Unauthorized", 
                message: "You are not authorized to access this approval group", 
                type: "error"
            });
            navigate('/');
            return;
        }
        
        setHasAccess(true);
    }, [userInfo, approvalGroup, approvalId, addNotification, navigate]);

    const checkUserPermissions = async () => {
        if (!approvalGroup || !user || permissionsChecked) return;

        try {
            // Check if user is a site admin (admin or root role)
            const isSiteAdmin = user.roles?.includes('admin') || user.roles?.includes('root');
            
            // Check if user is the owner
            const isOwner = approvalGroup.owner === user._id;
            
            if (isSiteAdmin || isOwner) {
                setUserPermissions({
                    canManageRoles: true,
                    canManageMembers: true,
                    canViewAnalytics: true
                });
                setPermissionsChecked(true);
                return;
            }

            // Get user's role in this approval group
            const response = await apiRequest(`/org-roles/${approvalGroup._id}/members`, {}, {
                method: 'GET'
            });

            if (response.success) {
                const userMember = response.members.find(member => 
                    member.user_id._id === user._id
                );

                if (userMember) {
                    const userRoleData = approvalGroup.positions?.find(role => role.name === userMember.role);
                    
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

    const baseMenuItems = [
        { 
            label: 'Dashboard', 
            icon: 'ic:round-dashboard',
            element: <Dash name={approvalId} />
        },
        { 
            label: 'Event Calendar', 
            icon: 'heroicons:calendar-16-solid',
            element: <EventsCalendar />
        },
        { 
            label: 'Events Board', 
            icon: 'heroicons-solid:view-boards',
            element: <ManageEvents />
        },
        { 
            label: 'Members', 
            icon: 'mdi:account-group',
            requiresPermission: 'canManageMembers',
            element: approvalGroup ? <Members expandedClass={expandedClass} org={approvalGroup} /> : <div>Loading...</div>
        },
        { 
            label: 'Settings', 
            icon: 'mdi:cog',
            subItems: [
                {
                    label: 'General',
                    icon: 'mdi:cog',
                    element: approvalGroup ? <GeneralSettings org={approvalGroup} expandedClass={expandedClass} /> : <div>Loading...</div>
                },
                {
                    label: 'Appearance',
                    icon: 'mdi:palette',
                    element: approvalGroup ? <AppearanceSettings org={approvalGroup} expandedClass={expandedClass} /> : <div>Loading...</div>
                },
                {
                    label: 'Roles & Permissions',
                    icon: 'mdi:shield-account',
                    requiresPermission: 'canManageRoles',
                    element: approvalGroup ? <Roles org={approvalGroup} expandedClass={expandedClass} refetch={approvalGroupsData.refetch}/> : <div>Loading...</div>
                },
                // {
                //     label: 'Membership',
                //     icon: 'mdi:account-group',
                //     requiresPermission: 'canManageMembers',
                //     element: approvalGroup ? <MemberSettings org={approvalGroup} expandedClass={expandedClass} /> : <div>Loading...</div>
                // },
                { 
                    label: 'Configuration', 
                    icon: 'flowbite:adjustments-horizontal-solid',
                    element: <ApprovalConfig approvalId={approvalId} />
                },
                { 
                    label: 'Automation', 
                    icon: 'mdi:robot',
                    requiresPermission: 'canManageRoles',
                    element: approvalGroup ? <Automation org={approvalGroup} expandedClass={expandedClass} /> : <div>Loading...</div>
                },
                {
                    label: 'Danger Zone',
                    icon: 'mdi:alert-circle',
                    requiresPermission: 'canManageRoles',
                    element: approvalGroup ? <DangerZone org={approvalGroup} expandedClass={expandedClass} /> : <div>Loading...</div>
                },
            ]
        },
    ];

    // Filter menu items based on user permissions
    const menuItems = baseMenuItems.filter(item => {
        if (!item.requiresPermission) return true;
        return userPermissions[item.requiresPermission];
    }).map(item => {
        if (item.subItems) {
            return {
                ...item,
                subItems: item.subItems.filter(subItem => {
                    if (!subItem.requiresPermission) return true;
                    return userPermissions[subItem.requiresPermission];
                })
            };
        }
        return item;
    });

    // Show loading state while checking permissions and access
    if (isAuthenticating || !permissionsChecked || !hasAccess) {
        return (
            <div className="oie-dash-loading">
                <div className="loading-content">
                    <div className="loading-spinner"></div>
                    <p>Verifying access to approval group...</p>
                </div>
            </div>
        );
    }

    // Show error state if approval group not found
    if (!approvalGroup) {
        return (
            <div className="oie-dash-error">
                <div className="error-content">
                    <h2>Approval Group Not Found</h2>
                    <p>The approval group "{approvalId}" does not exist or you don't have access to it.</p>
                    <button onClick={() => navigate('/')} className="back-button">
                        Return to Home
                    </button>
                </div>
            </div>
        );
    }

    return (
        <Dashboard 
            menuItems={menuItems} 
            additionalClass='oie-dash' 
            logo={eventsLogo}
            enableSubSidebar={true}
        >
        </Dashboard>
    )
}

export default OIEDash;