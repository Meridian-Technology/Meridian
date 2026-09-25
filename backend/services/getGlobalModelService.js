const globalUserSchema = require('../schemas/globalUser');
const platformRoleSchema = require('../schemas/platformRole');
const platformAdminInviteSchema = require('../schemas/platformAdminInvite');
const tenantMembershipSchema = require('../schemas/tenantMembership');
const globalSessionSchema = require('../schemas/globalSession');
const tenantConfigSchema = require('../schemas/tenantConfig');
const pivotReferralCodeSchema = require('../schemas/pivotReferralCode');
const pivotReferralRedemptionSchema = require('../schemas/pivotReferralRedemption');
const pivotWeeklySnapshotSchema = require('../schemas/pivotWeeklySnapshot');
const pivotLabNotesSchema = require('../schemas/pivotLabNotes');
const pivotTagCatalogSchema = require('../schemas/pivotTagCatalog');
const pivotPosterTemplateSchema = require('../schemas/pivotPosterTemplate');
const pivotCurationJobSchema = require('../schemas/pivotCurationJob');
const pivotCurationRunSchema = require('../schemas/pivotCurationRun');
const pivotCitySourceSchema = require('../schemas/pivotCitySource');
const pivotOrganizerSchema = require('../schemas/pivotOrganizer');
const pivotSourceDiscoveryRunSchema = require('../schemas/pivotSourceDiscoveryRun');
const pivotContactHashSchema = require('../schemas/pivotContactHash');
const pivotCreatorGrantSchema = require('../schemas/pivotCreatorGrant');
const pivotCopyPackSchema = require('../schemas/pivotCopyPack');
const pivotCarouselAssetSchema = require('../schemas/pivotCarouselAsset');
const pivotCarouselDeckSchema = require('../schemas/pivotCarouselDeck');
const pivotCarouselVoiceSchema = require('../schemas/pivotCarouselVoice');
const pivotCarouselAccountSchema = require('../schemas/pivotCarouselAccount');
const pivotCarouselSavedSearchSchema = require('../schemas/pivotCarouselSavedSearch');
const pivotCarouselCurationDraftSchema = require('../schemas/pivotCarouselCurationDraft');
const pivotCarouselRevisionSchema = require('../schemas/pivotCarouselRevision');
const justGoLandingEventSchema = require('../schemas/justGoLandingEvent');
const justGoWaitlistSchema = require('../schemas/justGoWaitlist');
const justGoLandingQrSchema = require('../schemas/justGoLandingQr');
const pivotComputeJobSchema = require('../schemas/pivotComputeJob');
const pivotComputeJobAttemptSchema = require('../schemas/pivotComputeJobAttempt');
const meridianJobRunSchema = require('../schemas/meridianJobRun');
const meridianJobAttemptSchema = require('../schemas/meridianJobAttempt');
const meridianJobDeliverySchema = require('../schemas/meridianJobDelivery');
const meridianNotificationDefinitionSchema = require('../schemas/meridianNotificationDefinition');

/**
 * Get models from the global/platform DB (cross-tenant data).
 * Use only in auth flows and admin-resolution logic.
 * Requires req.globalDb to be set (see app.js middleware).
 *
 * @param {object} req - request with req.globalDb
 * @param {...string} names - model names including 'GlobalUser', 'PlatformRole', 'PlatformAdminInvite', 'PivotCitySource', 'PivotCreatorGrant', 'PivotCopyPack', 'PivotCarouselDeck', 'PivotCarouselVoice', 'PivotCarouselAccount', 'PivotCarouselSavedSearch', 'JustGoLandingEvent', 'JustGoWaitlist', 'JustGoLandingQr', 'MeridianJobRun', 'MeridianJobAttempt', 'MeridianJobDelivery', 'MeridianNotificationDefinition', …
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
        PlatformAdminInvite: db.model(
            'PlatformAdminInvite',
            platformAdminInviteSchema,
            'platform_admin_invites'
        ),
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
        PivotCurationJob: db.model(
            'PivotCurationJob',
            pivotCurationJobSchema,
            'pivot_curation_jobs'
        ),
        PivotCurationRun: db.model(
            'PivotCurationRun',
            pivotCurationRunSchema,
            'pivot_curation_runs'
        ),
        PivotCitySource: db.model(
            'PivotCitySource',
            pivotCitySourceSchema,
            'pivot_city_sources'
        ),
        PivotOrganizer: db.model(
            'PivotOrganizer',
            pivotOrganizerSchema,
            'pivot_organizers'
        ),
        PivotSourceDiscoveryRun: db.model(
            'PivotSourceDiscoveryRun',
            pivotSourceDiscoveryRunSchema,
            'pivot_source_discovery_runs'
        ),
        PivotContactHash: db.model(
            'PivotContactHash',
            pivotContactHashSchema,
            'pivot_contact_hashes'
        ),
        PivotCreatorGrant: db.model(
            'PivotCreatorGrant',
            pivotCreatorGrantSchema,
            'pivot_creator_grants'
        ),
        PivotCopyPack: db.model(
            'PivotCopyPack',
            pivotCopyPackSchema,
            'pivot_copy_packs'
        ),
        PivotCarouselAsset: db.model('PivotCarouselAsset', pivotCarouselAssetSchema, 'pivot_carousel_assets'),
        PivotCarouselDeck: db.model(
            'PivotCarouselDeck',
            pivotCarouselDeckSchema,
            'pivot_carousel_decks'
        ),
        PivotCarouselVoice: db.model(
            'PivotCarouselVoice',
            pivotCarouselVoiceSchema,
            'pivot_carousel_voice'
        ),
        PivotCarouselAccount: db.model(
            'PivotCarouselAccount',
            pivotCarouselAccountSchema,
            'pivot_carousel_accounts'
        ),
        PivotCarouselSavedSearch: db.model(
            'PivotCarouselSavedSearch',
            pivotCarouselSavedSearchSchema,
            'pivot_carousel_saved_searches'
        ),
        PivotCarouselCurationDraft: db.model(
            'PivotCarouselCurationDraft',
            pivotCarouselCurationDraftSchema,
            'pivot_carousel_curation_drafts'
        ),
        PivotCarouselRevision: db.model(
            'PivotCarouselRevision',
            pivotCarouselRevisionSchema,
            'pivot_carousel_revisions'
        ),
        JustGoLandingEvent: db.model(
            'JustGoLandingEvent',
            justGoLandingEventSchema,
            'justgo_landing_events'
        ),
        JustGoWaitlist: db.model(
            'JustGoWaitlist',
            justGoWaitlistSchema,
            'justgo_waitlist'
        ),
        JustGoLandingQr: db.model(
            'JustGoLandingQr',
            justGoLandingQrSchema,
            'justgo_landing_qrs'
        ),
        PivotComputeJob: db.model(
            'PivotComputeJob',
            pivotComputeJobSchema,
            'pivot_compute_jobs'
        ),
        PivotComputeJobAttempt: db.model(
            'PivotComputeJobAttempt',
            pivotComputeJobAttemptSchema,
            'pivot_compute_job_attempts'
        ),
        MeridianJobRun: db.model(
            'MeridianJobRun',
            meridianJobRunSchema,
            'meridian_job_runs'
        ),
        MeridianJobAttempt: db.model(
            'MeridianJobAttempt',
            meridianJobAttemptSchema,
            'meridian_job_attempts'
        ),
        MeridianJobDelivery: db.model(
            'MeridianJobDelivery',
            meridianJobDeliverySchema,
            'meridian_job_deliveries'
        ),
        MeridianNotificationDefinition: db.model(
            'MeridianNotificationDefinition',
            meridianNotificationDefinitionSchema,
            'meridian_notification_definitions'
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
