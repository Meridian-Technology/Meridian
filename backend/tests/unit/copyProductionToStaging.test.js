const { transformDocument, residualEmails } = require('../../migrations/copyProductionToStaging');

const ctx = {
  adminGlobalUserIds: new Set(['g-admin']),
  keptGlobalUserIds: new Set(['g-admin', 'g-sf-user']),
  adminTenantUserIds: new Map([['sf', new Set(['t-admin'])], ['ic', new Set()]]),
  adminEmails: new Set(['admin@meridian.study']),
};

describe('copyProductionToStaging transform', () => {
  it('keeps only sf and ic tenants in tenant_config and strips every mongoUri', () => {
    const doc = transformDocument('global', 'tenant_config', {
      _id: 'cfg',
      tenants: [
        { tenantKey: 'sf', mongoUri: 'mongodb+srv://prod/sf', mongoDatabaseName: 'sf' },
        { tenantKey: 'ic', mongoUri: 'mongodb+srv://prod/ic' },
        { tenantKey: 'rpi', mongoUri: 'mongodb+srv://prod/studycompass' },
      ],
    }, ctx);
    expect(doc.tenants).toEqual([{ tenantKey: 'sf', mongoDatabaseName: 'sf' }, { tenantKey: 'ic' }]);
  });

  it('drops rows owned by excluded tenants and keeps tenant-less rows', () => {
    expect(transformDocument('global', 'tenant_memberships', { _id: 1, tenantKey: 'rpi' }, ctx)).toBeNull();
    expect(transformDocument('global', 'pivot_carousel_accounts', { _id: 2, ownerTenantKey: 'nyc' }, ctx)).toBeNull();
    expect(transformDocument('global', 'tenant_memberships', { _id: 3, tenantKey: 'ic' }, ctx)).toMatchObject({ tenantKey: 'ic' });
    expect(transformDocument('global', 'pivot_carousel_accounts', { _id: 4, ownerTenantKey: null, sourceTenantKeys: ['sf', 'rpi'] }, ctx))
      .toMatchObject({ sourceTenantKeys: ['sf'] });
  });

  it('scrubs global users except platform admins, and drops users outside kept tenants', () => {
    expect(transformDocument('global', 'global_users', { _id: 'g-admin', email: 'admin@meridian.study', name: 'Admin' }, ctx))
      .toMatchObject({ email: 'admin@meridian.study', name: 'Admin' });
    const user = transformDocument('global', 'global_users', { _id: 'g-sf-user', email: 'a@b.com', name: 'Alex', picture: 'x', googleId: 'gid' }, ctx);
    expect(user).toEqual({ _id: 'g-sf-user', email: 'user-g-sf-user@staging.invalid', name: 'Staging user f-user', picture: null });
    expect(transformDocument('global', 'global_users', { _id: 'g-rpi-user', email: 'r@b.com' }, ctx)).toBeNull();
  });

  it('removes credentials from tenant users and keeps platform admins able to sign in', () => {
    const user = transformDocument('sf', 'users', {
      _id: 't-user', email: 'a@b.com', username: 'alex', name: 'Alex', picture: 'x', password: 'hash', refreshToken: 'r',
      pushToken: 'ExponentPushToken[a]', googleId: 'g', appleId: 'a', adminMfa: { totp: { secret: 's' } }, roles: ['user'],
    }, ctx);
    expect(user).toEqual({ _id: 't-user', email: 'user-t-user@staging.invalid', username: 'user-t-user', name: 'Staging user t-user', picture: null, roles: ['user'] });

    const admin = transformDocument('sf', 'users', { _id: 't-admin', email: 'admin@meridian.study', password: 'hash', refreshToken: 'r', pushToken: 'ExponentPushToken[b]' }, ctx);
    expect(admin).toEqual({ _id: 't-admin', email: 'admin@meridian.study', password: 'hash', pushToken: 'ExponentPushToken[b]' });
  });

  it('skips sessions, lead lists and notifications, and clears tracking fields', () => {
    expect(transformDocument('global', 'sessions', { _id: 1 }, ctx)).toBeNull();
    expect(transformDocument('global', 'justgo_waitlist', { _id: 1, email: 'a@b.com' }, ctx)).toBeNull();
    expect(transformDocument('ic', 'notifications', { _id: 1 }, ctx)).toBeNull();
    expect(transformDocument('sf', 'analytics_events', { _id: 1, ip_hash: 'h', user_agent_summary: 'ua', event: 'view' }, ctx)).toEqual({ _id: 1, event: 'view' });
  });

  it('reports emails that survive the scrub, ignoring scrubbed and admin addresses', () => {
    const found = residualEmails({ email: 'user-1@staging.invalid', owner: 'admin@meridian.study', description: 'Contact host@venue.com', nested: [{ to: 'x@y.org' }] }, ctx);
    expect([...found]).toEqual([['description', 1], ['nested[].to', 1]]);
  });
});
