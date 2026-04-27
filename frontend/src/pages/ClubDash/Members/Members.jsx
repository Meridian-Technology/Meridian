import React, { useState, useEffect } from 'react';
import './Members.scss';
import { useNotification } from '../../../NotificationContext';
import useAuth from '../../../hooks/useAuth';
import { useFetch } from '../../../hooks/useFetch';
import apiRequest from '../../../utils/postRequest';
import { useGradient } from '../../../hooks/useGradient';
import { Icon } from '@iconify-icon/react';
import Popup from '../../../components/Popup/Popup';
import Modal from '../../../components/Modal/Modal';
import AddMemberForm from '../../../components/AddMemberForm';
import { getOrgRoleColor } from '../../../utils/orgUtils';
import Select from '../../../components/Select/Select'; 
import MemberApplicationsViewer from './MemberApplicationsViewer/MemberApplicationsViewer';
import TabbedContainer, { CommonTabConfigs } from '../../../components/TabbedContainer';
import ComingSoon from '../EventsManagement/components/EventDashboard/ComingSoon';

/** Prefer display name; fall back to username when name is unset or empty. */
function getMemberDisplayName(user) {
    if (!user) return 'Unknown User';
    const name = typeof user.name === 'string' ? user.name.trim() : '';
    if (name) return name;
    const username = typeof user.username === 'string' ? user.username.trim() : '';
    if (username) return username;
    return user.email || 'Unknown User';
}

function getMemberInitial(user) {
    return getMemberDisplayName(user).charAt(0).toUpperCase() || 'U';
}

function getNormalizedMemberRoles(member) {
    const roleFromLegacyField = member?.role ? [member.role] : [];
    const roleArray = Array.isArray(member?.roles) ? member.roles.filter(Boolean) : [];
    const merged = [...new Set([...roleFromLegacyField, ...roleArray])];
    return merged.length > 0 ? merged : ['member'];
}

function Members({ expandedClass, org, adminBypass = false }) {
    const { user } = useAuth();
    const { addNotification } = useNotification();
    const {AtlasMain} = useGradient();
    const [roles, setRoles] = useState([]);
    const [canManageMembers, setCanManageMembers] = useState(false);
    const [userRole, setUserRole] = useState(null);
    const [userRoleData, setUserRoleData] = useState(null);
    const [isOwner, setIsOwner] = useState(false);
    const [hasAccess, setHasAccess] = useState(false);
    const [permissionsChecked, setPermissionsChecked] = useState(false);
    const [showAddMember, setShowAddMember] = useState(false);
    const [showRoleAssignment, setShowRoleAssignment] = useState(false);
    const [selectedMember, setSelectedMember] = useState(null);
    const [selectedRoleNames, setSelectedRoleNames] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterRole, setFilterRole] = useState('all');
    const [showApplicationsViewer, setShowApplicationsViewer] = useState(false);
    const [showPendingInvites, setShowPendingInvites] = useState(false);

    // Use useFetch for members data
    const { data: membersData, loading: membersLoading, error: membersError, refetch: refetchMembers } = useFetch(
        org ? `/org-roles/${org._id}/members` : null,
    );

    // Extract members and applications from the fetched data
    const members = membersData?.members || [];
    const applications = membersData?.applications || [];

    // Fetch pending invites when modal is open
    const { data: invitesData, loading: invitesLoading, refetch: refetchInvites } = useFetch(
        showPendingInvites && org ? `/org-invites/${org._id}` : null,
    );
    const allInvites = invitesData?.data || [];
    const pendingInvites = allInvites.filter(
        (inv) => inv.status === 'pending' && new Date(inv.expires_at) > new Date()
    );

    useEffect(() => {
        if (org && !permissionsChecked) {
            console.log('Members component - org data:', org);
            console.log('Members component - user data:', user);
            setRoles(org.positions || []);
            checkUserPermissions();
        }
    }, [org, user, permissionsChecked]);

    useEffect(() => {
        // Handle members fetch error
        if (membersError) {
            console.error('Error fetching members:', membersError);
            addNotification({
                title: 'Error',
                message: 'Failed to fetch members',
                type: 'error'
            });
        }
    }, [membersError, addNotification]);

    const checkUserPermissions = async () => {
        if (!org || !user || permissionsChecked) return;

        try {
            // Admin/root viewing as admin: grant full access
            if (adminBypass) {
                setUserRole('admin');
                setCanManageMembers(true);
                setHasAccess(true);
                setPermissionsChecked(true);
                return;
            }

            // Check if user is the owner
            const ownerId = org.owner?._id ?? org.owner;
            const isOwner = ownerId != null && String(ownerId) === String(user._id);
            
            if (isOwner) {
                setUserRole('owner');
                setIsOwner(true);
                setUserRoleData(org.positions?.find((role) => role.name === 'owner') || null);
                setCanManageMembers(true);
                setHasAccess(true);
                setPermissionsChecked(true);
                return;
            }

            // Get effective permissions from backend source of truth
            const response = await apiRequest(`/org-roles/${org._id}/me/permissions`, {}, {
                method: 'GET'
            });

            if (response.success) {
                const currentRole = response.role || 'member';
                setUserRole(currentRole);
                const currentRoleData = org.positions.find((role) => role.name === currentRole) || null;
                setUserRoleData(currentRoleData);
                const effectivePermissions = response.permissions || [];
                setCanManageMembers(effectivePermissions.includes('all') || effectivePermissions.includes('manage_members'));
                setHasAccess(true);
            } else {
                console.error('Failed to fetch user membership:', response.message);
                setHasAccess(false);
                setCanManageMembers(false);
            }
        } catch (error) {
            console.error('Error checking user permissions:', error);
            setHasAccess(false);
            setCanManageMembers(false);
        } finally {
            setPermissionsChecked(true);
        }
    };

    const getAssignableRoles = () => {
        if (isOwner) return roles;
        const myOrder = userRoleData?.order ?? Number.MAX_SAFE_INTEGER;
        return roles.filter((role) => (role.order ?? Number.MAX_SAFE_INTEGER) >= myOrder);
    };

    const handleRoleAssignment = async (memberId, newRoles, reason = '') => {
        if (!canManageMembers) {
            addNotification({
                title: 'Error',
                message: 'You don\'t have permission to manage members',
                type: 'error'
            });
            return;
        }

        try {
            const response = await apiRequest(`/org-roles/${org._id}/members/${memberId}/role`, {
                role: newRoles?.[0] || 'member',
                roles: newRoles,
                reason: reason
            }, {
                method: 'POST'
            });

            if (response.success) {
                addNotification({
                    title: 'Success',
                    message: 'Role assigned successfully',
                    type: 'success'
                });
                refetchMembers(); // Refresh member list using useFetch refetch
                setShowRoleAssignment(false);
                setSelectedMember(null);
                setSelectedRoleNames([]);
            }
        } catch (error) {
            console.error('Error assigning role:', error);
            addNotification({
                title: 'Error',
                message: 'Failed to assign role',
                type: 'error'
            });
        }
    };

    const notifyOwnerTransferRequired = () => {
        addNotification({
            title: 'Ownership transfer required',
            message: 'To assign the owner role, use ownership transfer in Settings.',
            type: 'info'
        });
    };

    const handleRemoveMember = async (memberId) => {
        if (!canManageMembers) {
            addNotification({
                title: 'Error',
                message: 'You don\'t have permission to manage members',
                type: 'error'
            });
            return;
        }

        if (!window.confirm('Are you sure you want to remove this member from the organization?')) {
            return;
        }

        try {
            const response = await apiRequest(`/org-roles/${org._id}/members/${memberId}`, {}, {
                method: 'DELETE'
            });

            if (response.success) {
                addNotification({
                    title: 'Success',
                    message: 'Member removed successfully',
                    type: 'success'
                });
                refetchMembers(); // Refresh member list using useFetch refetch
            }
        } catch (error) {
            console.error('Error removing member:', error);
            addNotification({
                title: 'Error',
                message: 'Failed to remove member',
                type: 'error'
            });
        }
    };

    const handleMemberAdded = () => {
        refetchMembers(); // Refresh member list using useFetch refetch
    };

    const handleCloseAddMember = () => {
        setShowAddMember(false);
    };

    const filteredMembers = members.filter(member => {
        const matchesSearch = member.user_id?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            member.user_id?.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            member.user_id?.email?.toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesRole = filterRole === 'all' || member.role === filterRole;
        
        return matchesSearch && matchesRole;
    });

    const getRoleDisplayName = (roleName) => {
        const role = roles.find(r => r.name === roleName);
        return role ? role.displayName : roleName;
    };

    const getRoleColor = (roleName) => {
        // Try to find the role object and use its color property
        const role = roles.find(r => r.name === roleName);
        if (role && role.color) {
            return role.color;
        }

        const roleColors = {'owner': '#dc2626',
            'member': '#059669'
        }
   
        return roleColors[roleName] || '#6b7280';
    };

    // Tab configuration for TabbedContainer
    const tabs = [
        CommonTabConfigs.withBadge(
            'members',
            'Member List',
            'mdi:account-group',
            <div className="members-tab">
                <div className="member-management-container">
                    {/* search and filter */}
                    <div className="controls">
                        <div className="search-filter">
                            <div className="search-box">
                                <Icon icon="ic:round-search" className="search-icon" />
                                <input
                                    type="text"
                                    placeholder="Search members..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <div className="filter-dropdown">
                                <Select
                                    options={['All Roles', ...roles.map(role => role.displayName)]}
                                    onChange={(value) => setFilterRole(value === 'All Roles' ? 'all' : roles.find(role => role.displayName === value).name)}
                                    defaultValue="All Roles"
                                />
                            </div>
                        </div>
                        {/* {canManageMembers && (
                            
                                <button
                                className="view-applications-btn"
                                onClick={() => setShowApplicationsViewer(true)}
                                >
                                    
                                   
                                    View Applications
                                </button>
                            
                        )} */}
                        {canManageMembers && (
                            <>
                                <button 
                                    className="pending-invites-btn"
                                    onClick={() => setShowPendingInvites(true)}
                                >
                                    <Icon icon="mdi:email-clock-outline" />
                                    Pending Invites
                                </button>
                                <button 
                                    className="add-member-btn"
                                    onClick={() => setShowAddMember(true)}
                                >
                                    <Icon icon="ic:round-add" />
                                    Add Member
                                </button>
                            </>
                        )}
                        
                    </div>

                    <div className="members-list">
                        {
                            filteredMembers.length > 0 ? (
                                <div className="members-list-header">
                                    <h3>Name</h3>
                                    <h3></h3>
                                    <h3>Joined</h3>
                                    <h3>Role</h3>
                                    <h3>Actions</h3>
                                </div>
                            ) : (
                                <div className="members-list-header">

                                </div>
                            )
                        }
                        {filteredMembers.length === 0 ? (
                            <div className="no-members">
                                <Icon icon="mdi:account-group-outline" className="no-members-icon" />
                                <p>No members found</p>
                                {searchTerm || filterRole !== 'all' ? (
                                    <button 
                                        className="clear-filters-btn"
                                        onClick={() => {
                                            setSearchTerm('');
                                            setFilterRole('all');
                                        }}
                                    >
                                        Clear Filters
                                    </button>
                                ) : null}
                            </div>
                        ) : (
                            filteredMembers.map(member => (
                                <div key={member._id} className="member-card">
                                    <div className="member-avatar">
                                        {member.user_id?.picture ? (
                                            <img src={member.user_id.picture} alt={getMemberDisplayName(member.user_id)} />
                                        ) : (
                                            <div className="avatar-placeholder">
                                                {getMemberInitial(member.user_id)}
                                            </div>
                                        )}
                                    </div>
                                    <div className="member-details">
                                        <h4>{getMemberDisplayName(member.user_id)}</h4>
                                        <p className="email">{member.user_id?.email || 'No email'}</p>
                                    </div>
                                    <div className="member-meta">
                                        <span className="joined-date">
                                            Joined {new Date(member.joinedAt).toLocaleDateString()}
                                        </span>
                                        {member.assignedBy && (
                                            <span className="assigned-by">
                                                Assigned by {getMemberDisplayName(member.assignedBy)}
                                            </span>
                                        )}
                                        {(member.roleTermStart || member.roleTermEnd) && (
                                            <span className="role-term">
                                                Term:{' '}
                                                {member.roleTermStart
                                                    ? new Date(member.roleTermStart).toLocaleDateString()
                                                    : '—'}
                                                {' → '}
                                                {member.roleTermEnd
                                                    ? new Date(member.roleTermEnd).toLocaleDateString()
                                                    : '—'}
                                            </span>
                                        )}
                                    </div>
                                    
                                    <div className="role-badges">
                                        {getNormalizedMemberRoles(member).map((roleName) => (
                                            <div
                                                key={`${member._id}-${roleName}`}
                                                className="role-badge"
                                                style={{ backgroundColor: getOrgRoleColor(roleName, 0.1, roles), color: getOrgRoleColor(roleName, 1, roles) }}
                                            >
                                                {getRoleDisplayName(roleName)}
                                            </div>
                                        ))}
                                    </div>
                                    
                                    {canManageMembers && (
                                        <div className="action-buttons">
                                            <button 
                                                className="assign-role-btn"
                                                onClick={() => {
                                                    setSelectedMember(member);
                                                    setSelectedRoleNames(getNormalizedMemberRoles(member));
                                                    setShowRoleAssignment(true);
                                                }}
                                                title="Assign Role"
                                            >
                                                <Icon icon="mdi:shield-account" />
                                            </button>
                                            
                                            {member.role !== 'owner' && (
                                                <button 
                                                    className="remove-member-btn"
                                                    onClick={() => handleRemoveMember(member.user_id._id)}
                                                    title="Remove Member"
                                                >
                                                    <Icon icon="mdi:account-remove" />
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>,
            filteredMembers.length.toString(),
            'info'
        ),

        CommonTabConfigs.withBadge(
            'attendence record',
            'Attendence Record',
            'mdi:file-document-multiple',
            <ComingSoon feature="Attendance Record" />,
            applications.length.toString(),
            'warning'
        ),

        CommonTabConfigs.basic(
            'applications',
            'Applications',
            'mdi:shield-account',
            <MemberApplicationsViewer org={org} roles={getAssignableRoles()} />
        )
    ];

    // Custom header component
    const header = (
        <header className="header">
            <h1>Member Management</h1>
            <p>Manage members and assign roles for {org?.org_name}</p>
            <img src={AtlasMain} alt="" />
        </header>
    );

    if (membersLoading) {
        return (
            <div className={`dash ${expandedClass}`}>
                <div className="members loading">
                    <div className="loader">Loading members...</div>
                </div>
            </div>
        );
    }

    // If user doesn't have access to this organization
    if (!hasAccess) {
        return (
            <div className={`dash ${expandedClass}`}>
                <div className="members">
                    <header className="header">
                        <h1>Member Management</h1>
                        <p>Manage members and assign roles for {org.org_name}</p>
                        <img src={AtlasMain} alt="" />
                    </header>

                    <div className="permission-warning">
                        <p>You don't have access to this organization's member management.</p>
                        <p>You must be a member of this organization to view member information.</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={`dash ${expandedClass}`}>
            <Popup 
                isOpen={showApplicationsViewer} 
                onClose={() => {refetchMembers(); setShowApplicationsViewer(false)}}
                customClassName="wide-content"
                defaultStyling={false}
                popout={false}
            >
                <MemberApplicationsViewer org={org} roles={getAssignableRoles()} />
            </Popup>

            <Popup 
                isOpen={showPendingInvites} 
                onClose={() => setShowPendingInvites(false)}
                customClassName="pending-invites-popup medium-content"
            >
                <div className="pending-invites-modal">
                    <h3>Pending Invites</h3>
                    {invitesLoading ? (
                        <div className="pending-invites-loading">Loading...</div>
                    ) : pendingInvites.length === 0 ? (
                        <div className="pending-invites-empty">
                            <Icon icon="mdi:email-outline" className="empty-icon" />
                            <p>No pending invites</p>
                        </div>
                    ) : (
                        <div className="pending-invites-list">
                            <div className="pending-invites-header">
                                <span>Email</span>
                                <span>Role</span>
                                <span>Invited by</span>
                                <span>Expires</span>
                            </div>
                            {pendingInvites.map((inv) => (
                                <div key={inv._id} className="pending-invite-row">
                                    <span className="invite-email">{inv.email}</span>
                                    <span 
                                        className="invite-role"
                                        style={{ 
                                            backgroundColor: getOrgRoleColor(inv.role, 0.1, roles), 
                                            color: getOrgRoleColor(inv.role, 1, roles) 
                                        }}
                                    >
                                        {getRoleDisplayName(inv.role)}
                                    </span>
                                    <span className="invite-inviter">
                                        {inv.invited_by ? getMemberDisplayName(inv.invited_by) : '—'}
                                    </span>
                                    <span className="invite-expires">
                                        {new Date(inv.expires_at).toLocaleDateString()}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </Popup>

            <div className="members">
                {!canManageMembers && (
                    <div className="permission-warning">
                        <p>You don't have permission to manage members in this organization.</p>
                        <p>Only organization owners and users with member management permissions can modify member roles.</p>
                    </div>
                )}

                <TabbedContainer
                    tabs={tabs}
                    defaultTab="members"
                    tabStyle="default"
                    size="medium"
                    animated={true}
                    showTabIcons={true}
                    showTabLabels={true}
                    scrollable={true}
                    fullWidth={false}
                    className="members-tabs"
                    header={header}
                    onTabChange={(tabId) => {
                        console.log('Members tab changed to:', tabId);
                    }}
                />

                {/* add member form */}
                <Popup 
                    isOpen={showAddMember} 
                    onClose={handleCloseAddMember}
                    customClassName="add-member-popup medium-content"
                >
                    <AddMemberForm 
                        orgId={org._id}
                        roles={roles}
                        assignableRoles={getAssignableRoles()}
                        existingMembers={members}
                        onMemberAdded={handleMemberAdded}
                        onClose={handleCloseAddMember}
                        addNotification={addNotification}
                    />
                </Popup>

                {/* Role Assignment Modal */}
                <Modal 
                    isOpen={showRoleAssignment} 
                    onClose={() => {
                        setShowRoleAssignment(false);
                        setSelectedMember(null);
                    }}
                    title="Assign Role"
                    size="medium"
                    customClassName="role-assignment-modal"
                >
                    {selectedMember && (
                        <>
                            <div className="member-summary">
                                <div className="member-summary-header">
                                    <div className="member-avatar-summary">
                                        {selectedMember.user_id?.picture ? (
                                            <img src={selectedMember.user_id.picture} alt={getMemberDisplayName(selectedMember.user_id)} />
                                        ) : (
                                            <div className="avatar-placeholder">
                                                {getMemberInitial(selectedMember.user_id)}
                                            </div>
                                        )}
                                    </div>
                                    <div className="member-summary-info">
                                        <h4>{getMemberDisplayName(selectedMember.user_id)}</h4>
                                        {selectedMember.user_id?.username &&
                                            getMemberDisplayName(selectedMember.user_id) !==
                                                String(selectedMember.user_id.username).trim() && (
                                                <p className="member-username">@{String(selectedMember.user_id.username).trim()}</p>
                                            )}
                                    </div>
                                </div>
                                <div className="current-role-display">
                                    <span className="current-role-label">Current Role:</span>
                                    <div 
                                        className="current-role-badge"
                                        style={{ 
                                            backgroundColor: getOrgRoleColor(selectedMember.role, 0.1, roles),
                                            color: getOrgRoleColor(selectedMember.role, 1, roles)
                                        }}
                                    >
                                        <div 
                                            className="role-color-indicator"
                                            style={{ backgroundColor: getOrgRoleColor(selectedMember.role, 1, roles) }}
                                        />
                                        {getRoleDisplayName(selectedMember.role)}
                                    </div>
                                </div>
                            </div>
                            
                            <div className="role-selection">
                                <h4>Select Roles</h4>
                                <div className="role-options">
                                    {getAssignableRoles().map(role => {
                                        const isCurrentRole = selectedMember.role === role.name;
                                        const isChecked = selectedRoleNames.includes(role.name);
                                        const isOwnerRole = role.name === 'owner';
                                        const isDisabled = isOwnerRole;
                                        
                                        return (
                                            <button
                                                key={role.name}
                                                className={`role-option ${isCurrentRole ? 'current' : ''} ${isDisabled ? 'disabled' : ''} ${isChecked ? 'selected' : ''}`}
                                                onClick={() => {
                                                    if (isOwnerRole) {
                                                        notifyOwnerTransferRequired();
                                                        return;
                                                    }
                                                    setSelectedRoleNames((prev) => {
                                                        if (prev.includes(role.name)) {
                                                            const removed = prev.filter((r) => r !== role.name);
                                                            return removed.length > 0 ? removed : ['member'];
                                                        }
                                                        return [...prev, role.name];
                                                    });
                                                }}
                                                aria-disabled={isDisabled}
                                            >
                                                <div className="role-option-content">
                                                    <div 
                                                        className="role-color-indicator"
                                                        style={{ backgroundColor: getOrgRoleColor(role, 1, roles) }}
                                                    />
                                                    <div className="role-info">
                                                        <h5>{role.displayName || role.name}</h5>
                                                        <p>
                                                            {role.permissions && role.permissions.length > 0 
                                                                ? role.permissions.slice(0, 3).join(', ') + (role.permissions.length > 3 ? '...' : '')
                                                                : 'No specific permissions'}
                                                        </p>
                                                    </div>
                                                </div>
                                                {isChecked && (
                                                    <Icon icon="mdi:check-circle" className="current-indicator" />
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                                <button
                                    className="assign-role-btn-primary"
                                    onClick={() => {
                                        if (selectedRoleNames.includes('owner')) {
                                            notifyOwnerTransferRequired();
                                            return;
                                        }
                                        handleRoleAssignment(selectedMember.user_id._id, selectedRoleNames);
                                    }}
                                    disabled={selectedRoleNames.length === 0}
                                >
                                    Save Role Assignment
                                </button>
                            </div>
                        </>
                    )}
                </Modal>
            </div>
        </div>
    );
}

export default Members;


