const mongoose = require('mongoose');

const pivotDropOverrideSchema = new mongoose.Schema(
  {
    batchWeek: { type: String, required: true, trim: true },
    dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
    hour: { type: Number, required: true, min: 0, max: 23 },
    minute: { type: Number, default: 0, min: 0, max: 59 },
    pushTitle: { type: String, default: null, trim: true, maxlength: 100 },
    pushBody: { type: String, default: null, trim: true, maxlength: 240 },
  },
  { _id: false }
);

const pivotCrewConfigSchema = new mongoose.Schema(
  {
    version: { type: Number, default: null, min: 1 },
    feedMix: {
      personalInterestWeight: { type: Number, default: null, min: 0, max: 1 },
      crewSignalWeight: { type: Number, default: null, min: 0, max: 1 },
      friendSignalWeight: { type: Number, default: null, min: 0, max: 1 },
      explorationWeight: { type: Number, default: null, min: 0, max: 1 },
    },
    interestBleed: {
      enabled: { type: Boolean, default: null },
      maxWeight: { type: Number, default: null, min: 0, max: 1 },
      requiresCrewMemberSwipe: { type: Boolean, default: null },
    },
    quorum: {
      minSwipeParticipation: { type: Number, default: null, min: 0, max: 1 },
      minActiveMembers: { type: Number, default: null, min: 1 },
    },
    judgement: {
      windowHoursBeforeEvent: { type: Number, default: null, min: 1 },
      minHoursAfterDeckComplete: { type: Number, default: null, min: 0 },
    },
    pick: {
      algorithm: { type: String, default: null, trim: true },
      interestedWeight: { type: Number, default: null, min: 0 },
      registeredWeight: { type: Number, default: null, min: 0 },
      tieBreak: { type: String, default: null, trim: true },
    },
    crossCrew: {
      enabled: { type: Boolean, default: null },
      minSharedFriends: { type: Number, default: null, min: 0 },
      surfaceCopyKey: { type: String, default: null, trim: true, maxlength: 64 },
    },
    nudges: {
      soloCreateCrewAfterWeeks: { type: Number, default: null, min: 0 },
      unfinishedSwipeReminderHours: { type: Number, default: null, min: 1 },
    },
  },
  { _id: false }
);

const pivotDeckConfigSchema = new mongoose.Schema(
  {
    version: { type: Number, default: null, min: 1 },
    softMax: { type: Number, default: null, min: 1, max: 40 },
    hardMax: { type: Number, default: null, min: 1, max: 40 },
    leewayRatio: { type: Number, default: null, min: 0, max: 1 },
    highScoreFloor: { type: Number, default: null, min: 0, max: 5 },
    weights: {
      friendGoing: { type: Number, default: null, min: 0, max: 5 },
      friendInterested: { type: Number, default: null, min: 0, max: 5 },
      personalInterest: { type: Number, default: null, min: 0, max: 1 },
      crewSignal: { type: Number, default: null, min: 0, max: 1 },
      negativeTag: { type: Number, default: null, min: 0, max: 5 },
    },
  },
  { _id: false }
);

const pivotMobileConfigSchema = new mongoose.Schema(
  {
    minAppVersion: { type: String, default: null, trim: true },
    forceUpdate: { type: Boolean, default: null },
    message: { type: String, default: null, trim: true, maxlength: 240 },
    storeUrls: {
      ios: { type: String, default: null, trim: true, maxlength: 512 },
      android: { type: String, default: null, trim: true, maxlength: 512 },
    },
  },
  { _id: false }
);

/** Just Go Creator Console publish knobs (sparse overrides; defaults in pivotCreatorPublishConfig). */
const creatorPublishConfigSchema = new mongoose.Schema(
  {
    defaultIngestStatus: {
      type: String,
      enum: ['draft', 'staged'],
      default: null,
    },
    weekAssignment: {
      type: String,
      enum: ['event_start', 'force'],
      default: null,
    },
    forceBatchWeek: { type: String, default: null, trim: true },
    requireTagsToSubmit: { type: Boolean, default: null },
    notifyAdminsOnCreate: { type: Boolean, default: null },
    notifyAdminsOnLiveWeekSubmit: { type: Boolean, default: null },
  },
  { _id: false }
);

const tenantEntrySchema = new mongoose.Schema(
  {
    tenantKey: { type: String, required: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    subdomain: { type: String, required: true, trim: true, lowercase: true },
    location: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: ['active', 'coming_soon', 'maintenance', 'hidden'],
      default: 'active',
    },
    statusMessage: { type: String, default: '', trim: true, maxlength: 240 },
    tenantType: {
      type: String,
      enum: ['campus', 'pivot'],
      default: 'campus',
    },
    pivotPilot: { type: Boolean, default: false },
    mongoUri: { type: String, default: null, trim: true },
    mongoDatabaseName: { type: String, default: null, trim: true, lowercase: true },
    pivotCatalogOrgId: { type: String, default: null, trim: true },
    pivotDropTimezone: { type: String, default: null, trim: true },
    pivotDropDayOfWeek: { type: Number, default: null, min: 0, max: 6 },
    pivotDropHour: { type: Number, default: null, min: 0, max: 23 },
    pivotDropMinute: { type: Number, default: 0, min: 0, max: 59 },
    pivotDropPushTitle: { type: String, default: null, trim: true, maxlength: 100 },
    pivotDropPushBody: { type: String, default: null, trim: true, maxlength: 240 },
    pivotDropOverrides: { type: [pivotDropOverrideSchema], default: undefined },
    pivotCrewConfig: { type: pivotCrewConfigSchema, default: undefined },
    pivotDeckConfig: { type: pivotDeckConfigSchema, default: undefined },
    pivotMobileConfig: { type: pivotMobileConfigSchema, default: undefined },
    creatorPublish: { type: creatorPublishConfigSchema, default: undefined },
    provisioningConfirmations: {
      dns: { type: Boolean, default: false },
      cors: { type: Boolean, default: false },
      pickerVerified: { type: Boolean, default: false },
    },
  },
  { _id: false }
);

const tenantConfigSchema = new mongoose.Schema(
  {
    configKey: { type: String, required: true, unique: true, default: 'default' },
    tenants: { type: [tenantEntrySchema], default: [] },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = tenantConfigSchema;
