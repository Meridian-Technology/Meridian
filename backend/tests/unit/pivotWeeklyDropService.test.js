jest.mock('../../connectionsManager', () => ({
  connectToDatabase: jest.fn(),
}));

jest.mock('../../services/getModelService', () => jest.fn());

jest.mock('../../services/tenantConfigService', () => ({
  getTenantByKey: jest.fn(),
  upsertStoredTenantRow: jest.fn(),
  serializeTenantForAdmin: jest.fn((tenant) => tenant),
}));

jest.mock('../../services/pivotWeeklySnapshotService', () => ({
  rebuildWeeklySnapshot: jest.fn(),
}));

jest.mock('axios', () => ({
  post: jest.fn(),
}));

const axios = require('axios');
const { rebuildWeeklySnapshot } = require('../../services/pivotWeeklySnapshotService');
const { connectToDatabase } = require('../../connectionsManager');
const getModels = require('../../services/getModelService');
const { getTenantByKey, upsertStoredTenantRow } = require('../../services/tenantConfigService');
const {
  getWeeklyDropStatus,
  sendWeeklyDropPush,
  updateWeeklyDropConfig,
  resolveWeeklyDropPushCopy,
  PUSH_TITLE,
  PUSH_BODY,
} = require('../../services/pivotWeeklyDropService');

describe('pivotWeeklyDropService', () => {
  const nycTenant = {
    tenantKey: 'nyc',
    tenantType: 'pivot',
    pivotDropTimezone: 'America/New_York',
    pivotDropDayOfWeek: 4,
    pivotDropHour: 18,
    pivotDropMinute: 0,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    connectToDatabase.mockResolvedValue({});
    getModels.mockImplementation(() => ({
      Event: { countDocuments: jest.fn().mockResolvedValue(3) },
      User: {
        countDocuments: jest.fn().mockResolvedValue(2),
        find: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([
              { _id: '1', pushToken: 'ExponentPushToken[a]' },
              { _id: '2', pushToken: 'ExponentPushToken[b]' },
            ]),
          }),
        }),
      },
    }));
  });

  it('getWeeklyDropStatus returns resolved drop schedule', async () => {
    getTenantByKey.mockResolvedValue(nycTenant);

    const result = await getWeeklyDropStatus({}, 'nyc', '2026-W23');

    expect(result.dropSchedule.batchWeek).toBe('2026-W23');
    expect(result.dropSchedule.nextDropFormatted).toMatch(/Thu Jun 4/);
    expect(result.publishedEventCount).toBe(3);
    expect(result.pivotPushRecipientCount).toBe(2);
    expect(result.dropSchedule.pushCopy.title).toBe(PUSH_TITLE);
  });

  it('resolveWeeklyDropPushCopy prefers per-week override and tenant defaults', () => {
    const tenant = {
      pivotDropPushTitle: 'NYC drop',
      pivotDropPushBody: 'Swipe the week',
      pivotDropOverrides: [
        {
          batchWeek: '2026-W23',
          pushTitle: 'W23 special',
          pushBody: 'Only this week',
        },
      ],
    };

    expect(resolveWeeklyDropPushCopy(tenant, '2026-W24')).toEqual({
      title: 'NYC drop',
      body: 'Swipe the week',
      source: 'tenant',
    });
    expect(resolveWeeklyDropPushCopy(tenant, '2026-W23')).toEqual({
      title: 'W23 special',
      body: 'Only this week',
      source: 'override',
    });
    expect(
      resolveWeeklyDropPushCopy(tenant, '2026-W23', {
        pushTitle: 'One-off',
        pushBody: 'Tonight only',
      })
    ).toEqual({
      title: 'One-off',
      body: 'Tonight only',
      source: 'send',
    });
  });

  it('sendWeeklyDropPush dry-run uses custom push copy', async () => {
    getTenantByKey.mockResolvedValue(nycTenant);

    const result = await sendWeeklyDropPush({}, 'nyc', {
      batchWeek: '2026-W23',
      dryRun: true,
      force: true,
      pushTitle: 'Iowa City is live',
      pushBody: '52 events waiting for you',
    });

    expect(result.dryRun).toBe(true);
    expect(result.pushCopy.title).toBe('Iowa City is live');
    expect(result.sampleMessage?.title).toBe('Iowa City is live');
    expect(result.sampleMessage?.body).toBe('52 events waiting for you');
    expect(rebuildWeeklySnapshot).not.toHaveBeenCalled();
  });

  it('updateWeeklyDropConfig persists drop fields', async () => {
    getTenantByKey.mockResolvedValue(nycTenant);
    upsertStoredTenantRow.mockResolvedValue({
      ...nycTenant,
      pivotDropHour: 17,
    });

    const result = await updateWeeklyDropConfig(
      {},
      'nyc',
      { pivotDropHour: 17, batchWeek: '2026-W23' },
      'admin-id'
    );

    expect(upsertStoredTenantRow).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ pivotDropHour: 17 }),
      'admin-id'
    );
    expect(result.dropSchedule.hour).toBe(17);
  });

  it('sendWeeklyDropPush dry-run does not call Expo', async () => {
    getTenantByKey.mockResolvedValue(nycTenant);

    const result = await sendWeeklyDropPush({}, 'nyc', {
      batchWeek: '2026-W23',
      dryRun: true,
      force: true,
    });

    expect(result.dryRun).toBe(true);
    expect(result.pivotPushRecipientCount).toBe(2);
    expect(result.sampleMessage?.data?.type).toBe('pivot_week');
    expect(rebuildWeeklySnapshot).not.toHaveBeenCalled();
  });

  it('sendWeeklyDropPush rebuilds the weekly snapshot after a real send', async () => {
    getTenantByKey.mockResolvedValue(nycTenant);
    axios.post.mockResolvedValue({
      data: { data: [{ status: 'ok' }, { status: 'ok' }] },
    });
    rebuildWeeklySnapshot.mockResolvedValue({ data: { batchWeek: '2026-W23' } });

    const req = {};
    const result = await sendWeeklyDropPush(req, 'nyc', {
      batchWeek: '2026-W23',
      force: true,
    });

    expect(result.sent).toBe(2);
    expect(result.snapshotRebuilt).toBe(true);
    expect(rebuildWeeklySnapshot).toHaveBeenCalledWith(req, { batchWeek: '2026-W23' });
  });

  it('sendWeeklyDropPush still reports the send when snapshot rebuild fails', async () => {
    getTenantByKey.mockResolvedValue(nycTenant);
    axios.post.mockResolvedValue({
      data: { data: [{ status: 'ok' }, { status: 'ok' }] },
    });
    rebuildWeeklySnapshot.mockRejectedValue(new Error('global db down'));

    const result = await sendWeeklyDropPush({}, 'nyc', {
      batchWeek: '2026-W23',
      force: true,
    });

    expect(result.sent).toBe(2);
    expect(result.snapshotRebuilt).toBe(false);
  });
});
