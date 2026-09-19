jest.mock('../../services/getGlobalModelService', () => jest.fn());
jest.mock('../../services/resendClient', () => ({ getResend: jest.fn() }));
jest.mock('../../services/platformAdminInviteService', () => ({ listPlatformAdmins: jest.fn() }));

const getGlobalModels = require('../../services/getGlobalModelService');
const { getResend } = require('../../services/resendClient');
const { listPlatformAdmins } = require('../../services/platformAdminInviteService');
const { buildNotifyPayload, buildNotifyEmailHtml, notifyAdminsOnComputeJob } = require('../../services/pivotComputeAdminNotifyService');

const job = {
  externalJobId: 'compute-1', tenantKey: 'brooklyn', kind: 'refresh', status: 'completed',
  result: { embedded: { summary: 'Two events need review' } },
  applicationAudit: { buckets: [{ entityType: 'event', disposition: 'created', ingestStatus: 'published', batchWeek: '2026-W21', count: 2 }], rows: [{ name: 'Night <Market>', disposition: 'created', ingestStatus: 'published' }] },
};

describe('pivotComputeAdminNotifyService', () => {
  let PivotComputeJob;
  beforeEach(() => {
    jest.clearAllMocks();
    PivotComputeJob = { findOneAndUpdate: jest.fn().mockResolvedValue({ ...job, notifications: { email: [] } }), updateOne: jest.fn().mockResolvedValue({}) };
    getGlobalModels.mockReturnValue({ PivotComputeJob });
    listPlatformAdmins.mockResolvedValue({ admins: [{ email: 'OPS@example.com' }, { email: 'ops@example.com' }] });
    getResend.mockReturnValue({ emails: { send: jest.fn().mockResolvedValue({}) } });
  });

  it('builds an apply-complete payload and bounded manifest HTML', () => {
    const payload = buildNotifyPayload({ job, tenant: { location: 'Brooklyn' }, type: 'apply-complete' });
    expect(payload.inspectorHref).toContain('page=10');
    expect(payload.rows).toHaveLength(1);
    expect(buildNotifyEmailHtml(payload)).toContain('Night &lt;Market&gt;');
  });

  it('reserves notification before sending and deduplicates it', async () => {
    const result = await notifyAdminsOnComputeJob({}, { job, tenant: { location: 'Brooklyn' }, policy: { notifyAdminsEmail: true }, type: 'apply-complete' });
    expect(result.emailed).toBe(true);
    expect(PivotComputeJob.findOneAndUpdate).toHaveBeenCalledWith(expect.objectContaining({ 'notifications.email.type': { $ne: 'apply-complete' } }), expect.any(Object), expect.any(Object));
    expect(getResend().emails.send).toHaveBeenCalledTimes(1);
    expect(PivotComputeJob.updateOne).toHaveBeenCalled();
  });

  it('honors the tenant and environment email kill switches', async () => {
    const disabled = await notifyAdminsOnComputeJob({}, { job, policy: { notifyAdminsEmail: false }, type: 'failed' });
    expect(disabled.reason).toBe('notifications_disabled');
    expect(PivotComputeJob.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('never throws when delivery fails', async () => {
    getResend.mockReturnValue({ emails: { send: jest.fn().mockRejectedValue(new Error('down')) } });
    await expect(notifyAdminsOnComputeJob({}, { job, policy: {}, type: 'failed' })).resolves.toMatchObject({ skipped: true, reason: 'notify_error' });
  });
});
