const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const {
    ORG_PERMISSIONS,
    EVENT_PERMISSIONS,
    USER_PERMISSIONS
} = require('../constants/permissions');

const ROLE_PERMISSION_VALUES = Array.from(new Set([
    ...Object.values(ORG_PERMISSIONS),
    ...Object.values(EVENT_PERMISSIONS),
    ...Object.values(USER_PERMISSIONS)
]));

const OrgSchema= new Schema({
    org_name:{
        type:String,
        required: true
    },
    org_profile_image:{
        type: String,
        required: true
    },
    org_banner_image:{
        type: String,
        required: false
    },
    org_description:{
        type: String,
        required: true
    },
    positions: {
        type: [{
            _id: {
                type: Schema.Types.ObjectId,
                default: () => new mongoose.Types.ObjectId()
            },
            name: {
                type: String,
                required: true
            },
            displayName: {
                type: String,
                required: true
            },
            permissions: {
                type: [String],
                enum: ROLE_PERMISSION_VALUES,
                default: []
            },
            isDefault: {
                type: Boolean,
                default: false
            },
            canManageMembers: {
                type: Boolean,
                default: false
            },
            canManageRoles: {
                type: Boolean,
                default: false
            },
            canManageEvents: {
                type: Boolean,
                default: false
            },
            canViewAnalytics: {
                type: Boolean,
                default: false
            },
            order: {
                type: Number,
                default: 0
            },
            color: {
                type: String,
                required: false,
                default: null
            }
        }],
        required: true,
        default: [
            {
                name: 'owner',
                displayName: 'Owner',
                permissions: ['all'],
                isDefault: false,
                canManageMembers: true,
                canManageRoles: true,
                canManageEvents: true,
                canViewAnalytics: true,
                order: 0,
                color: '#dc2626'
            },
            {
                name: 'member',
                displayName: 'Member',
                permissions: ['view_events'],
                isDefault: true,
                canManageMembers: false,
                canManageRoles: false,
                canManageEvents: false,
                canViewAnalytics: false,
                order: 1,
                color: '#6b7280'
            }
        ]
    },
    weekly_meeting:{
        type: Object, //Times,Data, Room Location
        required: false
    },
    owner: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    memberForm: {
        type: Schema.Types.ObjectId,
        ref: 'Form',
        required: false
    },
    requireApprovalForJoin: {
        type: Boolean,
        default: false,
        required: false
    },
    // Verification fields
    verified: {
        type: Boolean,
        default: false
    },
    verifiedAt: {
        type: Date
    },
    verifiedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    },
    verificationType: {
        type: String,
        enum: ['basic', 'premium', 'gold', 'platinum', 'official', 'academic', 'cultural', 'sports', 'professional'],
        default: 'basic'
    },
    verificationStatus: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'conditionally_approved', 'under_review', 'escalated'],
        default: 'pending'
    },
    // Atlas org approval (new orgs - pending until manual or auto approval)
    approvalStatus: {
        type: String,
        enum: ['pending', 'approved'],
        default: 'approved'
    },
    approvedAt: {
        type: Date
    },
    approvedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    },
    // Add metadata for role management
    roleManagement: {
        allowCustomRoles: {
            type: Boolean,
            default: true
        },
        maxCustomRoles: {
            type: Number,
            default: 10
        },
        requireApprovalForRoleChanges: {
            type: Boolean,
            default: false
        }
    },
    
    // Approval-specific settings (for approval groups)
    approvalSettings: {
        type: {
            type: String,
            enum: ['regular', 'approval_group'],
            default: 'regular'
        },
        maxPendingApprovals: {
            type: Number,
            default: 50
        },
        escalationTimeout: {
            type: Number,
            default: 72 // hours
        },
        autoEscalate: {
            type: Boolean,
            default: true
        },
        notificationPreferences: {
            email: {
                type: Boolean,
                default: true
            },
            sms: {
                type: Boolean,
                default: false
            },
            push: {
                type: Boolean,
                default: true
            }
        }
    },
    // Message/announcement settings
    messageSettings: {
        enabled: {
            type: Boolean,
            default: true
        },
        visibility: {
            type: String,
            enum: ['members_only', 'members_and_followers', 'public'],
            default: 'members_and_followers'
        },
        postingPermissions: {
            type: [String], // Role names that can post
            default: ['owner', 'admin', 'officer']
        },
        allowReplies: {
            type: Boolean,
            default: true
        },
        allowLikes: {
            type: Boolean,
            default: true
        },
        requireApproval: {
            type: Boolean,
            default: false
        },
        characterLimit: {
            type: Number,
            default: 500,
            min: 100,
            max: 2000
        }
    },
    // Social links and external links (Linktree-like)
    socialLinks: {
        type: [{
            type: {
                type: String,
                enum: ['instagram', 'youtube', 'tiktok', 'website'],
                required: true
            },
            username: {
                type: String,
                required: false // Required for social media types
            },
            url: {
                type: String,
                required: false // Required for website type
            },
            title: {
                type: String,
                required: false // Required for website type
            },
            order: {
                type: Number,
                default: 0
            }
        }],
        default: [],
        required: false
    },
    // Unlisted: when true, org is hidden from the public Organizations list (Orgs.jsx)
    unlisted: {
        type: Boolean,
        default: false
    },
    // Soft delete
    isDeleted: {
        type: Boolean,
        default: false
    },
    deletedAt: {
        type: Date,
        default: null
    },
    deletedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }
});

// Exclude soft-deleted orgs from default find/findOne (use findOneWithDeleted or findWithDeleted for admin if needed)
OrgSchema.pre('find', function () {
    this.where({ isDeleted: { $ne: true } });
});
OrgSchema.pre('findOne', function () {
    this.where({ isDeleted: { $ne: true } });
});

// Add methods for role management
OrgSchema.methods.addCustomRole = function(roleData) {
    if (!this.roleManagement.allowCustomRoles) {
        throw new Error('Custom roles are not allowed for this organization');
    }
    
    if (this.positions.length >= this.roleManagement.maxCustomRoles) {
        throw new Error('Maximum number of custom roles reached');
    }
    
    const newRole = {
        ...roleData,
        order: this.positions.length,
        isDefault: false
    };
    
    this.positions.push(newRole);
    return this.save();
};

OrgSchema.methods.updateRole = function(roleName, updates) {
    const roleIndex = this.positions.findIndex(pos => pos.name === roleName);
    if (roleIndex === -1) {
        throw new Error('Role not found');
    }
    
    // Prevent updating owner role permissions
    if (roleName === 'owner') {
        const { permissions, canManageRoles } = updates;
        if (permissions && !permissions.includes('all')) {
            throw new Error('Owner role must have all permissions');
        }
        if (canManageRoles === false) {
            throw new Error('Owner role must be able to manage roles');
        }
    }
    
    this.positions[roleIndex] = { ...this.positions[roleIndex], ...updates };
    return this.save();
};

OrgSchema.methods.removeRole = function(roleName) {
    if (roleName === 'owner' || roleName === 'member') {
        throw new Error('Cannot remove owner or member roles');
    }
    
    this.positions = this.positions.filter(pos => pos.name !== roleName);
    return this.save();
};

OrgSchema.methods.getRoleByName = function(roleName) {
    return this.positions.find(pos => pos.name === roleName);
};

OrgSchema.methods.hasPermission = function(roleName, permission) {
    const role = this.getRoleByName(roleName);
    if (!role) return false;

    if (role.permissions.includes('all')) return true;
    if (role.permissions.includes(permission)) return true;

    // Also check boolean flags (roles may have canManageEvents etc. without permissions array)
    if (permission === 'manage_events' && role.canManageEvents) return true;
    if (permission === 'manage_members' && role.canManageMembers) return true;
    if (permission === 'manage_roles' && role.canManageRoles) return true;
    if (permission === 'view_analytics' && role.canViewAnalytics) return true;

    return false;
};

// Approval-specific methods
OrgSchema.methods.isApprovalGroup = function() {
    return this.approvalSettings.type === 'approval_group';
};

OrgSchema.methods.canApproveEvents = function(roleName) {
    return this.hasPermission(roleName, 'approve_events');
};

OrgSchema.methods.canRejectEvents = function(roleName) {
    return this.hasPermission(roleName, 'reject_events');
};

OrgSchema.methods.canConfigureApprovalRules = function(roleName) {
    return this.hasPermission(roleName, 'configure_approval_rules');
};

OrgSchema.methods.canEscalateApprovals = function(roleName) {
    return this.hasPermission(roleName, 'escalate_approvals');
};

// Static method to create approval group
OrgSchema.statics.createApprovalGroup = function(name, displayName, description, ownerId) {
    const approvalRoles = [
        {
            name: 'owner',
            displayName: 'Owner',
            permissions: ['all'],
            isDefault: false,
            canManageMembers: true,
            canManageRoles: true,
            canManageEvents: true,
            canViewAnalytics: true,
            order: 0
        },
        {
            name: 'admin',
            displayName: 'Administrator',
            permissions: ['approve_events', 'reject_events', 'request_changes', 'manage_members', 'configure_approval_rules', 'view_analytics'],
            isDefault: false,
            canManageMembers: true,
            canManageRoles: false,
            canManageEvents: true,
            canViewAnalytics: true,
            order: 1
        },
        {
            name: 'approver',
            displayName: 'Approver',
            permissions: ['approve_events', 'reject_events', 'request_changes'],
            isDefault: false,
            canManageMembers: false,
            canManageRoles: false,
            canManageEvents: false,
            canViewAnalytics: false,
            order: 2
        },
        {
            name: 'member',
            displayName: 'Member',
            permissions: ['approve_events'],
            isDefault: true,
            canManageMembers: false,
            canManageRoles: false,
            canManageEvents: false,
            canViewAnalytics: false,
            order: 3
        }
    ];

    return new this({
        org_name: name,
        org_description: description,
        org_profile_image: '/Logo.svg', // Default image for approval groups
        positions: approvalRoles,
        owner: ownerId,
        approvalSettings: {
            type: 'approval_group',
            maxPendingApprovals: 50,
            escalationTimeout: 72,
            autoEscalate: true,
            notificationPreferences: {
                email: true,
                sms: false,
                push: true
            }
        }
    });
};

module.exports=OrgSchema;
