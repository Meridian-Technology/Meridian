const {
  resolveMobileAnalyticsTenant,
  prepareMigratedAnalyticsEvent,
  eventIdsSafeToRemove,
  isMobileAnalyticsEvent,
  normalizeAnalyticsUserId,
} = require('../../services/mobileAnalyticsMigration');

const NYC = '507f191e810c19729de860eb';
const RPI = '507f191e810c19729de860ec';

function index(memberships) {
  return {
    tenantKeys: new Set(['nyc', 'rpi']),
    membershipsByUser: new Map(memberships),
  };
}

describe('mobileAnalyticsMigration', () => {
  it('moves a stamped event to that city and tags Just Go', () => {
    const event = {
      _id: 'db',
      event_id: 'e1',
      event: 'pivot_card_view',
      platform: 'ios',
      app: 'meridian',
      properties: { tenantKey: 'NYC', batchWeek: '2026-W40' },
      user_id: NYC,
    };
    expect(isMobileAnalyticsEvent(event)).toBe(true);
    expect(isMobileAnalyticsEvent({ platform: 'web' })).toBe(false);
    const decision = resolveMobileAnalyticsTenant(event, index([]));
    expect(decision).toEqual({ tenantKey: 'nyc', reason: 'tenantKey' });
    const doc = prepareMigratedAnalyticsEvent(event, decision.tenantKey);
    expect(doc._id).toBeUndefined();
    expect(doc.app).toBe('justgo');
    expect(doc.properties).toEqual({ tenantKey: 'nyc', batchWeek: '2026-W40' });
    expect(doc.event_id).toBe('e1');
  });

  it('uses the only membership when the event has no city', () => {
    const event = { platform: 'ios', event: 'screen_view', user_id: RPI, properties: {} };
    expect(resolveMobileAnalyticsTenant(event, index([[RPI, ['rpi']]]))).toEqual({
      tenantKey: 'rpi',
      reason: 'membership',
    });
    expect(prepareMigratedAnalyticsEvent(event, 'rpi').app).toBe('meridian');
  });

  it('leaves anonymous events and people in several cities unmoved', () => {
    const known = index([[NYC, ['nyc', 'rpi']]]);
    expect(
      resolveMobileAnalyticsTenant({ platform: 'ios', user_id: null, properties: {} }, known),
    ).toEqual({ tenantKey: null, reason: 'unassigned' });
    expect(
      resolveMobileAnalyticsTenant({ platform: 'android', user_id: NYC, properties: {} }, known),
    ).toEqual({ tenantKey: null, reason: 'ambiguous' });
  });

  it('drops a non-object id and keeps a duplicate-safe delete list', () => {
    expect(normalizeAnalyticsUserId('not-an-id')).toBeNull();
    const docs = [{ event_id: 'ok' }, { event_id: 'dup' }, { event_id: 'bad' }];
    expect(
      eventIdsSafeToRemove(docs, {
        writeErrors: [
          { index: 1, code: 11000 },
          { index: 2, code: 50 },
        ],
      }),
    ).toEqual(['ok', 'dup']);
    expect(eventIdsSafeToRemove(docs, new Error('down'))).toEqual([]);
  });
});
