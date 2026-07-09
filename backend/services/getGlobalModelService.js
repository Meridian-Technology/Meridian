const globalUserSchema = require('../schemas/globalUser');
const platformRoleSchema = require('../schemas/platformRole');
const tenantMembershipSchema = require('../schemas/tenantMembership');
const globalSessionSchema = require('../schemas/globalSession');
const tenantConfigSchema = require('../schemas/tenantConfig');
const pivotReferralCodeSchema = require('../schemas/pivotReferralCode');
const pivotReferralRedemptionSchema = require('../schemas/pivotReferralRedemption');
const pivotWeeklySnapshotSchema = require('../schemas/pivotWeeklySnapshot');
const pivotLabNotesSchema = require('../schemas/pivotLabNotes');
const pivotTagCatalogSchema = require('../schemas/pivotTagCatalog');
const pivotPosterTemplateSchema = require('../schemas/pivotPosterTemplate');

/**
 * Get models from the global/platform DB (cross-tenant data).
 * Use only in auth flows and admin-resolution logic.
 * Requires req.globalDb to be set (see app.js middleware).
 *
 * @param {object} req - request with req.globalDb
 * @param {...string} names - model names: 'GlobalUser', 'PlatformRole', 'TenantMembership', 'Session', 'TenantConfig', 'PivotReferralCode', 'PivotReferralRedemption', 'PivotWeeklySnapshot', 'PivotLabNotes', 'PivotTagCatalog', 'PivotPosterTemplate'
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
        TenantConfig: db.model('TenantConfig', tenantConfigSchema, 'tenant_config'),
        PivotReferralCode: db.model('PivotReferralCode', pivotReferralCodeSchema, 'pivot_referral_codes'),
        PivotReferralRedemption: db.model(
            'PivotReferralRedemption',
            pivotReferralRedemptionSchema,
            'pivot_referral_redemptions'
        ),
        PivotWeeklySnapshot: db.model(
            'PivotWeeklySnapshot',
            pivotWeeklySnapshotSchema,
            'pivot_weekly_snapshots'
        ),
        PivotLabNotes: db.model('PivotLabNotes', pivotLabNotesSchema, 'pivot_lab_notes'),
        PivotTagCatalog: db.model('PivotTagCatalog', pivotTagCatalogSchema, 'pivot_tag_catalog'),
        PivotPosterTemplate: db.model(
            'PivotPosterTemplate',
            pivotPosterTemplateSchema,
            'pivot_poster_templates'
        ),
    };

    return names.reduce((acc, name) => {
        if (models[name]) {
            acc[name] = models[name];
        }
        return acc;
    }, {});
};

module.exports = getGlobalModels;
