const mongoose = require('mongoose');
const { createMongoMemoryConnection } = require('../helpers/mongoMemory');
const getModels = require('../../services/getModelService');
const {
  proposeOrganizerMerges,
} = require('../../services/pivotOrganizerCatalogService');

describe('proposeOrganizerMerges (Task 3.2)', () => {
  let mongo;
  let db;
  let PivotOrganizer;
  let Event;
  const tenantKey = 'nyc';
  const hostingId = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    mongo = await createMongoMemoryConnection();
    db = mongo.connection;
    ({ PivotOrganizer, Event } = getModels({ db, school: tenantKey }, 'PivotOrganizer', 'Event'));
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

  function eventDoc({ organizerIds, name, location, imageUrl } = {}) {
    return {
      name: name || 'Sunset Listening',
      type: 'social',
      location: location || 'The Chapel',
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
          host: {
            name: 'Host',
            organizerIds: organizerIds.map((id) => String(id)),
            ...(imageUrl ? { imageUrl } : {}),
          },
        },
      },
    };
  }

  async function propose() {
    return proposeOrganizerMerges({ db, tenantKey });
  }

  it('does not propose similar names without corroboration', async () => {
    const [alice, near] = await PivotOrganizer.create([
      organizerDoc(),
      organizerDoc({
        canonicalName: 'Alice Cheng',
        normalizedName: 'alice cheng',
      }),
    ]);

    await Event.create([
      eventDoc({
        organizerIds: [alice._id],
        name: 'Jazz Night',
        location: 'The Chapel',
      }),
      eventDoc({
        organizerIds: [near._id],
        name: 'Poetry Reading',
        location: 'Neck of the Woods',
      }),
    ]);

    const before = await Event.find().select('customFields.pivot.host.organizerIds').lean();
    const { proposals } = await propose();

    expect(proposals).toEqual([]);
    expect(await PivotOrganizer.countDocuments()).toBe(2);
    const after = await Event.find().select('customFields.pivot.host.organizerIds').lean();
    expect(after.map((row) => row.customFields.pivot.host.organizerIds)).toEqual(
      before.map((row) => row.customFields.pivot.host.organizerIds),
    );
  });

  it('proposes similar names that share a venue on exclusive events', async () => {
    const [alice, near] = await PivotOrganizer.create([
      organizerDoc(),
      organizerDoc({
        canonicalName: 'Alice Cheng',
        normalizedName: 'alice cheng',
      }),
    ]);

    await Event.create([
      eventDoc({
        organizerIds: [alice._id],
        name: 'Jazz Night',
        location: 'The Chapel',
      }),
      eventDoc({
        organizerIds: [near._id],
        name: 'Poetry Reading',
        location: 'The Chapel',
      }),
    ]);

    const { proposals } = await propose();
    expect(proposals).toHaveLength(1);
    expect(proposals[0].reasons).toEqual(['name-similarity', 'shared-venue']);
    expect(proposals[0].score).toBeGreaterThanOrEqual(0.72);
    expect([proposals[0].a.canonicalName, proposals[0].b.canonicalName].sort()).toEqual([
      'Alice Chen',
      'Alice Cheng',
    ]);
    expect(await PivotOrganizer.countDocuments()).toBe(2);
  });

  it('proposes similar names that share an imageUrl', async () => {
    const imageUrl = 'https://cdn.example/alice.png';
    await PivotOrganizer.create([
      organizerDoc({ imageUrl }),
      organizerDoc({
        canonicalName: 'Alice Cheng',
        normalizedName: 'alice cheng',
        imageUrl,
      }),
    ]);

    const { proposals } = await propose();
    expect(proposals).toHaveLength(1);
    expect(proposals[0].reasons).toEqual(['name-similarity', 'same-image']);
  });

  it('proposes similar names that share a recurring title token', async () => {
    const [alice, near] = await PivotOrganizer.create([
      organizerDoc(),
      organizerDoc({
        canonicalName: 'Alice Cheng',
        normalizedName: 'alice cheng',
      }),
    ]);

    await Event.create([
      eventDoc({
        organizerIds: [alice._id],
        name: 'Sunset Listening Downtown',
        location: 'The Chapel',
      }),
      eventDoc({
        organizerIds: [alice._id],
        name: 'Sunset Listening Uptown',
        location: 'Brooklyn Bowl',
      }),
      eventDoc({
        organizerIds: [near._id],
        name: 'Sunset Listening Late',
        location: 'Neck of the Woods',
      }),
    ]);

    const { proposals } = await propose();
    expect(proposals).toHaveLength(1);
    expect(proposals[0].reasons).toContain('shared-title-token');
    expect(proposals[0].reasons).toContain('name-similarity');
  });

  it('does not propose dissimilar names even with a shared venue', async () => {
    const [alice, bob] = await PivotOrganizer.create([
      organizerDoc(),
      organizerDoc({
        canonicalName: 'Bob Smith',
        normalizedName: 'bob smith',
      }),
    ]);

    await Event.create([
      eventDoc({ organizerIds: [alice._id], location: 'The Chapel' }),
      eventDoc({ organizerIds: [bob._id], location: 'The Chapel' }),
    ]);

    const { proposals } = await propose();
    expect(proposals).toEqual([]);
  });

  it('does not treat a co-hosted event as venue corroboration', async () => {
    const [alice, near] = await PivotOrganizer.create([
      organizerDoc(),
      organizerDoc({
        canonicalName: 'Alice Cheng',
        normalizedName: 'alice cheng',
      }),
    ]);

    await Event.create([
      eventDoc({
        organizerIds: [alice._id, near._id],
        name: 'Collab Night',
        location: 'The Chapel',
      }),
    ]);

    const { proposals } = await propose();
    expect(proposals).toEqual([]);
  });

  it('does not propose Roof Records vs roof records nyc without corroboration', async () => {
    await PivotOrganizer.create([
      organizerDoc({
        canonicalName: 'Roof Records',
        normalizedName: 'roof records',
      }),
      organizerDoc({
        canonicalName: 'roof records nyc',
        normalizedName: 'roof records nyc',
      }),
    ]);

    const { proposals } = await propose();
    expect(proposals).toEqual([]);
  });
});
