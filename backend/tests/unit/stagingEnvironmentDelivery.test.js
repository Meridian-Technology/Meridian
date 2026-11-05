jest.mock('../../connectionsManager', () => ({
  connectToGlobalDatabase: jest.fn(),
}));

jest.mock('../../services/getGlobalModelService', () => jest.fn());

jest.mock('axios', () => ({
  post: jest.fn(),
}));

const mockSend = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend }, batch: { send: jest.fn() } })),
}));

const axios = require('axios');
const { connectToGlobalDatabase } = require('../../connectionsManager');
const getGlobalModels = require('../../services/getGlobalModelService');
const { getResend } = require('../../services/resendClient');
const { postExpoPushBatch, isDevelopmentExpoPushGateEnforced } = require('../../services/expoPushDeliveryService');
const { STAGING_NOTICE, resetStagingEnvironmentCache, skipS3DeleteOnStaging } = require('../../utilities/stagingEnvironment');

const query = (rows) => ({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(rows) }) });

describe('staging delivery gate', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    resetStagingEnvironmentCache();
    process.env = { ...originalEnv, NODE_ENV: 'production', MERIDIAN_ENVIRONMENT: 'staging', RESEND_API_KEY: 're_test' };
    connectToGlobalDatabase.mockResolvedValue({});
    getGlobalModels.mockReturnValue({
      PlatformRole: { find: jest.fn((filter) => query(filter.globalUserId ? [{ globalUserId: 'g-admin', roles: ['platform_admin'] }] : [{ globalUserId: 'g-admin' }])) },
      GlobalUser: { find: jest.fn(() => query([{ email: 'Admin@Meridian.study' }])) },
      TenantMembership: {
        find: jest.fn(() => query([
          { tenantUserId: 'u-admin', globalUserId: 'g-admin' },
          { tenantUserId: 'u-tenant-admin', globalUserId: 'g-tenant-admin' },
        ])),
      },
    });
    mockSend.mockResolvedValue({ data: { id: 'email-1' }, error: null });
    axios.post.mockResolvedValue({ data: { data: [{ status: 'ok' }] } });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('delivers email to platform admins only, with the staging notice', async () => {
    const result = await getResend().emails.send({
      from: 'Meridian <support@meridian.study>',
      to: ['Admin <admin@meridian.study>', 'someone@example.com'],
      bcc: 'other@example.com',
      subject: 'Your event is tomorrow',
      html: '<p>Hello</p>',
    });

    expect(result.error).toBeNull();
    expect(mockSend).toHaveBeenCalledTimes(1);
    const sent = mockSend.mock.calls[0][0];
    expect(sent.to).toEqual(['Admin <admin@meridian.study>']);
    expect(sent.bcc).toBeUndefined();
    expect(sent.subject).toBe('[Staging] Your event is tomorrow');
    expect(sent.html).toContain('Staging environment.');
    expect(sent.html).toContain('no other users received it');
    expect(sent.html).toContain('2 other recipient(s) on this message were withheld.');
    expect(sent.html).toContain('<p>Hello</p>');
  });

  it('sends nothing when no recipient is a platform admin', async () => {
    const result = await getResend().emails.send({ to: 'someone@example.com', subject: 'Hi', text: 'Hello' });
    expect(mockSend).not.toHaveBeenCalled();
    expect(result).toEqual({ data: { id: null, suppressedOnStaging: true }, error: null });
  });

  it('adds the notice to plain-text email', async () => {
    await getResend().emails.send({ to: 'admin@meridian.study', subject: 'Hi', text: 'Hello' });
    expect(mockSend.mock.calls[0][0].text).toBe(`${STAGING_NOTICE}\n\nHello`);
  });

  it('exposes no other Resend API on staging', () => {
    expect(getResend().batch).toBeUndefined();
  });

  it('uses the real client outside staging', async () => {
    delete process.env.MERIDIAN_ENVIRONMENT;
    await getResend().emails.send({ to: 'someone@example.com', subject: 'Hi', html: '<p>Hello</p>' });
    expect(mockSend.mock.calls[0][0]).toEqual({ to: 'someone@example.com', subject: 'Hi', html: '<p>Hello</p>' });
  });

  it('enforces the push gate on staging even with the development override', () => {
    process.env.EXPO_PUSH_ALLOW_ALL_IN_DEVELOPMENT = 'true';
    expect(isDevelopmentExpoPushGateEnforced()).toBe(true);
  });

  it('pushes to platform admins only on staging, not tenant admins, and labels the message', async () => {
    const platformAdmin = { _id: 'u-admin', roles: ['user'], pushToken: 'ExponentPushToken[a]' };
    const tenantAdmin = { _id: 'u-tenant-admin', roles: ['admin'], pushToken: 'ExponentPushToken[b]' };
    const result = await postExpoPushBatch(
      [{ to: platformAdmin.pushToken, title: 'Drop is live', body: 'Swipe now' }, { to: tenantAdmin.pushToken, title: 'Drop is live', body: 'Swipe now' }],
      { tenantKey: 'sf', recipients: [platformAdmin, tenantAdmin] },
    );

    expect(result.developmentGateBlocked).toBe(1);
    expect(axios.post).toHaveBeenCalledTimes(1);
    const messages = axios.post.mock.calls[0][1];
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ to: 'ExponentPushToken[a]', title: '[Staging] Drop is live' });
    expect(messages[0].body).toContain('no other users received this');
  });

  it('skips S3 deletes on staging only', () => {
    expect(skipS3DeleteOnStaging('test')).toBe(true);
    delete process.env.MERIDIAN_ENVIRONMENT;
    expect(skipS3DeleteOnStaging('test')).toBe(false);
  });
});

describe('production is unchanged when MERIDIAN_ENVIRONMENT is unset', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    resetStagingEnvironmentCache();
    process.env = { ...originalEnv, NODE_ENV: 'production', RESEND_API_KEY: 're_test' };
    delete process.env.MERIDIAN_ENVIRONMENT;
    axios.post.mockResolvedValue({ data: { data: [{ status: 'ok' }, { status: 'ok' }] } });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('hands out the real Resend client and never looks up admins', () => {
    const client = getResend();
    expect(client).toBe(getResend());
    expect(client.emails.send).toBe(mockSend);
    expect(client.batch).toBeDefined();
    expect(getGlobalModels).not.toHaveBeenCalled();
  });

  it('pushes to every recipient with the message untouched and no gate lookups', async () => {
    const messages = [
      { to: 'ExponentPushToken[a]', title: 'Drop is live', body: 'Swipe now' },
      { to: 'ExponentPushToken[b]', title: 'Drop is live', body: 'Swipe now' },
    ];
    const result = await postExpoPushBatch(messages, { tenantKey: 'sf', recipients: [{ _id: 'u1', roles: ['user'] }, { _id: 'u2', roles: ['user'] }] });
    expect(isDevelopmentExpoPushGateEnforced()).toBe(false);
    expect(result.sent).toBe(2);
    expect(axios.post.mock.calls[0][1]).toEqual(messages);
    expect(connectToGlobalDatabase).not.toHaveBeenCalled();
  });

  it('still deletes S3 objects', () => {
    expect(skipS3DeleteOnStaging('test')).toBe(false);
  });
});
