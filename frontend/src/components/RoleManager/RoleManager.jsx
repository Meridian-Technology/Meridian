import React, { useState, useEffect } from 'react';
import './RoleManager.scss';
import { Icon } from '@iconify-icon/react';
import { getOrgRoleColor } from '../../utils/orgUtils';


const RoleManager = ({ roles, onRolesChange, isEditable = true, roleHighlight = false }) => {
    const [customRoles, setCustomRoles] = useState(roles || []);
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingRole, setEditingRole] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        displayName: '',
        permissions: [],
        canManageMembers: false,
        canManageRoles: false,
        canManageEvents: false,
        canViewAnalytics: false
    });

    // Available permissions for selection
    const availablePermissions = [
        { key: 'view_events', label: 'View Events', description: 'Can view organization events' },
        { key: 'manage_events', label: 'Manage Events', description: 'Can create, edit, and delete events' },
        { key: 'manage_members', label: 'Manage Members', description: 'Can add, remove, and change member roles' },
        { key: 'manage_roles', label: 'Manage Roles', description: 'Can add, remove, and change role permissions' },
        { key: 'view_analytics', label: 'View Analytics', description: 'Can view organization analytics' },
        { key: 'manage_content', label: 'Manage Content', description: 'Can edit organization description and images' },
        { key: 'send_announcements', label: 'Send Announcements', description: 'Can send organization-wide messages' },
        { key: 'view_finances', label: 'View Finances', description: 'Can view financial information' },
        { key: 'manage_finances', label: 'Manage Finances', description: 'Can manage financial transactions' }
    ];

    // Update local state when roles prop changes (but don't trigger onRolesChange)
    useEffect(() => {
        setCustomRoles(roles || []);
    }, [roles]);

    const resetForm = () => {
        setFormData({
            name: '',
            displayName: '',
            permissions: [],
            canManageMembers: false,
            canManageRoles: false,
            canManageEvents: false,
            canViewAnalytics: false
        });
        setEditingRole(null);
        setShowAddForm(false);
    };

    const handlePermissionToggle = (permissionKey) => {
        setFormData(prev => ({
            ...prev,
            permissions: prev.permissions.includes(permissionKey)
                ? prev.permissions.filter(p => p !== permissionKey)
                : [...prev.permissions, permissionKey]
        }));
    };

    const handleCheckboxChange = (field) => {
        setFormData(prev => ({
            ...prev,
            [field]: !prev[field]
        }));
    };

    const validateForm = () => {
        if (!formData.name.trim() || !formData.displayName.trim()) {
            return false;
        }
        
        // Check if role name already exists (excluding the one being edited)
        const existingRole = customRoles.find(role => 
            role.name === formData.name && 
            (!editingRole || editingRole.name !== formData.name)
        );
        
        return !existingRole;
    };

    const handleSubmit = () => {
        if (!validateForm()) {
            return;
        }

        const newRole = {
            ...formData,
            name: formData.name.toLowerCase().replace(/\s+/g, '_'),
            displayName: formData.displayName.trim(),
            isDefault: false,
            order: customRoles.length
        };

        if (editingRole) {
            // Update existing role
            const updatedRoles = customRoles.map(role => 
                role.name === editingRole.name ? newRole : role
            );
            setCustomRoles(updatedRoles);
            onRolesChange(updatedRoles);
        } else {
            // Add new role
            const updatedRoles = [...customRoles, newRole];
            setCustomRoles(updatedRoles);
            onRolesChange(updatedRoles);
        }

        resetForm();
    };

    const handleEdit = (role) => {
        setEditingRole(role);
        setFormData({
            name: role.name,
            displayName: role.displayName,
            permissions: role.permissions || [],
            canManageMembers: role.canManageMembers || false,
            canManageRoles: role.canManageRoles || false,
            canManageEvents: role.canManageEvents || false,
            canViewAnalytics: role.canViewAnalytics || false
        });
        setShowAddForm(true);
    };

    const handleDelete = (roleName) => {
        if (roleName === 'owner' || roleName === 'member') {
            return; // Cannot delete default roles
        }
        const updatedRoles = customRoles.filter(role => role.name !== roleName);
        setCustomRoles(updatedRoles);
        onRolesChange(updatedRoles);
    };

    const getPermissionLabel = (permissionKey) => {
        const permission = availablePermissions.find(p => p.key === permissionKey);
        return permission ? permission.label : permissionKey;
    };

    return (
        <div className="role-manager">
            {/* <div className="role-manager-header">
                <h3>Organization Roles</h3>
                <p>Define custom roles and their permissions for your organization</p>
            </div> */}

            {/* default roles, need to make this dynamic at some point */}
            <div className="default-roles">
                <div className="default-roles-header">
                    <h4>Default Roles</h4>
                    <p>These roles are automatically created when you create your organization</p>
                </div>
                <div className="roles-grid">
                    <div className="role-card default">
                        <div className="role-header">
                            <h5>Owner</h5>
                            <span className="role-badge owner" style={{ backgroundColor: getOrgRoleColor('owner', 0.1), color: getOrgRoleColor('owner', 1) }}>Owner</span>
                        </div>
                        <p>Full access to all organization features</p>
                        <div className="permissions">
                            <span className="permission">All Permissions</span>
                        </div>
                    </div>

                    <div className="role-card default">
                        <div className="role-header">
                            <h5>Administrator</h5>
                            <span className="role-badge admin" style={{ backgroundColor: getOrgRoleColor('admin', 0.1), color: getOrgRoleColor('admin', 1) }}>Admin</span>
                        </div>
                        <p>Can manage members, events, and view analytics</p>
                        <div className="permissions">
                            <span className="permission">Manage Members</span>
                            <span className="permission">Manage Events</span>
                            <span className="permission">View Analytics</span>
                        </div>
                    </div>

                    <div className="role-card default">
                        <div className="role-header">
                            <h5>Officer</h5>
                            <span className="role-badge officer" style={{ backgroundColor: getOrgRoleColor('officer', 0.1), color: getOrgRoleColor('officer', 1) }}>Officer</span>
                        </div>
                        <p>Can manage events and view organization content</p>
                        <div className="permissions">
                            <span className="permission">Manage Events</span>
                            <span className="permission">View Events</span>
                        </div>
                    </div>

                    <div className="role-card default">
                        <div className="role-header">
                            <h5>Member</h5>
                            <span className="role-badge member" style={{ backgroundColor: getOrgRoleColor('member', 0.1), color: getOrgRoleColor('member', 1) }}>Member</span>
                        </div>
                        <p>Basic access to view organization events</p>
                        <div className="permissions">
                            <span className="permission">View Events</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Custom Roles */}
            <div className="custom-roles">
                <div className="custom-roles-header">
                    <div className="custom-roles-header-text">
                        <h4>Custom Roles</h4>
                        <p>Create custom roles for your organization</p>
                    </div>
                    {isEditable && (
                        <button 
                            className="add-role-btn"
                            onClick={() => setShowAddForm(true)}
                            disabled={showAddForm}
                        >
                            <Icon icon="mdi:plus" />
                            Add Custom Role
                        </button>
                    )}
                </div>

                {customRoles.filter(role => !['owner', 'admin', 'officer', 'member'].includes(role.name)).length === 0 ? (
                    <div className="no-custom-roles">
                        <Icon icon="mdi:account-group-outline" />
                        <p>No custom roles created yet</p>
                        {isEditable && (
                            <button 
                                className="add-first-role-btn"
                                onClick={() => setShowAddForm(true)}
                            >
                                Create Your First Custom Role
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="roles-grid">
                        {customRoles
                            .filter(role => !['owner', 'admin', 'officer', 'member'].includes(role.name))
                            .map((role, index) => (
                                <div key={role.name} className="role-card custom">
                                    <div className="role-header">
                                        <h5>{role.displayName}</h5>
                                        <span className="role-badge custom">Custom</span>
                                    </div>
                                    <p>{role.name}</p>
                                    <div className="permissions">
                                        {role.permissions.length > 0 ? (
                                            role.permissions.map(permission => (
                                                <span key={permission} className="permission">
                                                    {getPermissionLabel(permission)}
                                                </span>
                                            ))
                                        ) : (
                                            <span className="no-permissions">No special permissions</span>
                                        )}
                                    </div>
                                    {isEditable && (
                                        <div className="role-actions">
                                            <button 
                                                className="edit-btn"
                                                onClick={() => handleEdit(role)}
                                            >
                                                <Icon icon="mdi:pencil" />
                                            </button>
                                            <button 
                                                className="delete-btn"
                                                onClick={() => handleDelete(role.name)}
                                            >
                                                <Icon icon="mdi:delete" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                    </div>
                )}
            </div>

            {/* Add/Edit Role Form */}
            {showAddForm && (
                <div className="role-form-overlay">
                    <div className="role-form">
                        <div className="form-header">
                            <h4>{editingRole ? 'Edit Role' : 'Create Custom Role'}</h4>
                            <button className="close-btn" onClick={resetForm}>
                                <Icon icon="mdi:close" />
                            </button>
                        </div>

                        <div className="form-content">
                            <div className="form-group">
                                <label htmlFor="roleName">Role Name *</label>
                                <input
                                    type="text"
                                    id="roleName"
                                    value={formData.name}
                                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="e.g., treasurer, secretary"
                                    disabled={editingRole && editingRole.name === 'owner'}
                                />
                                <small>This will be used internally (lowercase, no spaces)</small>
                            </div>

                            <div className="form-group">
                                <label htmlFor="displayName">Display Name *</label>
                                <input
                                    type="text"
                                    id="displayName"
                                    value={formData.displayName}
                                    onChange={(e) => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
                                    placeholder="e.g., Treasurer, Secretary"
                                />
                                <small>This is what users will see</small>
                            </div>

                            <div className="form-group">
                                <label>Permissions</label>
                                <div className="permissions-grid">
                                    {availablePermissions.map(permission => (
                                        <label key={permission.key} className="permission-checkbox">
                                            <input
                                                type="checkbox"
                                                checked={formData.permissions.includes(permission.key)}
                                                onChange={() => handlePermissionToggle(permission.key)}
                                            />
                                            <div className="permission-info">
                                                <span className="permission-label">{permission.label}</span>
                                                <span className="permission-description">{permission.description}</span>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Quick Settings</label>
                                <div className="quick-settings">
                                    <label className="setting-checkbox">
                                        <input
                                            type="checkbox"
                                            checked={formData.canManageMembers}
                                            onChange={() => handleCheckboxChange('canManageMembers')}
                                        />
                                        <span>Can manage members</span>
                                    </label>
                                    <label className="setting-checkbox">
                                        <input
                                            type="checkbox"
                                            checked={formData.canManageRoles}
                                            onChange={() => handleCheckboxChange('canManageRoles')}
                                        />
                                        <span>Can manage roles</span>
                                    </label>
                                    <label className="setting-checkbox">
                                        <input
                                            type="checkbox"
                                            checked={formData.canManageEvents}
                                            onChange={() => handleCheckboxChange('canManageEvents')}
                                        />
                                        <span>Can manage events</span>
                                    </label>
                                    <label className="setting-checkbox">
                                        <input
                                            type="checkbox"
                                            checked={formData.canViewAnalytics}
                                            onChange={() => handleCheckboxChange('canViewAnalytics')}
                                        />
                                        <span>Can view analytics</span>
                                    </label>
                                </div>
                            </div>
                        </div>

                        <div className="form-actions">
                            <button className="cancel-btn" onClick={resetForm}>
                                Cancel
                            </button>
                            <button 
                                className="save-btn"
                                onClick={handleSubmit}
                                disabled={!validateForm()}
                            >
                                {editingRole ? 'Update Role' : 'Create Role'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RoleManager; 