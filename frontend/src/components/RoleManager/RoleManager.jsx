import React, { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import './RoleManager.scss';
import { Icon } from '@iconify-icon/react';
import { getOrgRoleColor } from '../../utils/orgUtils';
import DraggableList from '../DraggableList/DraggableList';

const RoleManager = forwardRef(({ roles, onRolesChange, onDeleteRequest, isEditable = true, roleHighlight = false, saveImmediately = false, onDraftChange }, ref) => {
    const [customRoles, setCustomRoles] = useState(roles || []);
    const [selectedRole, setSelectedRole] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        permissions: [],
        color: '#a855f7',
        useCustomColor: false
    });

    // Plaeholder role color pallete, needs to be updated.
    const colorPalette = [
        '#dc2626', // Red (owner)
        '#3b82f6', // Blue (admin)
        '#10b981', // Green (officer)
        '#6b7280', // Gray (member)
        '#a855f7', // Purple
        '#f59e0b', // Orange
        '#ef4444', // Red variant
        '#06b6d4', // Cyan
        '#8b5cf6', // Violet
        '#ec4899', // Pink
        '#14b8a6', // Teal
        '#f97316'  // Orange variant
    ];

    // Available permissions for selection
    // Note: as we scale this likely needs to be more dynamic
    const availablePermissions = [
        { key: 'view_events', label: 'View Events', description: 'Can view organization events' },
        { key: 'manage_events', label: 'Manage Events', description: 'Can create, edit, and delete events' },
        { key: 'manage_members', label: 'Manage Members', description: 'Can add, remove, and change member roles' },
        { key: 'manage_roles', label: 'Manage Roles', description: 'Can add, remove, and change role permissions' },
        { key: 'manage_equipment', label: 'Manage Equipment', description: 'Can assign and check out equipment' },
        { key: 'modify_equipment', label: 'Modify Equipment', description: 'Can create and edit equipment inventory' },
        { key: 'view_analytics', label: 'View Analytics', description: 'Can view organization analytics' },
        { key: 'manage_content', label: 'Manage Content', description: 'Can edit organization description and images' },
        { key: 'send_announcements', label: 'Send Announcements', description: 'Can send organization-wide messages' },
        { key: 'view_finances', label: 'View Finances', description: 'Can view financial information', comingSoon: true },
        { key: 'manage_finances', label: 'Manage Finances', description: 'Can manage financial transactions', comingSoon: true }
    ];

    // Update local state when roles prop changes
    useEffect(() => {
        setCustomRoles(roles || []);
        // If selected role still exists, update it
        if (selectedRole) {
            const updatedRole = roles?.find(r => r.name === selectedRole.name);
            if (updatedRole) {
                setSelectedRole(updatedRole);
            } else {
                setSelectedRole(null);
                resetForm();
            }
        }
    }, [roles]);

    useEffect(() => {
        if (!onDraftChange) return;
        if (selectedRole?.isNew) {
            onDraftChange(true);
        } else {
            onDraftChange(false);
        }
    }, [selectedRole, onDraftChange]);

    // Auto-select first editable role if none selected
    useEffect(() => {
        if (!selectedRole && customRoles.length > 0) {
            const editableRoles = customRoles.filter(r => r.name !== 'owner');
            if (editableRoles.length > 0) {
                const firstRole = editableRoles[0];
                setSelectedRole(firstRole);
                const permissions = firstRole.permissions || [];
                const booleanFields = syncBooleanFieldsFromPermissions(permissions);
                const displayName = firstRole.displayName || firstRole.name;
                setFormData({
                    name: displayName,
                    permissions: permissions,
                    ...booleanFields,
                    color: firstRole.color || '#a855f7',
                    useCustomColor: !colorPalette.includes(firstRole.color)
                });
            }
        }
    }, [customRoles]);

    const resetForm = () => {
        setFormData({
            name: '',
            permissions: [],
            color: '#a855f7',
            useCustomColor: false
        });
    };

    const handlePermissionToggle = (permissionKey) => {
        // Prevent toggling "coming soon" permissions
        const permission = availablePermissions.find(p => p.key === permissionKey);
        if (permission?.comingSoon) {
            return;
        }

        setFormData(prev => {
            const newPermissions = prev.permissions.includes(permissionKey)
                ? prev.permissions.filter(p => p !== permissionKey)
                : [...prev.permissions, permissionKey];
            
            // Auto-sync boolean fields
            const booleanFields = syncBooleanFieldsFromPermissions(newPermissions);
            
            return {
                ...prev,
                permissions: newPermissions,
                ...booleanFields
            };
        });
    };

    // Auto-sync boolean fields based on permissions
    const syncBooleanFieldsFromPermissions = (permissions) => {
        return {
            canManageMembers: permissions.includes('manage_members'),
            canManageRoles: permissions.includes('manage_roles'),
            canManageEvents: permissions.includes('manage_events'),
            canViewAnalytics: permissions.includes('view_analytics')
        };
    };

    const handleColorSelect = (color) => {
        setFormData(prev => ({
            ...prev,
            color: color,
            useCustomColor: false
        }));
    };

    const handleCustomColorFocus = () => {
        // When user clicks/focuses custom color input, enable custom color mode
        // If there's already a custom color, show it; otherwise start empty so they can type fresh
        setFormData(prev => ({
            ...prev,
            useCustomColor: true,
            // Only preserve color if it was already a custom color, otherwise start fresh
            color: prev.useCustomColor ? (prev.color || '') : ''
        }));
    };

    const handleCustomColorChange = (hex) => {
        // Allow typing partial hex codes while user is typing
        // Valid formats: empty, #, #a, #ab, #abc, #abcd, #abcde, #abcdef (3 or 6 digits)
        // Also allow without # prefix: a, ab, abc, etc. (we'll add # when needed)
        const partialHexPattern = /^#?[A-Fa-f0-9]{0,6}$/;
        
        // Allow empty string
        if (hex === '') {
            setFormData(prev => ({
                ...prev,
                color: '',
                useCustomColor: true
            }));
            return;
        }
        
        // Check if input matches partial hex pattern (with or without #)
        if (partialHexPattern.test(hex)) {
            // If it starts with a hex digit but no #, add the # prefix
            let processedHex = hex;
            if (/^[A-Fa-f0-9]/.test(hex) && !hex.startsWith('#')) {
                processedHex = '#' + hex;
            }
            
            setFormData(prev => ({
                ...prev,
                color: processedHex,
                useCustomColor: true
            }));
        }
    };

    const handleReorder = (newOrderedRoles) => {
        // Filter out owner and member from the reordered list to maintain their positions
        const ownerRole = customRoles.find(r => r.name === 'owner');
        const memberRole = customRoles.find(r => r.name === 'member');
        
        // Reconstruct the full roles array with owner first, reordered roles in middle, member last
        const updatedRoles = [];
        if (ownerRole) updatedRoles.push(ownerRole);
        
        // Add reordered roles (which should not include owner or member)
        newOrderedRoles.forEach((role) => {
            if (role.name !== 'owner' && role.name !== 'member') {
                updatedRoles.push(role);
            }
        });
        
        if (memberRole) updatedRoles.push(memberRole);

        // Update order values (excluding owner and member from ordering)
        let orderCounter = 0;
        updatedRoles.forEach((role) => {
            if (role.name !== 'owner' && role.name !== 'member') {
                role.order = orderCounter++;
            }
        });

        setCustomRoles(updatedRoles);
        onRolesChange(updatedRoles);
    };

    // Auto-save changes to local state when form data changes
    useEffect(() => {
        if (!selectedRole || selectedRole.isNew) return;

        // Don't auto-save name changes for owner or member (they must keep their names)
        const isProtectedRole = selectedRole.name === 'owner' || selectedRole.name === 'member';

        // Debounce auto-save
        const timeoutId = setTimeout(() => {
            // Filter out coming soon permissions before saving
            const filteredPermissions = formData.permissions.filter(p => {
                const permission = availablePermissions.find(ap => ap.key === p);
                return !permission?.comingSoon;
            });

            const booleanFields = syncBooleanFieldsFromPermissions(filteredPermissions);
            
            let roleName = selectedRole.name;
            let displayName = selectedRole.displayName || selectedRole.name;

            // Only update name if not a protected role
            if (!isProtectedRole) {
                const trimmedName = formData.name.trim();
                if (trimmedName) {
                    roleName = trimmedName.toLowerCase().replace(/\s+/g, '_');
                    displayName = trimmedName;

                    // Check if new name conflicts with existing role
                    const existingRole = customRoles.find(role => 
                        role.name === roleName && 
                        role.name !== selectedRole.name
                    );

                    if (existingRole) {
                        return; // Don't update if name conflicts
                    }
                } else {
                    return; // Don't update if name is empty
                }
            }

            const updatedRole = {
                ...selectedRole,
                name: roleName,
                displayName: displayName,
                permissions: filteredPermissions,
                ...booleanFields,
                color: formData.color || '#a855f7'
            };

            const updatedRoles = customRoles.map(role => 
                role.name === selectedRole.name ? updatedRole : role
            );
            setCustomRoles(updatedRoles);
            onRolesChange(updatedRoles);
            setSelectedRole(updatedRole);
        }, 500);

        return () => clearTimeout(timeoutId);
    }, [formData.name, formData.permissions, formData.color]);

    const createDraftRole = () => {
        const roleName = formData.name.trim().toLowerCase().replace(/\s+/g, '_');
        const displayName = formData.name.trim();

        if (!roleName || !displayName) {
            return { success: false, reason: 'empty' };
        }

        // Check if role name already exists
        const existingRole = customRoles.find(role => role.name === roleName);
        if (existingRole) {
            return { success: false, reason: 'duplicate' };
        }

        // Filter out coming soon permissions before creating role
        const filteredPermissions = formData.permissions.filter(p => {
            const permission = availablePermissions.find(ap => ap.key === p);
            return !permission?.comingSoon;
        });

        // Auto-sync boolean fields from permissions
        const booleanFields = syncBooleanFieldsFromPermissions(filteredPermissions);

        // Calculate order (highest order + 1, excluding owner and member)
        const maxOrder = Math.max(
            ...customRoles
                .filter(r => r.name !== 'owner' && r.name !== 'member')
                .map(r => r.order || 0),
            -1
        );

        const newRole = {
            name: roleName,
            displayName: displayName,
            permissions: filteredPermissions,
            ...booleanFields,
            isDefault: false,
            color: formData.color || '#a855f7',
            order: maxOrder + 1
        };

        const updatedRoles = [...customRoles, newRole];
        setCustomRoles(updatedRoles);
        onRolesChange(updatedRoles);
        setSelectedRole(newRole);
        resetForm();
        return { success: true, roles: updatedRoles };
    };

    const handleCreateRole = () => {
        createDraftRole();
    };

    useImperativeHandle(ref, () => ({
        createDraftRole
    }));

    const handleRoleSelect = (role) => {
        setSelectedRole(role);
        const permissions = role.permissions || [];
        const booleanFields = syncBooleanFieldsFromPermissions(permissions);
        // Use displayName if available, otherwise use name
        const displayName = role.displayName || role.name;
        setFormData({
            name: displayName,
            permissions: permissions,
            ...booleanFields,
            color: role.color || '#a855f7',
            useCustomColor: !colorPalette.includes(role.color)
        });
    };

    const handleNewRole = () => {
        resetForm();
        // Create a temporary role object for the form
        setSelectedRole({ name: '', permissions: [], color: '#a855f7', isNew: true });
    };

    const handleDelete = (roleName) => {
        if (roleName === 'owner' || roleName === 'member') {
            return; // Cannot delete owner or member roles
        }
        
        if (onDeleteRequest) {
            // Use callback for delete confirmation
            onDeleteRequest(roleName);
        } else {
            // Fallback to immediate delete if no callback provided
        const updatedRoles = customRoles.filter(role => role.name !== roleName);
            // Reorder remaining roles (excluding owner and member)
            let orderCounter = 0;
            updatedRoles.forEach((role) => {
                if (role.name !== 'owner' && role.name !== 'member') {
                    role.order = orderCounter++;
                }
            });
        setCustomRoles(updatedRoles);
        onRolesChange(updatedRoles);
            if (selectedRole?.name === roleName) {
                setSelectedRole(null);
                resetForm();
            }
        }
    };

    const getPermissionLabel = (permissionKey) => {
        const permission = availablePermissions.find(p => p.key === permissionKey);
        return permission ? permission.label : permissionKey;
    };

    // Get all roles except owner, sorted by order (member always last)
    const editableRoles = customRoles
        .filter(role => role.name !== 'owner')
        .sort((a, b) => {
            // Member should always be last
            if (a.name === 'member') return 1;
            if (b.name === 'member') return -1;
            // Sort by order for all other roles
            return (a.order || 0) - (b.order || 0);
        });

    return (
        <div className="role-manager">
            <div className="role-manager-layout">
                {/* Left Column: Role List */}
                <div className="role-list-column">
                    <div className="role-list-header">
                        {isEditable && (
                            <button 
                                className="add-role-btn"
                                onClick={handleNewRole}
                            >
                                <Icon icon="mdi:plus" />
                                Add Role
                            </button>
                        )}
                    </div>
                    <div className="role-list">
                        {editableRoles.length === 0 ? (
                            <div className="no-roles">
                                <Icon icon="mdi:account-group-outline" />
                                <p>No roles yet</p>
                            </div>
                        ) : (
                            <>
                                <DraggableList
                                    items={editableRoles.filter(role => role.name !== 'member')}
                                    onReorder={handleReorder}
                                    getItemId={(role) => role.name}
                                    disabled={!isEditable}
                                    renderItem={(role, index) => {
                                        const isSelected = selectedRole?.name === role.name;
                                        
                                        return (
                                            <div 
                                                className={`role-list-item ${isSelected ? 'selected' : ''}`}
                                                onClick={() => handleRoleSelect(role)}
                                            >
                                                {isEditable && (
                                                    <div className="drag-handle" onClick={(e) => e.stopPropagation()}>
                                                        <Icon icon="mdi:drag" />
                                                    </div>
                                                )}
                                                <div className="role-list-item-content">
                                                    <div 
                                                        className="role-color-indicator"
                                                        style={{ backgroundColor: getOrgRoleColor(role, 1, customRoles) }}
                                                    />
                                                    <div className="role-list-item-info">
                                                        <span className="role-list-item-name">{role.displayName || role.name}</span>
                                                    </div>
                                                </div>
                                                {isEditable && (
                                                    <div className="role-list-item-actions" onClick={(e) => e.stopPropagation()}>
                                                        <button 
                                                            className="delete-btn"
                                                            onClick={() => handleDelete(role.name)}
                                                            title="Delete role"
                                                        >
                                                            <Icon icon="mdi:delete" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    }}
                                />
                                {/* Always render member role separately at the bottom (non-draggable) */}
                                {(() => {
                                    const memberRole = editableRoles.find(role => role.name === 'member');
                                    return memberRole ? (
                                        <div 
                                            className={`role-list-item ${selectedRole?.name === 'member' ? 'selected' : ''}`}
                                            onClick={() => handleRoleSelect(memberRole)}
                                        >
                                            <div className="role-list-item-content">
                                                <div 
                                                    className="role-color-indicator"
                                                    style={{ backgroundColor: getOrgRoleColor(memberRole, 1, customRoles) }}
                                                />
                                                <div className="role-list-item-info">
                                                    <span className="role-list-item-name">
                                                        {memberRole.displayName || 'member'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ) : null;
                                })()}
                            </>
                        )}
                    </div>
            </div>

                {/* Right Column: Role Editor */}
                <div className="role-editor-column">
                    {selectedRole ? (
                        <div className="role-editor">
                            <div className="role-editor-header">
                                <h3>{selectedRole.isNew ? 'Create New Role' : `Edit Role — ${selectedRole.displayName || selectedRole.name}`}</h3>
                        </div>

                            <div className="role-editor-content">
                            <div className="form-group">
                                <label htmlFor="roleName">Role Name *</label>
                                <input
                                    type="text"
                                    id="roleName"
                                    className="text-input"
                                    value={formData.name}
                                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="e.g., Treasurer, Secretary"
                                    disabled={selectedRole && selectedRole.name === 'owner'}
                                />
                                <small>This is what users will see. The internal name will be automatically generated.</small>
                            </div>

                            <div className="form-group">
                                    <label>Role Color</label>
                                    <div className="color-picker">
                                        <div className="color-palette">
                                            {colorPalette.map((color) => (
                                                <button
                                                    key={color}
                                                    type="button"
                                                    className={`color-swatch ${formData.color === color && !formData.useCustomColor ? 'selected' : ''}`}
                                                    style={{ backgroundColor: color }}
                                                    onClick={() => handleColorSelect(color)}
                                                    title={color}
                                                />
                                            ))}
                                        </div>
                                        <div className="custom-color-input">
                                            <label htmlFor="customColor">Custom Color (Hex)</label>
                                            <div className="color-input-wrapper">
                                <input
                                    type="text"
                                    id="customColor"
                                    className="text-input"
                                    value={formData.useCustomColor ? (formData.color || '') : ''}
                                    onChange={(e) => handleCustomColorChange(e.target.value)}
                                    onFocus={handleCustomColorFocus}
                                    placeholder="#a855f7"
                                    maxLength={7}
                                />
                                                {formData.useCustomColor && formData.color && (
                                                    <div 
                                                        className="color-preview" 
                                                        style={{ backgroundColor: formData.color }}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                            </div>

                            <div className="form-group">
                                <label>Permissions</label>
                                <div className="permissions-grid">
                                    {availablePermissions.map(permission => {
                                        const isSelected = formData.permissions.includes(permission.key);
                                        const isComingSoon = permission.comingSoon;
                                        
                                        return (
                                            <div
                                                key={permission.key}
                                                className={`permission-item ${isSelected ? 'selected' : ''} ${isComingSoon ? 'coming-soon' : ''}`}
                                                onClick={() => !isComingSoon && handlePermissionToggle(permission.key)}
                                                role="button"
                                                tabIndex={isComingSoon ? -1 : 0}
                                                onKeyDown={(e) => {
                                                    if (!isComingSoon && (e.key === 'Enter' || e.key === ' ')) {
                                                        e.preventDefault();
                                                        handlePermissionToggle(permission.key);
                                                    }
                                                }}
                                            >
                                                <div className="permission-info">
                                                    <div className="permission-header">
                                                        <span className="permission-label">{permission.label}</span>
                                                        {isComingSoon && (
                                                            <span className="coming-soon-badge">Coming Soon</span>
                                                        )}
                                                    </div>
                                                    <span className="permission-description">{permission.description}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            </div>

                            {selectedRole?.isNew && (
                                <div className="role-editor-create-action">
                                    <button 
                                        className="create-btn"
                                        onClick={handleCreateRole}
                                        disabled={!formData.name.trim()}
                                    >
                                        Create Role
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="no-role-selected">
                            <Icon icon="mdi:account-group-outline" />
                            <h3>Select a role to edit</h3>
                            <p>Choose a role from the list on the left to view and edit its permissions</p>
                            {isEditable && (
                                <button className="add-first-role-btn" onClick={handleNewRole}>
                                    Create Your First Role
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

export default RoleManager; 
