jest.mock('../../services/getModelService', () => jest.fn());
jest.mock('../../connectionsManager', () => ({
  connectToDatabase: jest.fn(),
}));
jest.mock('../../services/getGlobalModelService', () => jest.fn());
jest.mock('../../services/resendClient', () => ({
  getResend: jest.fn(),
}));
jest.mock('../../services/platformAdminInviteService', () => ({
  listPlatformAdmins: jest.fn(),
}));
jest.mock('../../services/pivotBatchService', () => ({
  getPivotBatch: jest.fn(),
}));

const getModels = require('../../services/getModelService');
const getGlobalModels = require('../../services/getGlobalModelService');
const { connectToDatabase } = require('../../connectionsManager');
const { getResend } = require('../../services/resendClient');
const { listPlatformAdmins } = require('../../services/platformAdminInviteService');
const { getPivotBatch } = require('../../services/pivotBatchService');
const {
  notifyAdminsOnCreatorListingCreate,
  isLiveCreatorBatchWeek,
  buildCreatorListingNotifyPayload,
  buildCreatorListingCurationHref,
  clearOpsInboxStub,
  getOpsInboxStub,
} = require('../../services/pivotCreatorAdminNotifyService');

const TENANT = {
  tenantKey: 'brooklyn',
  tenantType: 'pivot',
  location: 'Brooklyn',
};

const EVENT = {
  _id: '507f1f77bcf86cd799439099',
  name: 'Rooftop Vinyl Night',
  start_time: new Date('2026-05-23T19:00:00.000Z'),
  customFields: { pivot: { ingestStatus: 'draft' } },
};

describe('pivotCreatorAdminNotifyService', () => {
  let Event;

  beforeEach(() => {
    clearOpsInboxStub();
    jest.clearAllMocks();
    Event = {
      countDocuments: jest.fn().mockResolvedValue(0),
    };
    getModels.mockReturnValue({ Event });
    connectToDatabase.mockResolvedValue({});
    getPivotBatch.mockResolvedValue({ data: null });
    getGlobalModels.mockReturnValue({
      GlobalUser: {
        findById: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue({
            email: 'host@example.com',
            name: 'Host',
          }),
        })),
      },
    });
    listPlatformAdmins.mockResolvedValue({
      admins: [{ email: 'ops@meridian.study' }],
      nominations: [],
    });
    getResend.mockReturnValue(null);
  });

  describe('isLiveCreatorBatchWeek', () => {
    it('is live when published count > 0', async () => {
      Event.countDocuments.mockResolvedValue(3);

      const result = await isLiveCreatorBatchWeek(
        { school: 'brooklyn', db: {} },
        { tenantKey: 'brooklyn', batchWeek: '2026-W21' },
      );

      expect(result.isLive).toBe(true);
      expect(result.publishedCount).toBe(3);
      expect(result.reasons).toContain('published_events');
    });

    it('is live when batch status is released', async () => {
      getPivotBatch.mockResolvedValue({ data: { status: 'released' } });

      const result = await isLiveCreatorBatchWeek(
        { school: 'brooklyn', db: {} },
        { tenantKey: 'brooklyn', batchWeek: '2026-W21' },
      );

      expect(result.isLive).toBe(true);
      expect(result.reasons).toContain('batch_released');
    });

    it('is not live when no published events and batch not released', async () => {
      const result = await isLiveCreatorBatchWeek(
        { school: 'brooklyn', db: {} },
        { tenantKey: 'brooklyn', batchWeek: '2026-W21' },
      );

      expect(result.isLive).toBe(false);
      expect(result.reasons).toEqual([]);
    });
  });

  describe('buildCreatorListingNotifyPayload', () => {
    it('marks live-week emphasis when config allows', () => {
      const payload = buildCreatorListingNotifyPayload({
        tenant: TENANT,
        event: EVENT,
        batchWeek: '2026-W21',
        creatorIdentity: {
          creatorUserId: 'u1',
          email: 'host@example.com',
        },
        liveWeek: {
          isLive: true,
          publishedCount: 2,
          batchStatus: 'released',
          reasons: ['published_events', 'batch_released'],
        },
        config: {
          notifyAdminsOnCreate: true,
          notifyAdminsOnLiveWeekSubmit: true,
        },
      });

      expect(payload.isLiveWeek).toBe(true);
      expect(payload.emphasizeLive).toBe(true);
      expect(payload.priority).toBe('high');
      expect(payload.subject).toMatch(/^Live week:/);
      expect(payload.curationHref).toContain('source=justgo');
      expect(payload.curationHref).toContain('eventId=');
    });

    it('keeps baseline notify without live emphasis when live-week config is false', () => {
      const payload = buildCreatorListingNotifyPayload({
        tenant: TENANT,
        event: EVENT,
        batchWeek: '2026-W21',
        creatorIdentity: { creatorUserId: 'u1', email: 'host@example.com' },
        liveWeek: {
          isLive: true,
          publishedCount: 1,
          batchStatus: null,
          reasons: ['published_events'],
        },
        config: {
          notifyAdminsOnCreate: true,
          notifyAdminsOnLiveWeekSubmit: false,
        },
      });

      expect(payload.isLiveWeek).toBe(true);
      expect(payload.emphasizeLive).toBe(false);
      expect(payload.priority).toBe('normal');
      expect(payload.subject).toMatch(/^New host listing/);
    });
  });

  describe('notifyAdminsOnCreatorListingCreate', () => {
    it('skips when notifyAdminsOnCreate is false', async () => {
      const result = await notifyAdminsOnCreatorListingCreate(
        { school: 'brooklyn', db: {}, globalDb: {} },
        {
          tenant: TENANT,
          config: { notifyAdminsOnCreate: false },
          event: EVENT,
          batchWeek: '2026-W21',
          creatorUserId: '507f191e810c19729de860ea',
        },
      );

      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('notifyAdminsOnCreate_false');
      expect(getOpsInboxStub()).toHaveLength(0);
      expect(listPlatformAdmins).not.toHaveBeenCalled();
    });

    it('records ops inbox stub and distinguishes live-week in payload', async () => {
      Event.countDocuments.mockResolvedValue(2);
      getPivotBatch.mockResolvedValue({ data: { status: 'released' } });

      const result = await notifyAdminsOnCreatorListingCreate(
        { school: 'brooklyn', db: {}, globalDb: {} },
        {
          tenant: TENANT,
          config: {
            notifyAdminsOnCreate: true,
            notifyAdminsOnLiveWeekSubmit: true,
          },
          event: EVENT,
          batchWeek: '2026-W21',
          creatorUserId: '507f191e810c19729de860ea',
        },
      );

      expect(result.skipped).toBe(false);
      expect(result.payload.isLiveWeek).toBe(true);
      expect(result.payload.emphasizeLive).toBe(true);
      expect(getOpsInboxStub()).toHaveLength(1);
      expect(getOpsInboxStub()[0].priority).toBe('high');
    });

    it('does not throw when Resend fails (inbox stub still recorded)', async () => {
      getResend.mockReturnValue({
        emails: {
          send: jest.fn().mockRejectedValue(new Error('resend down')),
        },
      });

      const result = await notifyAdminsOnCreatorListingCreate(
        { school: 'brooklyn', db: {}, globalDb: {} },
        {
          tenant: TENANT,
          config: {
            notifyAdminsOnCreate: true,
            notifyAdminsOnLiveWeekSubmit: true,
          },
          event: EVENT,
          batchWeek: '2026-W21',
          creatorUserId: '507f191e810c19729de860ea',
        },
      );

      expect(result.skipped).toBe(false);
      expect(result.emailed).toBe(false);
      expect(getOpsInboxStub()).toHaveLength(1);
    });

    it('sends email when Resend is configured', async () => {
      const send = jest.fn().mockResolvedValue({ data: { id: 'email-1' }, error: null });
      getResend.mockReturnValue({ emails: { send } });

      const result = await notifyAdminsOnCreatorListingCreate(
        { school: 'brooklyn', db: {}, globalDb: {} },
        {
          tenant: TENANT,
          config: {
            notifyAdminsOnCreate: true,
            notifyAdminsOnLiveWeekSubmit: false,
          },
          event: EVENT,
          batchWeek: '2026-W21',
          creatorUserId: '507f191e810c19729de860ea',
        },
      );

      expect(result.emailed).toBe(true);
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ['ops@meridian.study'],
          subject: expect.stringContaining('New host listing'),
        }),
      );
    });
  });

  describe('buildCreatorListingCurationHref', () => {
    it('includes draft filter, justgo source, and event id', () => {
      const href = buildCreatorListingCurationHref({
        tenantKey: 'brooklyn',
        batchWeek: '2026-W21',
        eventId: 'evt1',
        emphasizeLive: true,
      });

      expect(href).toContain('/platform-admin/pivot/brooklyn');
      expect(href).toContain('batchWeek=2026-W21');
      expect(href).toContain('filter=draft');
      expect(href).toContain('source=justgo');
      expect(href).toContain('eventId=evt1');
      expect(href).toContain('alert=live-week-host');
    });
  });
});
