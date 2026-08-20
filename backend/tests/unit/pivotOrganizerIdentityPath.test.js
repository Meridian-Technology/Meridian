const { createMongoMemoryConnection } = require('../helpers/mongoMemory');
const getModels = require('../../services/getModelService');
const {
  identitiesFromPartifulHosts,
  identitiesFromLumaHosts,
} = require('../../utilities/pivotHostIdentity');
const { attachOrganizerIdsToDrafts } = require('../../services/pivotOrganizerResolveService');
const { mergeIngestIntoExisting } = require('../../services/pivotIngestDuplicateService');

/**
 * Task 6.1 — write-path composition. Small hand-built hosts, not a city catalog snapshot.
 * Preview extractors → resolve-once → merge union.
 */
describe('organizer identity write path (Task 6.1)', () => {
  let mongo;
  let db;
  let PivotOrganizer;
  const tenantKey = 'nyc';

  beforeAll(async () => {
    mongo = await createMongoMemoryConnection();
    db = mongo.connection;
    ({ PivotOrganizer } = getModels({ db, school: tenantKey }, 'PivotOrganizer'));
    await PivotOrganizer.syncIndexes();
  });

  afterEach(async () => {
    await mongo.reset();
    await PivotOrganizer.syncIndexes();
  });

  afterAll(async () => {
    await mongo.cleanup();
  });

  it('extracts per-host identities, resolves once, and stamps both drafts', async () => {
    const identities = identitiesFromPartifulHosts([
      {
        name: 'Alice Chen',
        isManaged: true,
        username: 'alice',
        photo: 'https://cdn.partiful.com/alice.jpg',
      },
      { name: 'Bob Ruiz', username: 'bob' },
    ]);
    expect(identities).toHaveLength(2);
    expect(identities[0]).toEqual(
      expect.objectContaining({
        provider: 'partiful',
        name: 'Alice Chen',
        profileUrl: 'https://partiful.com/u/alice',
      }),
    );

    const drafts = [
      {
        sourceUrl: 'https://partiful.com/e/one',
        draft: {
          name: 'Sunset One',
          hostName: 'Alice Chen & Bob Ruiz',
          hostIdentities: identities,
        },
      },
      {
        sourceUrl: 'https://partiful.com/e/two',
        draft: {
          name: 'Sunset Two',
          hostName: 'Alice Chen & Bob Ruiz',
          hostIdentities: identities,
        },
      },
    ];
    const stats = {};

    const result = await attachOrganizerIdsToDrafts({
      db,
      tenantKey,
      drafts,
      stats,
    });

    expect(result.cacheSize).toBe(2);
    expect(drafts[0].draft.organizerIds).toHaveLength(2);
    expect(drafts[1].draft.organizerIds).toEqual(drafts[0].draft.organizerIds);
    expect(await PivotOrganizer.countDocuments()).toBe(2);
    expect(stats.organizerUniqueIdentities).toBe(2);
    expect(stats.organizerResolved).toBe(2);
  });

  it('unions organizerIds and identities on fingerprint merge; empty incoming does not wipe', () => {
    const existing = {
      name: 'Sunset Listening',
      location: 'The Chapel',
      start_time: new Date('2026-07-12T22:00:00.000Z'),
      customFields: {
        pivot: {
          source: 'partiful',
          host: {
            name: 'Alice Chen',
            identities: [
              { provider: 'partiful', name: 'Alice Chen', profileUrl: 'https://partiful.com/u/alice' },
            ],
            organizerIds: ['665a1b2c3d4e5f6789012aaa'],
          },
        },
      },
    };

    const lumaIdentities = identitiesFromLumaHosts([
      {
        name: 'Alice Chen',
        api_id: 'usr-alice',
        avatar_url: 'https://cdn.luma.com/alice.jpg',
      },
    ]);

    const merged = mergeIngestIntoExisting(
      existing,
      {
        name: 'Sunset Listening',
        location: 'The Chapel',
        startTime: new Date('2026-07-12T22:00:00.000Z'),
        source: 'luma',
        hostName: 'Alice C',
        hostIdentities: lumaIdentities,
        organizerIds: ['665a1b2c3d4e5f6789012bbb'],
      },
      { matchType: 'fingerprint' },
      'https://luma.com/sunset',
    );

    expect(merged.organizerIds).toEqual([
      '665a1b2c3d4e5f6789012aaa',
      '665a1b2c3d4e5f6789012bbb',
    ]);
    expect(merged.hostIdentities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: 'partiful', name: 'Alice Chen' }),
        expect.objectContaining({ provider: 'luma', name: 'Alice Chen' }),
      ]),
    );
    expect(merged.hostName).toBe('Alice Chen');

    const leftoverIncoming = mergeIngestIntoExisting(
      {
        ...existing,
        customFields: {
          pivot: {
            host: {
              name: 'Alice Chen',
              organizerIds: merged.organizerIds,
              identities: merged.hostIdentities,
            },
          },
        },
      },
      {
        name: 'Sunset Listening',
        location: 'The Chapel',
        startTime: new Date('2026-07-12T22:00:00.000Z'),
        hostName: 'Alice & Bob',
        organizerIds: [],
      },
      { matchType: 'fingerprint' },
      'https://partiful.com/e/soup',
    );
    expect(leftoverIncoming.organizerIds).toEqual(merged.organizerIds);
  });

  it('leaves a joined Alice & Bob display name unlinked when there are no per-person identities', async () => {
    const drafts = [
      {
        draft: {
          name: 'Soup night',
          hostName: 'Alice & Bob',
          hostIdentities: [],
        },
      },
    ];

    const result = await attachOrganizerIdsToDrafts({
      db,
      tenantKey,
      drafts,
      stats: {},
    });

    expect(drafts[0].draft.organizerIds).toEqual([]);
    expect(result.unlinked).toBe(1);
    expect(await PivotOrganizer.countDocuments()).toBe(0);
  });
});
