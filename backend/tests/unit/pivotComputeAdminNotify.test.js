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

  it('requires an explicit supported type and a job', async () => {
    await expect(notifyAdminsOnComputeJob({}, { job, policy: {}, type: 'review-please' }))
      .resolves.toMatchObject({ skipped: true, reason: 'invalid_type' });
    await expect(notifyAdminsOnComputeJob({}, { policy: {}, type: 'failed' }))
      .resolves.toMatchObject({ skipped: true, reason: 'missing_job' });
    expect(PivotComputeJob.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('builds review-required and carousel-complete email bodies from explicit types', () => {
    const review = buildNotifyPayload({ job, tenant: { location: 'Brooklyn' }, type: 'review-required' });
    expect(review.subject).toContain('needs review');
    expect(buildNotifyEmailHtml(review)).toContain('Two events need review');

    const carousel = buildNotifyPayload({
      job: { ...job, kind: 'carousel-export', status: 'completed' },
      tenant: { location: 'Brooklyn' },
      type: 'carousel-complete',
    });
    expect(carousel.subject).toContain('Carousel export complete');
    expect(buildNotifyEmailHtml(carousel)).toContain('carousel export completed');
  });

  it('sends failed and review-required types through the same reservation path', async () => {
    const failed = await notifyAdminsOnComputeJob({}, {
      job: { ...job, status: 'failed', failure: { code: 'EXECUTION_FAILED', message: 'boom' } },
      policy: { notifyAdminsEmail: true },
      type: 'failed',
    });
    expect(failed.emailed).toBe(true);
    expect(PivotComputeJob.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ 'notifications.email.type': { $ne: 'failed' } }),
      expect.any(Object),
      expect.any(Object),
    );

    PivotComputeJob.findOneAndUpdate.mockResolvedValue({ ...job, notifications: { email: [] } });
    const review = await notifyAdminsOnComputeJob({}, {
      job,
      tenant: { location: 'Brooklyn' },
      type: 'review-required',
    });
    expect(review.emailed).toBe(true);
    expect(getResend().emails.send).toHaveBeenCalledTimes(2);
  });
});
