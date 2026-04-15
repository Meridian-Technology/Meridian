/**
 * Root / community dashboard: search users and manage operator roles + suspension.
 * Uses getModels(req, 'User') only.
 */

const getModels = require('./getModelService');

/** Roles this panel may grant or revoke (end-user operators: admin only). */
const MANAGEABLE_ROLES = ['admin'];

function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function actorUserId(req) {
    return String(req.user?.userId || req.user?.tenantUserId || '');
}

/**
 * Snapshot counts for the People & access dashboard header.
 * @param {import('express').Request} req
 */
async function getRootOperatorUserStats(req) {
    const { User } = getModels(req, 'User');
    const [totalUsers, adminCount] = await Promise.all([
        User.countDocuments({}),
        User.countDocuments({ roles: 'admin' }),
    ]);
    const memberCount = Math.max(0, totalUsers - adminCount);
    return {
        totalUsers,
        adminCount,
        memberCount,
    };
}

/**
 * @param {import('express').Request} req
 * @param {{ q?: string, limit?: number, role?: string }} opts
 */
async function searchRootOperatorUsers(req, opts = {}) {
    const { User } = getModels(req, 'User');
    const rawQ = typeof opts.q === 'string' ? opts.q.trim() : '';
    const limit = Math.min(50, Math.max(1, parseInt(String(opts.limit || 25), 10) || 25));
    const roleFilter =
        typeof opts.role === 'string' && opts.role && MANAGEABLE_ROLES.includes(opts.role) ? opts.role : '';

    if (rawQ.length < 2) {
        return { users: [], total: 0 };
    }

    const escaped = escapeRegex(rawQ);
    const searchQuery = {
        $or: [
            { username: { $regex: escaped, $options: 'i' } },
            { name: { $regex: escaped, $options: 'i' } },
            { email: { $regex: escaped, $options: 'i' } },
        ],
    };
    if (roleFilter) {
        searchQuery.roles = roleFilter;
    }

    const [users, total] = await Promise.all([
        User.find(searchQuery)
            .sort({ username: 1 })
            .limit(limit)
            .select('username name email picture roles accessSuspended accessSuspendedAt createdAt')
            .lean(),
        User.countDocuments(searchQuery),
    ]);

    return { users, total };
}

/**
 * @param {import('express').Request} req
 * @param {{ userId: string, role: string, assign: boolean }} opts
 */
async function setRootOperatorUserRole(req, opts) {
    const actorId = actorUserId(req);
    const targetId = String(opts.userId || '');
    const role = opts.role;
    const assign = opts.assign === true;

    if (!actorId || !targetId || !MANAGEABLE_ROLES.includes(role)) {
        const e = new Error('Invalid request');
        e.statusCode = 400;
        throw e;
    }

    const { User } = getModels(req, 'User');
    const [actor, target] = await Promise.all([User.findById(actorId), User.findById(targetId)]);
    if (!actor || !target) {
        const e = new Error('User not found');
        e.statusCode = 404;
        throw e;
    }

    const actorRoles = new Set(actor.roles || []);
    if (!['admin', 'developer', 'beta'].some((r) => actorRoles.has(r))) {
        const e = new Error('Forbidden');
        e.statusCode = 403;
        throw e;
    }

    if (!actorRoles.has('admin')) {
        const e = new Error('Only admins can change admin access');
        e.statusCode = 403;
        throw e;
    }

    if (!assign && role === 'admin' && (target.roles || []).includes('admin')) {
        const adminCount = await User.countDocuments({ roles: 'admin' });
        if (adminCount <= 1) {
            const e = new Error('Cannot remove the last admin');
            e.statusCode = 400;
            throw e;
        }
    }

    let nextRoles = [...(target.roles || [])];
    if (assign) {
        if (!nextRoles.includes(role)) nextRoles.push(role);
    } else {
        nextRoles = nextRoles.filter((r) => r !== role);
    }
    if (nextRoles.length === 0) nextRoles = ['user'];
    else if (!nextRoles.includes('user')) nextRoles.push('user');

    target.roles = nextRoles;
    await target.save();

    return { roles: target.roles };
}

/**
 * @param {import('express').Request} req
 * @param {{ userId: string, accessSuspended: boolean }} opts
 */
async function setRootOperatorAccessSuspended(req, opts) {
    const actorId = actorUserId(req);
    const targetId = String(opts.userId || '');
    const suspended = Boolean(opts.accessSuspended);

    if (!actorId || !targetId) {
        const e = new Error('Invalid request');
        e.statusCode = 400;
        throw e;
    }
    if (actorId === targetId) {
        const e = new Error('You cannot change suspension on your own account');
        e.statusCode = 400;
        throw e;
    }

    const { User } = getModels(req, 'User');
    const actor = await User.findById(actorId);
    if (!actor?.roles?.includes('admin')) {
        const e = new Error('Only admins can suspend or restore accounts');
        e.statusCode = 403;
        throw e;
    }

    const target = await User.findById(targetId);
    if (!target) {
        const e = new Error('User not found');
        e.statusCode = 404;
        throw e;
    }

    target.accessSuspended = suspended;
    target.accessSuspendedAt = suspended ? new Date() : null;
    await target.save();

    return { accessSuspended: target.accessSuspended, accessSuspendedAt: target.accessSuspendedAt };
}

module.exports = {
    getRootOperatorUserStats,
    searchRootOperatorUsers,
    setRootOperatorUserRole,
    setRootOperatorAccessSuspended,
    MANAGEABLE_ROLES,
};
