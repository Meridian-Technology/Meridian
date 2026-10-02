jest.mock('../../services/pivotWeeklyReportService', () => ({ sendWeeklyReport: jest.fn() }));
jest.mock('../../services/meridianJobSendClaim', () => ({
  claimMeridianJobExpoSend: jest.fn(),
  releaseMeridianJobExpoSend: jest.fn(),
}));

const { sendWeeklyReport } = require('../../services/pivotWeeklyReportService');
const {
  claimMeridianJobExpoSend,
  releaseMeridianJobExpoSend,
} = require('../../services/meridianJobSendClaim');
const {
  buildAdminWeeklyReportRunKey,
  executeAdminWeeklyReport,
} = require('../../services/meridianJobHandlers/adminWeeklyReport');
const { MeridianJobHandlerError } = require('../../services/meridianJobRegistry');

const req = { globalDb: {} };
const run = (payload = {}) => ({ _id: 'run1', tenantKey: 'sf', payload });

describe('admin_weekly_report handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    claimMeridianJobExpoSend.mockResolvedValue({ proceed: true });
  });

  it('keys runs by schedule slot', () => {
    expect(buildAdminWeeklyReportRunKey({ payload: { timeBucket: '2026-10-04T09:00' } }))
      .toBe('admin_weekly_report:2026-10-04T09:00');
    expect(buildAdminWeeklyReportRunKey({ payload: { timeBucket: '2026-10-04T09:00', dryRun: true } }))
      .toBe('admin_weekly_report:2026-10-04T09:00:dry');
  });

  it('sends to platform admins only, with no recipient override', async () => {
    sendWeeklyReport.mockResolvedValue({
      data: { sent: true, recipients: ['a@meridian.study', 'b@meridian.study'], period: 'sep 24 – sep 30' },
    });

    const result = await executeAdminWeeklyReport({
      run: run({ to: ['someone@else.com'], timeBucket: '2026-10-04T09:00' }),
      req,
    });

    expect(sendWeeklyReport).toHaveBeenCalledWith(req, expect.not.objectContaining({ to: expect.anything() }));
    expect(sendWeeklyReport.mock.calls[0][1]).toMatchObject({ dryRun: false });
    expect(result).toEqual({
      terminalStatus: 'succeeded',
      summary: expect.objectContaining({ attempted: 2, accepted: 2, message: 'report for sep 24 – sep 30' }),
    });
  });

  it('does not send twice for the same run', async () => {
    claimMeridianJobExpoSend.mockResolvedValue({ proceed: false });
    const result = await executeAdminWeeklyReport({ run: run(), req });
    expect(sendWeeklyReport).not.toHaveBeenCalled();
    expect(result.summary.message).toBe('skipped duplicate send');
  });

  it('previews on a dry run without claiming the send', async () => {
    sendWeeklyReport.mockResolvedValue({ data: { sent: false, recipients: ['a@meridian.study'] } });
    const result = await executeAdminWeeklyReport({ run: run({ dryRun: true }), req });
    expect(claimMeridianJobExpoSend).not.toHaveBeenCalled();
    expect(result.terminalStatus).toBe('preview');
    expect(result.summary.accepted).toBe(0);
  });

  it('releases the claim and fails when the send fails', async () => {
    sendWeeklyReport.mockResolvedValue({ error: 'No recipients for the weekly report.', status: 400, code: 'NO_RECIPIENTS' });
    const error = await executeAdminWeeklyReport({ run: run(), req }).catch((caught) => caught);
    expect(error).toBeInstanceOf(MeridianJobHandlerError);
    expect(error.retryable).toBe(false);
    expect(releaseMeridianJobExpoSend).toHaveBeenCalledWith(req, 'run1');

    sendWeeklyReport.mockResolvedValue({ error: 'provider down', status: 502, code: 'SEND_FAILED' });
    const retry = await executeAdminWeeklyReport({ run: run(), req }).catch((caught) => caught);
    expect(retry.retryable).toBe(true);
  });
});
