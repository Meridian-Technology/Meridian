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
const qrSchema = require('../schemas/qr');
const ratingSchema = require('../schemas/rating');
const repeatedVisitSchema = require('../schemas/repeatedVisit');
const reportSchema = require('../schemas/report');
const scheduleSchema = require('../schemas/schedule');
const searchSchema = require('../schemas/search');
const studyHistorySchema = require('../schemas/studyHistory');
const userSchema = require('../schemas/user');
const visitSchema = require('../schemas/visit');
const orgMemberApplicationSchema = require('../schemas/orgMemberApplication');
const samlConfigSchema = require('../schemas/samlConfig');
const notificationSchema = require('../schemas/notification');
const orgMessageSchema = require('../schemas/orgMessage');
const contactRequestSchema = require('../schemas/contactRequest');
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



const getModels = (req, ...names) => {
    const models = {
        BadgeGrant: req.db.model('BadgeGrant', badgeGrantSchema, 'badgegrants'),
        Building: req.db.model('Building', buildingSchema, 'buildings'),
        Classroom: req.db.model('Classroom', classroomSchema, 'classrooms1'),
        Developer: req.db.model('Developer', developerSchema, 'developers'),
        Event: req.db.model('Event', eventSchema, 'events'),
        Friendship: req.db.model('Friendship', friendshipSchema, 'friendships'),
        OIEStatus: req.db.model('OIE', OIESchema, 'OIEStatuses'),
        OIEConfig: req.db.model('OIEConfig', OIEConfigSchema, 'OIEConfig'),
        Org: req.db.model('Org', orgSchema, 'orgs'),
        OrgFollower: req.db.model('OrgFollower', orgFollowerSchema, 'followers'),
        OrgMember: req.db.model('OrgMember', orgMemberSchema, 'members'),
        QR: req.db.model('QR', qrSchema, 'QR'),
        Rating: req.db.model('Rating', ratingSchema, 'ratings'),
        RepeatedVisit: req.db.model('RepeatedVisit', repeatedVisitSchema, 'repeatedVisits'),
        Report: req.db.model('Report', reportSchema, 'reports'),
        Schedule: req.db.model('Schedule', scheduleSchema, 'schedules'),
        Search: req.db.model('Search', searchSchema, 'searches'),
        StudyHistory: req.db.model('StudyHistory', studyHistorySchema, 'studyHistories'),
        User: req.db.model('User', userSchema, 'users'),
        Visit: req.db.model('Visit', visitSchema, 'visits'),
        ApprovalFlow: req.db.model('ApprovalFlow', approvalFlowDefinition, 'approvalFlows'),
        ApprovalInstance: req.db.model('ApprovalInstance', approvalFlowInstance, 'approvalInstances'),
        RssFeed: req.db.model('RssFeed', rssFeedSchema, 'rssFeeds'),
        Form: req.db.model('Form', formSchema, 'forms'),    
        FormResponse: req.db.model('FormResponse', formResponseSchema, 'formResponses'),
        OrgVerification: req.db.model('OrgVerification', orgVerificationSchema, 'orgVerifications'),
        OrgManagementConfig: req.db.model('OrgManagementConfig', orgManagementConfigSchema, 'orgManagementConfigs'),
        OrgMemberApplication: req.db.model('OrgMemberApplication', orgMemberApplicationSchema, 'orgMemberApplications'),
        SAMLConfig: req.db.model('SAMLConfig', samlConfigSchema, 'samlConfigs'),
        Notification: req.db.model('Notification', notificationSchema, 'notifications'),
        OrgMessage: req.db.model('OrgMessage', orgMessageSchema, 'orgMessages'),
        EventAnalytics: req.db.model('EventAnalytics', eventAnalyticsSchema, 'eventAnalytics'),

        // Study Sessions
        StudySession: req.db.model('StudySession', studySessionSchema, 'studySessions'),
        AvailabilityPoll: req.db.model('AvailabilityPoll', availabilityPollSchema, 'availabilityPolls'),

        // Universal Feedback System
        UniversalFeedback: req.db.model('UniversalFeedback', universalFeedbackSchema, 'universalFeedback'),
        FeedbackConfig: req.db.model('FeedbackConfig', feedbackConfigSchema, 'feedbackConfigs'),
        SystemVersion: req.db.model('SystemVersion', systemVersionSchema, 'systemVersions'),

        EventAnalytics: req.db.model('EventAnalytics', eventAnalyticsSchema, 'eventAnalytics'),
        EventSystemConfig: req.db.model('EventSystemConfig', eventSystemConfigSchema, 'eventSystemConfigs'),
        StakeholderRole: req.db.model('StakeholderRole', stakeholderRoleSchema, 'stakeholderRoles'),
        Domain: req.db.model('Domain', domainSchema, 'domains'),
        ContactRequest: req.db.model('ContactRequest', contactRequestSchema, 'contactRequests'),
        EventAgenda: req.db.model('EventAgenda', eventAgendaSchema, 'eventAgendas'),
        EventJob: req.db.model('EventJob', eventJobSchema, 'eventRoles'),
        OrgEventRole: req.db.model('OrgEventRole', orgEventRoleSchema, 'orgEventRoles'),
        VolunteerSignup: req.db.model('VolunteerSignup', volunteerSignupSchema, 'volunteerSignups'),
        EventEquipment: req.db.model('EventEquipment', eventEquipmentSchema, 'eventEquipment'),
        OrgEquipment: req.db.model('OrgEquipment', orgEquipmentSchema, 'orgEquipment'),
    };

    return names.reduce((acc, name) => {
        if (models[name]) {
            acc[name] = models[name];
        }
        return acc;
    }, {});
};

//example call
// const { User, Event } = getModels(req, 'User', 'Event');

module.exports = getModels;
