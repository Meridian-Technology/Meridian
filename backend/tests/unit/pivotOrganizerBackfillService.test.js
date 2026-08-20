const mongoose = require('mongoose');
const { createMongoMemoryConnection } = require('../helpers/mongoMemory');
const getModels = require('../../services/getModelService');
const {
  runOrganizerBackfill,
  getLastOrganizerBackfill,
  identitiesFromStoredHost,
} = require('../../services/pivotOrganizerBackfillService');

describe('identitiesFromStoredHost', () => {
  it('prefers persisted identities over the display snapshot', () => {
    expect(
      identitiesFromStoredHost(
        {
          name: 'Alice & Bob',
          profileUrl: 'https://partiful.com/u/ignored',
          identities: [
            { provider: 'partiful', name: 'Alice', profileUrl: 'https://partiful.com/u/alice' },
          ],
        },
        'partiful',
      ),
    ).toEqual([
      { provider: 'partiful', name: 'Alice', profileUrl: 'https://partiful.com/u/alice' },
    ]);
  });

  it('falls back to profileUrl + name + source for historical rows', () => {
    expect(
      identitiesFromStoredHost(
        { name: 'Alice', profileUrl: 'https://www.lu.ma/user/alice/' },
        'luma',
      ),
    ).toEqual([
      {
        provider: 'luma',
        name: 'Alice',
        profileUrl: 'https://luma.com/user/alice',
      },
    ]);
  });
});

describe('runOrganizerBackfill (Task 3.3)', () => {
  let mongo;
  let db;
  let Event;
  let PivotOrganizer;
  let PivotOrganizerBackfillRun;
  const tenantKey = 'nyc';
  const hostingId = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    mongo = await createMongoMemoryConnection();
    db = mongo.connection;
    ({ Event, PivotOrganizer, PivotOrganizerBackfillRun } = getModels(
      { db, school: tenantKey },
      'Event',
      'PivotOrganizer',
      'PivotOrganizerBackfillRun',
    ));
    await PivotOrganizer.syncIndexes();
    await PivotOrganizerBackfillRun.syncIndexes();
  });

  afterEach(async () => {
    await mongo.reset();
    await PivotOrganizer.syncIndexes();
    await PivotOrganizerBackfillRun.syncIndexes();
  });

  afterAll(async () => {
    await mongo.cleanup();
  });

  function eventDoc({ name, host, source = 'partiful' } = {}) {
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
          source,
          sourceUrl: 'https://partiful.com/e/example',
          host,
        },
      },
    };
  }

  async function backfill(overrides = {}) {
    return runOrganizerBackfill({ db, tenantKey, pageSize: 1, ...overrides });
  }

  it('links events that share a historical profileUrl to one organizer', async () => {
    const created = await Event.create([
      eventDoc({
        name: 'Night One',
        host: { name: 'Alice', profileUrl: 'https://partiful.com/u/alice' },
      }),
      eventDoc({
        name: 'Night Two',
        host: { name: 'Alice Chen', profileUrl: 'https://partiful.com/u/alice' },
      }),
    ]);

    const result = await backfill();

    expect(result.scanned).toBe(2);
    expect(result.linked).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.ambiguous).toBe(0);
    expect(result.unlinked).toBe(0);
    expect(result.createdOrganizers).toBe(1);
    expect(await PivotOrganizer.countDocuments()).toBe(1);

    const events = await Event.find({ _id: { $in: created.map((row) => row._id) } })
      .sort({ name: 1 })
      .lean();
    expect(events[0].customFields.pivot.host.organizerIds).toHaveLength(1);
    expect(events[1].customFields.pivot.host.organizerIds).toEqual(
      events[0].customFields.pivot.host.organizerIds,
    );
    expect(events[0].customFields.pivot.host.name).toBe('Alice');
    expect(result.lastBackfill.linked).toBe(2);
    expect(await getLastOrganizerBackfill({ db, tenantKey })).toMatchObject({
      linked: 2,
      createdOrganizers: 1,
      force: false,
    });
  });

  it('leaves colliding names unlinked / ambiguous and does not invent a third organizer', async () => {
    await PivotOrganizer.create([
      { tenantKey, canonicalName: 'Alice', normalizedName: 'alice' },
      { tenantKey, canonicalName: 'alice', normalizedName: 'alice' },
    ]);
    const event = await Event.create(
      eventDoc({ host: { name: 'Alice' }, source: 'generic-site' }),
    );

    const result = await backfill();

    expect(result.linked).toBe(0);
    expect(result.ambiguous).toBe(1);
    expect(result.createdOrganizers).toBe(0);
    expect(await PivotOrganizer.countDocuments()).toBe(2);

    const fresh = await Event.findById(event._id).lean();
    expect(fresh.customFields.pivot.host.organizerIds).toEqual([]);
  });

  it('is a no-op on a second run without force', async () => {
    await Event.create(
      eventDoc({
        host: { name: 'Alice', profileUrl: 'https://partiful.com/u/alice' },
      }),
    );

    const first = await backfill();
    const second = await backfill();

    expect(first.linked).toBe(1);
    expect(second.scanned).toBe(1);
    expect(second.skipped).toBe(1);
    expect(second.linked).toBe(0);
    expect(second.createdOrganizers).toBe(0);
    expect(await PivotOrganizer.countDocuments()).toBe(1);
  });

  it('re-resolves when force=true', async () => {
    const event = await Event.create(
      eventDoc({
        host: { name: 'Alice', profileUrl: 'https://partiful.com/u/alice' },
      }),
    );
    await backfill();
    await Event.updateOne(
      { _id: event._id },
      { $set: { 'customFields.pivot.host.organizerIds': [] } },
    );

    const forced = await backfill({ force: true });
    expect(forced.skipped).toBe(0);
    expect(forced.linked).toBe(1);
    expect(forced.lastBackfill.force).toBe(true);

    const fresh = await Event.findById(event._id).lean();
    expect(fresh.customFields.pivot.host.organizerIds).toHaveLength(1);
  });

  it('leaves joined multi-host leftovers unlinked', async () => {
    const event = await Event.create(
      eventDoc({ host: { name: 'Alice & Bob' }, source: 'generic-site' }),
    );

    const result = await backfill();
    expect(result.unlinked).toBe(1);
    expect(result.createdOrganizers).toBe(0);
    expect(await PivotOrganizer.countDocuments()).toBe(0);

    const fresh = await Event.findById(event._id).lean();
    expect(fresh.customFields.pivot.host.organizerIds).toEqual([]);
  });

  it('does not import Firecrawl or propose fuzzy stamps', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../../services/pivotOrganizerBackfillService.js'),
      'utf8',
    );
    const requires = source.match(/require\(['"][^'"]+['"]\)/g) || [];
    expect(requires.join('\n')).not.toMatch(/firecrawl|proposeOrganizerMerges/i);
  });
});
