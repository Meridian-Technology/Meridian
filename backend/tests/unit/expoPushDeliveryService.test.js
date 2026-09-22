jest.mock('../../connectionsManager', () => ({
  connectToGlobalDatabase: jest.fn(),
}));

jest.mock('../../services/getGlobalModelService', () => jest.fn());

jest.mock('axios', () => ({
  post: jest.fn(),
}));

const axios = require('axios');
const { connectToGlobalDatabase } = require('../../connectionsManager');
const getGlobalModels = require('../../services/getGlobalModelService');
const {
  isDevelopmentExpoPushGateEnforced,
  filterTenantUsersForExpoPushDelivery,
  postExpoPushBatch,
} = require('../../services/expoPushDeliveryService');

describe('expoPushDeliveryService development gate', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, NODE_ENV: 'development' };
    delete process.env.EXPO_PUSH_ALLOW_ALL_IN_DEVELOPMENT;
    connectToGlobalDatabase.mockResolvedValue({});
    getGlobalModels.mockReturnValue({
      TenantMembership: {
        find: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([]),
          }),
        }),
      },
      PlatformRole: {
        find: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([]),
          }),
        }),
      },
    });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('enforces gate in development by default', () => {
    expect(isDevelopmentExpoPushGateEnforced()).toBe(true);
  });

  it('allows override with EXPO_PUSH_ALLOW_ALL_IN_DEVELOPMENT', () => {
    process.env.EXPO_PUSH_ALLOW_ALL_IN_DEVELOPMENT = 'true';
    expect(isDevelopmentExpoPushGateEnforced()).toBe(false);
  });

  it('keeps tenant admin users when gate is active', async () => {
    const users = [
      { _id: '1', roles: ['user'] },
      { _id: '2', roles: ['admin'] },
    ];
    const result = await filterTenantUsersForExpoPushDelivery('nyc', users);
    expect(result.users.map((row) => row._id)).toEqual(['2']);
    expect(result.blockedCount).toBe(1);
  });

  it('refuses batch without tenantKey in development', async () => {
    const result = await postExpoPushBatch([{ to: 'ExponentPushToken[x]' }], {});
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('sends to admin recipients in development', async () => {
    axios.post.mockResolvedValue({
      data: { data: [{ status: 'ok' }] },
    });
    const recipient = { _id: '2', roles: ['admin'], pushToken: 'ExponentPushToken[x]' };
    const result = await postExpoPushBatch([{ to: recipient.pushToken }], {
      tenantKey: 'nyc',
      recipients: [recipient],
    });
    expect(result.sent).toBe(1);
    expect(axios.post).toHaveBeenCalledTimes(1);
  });
});
