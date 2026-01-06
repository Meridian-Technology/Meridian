// Organization-level permissions
const ORG_PERMISSIONS = {
    // Core permissions
    ALL: 'all',                           // Super admin - all permissions
    VIEW_ROLES: 'view_roles',             // Can view organization roles
    MANAGE_ROLES: 'manage_roles',         // Can create, edit, delete roles
    MANAGE_MEMBERS: 'manage_members',     // Can add, remove, change member roles
    MANAGE_EVENTS: 'manage_events',       // Can create, edit, delete events
    VIEW_ANALYTICS: 'view_analytics',     // Can view organization analytics
    VIEW_EVENTS: 'view_events',           // Can view organization events
    
    // Content management
    MANAGE_CONTENT: 'manage_content',     // Can edit organization description, images
    MANAGE_SETTINGS: 'manage_settings',   // Can change organization settings
    
    // Communication
    SEND_ANNOUNCEMENTS: 'send_announcements', // Can send org-wide messages
    MANAGE_COMMUNICATIONS: 'manage_communications', // Can manage all communications
    
    // Financial (if applicable)
    VIEW_FINANCES: 'view_finances',       // Can view financial information
    MANAGE_FINANCES: 'manage_finances',   // Can manage financial transactions
    
    // Advanced features
    MANAGE_INTEGRATIONS: 'manage_integrations', // Can manage third-party integrations
    ACCESS_ADVANCED_FEATURES: 'access_advanced_features' // Can access beta/advanced features
};

// Event-specific permissions
const EVENT_PERMISSIONS = {
    CREATE_EVENTS: 'create_events',
    EDIT_EVENTS: 'edit_events',
    DELETE_EVENTS: 'delete_events',
    APPROVE_EVENTS: 'approve_events',
    VIEW_EVENT_ANALYTICS: 'view_event_analytics',
    MANAGE_EVENT_REGISTRATIONS: 'manage_event_registrations'
};

// User management permissions
const USER_PERMISSIONS = {
    INVITE_USERS: 'invite_users',
    REMOVE_USERS: 'remove_users',
    CHANGE_USER_ROLES: 'change_user_roles',
    VIEW_USER_PROFILES: 'view_user_profiles',
    MANAGE_USER_PERMISSIONS: 'manage_user_permissions'
};

// System-level permissions (for global admins)
const SYSTEM_PERMISSIONS = {
    MANAGE_ORGANIZATIONS: 'manage_organizations',
    MANAGE_SYSTEM_SETTINGS: 'manage_system_settings',
    VIEW_SYSTEM_ANALYTICS: 'view_system_analytics',
    MANAGE_GLOBAL_USERS: 'manage_global_users',
    ACCESS_ADMIN_PANEL: 'access_admin_panel'
};

// Permission groups for easier management
const PERMISSION_GROUPS = {
    BASIC_MEMBER: [
        ORG_PERMISSIONS.VIEW_EVENTS
    ],
    
    OFFICER: [
        ORG_PERMISSIONS.VIEW_EVENTS,
        ORG_PERMISSIONS.MANAGE_EVENTS,
        EVENT_PERMISSIONS.CREATE_EVENTS,
        EVENT_PERMISSIONS.EDIT_EVENTS
    ],
    
    ADMIN: [
        ORG_PERMISSIONS.VIEW_EVENTS,
        ORG_PERMISSIONS.MANAGE_EVENTS,
        ORG_PERMISSIONS.MANAGE_MEMBERS,
        ORG_PERMISSIONS.VIEW_ANALYTICS,
        ORG_PERMISSIONS.VIEW_ROLES,
        EVENT_PERMISSIONS.CREATE_EVENTS,
        EVENT_PERMISSIONS.EDIT_EVENTS,
        EVENT_PERMISSIONS.DELETE_EVENTS,
        USER_PERMISSIONS.INVITE_USERS,
        USER_PERMISSIONS.REMOVE_USERS,
        USER_PERMISSIONS.CHANGE_USER_ROLES
    ],
    
    OWNER: [
        ORG_PERMISSIONS.ALL
    ]
};

// Permission descriptions for UI
const PERMISSION_DESCRIPTIONS = {
    [ORG_PERMISSIONS.ALL]: 'Full access to all organization features',
    [ORG_PERMISSIONS.VIEW_ROLES]: 'Can view organization roles and permissions',
    [ORG_PERMISSIONS.MANAGE_ROLES]: 'Can create, edit, and delete organization roles',
    [ORG_PERMISSIONS.MANAGE_MEMBERS]: 'Can add, remove, and change member roles',
    [ORG_PERMISSIONS.MANAGE_EVENTS]: 'Can create, edit, and delete organization events',
    [ORG_PERMISSIONS.VIEW_ANALYTICS]: 'Can view organization analytics and reports',
    [ORG_PERMISSIONS.VIEW_EVENTS]: 'Can view organization events',
    [ORG_PERMISSIONS.MANAGE_CONTENT]: 'Can edit organization description and images',
    [ORG_PERMISSIONS.MANAGE_SETTINGS]: 'Can change organization settings',
    [ORG_PERMISSIONS.SEND_ANNOUNCEMENTS]: 'Can send organization-wide announcements',
    [ORG_PERMISSIONS.MANAGE_COMMUNICATIONS]: 'Can manage all organization communications',
    [ORG_PERMISSIONS.VIEW_FINANCES]: 'Can view financial information',
    [ORG_PERMISSIONS.MANAGE_FINANCES]: 'Can manage financial transactions',
    [ORG_PERMISSIONS.MANAGE_INTEGRATIONS]: 'Can manage third-party integrations',
    [ORG_PERMISSIONS.ACCESS_ADVANCED_FEATURES]: 'Can access beta and advanced features',
    
    [EVENT_PERMISSIONS.CREATE_EVENTS]: 'Can create new events',
    [EVENT_PERMISSIONS.EDIT_EVENTS]: 'Can edit existing events',
    [EVENT_PERMISSIONS.DELETE_EVENTS]: 'Can delete events',
    [EVENT_PERMISSIONS.APPROVE_EVENTS]: 'Can approve events for publication',
    [EVENT_PERMISSIONS.VIEW_EVENT_ANALYTICS]: 'Can view event-specific analytics',
    [EVENT_PERMISSIONS.MANAGE_EVENT_REGISTRATIONS]: 'Can manage event registrations',
    
    [USER_PERMISSIONS.INVITE_USERS]: 'Can invite new users to the organization',
    [USER_PERMISSIONS.REMOVE_USERS]: 'Can remove users from the organization',
    [USER_PERMISSIONS.CHANGE_USER_ROLES]: 'Can change user roles within the organization',
    [USER_PERMISSIONS.VIEW_USER_PROFILES]: 'Can view detailed user profiles',
    [USER_PERMISSIONS.MANAGE_USER_PERMISSIONS]: 'Can manage individual user permissions'
};

// Helper functions
const getAllPermissions = () => {
    return {
        ...ORG_PERMISSIONS,
        ...EVENT_PERMISSIONS,
        ...USER_PERMISSIONS,
        ...SYSTEM_PERMISSIONS
    };
};

const getPermissionDescription = (permission) => {
    return PERMISSION_DESCRIPTIONS[permission] || 'No description available';
};

const getPermissionsByGroup = (groupName) => {
    return PERMISSION_GROUPS[groupName] || [];
};

const validatePermission = (permission) => {
    const allPermissions = getAllPermissions();
    return Object.values(allPermissions).includes(permission);
};

module.exports = {
    ORG_PERMISSIONS,
    EVENT_PERMISSIONS,
    USER_PERMISSIONS,
    SYSTEM_PERMISSIONS,
    PERMISSION_GROUPS,
    PERMISSION_DESCRIPTIONS,
    getAllPermissions,
    getPermissionDescription,
    getPermissionsByGroup,
    validatePermission
}; 