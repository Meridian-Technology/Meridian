const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const memberSchema = new Schema({
    org_id: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'Org'
    },
    user_id: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    role: {
        type: String,
        required: true,
        default: 'member'
    },
    roles: {
        type: [String],
        default: ['member']
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'pending', 'suspended'],
        default: 'active'
    },
    joinedAt: {
        type: Date,
        default: Date.now
    },
    assignedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: false
    },
    assignedAt: {
        type: Date,
        default: Date.now
    },
    roleTermStart: {
        type: Date,
        required: false
    },
    roleTermEnd: {
        type: Date,
        required: false
    },
    // For tracking role changes
    roleHistory: [{
        role: String,
        assignedBy: {
            type: Schema.Types.ObjectId,
            ref: 'User'
        },
        assignedAt: {
            type: Date,
            default: Date.now
        },
        reason: String
    }],

    membershipHistory: [{
        at: { type: Date, default: Date.now },
        action: {
            type: String,
            required: true
        },
        fromStatus: String,
        toStatus: String,
        role: String,
        actorUserId: {
            type: Schema.Types.ObjectId,
            ref: 'User'
        },
        reason: String
    }],

    // Custom permissions that override role permissions
    customPermissions: {
        type: [String],
        default: []
    },
    // Permissions that are explicitly denied
    deniedPermissions: {
        type: [String],
        default: []
    }
});

// Index for efficient queries
memberSchema.index({ org_id: 1, user_id: 1 }, { unique: true });
memberSchema.index({ org_id: 1, role: 1 });
memberSchema.index({ user_id: 1, status: 1 });

// Methods for permission checking
memberSchema.methods.hasPermission = async function(permission) {
    // Check if permission is explicitly denied
    if (this.deniedPermissions.includes(permission)) {
        return false;
    }
    
    // Check if permission is explicitly granted
    if (this.customPermissions.includes(permission)) {
        return true;
    }
    
    // For role-based permissions, we'll need to check the organization's roles
    // This will be handled by the middleware that has access to the Org model
    return false; // Default to false, will be overridden by middleware
};

// Method to check permissions with Org model provided
memberSchema.methods.getAssignedRoles = function() {
    if (Array.isArray(this.roles) && this.roles.length > 0) {
        return [...new Set(this.roles.filter(Boolean))];
    }
    return this.role ? [this.role] : ['member'];
};

memberSchema.methods.getPrimaryRole = function() {
    const assignedRoles = this.getAssignedRoles();
    return assignedRoles[0] || 'member';
};

memberSchema.methods.hasPermissionWithOrg = async function(permission, org) {
    // Check if permission is explicitly denied
    if (this.deniedPermissions.includes(permission)) {
        return false;
    }
    
    // Check if permission is explicitly granted
    if (this.customPermissions.includes(permission)) {
        return true;
    }
    
    // Check role permissions using the provided org (union for multi-role members)
    if (!org) return false;
    const assignedRoles = this.getAssignedRoles();
    return assignedRoles.some((roleName) => org.hasPermission(roleName, permission));
};

memberSchema.methods.canManageMembers = async function(org) {
    return this.hasPermissionWithOrg('manage_members', org);
};

memberSchema.methods.canManageRoles = async function(org) {
    return this.hasPermissionWithOrg('manage_roles', org);
};

memberSchema.methods.canManageEvents = async function(org) {
    return this.hasPermissionWithOrg('manage_events', org);
};

memberSchema.methods.canViewAnalytics = async function(org) {
    return this.hasPermissionWithOrg('view_analytics', org);
};

// Method to change role with history tracking
memberSchema.methods.changeRole = async function(newRole, assignedBy, reason = '', options = {}) {
    const { termStart, termEnd } = options || {};
    this.roleHistory.push({
        role: this.role,
        assignedBy: this.assignedBy,
        assignedAt: this.assignedAt,
        reason: reason
    });
    if (!this.membershipHistory) {
        this.membershipHistory = [];
    }
    this.membershipHistory.push({
        at: new Date(),
        action: 'role_change',
        role: newRole,
        actorUserId: assignedBy,
        reason: reason || ''
    });
    this.role = newRole;
    this.roles = [newRole];
    this.assignedBy = assignedBy;
    this.assignedAt = new Date();
    if (termStart !== undefined) {
        this.roleTermStart = termStart;
    }
    if (termEnd !== undefined) {
        this.roleTermEnd = termEnd;
    }
    return this.save();
};

memberSchema.methods.setRoles = async function(newRoles, assignedBy, reason = '', options = {}) {
    const normalizedRoles = [...new Set((newRoles || []).filter(Boolean))];
    const safeRoles = normalizedRoles.length > 0 ? normalizedRoles : ['member'];
    const primaryRole = safeRoles[0];
    return this.changeRole(primaryRole, assignedBy, reason, options).then(async () => {
        this.roles = safeRoles;
        return this.save();
    });
};

memberSchema.pre('save', function(next) {
    if (!Array.isArray(this.roles) || this.roles.length === 0) {
        this.roles = [this.role || 'member'];
    }
    this.roles = [...new Set(this.roles.filter(Boolean))];
    this.role = this.roles[0] || this.role || 'member';
    next();
});

// Static method to get members by role
memberSchema.statics.getMembersByRole = function(orgId, role) {
    return this.find({
        org_id: orgId,
        status: 'active',
        $or: [{ role }, { roles: role }]
    })
        .populate('user_id', 'username name email picture')
        .populate('assignedBy', 'username name');
};

// Static method to get all active members
memberSchema.statics.getActiveMembers = function(orgId) {
    return this.find({ org_id: orgId, status: 'active' })
        .populate('user_id', 'username name email picture')
        .populate('assignedBy', 'username name')
        .sort({ role: 1, joinedAt: 1 });
};

module.exports = memberSchema;