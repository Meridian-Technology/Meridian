const mongoose = require('mongoose');
const { createMongoMemoryConnection } = require('../helpers/mongoMemory');
const getModels = require('../../services/getModelService');
const {
  runListUnlinkedOrganizerEvents,
} = require('../../services/pivotOrganizerCatalogService');

describe('runListUnlinkedOrganizerEvents (Task 4.4)', () => {
  let mongo;
  let db;
  let Event;
  let PivotOrganizer;
  const tenantKey = 'nyc';
  const hostingId = new mongoose.Types.ObjectId();

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

  function eventDoc({ name, hostName, organizerIds, batchWeek } = {}) {
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
          batchWeek: batchWeek || '2026-W30',
          ingestStatus: 'published',
          source: 'partiful',
          host: {
            name: hostName || 'Alice',
            ...(organizerIds
              ? { organizerIds: organizerIds.map((id) => String(id)) }
              : { organizerIds: [] }),
          },
        },
      },
    };
  }

  it('lists leftover and ambiguous empty-organizerIds events, not linked ones', async () => {
    await PivotOrganizer.create([
      {
        tenantKey,
        canonicalName: 'Chapel',
        normalizedName: 'chapel',
      },
      {
        tenantKey,
        canonicalName: 'The Chapel',
        normalizedName: 'chapel',
      },
    ]);

    const linked = new mongoose.Types.ObjectId();
    const missingIds = eventDoc({
      name: 'No ids field',
      hostName: 'Solo leftover',
      batchWeek: '2026-W29',
    });
    delete missingIds.customFields.pivot.host.organizerIds;
    await Event.create([
      eventDoc({ name: 'Soup night', hostName: 'Alice & Bob', organizerIds: [] }),
      eventDoc({
        name: 'Chapel show',
        hostName: 'The Chapel',
        organizerIds: [],
        batchWeek: '2026-W33',
      }),
      eventDoc({ name: 'Linked set', hostName: 'Alice Chen', organizerIds: [linked] }),
      missingIds,
    ]);

    const result = await runListUnlinkedOrganizerEvents({ db, tenantKey });
    expect(result.data.events.map((row) => row.name)).toEqual([
      'Chapel show',
      'Soup night',
      'No ids field',
    ]);
    expect(result.data.leftover).toBe(2);
    expect(result.data.ambiguous).toBe(1);
    expect(result.data.events.find((row) => row.name === 'Soup night').kind).toBe('leftover');
    expect(result.data.events.find((row) => row.name === 'Chapel show').kind).toBe(
      'ambiguous',
    );
    expect(result.data.proposals).toEqual([]);
    expect(result.data.lastBackfill).toBeNull();
  });

  it('filters kind=ambiguous', async () => {
    await PivotOrganizer.create([
      { tenantKey, canonicalName: 'Chapel', normalizedName: 'chapel' },
      { tenantKey, canonicalName: 'The Chapel', normalizedName: 'chapel' },
    ]);
    await Event.create([
      eventDoc({ name: 'Soup night', hostName: 'Alice & Bob' }),
      eventDoc({ name: 'Chapel show', hostName: 'Chapel' }),
    ]);

    const result = await runListUnlinkedOrganizerEvents({
      db,
      tenantKey,
      kind: 'ambiguous',
    });
    expect(result.data.events.map((row) => row.name)).toEqual(['Chapel show']);
    expect(result.data.total).toBe(1);
    expect(result.data.ambiguous).toBe(1);
    expect(result.data.leftover).toBe(1);
  });
});
