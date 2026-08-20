const mongoose = require('mongoose');
const { createMongoMemoryConnection } = require('../helpers/mongoMemory');
const getModels = require('../../services/getModelService');
const {
  runListOrganizers,
  ORGANIZER_LIST_DEFAULT_LIMIT,
} = require('../../services/pivotOrganizerCatalogService');

describe('runListOrganizers (Task 4.2)', () => {
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

  function organizerDoc(overrides = {}) {
    return {
      tenantKey,
      canonicalName: 'Alice Chen',
      normalizedName: 'alice chen',
      ...overrides,
    };
  }

  function eventDoc({ organizerIds, name, batchWeek } = {}) {
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
            name: 'Alice',
            organizerIds: (organizerIds || []).map((id) => String(id)),
          },
        },
      },
    };
  }

  async function list(options = {}) {
    return runListOrganizers({ db, tenantKey, ...options });
  }

  it('returns an empty city without a Curation week queue', async () => {
    const result = await list();
    expect(result.data.organizers).toEqual([]);
    expect(result.data.total).toBe(0);
    expect(result.data.audience).toBe('detail-only');
    expect(result.data.sort).toBe('events');
    expect(result.data.limit).toBe(ORGANIZER_LIST_DEFAULT_LIMIT);
  });

  it('hides merged tombstones and is not filtered by batchWeek', async () => {
    const [alice, bob, tombstone] = await PivotOrganizer.create([
      organizerDoc({
        identities: [{ provider: 'partiful', name: 'Alice Chen' }],
      }),
      organizerDoc({
        canonicalName: 'Bob Ruiz',
        normalizedName: 'bob ruiz',
        identities: [{ provider: 'luma', name: 'Bob Ruiz' }],
      }),
      organizerDoc({
        canonicalName: 'Old Alice',
        normalizedName: 'old alice',
        status: 'merged',
      }),
    ]);

    await Event.create([
      eventDoc({ organizerIds: [alice._id], batchWeek: '2026-W28', name: 'June set' }),
      eventDoc({ organizerIds: [alice._id], batchWeek: '2026-W33', name: 'August set' }),
      eventDoc({ organizerIds: [bob._id], batchWeek: '2026-W33', name: 'Bob night' }),
    ]);

    const result = await list();
    expect(result.data.total).toBe(2);
    expect(result.data.organizers.map((row) => row.canonicalName)).toEqual([
      'Alice Chen',
      'Bob Ruiz',
    ]);
    expect(result.data.organizers.some((row) => row.id === String(tombstone._id))).toBe(false);

    const aliceRow = result.data.organizers[0];
    expect(aliceRow.eventCount).toBe(2);
    expect(aliceRow.weeksActive).toEqual(['2026-W33', '2026-W28']);
    expect(aliceRow.providers).toEqual(['partiful']);
    expect(aliceRow).not.toHaveProperty('audience');
  });

  it('matches search on canonical name and aliases', async () => {
    await PivotOrganizer.create([
      organizerDoc({
        aliases: [
          { name: 'The Chapel', normalized: 'chapel' },
          { name: 'Chapel', normalized: 'chapel' },
        ],
      }),
      organizerDoc({
        canonicalName: 'Roof Records',
        normalizedName: 'roof records',
      }),
    ]);

    const byAlias = await list({ q: 'chapel' });
    expect(byAlias.data.organizers.map((row) => row.canonicalName)).toEqual(['Alice Chen']);
    expect(byAlias.data.organizers[0].aliases).toEqual(['The Chapel', 'Chapel']);

    const byCanonical = await list({ q: 'Roof' });
    expect(byCanonical.data.organizers.map((row) => row.canonicalName)).toEqual(['Roof Records']);
  });

  it('filters by claimStatus and identity source', async () => {
    await PivotOrganizer.create([
      organizerDoc({
        claimStatus: 'claimed',
        identities: [{ provider: 'justgo', name: 'Alice Chen' }],
      }),
      organizerDoc({
        canonicalName: 'Bob Ruiz',
        normalizedName: 'bob ruiz',
        claimStatus: 'unclaimed',
        identities: [{ provider: 'luma', name: 'Bob Ruiz' }],
      }),
    ]);

    const claimed = await list({ claimStatus: 'claimed' });
    expect(claimed.data.organizers.map((row) => row.canonicalName)).toEqual(['Alice Chen']);

    const luma = await list({ source: 'luma' });
    expect(luma.data.organizers.map((row) => row.canonicalName)).toEqual(['Bob Ruiz']);
  });

  it('sorts by events desc by default and supports name / weeks', async () => {
    const [few, many, mid] = await PivotOrganizer.create([
      organizerDoc({ canonicalName: 'Zed', normalizedName: 'zed' }),
      organizerDoc({ canonicalName: 'Amy', normalizedName: 'amy' }),
      organizerDoc({ canonicalName: 'Mia', normalizedName: 'mia' }),
    ]);

    await Event.create([
      eventDoc({ organizerIds: [many._id], batchWeek: '2026-W30' }),
      eventDoc({ organizerIds: [many._id], batchWeek: '2026-W31' }),
      eventDoc({ organizerIds: [many._id], batchWeek: '2026-W32' }),
      eventDoc({ organizerIds: [mid._id], batchWeek: '2026-W30' }),
      eventDoc({ organizerIds: [mid._id], batchWeek: '2026-W30' }),
      eventDoc({ organizerIds: [few._id], batchWeek: '2026-W30' }),
    ]);

    const byEvents = await list();
    expect(byEvents.data.organizers.map((row) => row.canonicalName)).toEqual([
      'Amy',
      'Mia',
      'Zed',
    ]);

    const byName = await list({ sort: 'name' });
    expect(byName.data.organizers.map((row) => row.canonicalName)).toEqual([
      'Amy',
      'Mia',
      'Zed',
    ]);

    const byWeeks = await list({ sort: 'weeks' });
    expect(byWeeks.data.organizers[0].canonicalName).toBe('Amy');
    expect(byWeeks.data.organizers[0].weeksActive).toHaveLength(3);

    const byAudience = await list({ sort: 'audience' });
    expect(byAudience.data.sort).toBe('audience');
    expect(byAudience.data.organizers.map((row) => row.canonicalName)).toEqual([
      'Amy',
      'Mia',
      'Zed',
    ]);
  });

  it('pages in memory after aggregating events (does not return Event docs)', async () => {
    await PivotOrganizer.create([
      organizerDoc({ canonicalName: 'Amy', normalizedName: 'amy' }),
      organizerDoc({ canonicalName: 'Ben', normalizedName: 'ben' }),
      organizerDoc({ canonicalName: 'Cam', normalizedName: 'cam' }),
    ]);

    const page = await list({ sort: 'name', limit: 2, offset: 1 });
    expect(page.data.total).toBe(3);
    expect(page.data.limit).toBe(2);
    expect(page.data.offset).toBe(1);
    expect(page.data.organizers.map((row) => row.canonicalName)).toEqual(['Ben', 'Cam']);
    expect(page.data.organizers.every((row) => row.id && row.canonicalName)).toBe(true);
  });
});
