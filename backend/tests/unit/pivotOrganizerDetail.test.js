const mongoose = require('mongoose');
const { createMongoMemoryConnection } = require('../helpers/mongoMemory');
const getModels = require('../../services/getModelService');
const { runGetOrganizer } = require('../../services/pivotOrganizerCatalogService');

describe('runGetOrganizer (Task 4.3)', () => {
  let mongo;
  let db;
  let Event;
  let PivotOrganizer;
  let PivotEventIntent;
  const tenantKey = 'nyc';
  const hostingId = new mongoose.Types.ObjectId();
  const userA = new mongoose.Types.ObjectId();
  const userB = new mongoose.Types.ObjectId();
  const userC = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    mongo = await createMongoMemoryConnection();
    db = mongo.connection;
    ({ Event, PivotOrganizer, PivotEventIntent } = getModels(
      { db, school: tenantKey },
      'Event',
      'PivotOrganizer',
      'PivotEventIntent',
    ));
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

  function eventDoc({ organizerIds, name, batchWeek, start } = {}) {
    return {
      name: name || 'Sunset Listening',
      type: 'social',
      location: 'The Chapel',
      start_time: start || new Date('2026-07-24T20:00:00.000Z'),
      end_time: new Date('2026-07-24T23:00:00.000Z'),
      status: 'not-applicable',
      visibility: 'public',
      expectedAttendance: 50,
      hostingType: 'Org',
      hostingId,
      customFields: {
        pivot: {
          batchWeek: batchWeek || '2026-W30',
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

  async function detail(organizerId) {
    return runGetOrganizer({ db, tenantKey, organizerId });
  }

  it('returns 400 for an invalid organizer id', async () => {
    const result = await detail('unlinked');
    expect(result.code).toBe('ORGANIZER_INVALID_ID');
    expect(result.status).toBe(400);
  });

  it('returns 404 for missing or merged organizers', async () => {
    const missing = await detail(new mongoose.Types.ObjectId());
    expect(missing.code).toBe('ORGANIZER_NOT_FOUND');

    const tombstone = await PivotOrganizer.create(
      organizerDoc({ status: 'merged', mergedInto: new mongoose.Types.ObjectId() }),
    );
    const merged = await detail(tombstone._id);
    expect(merged.code).toBe('ORGANIZER_NOT_FOUND');
  });

  it('lists events from multiple weeks and matches a manual audience count', async () => {
    const alice = await PivotOrganizer.create(
      organizerDoc({
        aliases: [{ name: 'Alice', normalized: 'alice', source: 'resolve' }],
        identities: [
          {
            provider: 'partiful',
            name: 'Alice Chen',
            profileUrl: 'https://partiful.com/u/alice',
          },
        ],
      }),
    );

    const [june, august] = await Event.create([
      eventDoc({
        organizerIds: [alice._id],
        name: 'June set',
        batchWeek: '2026-W28',
        start: new Date('2026-07-08T20:00:00.000Z'),
      }),
      eventDoc({
        organizerIds: [alice._id],
        name: 'August set',
        batchWeek: '2026-W33',
        start: new Date('2026-08-12T20:00:00.000Z'),
      }),
    ]);

    await PivotEventIntent.create([
      {
        userId: userA,
        eventId: june._id,
        batchWeek: '2026-W28',
        status: 'interested',
        externalOpenCount: 2,
      },
      {
        userId: userA,
        eventId: august._id,
        batchWeek: '2026-W33',
        status: 'registered',
        externalOpenCount: 1,
      },
      {
        userId: userB,
        eventId: august._id,
        batchWeek: '2026-W33',
        status: 'interested',
      },
      {
        userId: userC,
        eventId: june._id,
        batchWeek: '2026-W28',
        status: 'passed',
      },
    ]);

    const result = await detail(alice._id);
    expect(result.data.organizer.canonicalName).toBe('Alice Chen');
    expect(result.data.organizer.providers).toEqual(['partiful']);
    expect(result.data.organizer.identities[0].profileUrl).toBe(
      'https://partiful.com/u/alice',
    );
    expect(result.data.events.map((row) => row.name)).toEqual(['August set', 'June set']);
    expect(result.data.events.map((row) => row.batchWeek)).toEqual([
      '2026-W33',
      '2026-W28',
    ]);
    expect(result.data.events[0].intentStats.interested).toBe(1);
    expect(result.data.events[0].intentStats.registered).toBe(1);
    expect(result.data.events[1].intentStats.interested).toBe(1);
    expect(result.data.events[1].intentStats.passed).toBe(1);

    // Manual: A interested+registered (2 events), B interested, C passed.
    // unique interested = A+B = 2; registered = A = 1; passed = C = 1;
    // externalOpens = 2+1 = 3; repeatUsers = A only = 1.
    expect(result.data.audience).toEqual({
      interested: 2,
      registered: 1,
      passed: 1,
      externalOpens: 3,
      repeatUsers: 1,
    });
  });
});
