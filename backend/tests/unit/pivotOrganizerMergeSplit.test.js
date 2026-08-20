const mongoose = require('mongoose');
const { createMongoMemoryConnection } = require('../helpers/mongoMemory');
const getModels = require('../../services/getModelService');
const {
  runMergeOrganizers,
  runSplitOrganizer,
} = require('../../services/pivotOrganizerCatalogService');

describe('merge / split organizers (Task 3.4)', () => {
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

  function eventDoc({ organizerIds, name } = {}) {
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
          source: 'partiful',
          host: {
            name: 'Alice',
            organizerIds: (organizerIds || []).map((id) => String(id)),
          },
        },
      },
    };
  }

  it('rewrites event organizerIds and retires the source as a tombstone', async () => {
    const target = await PivotOrganizer.create(
      organizerDoc({
        aliases: [{ name: 'Alice Chen', normalized: 'alice chen', source: 'resolve' }],
        identities: [{ provider: 'luma', name: 'Alice Chen', profileUrl: 'https://luma.com/user/alice' }],
      }),
    );
    const source = await PivotOrganizer.create(
      organizerDoc({
        canonicalName: 'Alice Cheng',
        normalizedName: 'alice cheng',
        aliases: [{ name: 'Alice Cheng', normalized: 'alice cheng', source: 'resolve' }],
        identities: [
          { provider: 'partiful', name: 'Alice Cheng', profileUrl: 'https://partiful.com/u/alice' },
        ],
      }),
    );
    const event = await Event.create(
      eventDoc({ organizerIds: [source._id, target._id], name: 'Collab' }),
    );
    const onlySource = await Event.create(eventDoc({ organizerIds: [source._id], name: 'Solo' }));

    const result = await runMergeOrganizers({
      db,
      tenantKey,
      targetId: target._id,
      sourceId: source._id,
    });

    expect(result.error).toBeUndefined();
    expect(result.data.eventsRewritten).toBe(2);
    expect(result.data.target.identities).toHaveLength(2);
    expect(result.data.target.aliases.map((row) => row.name)).toEqual(
      expect.arrayContaining(['Alice Chen', 'Alice Cheng']),
    );
    expect(result.data.source.status).toBe('merged');
    expect(result.data.source.mergedInto).toBe(String(target._id));
    expect(result.data.source.identities).toEqual([]);

    const retired = await PivotOrganizer.findById(source._id).lean();
    expect(retired.status).toBe('merged');
    expect(retired.identities || []).toEqual([]);

    const collab = await Event.findById(event._id).lean();
    const solo = await Event.findById(onlySource._id).lean();
    expect(collab.customFields.pivot.host.organizerIds).toEqual([String(target._id)]);
    expect(solo.customFields.pivot.host.organizerIds).toEqual([String(target._id)]);
    expect(await PivotOrganizer.countDocuments()).toBe(2);
  });

  it('rejects merging two organizers claimed by different users', async () => {
    const target = await PivotOrganizer.create(
      organizerDoc({ claimStatus: 'claimed', claimedByUserId: userA }),
    );
    const source = await PivotOrganizer.create(
      organizerDoc({
        canonicalName: 'Alice Cheng',
        normalizedName: 'alice cheng',
        claimStatus: 'claimed',
        claimedByUserId: userB,
      }),
    );

    const result = await runMergeOrganizers({
      db,
      tenantKey,
      targetId: target._id,
      sourceId: source._id,
    });

    expect(result.code).toBe('ORGANIZER_ALREADY_CLAIMED');
    expect(result.status).toBe(409);
    expect((await PivotOrganizer.findById(source._id).lean()).status).toBe('active');
  });

  it('rejects merge-into-self and missing organizers', async () => {
    const target = await PivotOrganizer.create(organizerDoc());

    const self = await runMergeOrganizers({
      db,
      tenantKey,
      targetId: target._id,
      sourceId: target._id,
    });
    expect(self.code).toBe('ORGANIZER_MERGE_SELF');

    const missing = await runMergeOrganizers({
      db,
      tenantKey,
      targetId: target._id,
      sourceId: new mongoose.Types.ObjectId(),
    });
    expect(missing.code).toBe('ORGANIZER_NOT_FOUND');
  });

  it('splits selected events onto a new organizer and optionally detaches an identity', async () => {
    const source = await PivotOrganizer.create(
      organizerDoc({
        identities: [
          { provider: 'luma', name: 'Alice', profileUrl: 'https://luma.com/user/alice' },
          { provider: 'partiful', name: 'Alice', profileUrl: 'https://partiful.com/u/alice' },
        ],
      }),
    );
    const keep = await Event.create(eventDoc({ organizerIds: [source._id], name: 'Keep' }));
    const move = await Event.create(eventDoc({ organizerIds: [source._id], name: 'Move' }));

    const result = await runSplitOrganizer({
      db,
      tenantKey,
      organizerId: source._id,
      eventIds: [String(move._id)],
      newCanonicalName: 'Alice Partiful',
      identity: { provider: 'partiful', profileUrl: 'https://partiful.com/u/alice' },
    });

    expect(result.error).toBeUndefined();
    expect(result.data.eventsRewritten).toBe(1);
    expect(result.data.created.canonicalName).toBe('Alice Partiful');
    expect(result.data.created.identities).toHaveLength(1);
    expect(result.data.created.identities[0].provider).toBe('partiful');
    expect(result.data.source.identities).toHaveLength(1);
    expect(result.data.source.identities[0].provider).toBe('luma');

    const kept = await Event.findById(keep._id).lean();
    const moved = await Event.findById(move._id).lean();
    expect(kept.customFields.pivot.host.organizerIds).toEqual([String(source._id)]);
    expect(moved.customFields.pivot.host.organizerIds).toEqual([String(result.data.created.id)]);
  });

  it('rejects an empty eventIds split', async () => {
    const source = await PivotOrganizer.create(organizerDoc());
    const result = await runSplitOrganizer({
      db,
      tenantKey,
      organizerId: source._id,
      eventIds: [],
    });
    expect(result.code).toBe('ORGANIZER_SPLIT_EMPTY');
  });
});
