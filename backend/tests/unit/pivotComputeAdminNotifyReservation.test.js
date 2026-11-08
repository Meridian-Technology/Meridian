const { createMongoMemoryConnection } = require('../helpers/mongoMemory');

jest.mock('../../services/resendClient', () => ({ getResend: jest.fn() }));
jest.mock('../../services/platformAdminInviteService', () => ({ listPlatformAdmins: jest.fn() }));

const getGlobalModels = require('../../services/getGlobalModelService');
const { getResend } = require('../../services/resendClient');
const { listPlatformAdmins } = require('../../services/platformAdminInviteService');
const { createComputeJob } = require('../../services/pivotComputeJobStore');
const { notifyAdminsOnComputeJob } = require('../../services/pivotComputeAdminNotifyService');

jest.setTimeout(120000);

// The service tests mock the model; this one runs the reservation against Mongo,
// where a freshly created job stores notifications as null.
describe('compute job admin email reservation on a stored job', () => {
  let mongo;
  let req;
  let send;
  let seq = 0;

  beforeAll(async () => {
    mongo = await createMongoMemoryConnection({ withGlobalDb: true });
    req = { globalDb: mongo.globalConnection };
  });

  afterAll(async () => {
    if (mongo) await mongo.cleanup();
  });

  beforeEach(async () => {
    await mongo.reset();
    send = jest.fn().mockResolvedValue({});
    getResend.mockReturnValue({ emails: { send } });
    listPlatformAdmins.mockResolvedValue({ admins: [{ email: 'ops@example.com' }] });
  });

  async function storedJob() {
    seq += 1;
    const externalJobId = `job:compose:notify-${seq}`;
    await createComputeJob(req, {
      externalJobId,
      kind: 'carousel-compose',
      cityKey: 'ic',
      contextVersion: 'ctx:compose.pending',
      createIdempotencyKey: `idem:notify-${seq}`,
      origin: { type: 'admin' },
      options: { editorialAccountKey: 'just.go.ic', proposedPublicationAt: '2026-11-09T00:00:00.000Z' },
    });
    const { PivotComputeJob } = getGlobalModels(req, 'PivotComputeJob');
    return PivotComputeJob.findOne({ externalJobId }).lean();
  }

  function notify(job, type = 'review-required') {
    return notifyAdminsOnComputeJob(req, {
      job,
      type,
      tenant: { location: 'Iowa City' },
      policy: { notifyAdminsEmail: true },
    });
  }

  async function notifications(externalJobId) {
    const { PivotComputeJob } = getGlobalModels(req, 'PivotComputeJob');
    return (await PivotComputeJob.findOne({ externalJobId }).lean()).notifications;
  }

  it('emails for a new job whose notifications are still null, once per type', async () => {
    const job = await storedJob();
    expect(job.notifications).toBeNull();

    const first = await notify(job);
    expect(first).toMatchObject({ emailed: true, recipientCount: 1 });
    expect(send).toHaveBeenCalledTimes(1);
    expect((await notifications(job.externalJobId)).email).toEqual([
      expect.objectContaining({ type: 'review-required', recipientCount: 1 }),
    ]);

    expect(await notify(job)).toMatchObject({ skipped: true, reason: 'already_notified' });
    expect(send).toHaveBeenCalledTimes(1);

    expect(await notify(job, 'apply-complete')).toMatchObject({ emailed: true });
    expect((await notifications(job.externalJobId)).email.map((row) => row.type))
      .toEqual(['review-required', 'apply-complete']);
  });

  it('keeps grokbot notices that were reserved first', async () => {
    const job = await storedJob();
    const { PivotComputeJob } = getGlobalModels(req, 'PivotComputeJob');
    await PivotComputeJob.updateOne(
      { externalJobId: job.externalJobId },
      { $set: { notifications: { grokbot: [{ event: 'wait', sentAt: new Date() }] } } },
    );

    expect(await notify(job)).toMatchObject({ emailed: true });
    const stored = await notifications(job.externalJobId);
    expect(stored.grokbot).toEqual([expect.objectContaining({ event: 'wait' })]);
    expect(stored.email).toEqual([expect.objectContaining({ type: 'review-required' })]);
  });
});
