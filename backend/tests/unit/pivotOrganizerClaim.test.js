const mongoose = require('mongoose');
const { createMongoMemoryConnection } = require('../helpers/mongoMemory');
const getModels = require('../../services/getModelService');
const { runClaimOrganizer } = require('../../services/pivotOrganizerCatalogService');

describe('claim organizer (Task 5.1)', () => {
  let mongo;
  let db;
  let Event;
  let PivotOrganizer;
  const tenantKey = 'nyc';
  const hostingId = new mongoose.Types.ObjectId();
  const userA = new mongoose.Types.ObjectId();
  const userB = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    mongo = await createMongoMemoryConnection();
    db = mongo.connection;
    ({ Event, PivotOrganizer } = getModels({ db, school: tenantKey }, 'Event', 'PivotOrganizer'));
    await PivotOrganizer.syncIndexes();
  });

  afterEach(async () => {
    await mongo.reset();
    await PivotOrganizer.syncIndexes();
  });

  afterAll(async () => {
    await mongo.cleanup();
  });

  function organizerDoc(overrides = {}) {
    return {
      tenantKey,
      canonicalName: 'Alice Chen',
      normalizedName: 'alice chen',
      ...overrides,
    };
  }

  function eventDoc({ organizerIds, name, source, createdByUserId } = {}) {
    return {
      name: name || 'Sunset Listening',
      type: 'social',
      location: 'The Chapel',
      start_time: new Date('2026-07-24T20:00:00.000Z'),
      end_time: new Date('2026-07-24T23:00:00.000Z'),
      status: 'not-applicable',
      visibility: 'public',
      expectedAttendance: 50,
      hostingType: 'Org',
      hostingId,
      customFields: {
        pivot: {
          batchWeek: '2026-W30',
          ingestStatus: 'published',
          source: source || 'partiful',
          ...(createdByUserId ? { createdByUserId } : {}),
          host: {
            name: 'Alice',
            organizerIds: (organizerIds || []).map((id) => String(id)),
          },
        },
      },
    };
  }

  function grantFor(userId) {
    return async ({ globalUserId }) =>
      String(globalUserId) === String(userId) ? { status: 'active', globalUserId } : null;
  }

  async function claim(organizerId, { globalUserId, unclaim, findActiveGrant } = {}) {
    return runClaimOrganizer({
      db,
      tenantKey,
      organizerId,
      globalUserId,
      unclaim,
      findActiveGrant: findActiveGrant || grantFor(globalUserId),
    });
  }

  it('requires an active creator grant for the user + city', async () => {
    const organizer = await PivotOrganizer.create(organizerDoc());

    const missing = await runClaimOrganizer({
      db,
      tenantKey,
      organizerId: organizer._id,
      globalUserId: userA,
    });
    expect(missing.code).toBe('CREATOR_GRANT_REQUIRED');
    expect(missing.status).toBe(409);

    const revoked = await runClaimOrganizer({
      db,
      tenantKey,
      organizerId: organizer._id,
      globalUserId: userA,
      findActiveGrant: async () => null,
    });
    expect(revoked.code).toBe('CREATOR_GRANT_REQUIRED');

    const otherCity = await runClaimOrganizer({
      db,
      tenantKey,
      organizerId: organizer._id,
      globalUserId: userA,
      findActiveGrant: async ({ tenantKey: key }) =>
        key === 'brooklyn' ? { status: 'active' } : null,
    });
    expect(otherCity.code).toBe('CREATOR_GRANT_REQUIRED');

    const after = await PivotOrganizer.findById(organizer._id).lean();
    expect(after.claimStatus).toBe('unclaimed');
    expect(after.claimedByUserId).toBeNull();
  });

  it('claims when the user has an active grant', async () => {
    const organizer = await PivotOrganizer.create(organizerDoc());

    const result = await claim(organizer._id, { globalUserId: userA });

    expect(result.error).toBeUndefined();
    expect(result.data.alreadyClaimed).toBe(false);
    expect(result.data.organizer.claimStatus).toBe('claimed');
    expect(result.data.organizer.claimedByUserId).toBe(String(userA));

    const stored = await PivotOrganizer.findById(organizer._id).lean();
    expect(stored.claimStatus).toBe('claimed');
    expect(String(stored.claimedByUserId)).toBe(String(userA));
  });

  it('rejects a second claim by another user', async () => {
    const organizer = await PivotOrganizer.create(
      organizerDoc({ claimStatus: 'claimed', claimedByUserId: userA }),
    );

    const result = await claim(organizer._id, { globalUserId: userB });

    expect(result.code).toBe('ORGANIZER_ALREADY_CLAIMED');
    expect(result.status).toBe(409);
    expect(result.error).toMatch(/already claimed by another user/i);

    const stored = await PivotOrganizer.findById(organizer._id).lean();
    expect(stored.claimStatus).toBe('claimed');
    expect(String(stored.claimedByUserId)).toBe(String(userA));
  });

  it('is idempotent when the same user claims again', async () => {
    const organizer = await PivotOrganizer.create(
      organizerDoc({ claimStatus: 'claimed', claimedByUserId: userA }),
    );

    const result = await claim(organizer._id, { globalUserId: userA });

    expect(result.error).toBeUndefined();
    expect(result.data.alreadyClaimed).toBe(true);
    expect(result.data.organizer.claimedByUserId).toBe(String(userA));
  });

  it('unclaims without requiring a grant, then allows a new claim', async () => {
    const organizer = await PivotOrganizer.create(
      organizerDoc({ claimStatus: 'claimed', claimedByUserId: userA }),
    );

    const cleared = await runClaimOrganizer({
      db,
      tenantKey,
      organizerId: organizer._id,
      unclaim: true,
    });
    expect(cleared.error).toBeUndefined();
    expect(cleared.data.unclaimed).toBe(true);
    expect(cleared.data.organizer.claimStatus).toBe('unclaimed');
    expect(cleared.data.organizer.claimedByUserId).toBeNull();

    const reassigned = await claim(organizer._id, { globalUserId: userB });
    expect(reassigned.error).toBeUndefined();
    expect(reassigned.data.organizer.claimedByUserId).toBe(String(userB));
  });

  it('does not rewrite scraped event source or createdByUserId', async () => {
    const organizer = await PivotOrganizer.create(organizerDoc());
    const luma = await Event.create(
      eventDoc({ organizerIds: [organizer._id], name: 'Luma Night', source: 'luma' }),
    );
    const partiful = await Event.create(
      eventDoc({
        organizerIds: [organizer._id],
        name: 'Partiful Night',
        source: 'partiful',
      }),
    );

    const result = await claim(organizer._id, { globalUserId: userA });
    expect(result.error).toBeUndefined();

    const lumaAfter = await Event.findById(luma._id).lean();
    const partifulAfter = await Event.findById(partiful._id).lean();
    expect(lumaAfter.customFields.pivot.source).toBe('luma');
    expect(partifulAfter.customFields.pivot.source).toBe('partiful');
    expect(lumaAfter.customFields.pivot.createdByUserId).toBeUndefined();
    expect(partifulAfter.customFields.pivot.createdByUserId).toBeUndefined();
    expect(lumaAfter.customFields.pivot.host.organizerIds).toEqual([String(organizer._id)]);
  });

  it('rejects invalid ids and hides merged tombstones', async () => {
    const invalid = await claim('not-an-id', { globalUserId: userA });
    expect(invalid.code).toBe('ORGANIZER_INVALID_ID');

    const missingUser = await runClaimOrganizer({
      db,
      tenantKey,
      organizerId: new mongoose.Types.ObjectId(),
      globalUserId: 'not-an-id',
      findActiveGrant: async () => ({ status: 'active' }),
    });
    expect(missingUser.code).toBe('ORGANIZER_NOT_FOUND');

    const badUser = await runClaimOrganizer({
      db,
      tenantKey,
      organizerId: (await PivotOrganizer.create(organizerDoc()))._id,
      globalUserId: 'not-an-id',
      findActiveGrant: async () => ({ status: 'active' }),
    });
    expect(badUser.code).toBe('INVALID_GLOBAL_USER_ID');

    const tombstone = await PivotOrganizer.create(
      organizerDoc({
        canonicalName: 'Retired',
        normalizedName: 'retired',
        status: 'merged',
        mergedInto: new mongoose.Types.ObjectId(),
      }),
    );
    const merged = await claim(tombstone._id, { globalUserId: userA });
    expect(merged.code).toBe('ORGANIZER_NOT_FOUND');
  });
});
