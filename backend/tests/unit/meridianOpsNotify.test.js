jest.mock('../../connectionsManager', () => ({
  connectToGlobalDatabase: jest.fn(),
  connectToDatabase: jest.fn(),
}));
jest.mock('../../services/getGlobalModelService', () => jest.fn());
jest.mock('../../services/getModelService', () => jest.fn());
jest.mock('../../services/resendClient', () => ({ getResend: jest.fn() }));
jest.mock('../../services/platformAdminInviteService', () => ({ listPlatformAdmins: jest.fn() }));
jest.mock('../../services/expoPushDeliveryService', () => ({
  sendExpoPushToRecipients: jest.fn(),
}));

const getGlobalModels = require('../../services/getGlobalModelService');
const getModels = require('../../services/getModelService');
const { connectToDatabase } = require('../../connectionsManager');
const { getResend } = require('../../services/resendClient');
const { listPlatformAdmins } = require('../../services/platformAdminInviteService');
const { sendExpoPushToRecipients } = require('../../services/expoPushDeliveryService');
const {
  buildMeridianOpsNotifyPayload,
  buildMeridianOpsNotifyEmailHtml,
  notifyMeridianJobTerminalFailure,
  getMeridianOpsTenantKey,
} = require('../../services/meridianOpsNotifyService');

const RUN_ID = '507f191e810c19729de860ea';
const ADMIN_GLOBAL_ID = '507f191e810c19729de860eb';
const TENANT_USER_ID = '507f191e810c19729de860ec';

const failedRun = {
  _id: RUN_ID,
  runKey: 'ritual_crew_scan:nyc:manual',
  type: 'ritual_crew_scan',
  tenantKey: 'nyc',
  status: 'failed',
  lastError: 'Expo timeout <retry>',
  attemptCount: 3,
  maxAttempts: 3,
  payload: { batchWeek: '2026-W38' },
  failureAlertSentAt: null,
};

describe('meridianOpsNotifyService', () => {
  let MeridianJobRun;
  let TenantMembership;
  let User;
  let sendEmail;

  beforeEach(() => {
    jest.clearAllMocks();
    sendEmail = jest.fn().mockResolvedValue({});
    getResend.mockReturnValue({ emails: { send: sendEmail } });
    MeridianJobRun = {
      findOneAndUpdate: jest.fn().mockResolvedValue({ ...failedRun }),
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
    };
    TenantMembership = {
      find: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { globalUserId: ADMIN_GLOBAL_ID, tenantUserId: TENANT_USER_ID, tenantKey: 'sf' },
        ]),
      }),
    };
    User = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            {
              _id: TENANT_USER_ID,
              roles: ['admin'],
              pushToken: 'ExponentPushToken[ops]',
            },
          ]),
        }),
      }),
    };
    getGlobalModels.mockImplementation((_req, ...names) => {
      const models = { MeridianJobRun, TenantMembership };
      return names.reduce((acc, name) => {
        acc[name] = models[name];
        return acc;
      }, {});
    });
    getModels.mockReturnValue({ User });
    connectToDatabase.mockResolvedValue({});
    listPlatformAdmins.mockResolvedValue({
      admins: [
        { email: 'OPS@example.com', globalUserId: ADMIN_GLOBAL_ID },
        { email: 'ops@example.com', globalUserId: ADMIN_GLOBAL_ID },
      ],
    });
    sendExpoPushToRecipients.mockResolvedValue({ sent: 1, failed: 0, developmentGateBlocked: 0 });
    delete process.env.MERIDIAN_OPS_TENANT_KEY;
    process.env.FRONTEND_URL = 'http://localhost:3000';
  });

  it('defaults the ops tenant to sf', () => {
    expect(getMeridianOpsTenantKey({})).toBe('sf');
    expect(getMeridianOpsTenantKey({ MERIDIAN_OPS_TENANT_KEY: 'NYC' })).toBe('nyc');
  });

  it('builds a Notifications run-detail payload and escaped email HTML', () => {
    const payload = buildMeridianOpsNotifyPayload(failedRun);
    expect(payload.inspectorHref).toBe(
      `/platform-admin/pivot/nyc?page=9&jobRunId=${RUN_ID}&batchWeek=2026-W38`,
    );
    expect(payload.inspectorUrl).toContain(payload.inspectorHref);
    expect(payload.subject).toContain('ritual_crew_scan');
    expect(buildMeridianOpsNotifyEmailHtml(payload)).toContain('Expo timeout &lt;retry&gt;');
    expect(buildMeridianOpsNotifyEmailHtml(payload)).toContain('Open Notifications run');
  });

  it('emails platform admins and pushes via expo on the ops tenant after reserving', async () => {
    const result = await notifyMeridianJobTerminalFailure(
      { globalDb: {} },
      { runId: RUN_ID },
    );

    expect(result.skipped).toBe(false);
    expect(result.email.emailed).toBe(true);
    expect(result.email.recipientCount).toBe(1);
    expect(MeridianJobRun.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: RUN_ID,
        status: 'failed',
        failureAlertSentAt: null,
      }),
      expect.objectContaining({
        $set: expect.objectContaining({ failureAlertClaimedAt: expect.any(Date) }),
      }),
      { new: true },
    );
    expect(MeridianJobRun.updateOne).toHaveBeenCalledWith(
      { _id: RUN_ID, failureAlertSentAt: null },
      expect.objectContaining({
        $set: expect.objectContaining({ failureAlertSentAt: expect.any(Date) }),
      }),
    );
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: ['ops@example.com'],
      subject: expect.stringContaining('Notification job failed'),
    }));
    expect(TenantMembership.find).toHaveBeenCalledWith({
      tenantKey: 'sf',
      status: 'active',
      globalUserId: { $in: [ADMIN_GLOBAL_ID] },
    });
    expect(sendExpoPushToRecipients).toHaveBeenCalledWith(
      'sf',
      expect.arrayContaining([expect.objectContaining({ _id: TENANT_USER_ID })]),
      expect.arrayContaining([
        expect.objectContaining({
          to: 'ExponentPushToken[ops]',
          title: 'Notification job failed',
          data: expect.objectContaining({
            pushType: 'meridian_job_failure',
            runId: RUN_ID,
            tenantKey: 'nyc',
          }),
        }),
      ]),
    );
  });

  it('dedupes when failureAlertSentAt is already set', async () => {
    MeridianJobRun.findOneAndUpdate.mockResolvedValue(null);
    const result = await notifyMeridianJobTerminalFailure({ globalDb: {} }, { run: failedRun });
    expect(result).toEqual({ skipped: true, reason: 'already_notified' });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(sendExpoPushToRecipients).not.toHaveBeenCalled();
  });

  it('still pushes when email delivery throws', async () => {
    getResend.mockReturnValue({ emails: { send: jest.fn().mockRejectedValue(new Error('down')) } });
    const result = await notifyMeridianJobTerminalFailure({ globalDb: {} }, { runId: RUN_ID });
    expect(result.skipped).toBe(false);
    expect(result.email.reason).toBe('send_error');
    expect(sendExpoPushToRecipients).toHaveBeenCalled();
  });

  it('releases the alert claim when both channels fail so a later tick can retry', async () => {
    getResend.mockReturnValue(null);
    listPlatformAdmins.mockResolvedValue({ admins: [] });
    sendExpoPushToRecipients.mockResolvedValue({ sent: 0, failed: 0 });

    const result = await notifyMeridianJobTerminalFailure({ globalDb: {} }, { runId: RUN_ID });

    expect(result.skipped).toBe(false);
    expect(result.delivered).toBe(false);
    expect(MeridianJobRun.updateOne).toHaveBeenCalledWith(
      { _id: RUN_ID, failureAlertSentAt: null },
      { $set: { failureAlertClaimedAt: null } },
    );
  });

  it('never throws when reservation fails', async () => {
    MeridianJobRun.findOneAndUpdate.mockRejectedValue(new Error('db down'));
    await expect(notifyMeridianJobTerminalFailure({ globalDb: {} }, { runId: RUN_ID }))
      .resolves.toMatchObject({ skipped: true, reason: 'notify_error' });
  });

  it('skips a missing run without reserving', async () => {
    const result = await notifyMeridianJobTerminalFailure({ globalDb: {} }, {});
    expect(result.reason).toBe('missing_run');
    expect(MeridianJobRun.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
