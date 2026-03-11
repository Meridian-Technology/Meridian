const globalUserSchema = require('../schemas/globalUser');
const platformRoleSchema = require('../schemas/platformRole');
const tenantMembershipSchema = require('../schemas/tenantMembership');
const globalSessionSchema = require('../schemas/globalSession');

/**
 * Get models from the global/platform DB (cross-tenant data).
 * Use only in auth flows and admin-resolution logic.
 * Requires req.globalDb to be set (see app.js middleware).
 *
 * @param {object} req - request with req.globalDb
 * @param {...string} names - model names: 'GlobalUser', 'PlatformRole', 'TenantMembership', 'Session'
 * @returns {object} map of requested models
 */
const getGlobalModels = (req, ...names) => {
    if (!req.globalDb) {
        throw new Error('req.globalDb is not set; ensure global DB middleware runs first');
    }
    const db = req.globalDb;

    const models = {
        GlobalUser: db.model('GlobalUser', globalUserSchema, 'global_users'),
        PlatformRole: db.model('PlatformRole', platformRoleSchema, 'platform_roles'),
        TenantMembership: db.model('TenantMembership', tenantMembershipSchema, 'tenant_memberships'),
        Session: db.model('Session', globalSessionSchema, 'sessions'),
    };

    return names.reduce((acc, name) => {
        if (models[name]) {
            acc[name] = models[name];
        }
        return acc;
    }, {});
};

module.exports = getGlobalModels;
