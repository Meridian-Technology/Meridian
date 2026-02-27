import React, { useState, useEffect, useCallback } from 'react';
import apiRequest from '../../../utils/postRequest';
import { useNotification } from '../../../NotificationContext';
import defaultAvatar from '../../../assets/defaultAvatar.svg';
import './ManageUsers.scss';

const AVAILABLE_ROLES = ['user', 'admin', 'moderator', 'developer', 'oie', 'beta'];

function ManageUsers() {
    const { addNotification } = useNotification();
    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isUpdatingRole, setIsUpdatingRole] = useState(false);

    const fetchUsers = useCallback(async () => {
        if (!searchQuery.trim()) {
            setUsers([]);
            return;
        }
        setIsLoading(true);
        try {
            const params = {
                query: searchQuery,
                limit: 30,
                sortBy: 'username',
                sortOrder: 'asc',
            };
            if (roleFilter) {
                params.roles = JSON.stringify([roleFilter]);
            }
            const response = await apiRequest('/search-users', {}, {
                method: 'GET',
                params,
            });
            if (response.success && response.data) {
                setUsers(response.data);
                setSelectedUser(prev => prev && !response.data.find(u => u._id === prev._id) ? null : prev);
            } else {
                setUsers([]);
            }
        } catch (err) {
            console.error('Failed to fetch users:', err);
            setUsers([]);
            addNotification({ title: 'Search failed', message: 'Could not load users', type: 'error' });
        } finally {
            setIsLoading(false);
        }
    }, [searchQuery, roleFilter]);

    useEffect(() => {
        const timer = setTimeout(fetchUsers, 400);
        return () => clearTimeout(timer);
    }, [fetchUsers]);

    const toggleRole = async (user, role) => {
        if (!user || isUpdatingRole) return;
        setIsUpdatingRole(true);
        try {
            const result = await apiRequest('/manage-roles', { role, userId: user._id });
            if (result.error) {
                addNotification({ title: 'Role update failed', message: result.error, type: 'error' });
            } else {
                const hasRole = user.roles?.includes(role);
                const updatedRoles = hasRole
                    ? (user.roles || []).filter(r => r !== role)
                    : [...(user.roles || []), role];
                setSelectedUser(prev => prev?._id === user._id ? { ...prev, roles: updatedRoles } : prev);
                setUsers(prev => prev.map(u => u._id === user._id ? { ...u, roles: updatedRoles } : u));
                addNotification({
                    title: 'Role updated',
                    type: 'success',
                    message: hasRole ? `Removed ${role} from @${user.username}` : `Added ${role} to @${user.username}`,
                });
            }
        } catch (err) {
            addNotification({ title: 'Role update failed', message: 'Something went wrong', type: 'error' });
        } finally {
            setIsUpdatingRole(false);
        }
    };

    const formatDate = (date) => {
        if (!date) return '—';
        const d = new Date(date);
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    };

    return (
        <div className="manage-users-panel">
            <header className="manage-users-header">
                <h2>User Management</h2>
                <p className="subtitle">Search users and manage roles</p>
            </header>

            <div className="manage-users-toolbar">
                <div className="search-wrapper">
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Search by name, username or email..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoFocus
                    />
                </div>
                <div className="filter-row">
                    <label>Filter by role:</label>
                    <select
                        value={roleFilter}
                        onChange={(e) => setRoleFilter(e.target.value)}
                        className="role-filter-select"
                    >
                        <option value="">All roles</option>
                        {AVAILABLE_ROLES.map(role => (
                            <option key={role} value={role}>{role}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="manage-users-content">
                <div className="users-list-section">
                    <div className="users-list-header">
                        <span>Results</span>
                        {users.length > 0 && (
                            <span className="count">{users.length} user{users.length !== 1 ? 's' : ''}</span>
                        )}
                    </div>
                    <div className="users-list">
                        {isLoading ? (
                            <div className="loading-state">Searching...</div>
                        ) : !searchQuery.trim() ? (
                            <div className="empty-state">
                                <p>Type in the search bar to find users</p>
                            </div>
                        ) : users.length === 0 ? (
                            <div className="empty-state">
                                <p>No users found</p>
                            </div>
                        ) : (
                            users.map(user => (
                                <div
                                    key={user._id}
                                    className={`user-row ${selectedUser?._id === user._id ? 'selected' : ''}`}
                                    onClick={() => setSelectedUser(user)}
                                >
                                    <img
                                        src={user.picture || defaultAvatar}
                                        alt=""
                                        className="user-row-avatar"
                                    />
                                    <div className="user-row-info">
                                        <span className="user-row-name">{user.name || 'No name'}</span>
                                        <span className="user-row-username">@{user.username || user.email}</span>
                                        {user.email && <span className="user-row-email">{user.email}</span>}
                                    </div>
                                    <div className="user-row-roles">
                                        {(user.roles || []).slice(0, 2).map(role => (
                                            <span key={role} className="role-badge small active">
                                                {role}
                                            </span>
                                        ))}
                                        {(user.roles || []).length > 2 && (
                                            <span className="role-badge more">+{(user.roles || []).length - 2}</span>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className={`user-detail-section ${selectedUser ? 'has-selection' : ''}`}>
                    {selectedUser ? (
                        <div className="user-detail-card">
                            <div className="user-detail-header">
                                <img
                                    src={selectedUser.picture || defaultAvatar}
                                    alt=""
                                    className="user-detail-avatar"
                                />
                                <div className="user-detail-identity">
                                    <h3>{selectedUser.name || 'No name'}</h3>
                                    <p className="username">@{selectedUser.username || selectedUser.email}</p>
                                    {selectedUser.email && selectedUser.email !== selectedUser.username && (
                                        <p className="email">{selectedUser.email}</p>
                                    )}
                                </div>
                            </div>

                            <div className="user-detail-meta">
                                <div className="meta-row">
                                    <span className="meta-label">Joined</span>
                                    <span className="meta-value">{formatDate(selectedUser.createdAt)}</span>
                                </div>
                                {selectedUser.tags?.length > 0 && (
                                    <div className="meta-row tags-row">
                                        <span className="meta-label">Tags</span>
                                        <div className="tags-list">
                                            {selectedUser.tags.map((tag, i) => (
                                                <span key={i} className="tag-badge">{tag}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="user-detail-roles">
                                <h4>Roles</h4>
                                <p className="roles-hint">Click a role to add or remove it</p>
                                <div className="roles-grid">
                                    {AVAILABLE_ROLES.map(role => {
                                        const hasRole = (selectedUser.roles || []).includes(role);
                                        return (
                                            <button
                                                key={role}
                                                type="button"
                                                className={`role-chip ${hasRole ? 'active' : ''}`}
                                                onClick={() => toggleRole(selectedUser, role)}
                                                disabled={isUpdatingRole}
                                            >
                                                {role}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {(selectedUser.approvalRoles || []).length > 0 && (
                                <div className="user-detail-approval-roles">
                                    <h4>Approval roles</h4>
                                    <div className="approval-roles-list">
                                        {selectedUser.approvalRoles.map((role, i) => (
                                            <span key={i} className="approval-badge">{role}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="no-selection">
                            <p>Select a user to view details and manage roles</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default ManageUsers;
