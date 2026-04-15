const badgeGrantSchema = require('../schemas/badgeGrant');
const buildingSchema = require('../schemas/building');
const classroomSchema = require('../schemas/classroom');
const developerSchema = require('../schemas/developer');
const friendshipSchema = require('../schemas/friendship');
const OIESchema = require('../schemas/OIE');
const OIEConfigSchema = require('../schemas/OIEConfig');
const orgSchema = require('../schemas/org');
const orgFollowerSchema = require('../schemas/orgFollower');
const orgMemberSchema = require('../schemas/orgMember');
const orgMembershipAuditSchema = require('../schemas/orgMembershipAudit');
const orgInviteSchema = require('../schemas/orgInvite');
const eventCollaborationInviteSchema = require('../schemas/eventCollaborationInvite');
const qrSchema = require('../schemas/qr');
const ratingSchema = require('../schemas/rating');
const repeatedVisitSchema = require('../schemas/repeatedVisit');
const reportSchema = require('../schemas/report');
const scheduleSchema = require('../schemas/schedule');
const searchSchema = require('../schemas/search');
const studyHistorySchema = require('../schemas/studyHistory');
const userSchema = require('../schemas/user');
const visitSchema = require('../schemas/visit');
const sessionSchema = require('../schemas/session');
const orgMemberApplicationSchema = require('../schemas/orgMemberApplication');
const samlConfigSchema = require('../schemas/samlConfig');
const notificationSchema = require('../schemas/notification');
const orgMessageSchema = require('../schemas/orgMessage');
const contactRequestSchema = require('../schemas/contactRequest');
const androidTesterSignupSchema = require('../schemas/androidTesterSignup');
const resourcesConfigSchema = require('../schemas/resources');
const shuttleConfigSchema = require('../schemas/shuttleConfig');
const noticeConfigSchema = require('../schemas/noticeConfig');
// Study Sessions
const studySessionSchema = require('../schemas/studySession');
const availabilityPollSchema = require('../schemas/availabilityPoll');

// Universal Feedback System
const universalFeedbackSchema = require('../schemas/universalFeedback');
const feedbackConfigSchema = require('../schemas/feedbackConfig');
const systemVersionSchema = require('../schemas/systemVersion');

//events
const rssFeedSchema = require('../events/schemas/rssFeed');
const approvalFlowDefinition = require('../events/schemas/approvalFlowDefinition');
const approvalFlowInstance = require('../events/schemas/approvalInstance');
const eventSchema = require('../events/schemas/event');
const formSchema = require('../events/schemas/form');
const formResponseSchema = require('../events/schemas/formResponse');
const orgVerificationSchema = require('../schemas/orgVerification');
const orgManagementConfigSchema = require('../schemas/orgManagementConfig');
const financeConfigSchema = require('../schemas/financeConfig');
const orgBudgetSchema = require('../schemas/orgBudget');
const eventAnalyticsSchema = require('../events/schemas/eventAnalytics');
const eventSystemConfigSchema = require('../events/schemas/eventSystemConfig');
const stakeholderRoleSchema = require('../events/schemas/stakeholderRole');
const domainSchema = require('../events/schemas/domain');
const eventAgendaSchema = require('../schemas/EventAgenda');
const eventJobSchema = require('../schemas/EventJob');
const orgEventRoleSchema = require('../schemas/OrgEventRole');
const volunteerSignupSchema = require('../schemas/VolunteerSignup');
const eventEquipmentSchema = require('../schemas/EventEquipment');
const orgEquipmentSchema = require('../schemas/OrgEquipment');
const analyticsEventSchema = require('../events/schemas/analyticsEvent');
const eventQRSchema = require('../events/schemas/eventQR');
const registeredConnections = new WeakSet();
const MODEL_DEFINITIONS = Object.freeze({
    BadgeGrant: { modelName: 'BadgeGrant', schema: badgeGrantSchema, collection: 'badgegrants' },
    Building: { modelName: 'Building', schema: buildingSchema, collection: 'buildings' },
    Classroom: { modelName: 'Classroom', schema: classroomSchema, collection: 'classrooms1' },
    Developer: { modelName: 'Developer', schema: developerSchema, collection: 'developers' },
    Event: { modelName: 'Event', schema: eventSchema, collection: 'events' },
    Friendship: { modelName: 'Friendship', schema: friendshipSchema, collection: 'friendships' },
    OIEStatus: { modelName: 'OIE', schema: OIESchema, collection: 'OIEStatuses' },
    OIEConfig: { modelName: 'OIEConfig', schema: OIEConfigSchema, collection: 'OIEConfig' },
    Org: { modelName: 'Org', schema: orgSchema, collection: 'orgs' },
    OrgFollower: { modelName: 'OrgFollower', schema: orgFollowerSchema, collection: 'followers' },
    OrgMember: { modelName: 'OrgMember', schema: orgMemberSchema, collection: 'members' },
    OrgInvite: { modelName: 'OrgInvite', schema: orgInviteSchema, collection: 'orgInvites' },
    EventCollaborationInvite: { modelName: 'EventCollaborationInvite', schema: eventCollaborationInviteSchema, collection: 'eventCollaborationInvites' },
    QR: { modelName: 'QR', schema: qrSchema, collection: 'QR' },
    Rating: { modelName: 'Rating', schema: ratingSchema, collection: 'ratings' },
    RepeatedVisit: { modelName: 'RepeatedVisit', schema: repeatedVisitSchema, collection: 'repeatedVisits' },
    Report: { modelName: 'Report', schema: reportSchema, collection: 'reports' },
    Schedule: { modelName: 'Schedule', schema: scheduleSchema, collection: 'schedules' },
    Search: { modelName: 'Search', schema: searchSchema, collection: 'searches' },
    StudyHistory: { modelName: 'StudyHistory', schema: studyHistorySchema, collection: 'studyHistories' },
    User: { modelName: 'User', schema: userSchema, collection: 'users' },
    Visit: { modelName: 'Visit', schema: visitSchema, collection: 'visits' },
    Session: { modelName: 'Session', schema: sessionSchema, collection: 'sessions' },
    ApprovalFlow: { modelName: 'ApprovalFlow', schema: approvalFlowDefinition, collection: 'approvalFlows' },
    ApprovalInstance: { modelName: 'ApprovalInstance', schema: approvalFlowInstance, collection: 'approvalInstances' },
    RssFeed: { modelName: 'RssFeed', schema: rssFeedSchema, collection: 'rssFeeds' },
    Form: { modelName: 'Form', schema: formSchema, collection: 'forms' },
    FormResponse: { modelName: 'FormResponse', schema: formResponseSchema, collection: 'formResponses' },
    StudySession: { modelName: 'StudySession', schema: studySessionSchema, collection: 'studySessions' },
    OrgVerification: { modelName: 'OrgVerification', schema: orgVerificationSchema, collection: 'orgVerifications' },
    OrgManagementConfig: { modelName: 'OrgManagementConfig', schema: orgManagementConfigSchema, collection: 'orgManagementConfigs' },
    OrgMemberApplication: { modelName: 'OrgMemberApplication', schema: orgMemberApplicationSchema, collection: 'orgMemberApplications' },
    SAMLConfig: { modelName: 'SAMLConfig', schema: samlConfigSchema, collection: 'samlConfigs' },
    Notification: { modelName: 'Notification', schema: notificationSchema, collection: 'notifications' },
    OrgMessage: { modelName: 'OrgMessage', schema: orgMessageSchema, collection: 'orgMessages' },
    EventAnalytics: { modelName: 'EventAnalytics', schema: eventAnalyticsSchema, collection: 'eventAnalytics' },
    AvailabilityPoll: { modelName: 'AvailabilityPoll', schema: availabilityPollSchema, collection: 'availabilityPolls' },
    UniversalFeedback: { modelName: 'UniversalFeedback', schema: universalFeedbackSchema, collection: 'universalFeedback' },
    FeedbackConfig: { modelName: 'FeedbackConfig', schema: feedbackConfigSchema, collection: 'feedbackConfigs' },
    SystemVersion: { modelName: 'SystemVersion', schema: systemVersionSchema, collection: 'systemVersions' },
    EventSystemConfig: { modelName: 'EventSystemConfig', schema: eventSystemConfigSchema, collection: 'eventSystemConfigs' },
    StakeholderRole: { modelName: 'StakeholderRole', schema: stakeholderRoleSchema, collection: 'stakeholderRoles' },
    Domain: { modelName: 'Domain', schema: domainSchema, collection: 'domains' },
    ContactRequest: { modelName: 'ContactRequest', schema: contactRequestSchema, collection: 'contactRequests' },
    AndroidTesterSignup: { modelName: 'AndroidTesterSignup', schema: androidTesterSignupSchema, collection: 'androidTesterSignups' },
    EventAgenda: { modelName: 'EventAgenda', schema: eventAgendaSchema, collection: 'eventAgendas' },
    EventJob: { modelName: 'EventJob', schema: eventJobSchema, collection: 'eventRoles' },
    OrgEventRole: { modelName: 'OrgEventRole', schema: orgEventRoleSchema, collection: 'orgEventRoles' },
    VolunteerSignup: { modelName: 'VolunteerSignup', schema: volunteerSignupSchema, collection: 'volunteerSignups' },
    EventEquipment: { modelName: 'EventEquipment', schema: eventEquipmentSchema, collection: 'eventEquipment' },
    OrgEquipment: { modelName: 'OrgEquipment', schema: orgEquipmentSchema, collection: 'orgEquipment' },
    AnalyticsEvent: { modelName: 'AnalyticsEvent', schema: analyticsEventSchema, collection: 'analytics_events' },
    EventQR: { modelName: 'EventQR', schema: eventQRSchema, collection: 'event_qrs' },
    ResourcesConfig: { modelName: 'ResourcesConfig', schema: resourcesConfigSchema, collection: 'resourcesConfigs' },
    ShuttleConfig: { modelName: 'ShuttleConfig', schema: shuttleConfigSchema, collection: 'shuttleConfigs' },
    NoticeConfig: { modelName: 'NoticeConfig', schema: noticeConfigSchema, collection: 'noticeConfigs' },
});

function getOrCreateModel(req, definition) {
    const existingModel = req.db.models[definition.modelName];
    if (existingModel) return existingModel;
    return req.db.model(definition.modelName, definition.schema, definition.collection);
}

function ensureAllModelsRegistered(req) {
    if (registeredConnections.has(req.db)) return;

    Object.values(MODEL_DEFINITIONS).forEach((definition) => {
        getOrCreateModel(req, definition);
    });

    registeredConnections.add(req.db);
}

const getModels = (req, ...names) => {
    if (!req?.db) {
        throw new Error('getModels requires req.db to be available.');
    }

    ensureAllModelsRegistered(req);

    return names.reduce((acc, name) => {
        const definition = MODEL_DEFINITIONS[name];
        if (definition) {
            acc[name] = getOrCreateModel(req, definition);
        }
        return acc;
    }, {});
};

//example call
// const { User, Event } = getModels(req, 'User', 'Event');

module.exports = getModels;
