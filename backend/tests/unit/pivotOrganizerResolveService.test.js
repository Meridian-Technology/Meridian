const mongoose = require('mongoose');
const { createMongoMemoryConnection } = require('../helpers/mongoMemory');
const getModels = require('../../services/getModelService');
const {
  resolveOrganizers,
  attachOrganizerIdsToDrafts,
  normalizeOrganizerName,
  normalizeProfileUrl,
  identitiesToResolve,
} = require('../../services/pivotOrganizerResolveService');

describe('pivotOrganizerResolveService (Task 2.2)', () => {
  let mongo;
  let db;
  let PivotOrganizer;
  const tenantKey = 'nyc';

  async function resolve(overrides = {}) {
    return resolveOrganizers({ db, tenantKey, ...overrides });
  }

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

  describe('re-exports', () => {
    it('reuses the shared name and profile URL normalizers', () => {
      expect(normalizeOrganizerName("Gabe's")).toBe('gabes');
      expect(normalizeProfileUrl('https://www.lu.ma/user/alice/')).toBe(
        'https://luma.com/user/alice',
      );
    });
  });

  describe('tier 1 — hard ID', () => {
    it('creates an organizer from a profileUrl', async () => {
      const result = await resolve({
        identities: [
          {
            provider: 'luma',
            name: 'Alice',
            profileUrl: 'https://lu.ma/user/alice',
            imageUrl: 'https://img.example/alice.png',
          },
        ],
      });

      expect(result.created).toHaveLength(1);
      expect(result.attached).toHaveLength(0);
      expect(result.ambiguous).toHaveLength(0);
      expect(result.organizerIds).toHaveLength(1);

      const doc = await PivotOrganizer.findById(result.organizerIds[0]).lean();
      expect(doc.tenantKey).toBe('nyc');
      expect(doc.canonicalName).toBe('Alice');
      expect(doc.normalizedName).toBe('alice');
      expect(doc.identities[0]).toMatchObject({
        provider: 'luma',
        name: 'Alice',
        profileUrl: 'https://luma.com/user/alice',
      });
      expect(doc.identities[0].profileUrl).toBe('https://luma.com/user/alice');
      expect(doc.aliases[0]).toMatchObject({ name: 'Alice', normalized: 'alice' });
      expect(doc.lastResolvedAt).toBeInstanceOf(Date);
      expect(doc.imageUrl).toBe('https://img.example/alice.png');
    });

    it('attaches a second event with the same profileUrl and records a new alias', async () => {
      const first = await resolve({
        identities: [{ provider: 'partiful', name: 'Alice', profileUrl: 'https://partiful.com/u/alice' }],
      });

      const second = await resolve({
        identities: [
          { provider: 'partiful', name: 'Alice Chen', profileUrl: 'https://partiful.com/u/alice' },
        ],
      });

      expect(second.organizerIds).toEqual(first.organizerIds);
      expect(second.created).toHaveLength(0);
      expect(second.attached).toHaveLength(1);
      expect(await PivotOrganizer.countDocuments()).toBe(1);

      const doc = await PivotOrganizer.findById(first.organizerIds[0]).lean();
      expect(doc.canonicalName).toBe('Alice');
      expect(doc.aliases.map((row) => row.name)).toEqual(['Alice', 'Alice Chen']);
    });

    it('creates / attaches on (provider, externalId) including justgo + createdByUserId', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const first = await resolve({
        identities: [{ provider: 'justgo', externalId: userId, name: 'Sam' }],
        displayName: 'Sam',
      });
      const second = await resolve({
        identities: [{ provider: 'justgo', externalId: userId, name: 'Sam' }],
      });

      expect(first.created).toHaveLength(1);
      expect(second.attached).toHaveLength(1);
      expect(second.organizerIds).toEqual(first.organizerIds);
      expect(await PivotOrganizer.countDocuments()).toBe(1);
    });

    it('does not attach a hard-ID create onto a same-name leftover (ops merge later)', async () => {
      await PivotOrganizer.create({
        tenantKey,
        canonicalName: 'Alice',
        normalizedName: 'alice',
        aliases: [{ name: 'Alice', normalized: 'alice', source: 'resolve' }],
      });

      const result = await resolve({
        identities: [{ provider: 'luma', name: 'Alice', profileUrl: 'https://luma.com/user/alice' }],
      });

      expect(result.created).toHaveLength(1);
      expect(await PivotOrganizer.countDocuments()).toBe(2);
    });
  });

  describe('tier 2 — exact name', () => {
    it('creates when the normalized name is new in the city', async () => {
      const result = await resolve({
        identities: [{ provider: 'generic-site', name: 'Roof Records' }],
      });

      expect(result.created).toHaveLength(1);
      expect(result.organizerIds).toHaveLength(1);
      const doc = await PivotOrganizer.findById(result.organizerIds[0]).lean();
      expect(doc.normalizedName).toBe('roof records');
      expect(doc.identities[0].profileUrl).toBeUndefined();
    });

    it('attaches when the normalized name is unique, including displayName fallback', async () => {
      const first = await resolve({ displayName: 'The Chapel' });
      const second = await resolve({ displayName: 'Chapel' });

      expect(first.created).toHaveLength(1);
      expect(second.attached).toHaveLength(1);
      expect(second.organizerIds).toEqual(first.organizerIds);
      expect(await PivotOrganizer.countDocuments()).toBe(1);

      const doc = await PivotOrganizer.findById(first.organizerIds[0]).lean();
      expect(doc.aliases.map((row) => row.name)).toEqual(['The Chapel', 'Chapel']);
      expect(doc.aliases.every((row) => row.normalized === 'chapel')).toBe(true);
    });

    it('attaches LLC / Inc variants and keeps each observed raw alias', async () => {
      const first = await resolve({
        identities: [{ provider: 'generic-site', name: 'Roof Records' }],
      });
      const second = await resolve({
        identities: [{ provider: 'generic-site', name: 'Roof Records, LLC' }],
      });

      expect(second.organizerIds).toEqual(first.organizerIds);
      expect(second.attached).toHaveLength(1);
      expect(await PivotOrganizer.countDocuments()).toBe(1);

      const doc = await PivotOrganizer.findById(first.organizerIds[0]).lean();
      expect(doc.normalizedName).toBe('roof records');
      expect(doc.aliases.map((row) => row.name)).toEqual([
        'Roof Records',
        'Roof Records, LLC',
      ]);
    });

    it('does not attach a city-suffixed name without a shared hard ID', async () => {
      const first = await resolve({
        identities: [{ provider: 'generic-site', name: 'Roof Records' }],
      });
      const second = await resolve({
        identities: [{ provider: 'generic-site', name: 'roof records nyc' }],
      });

      expect(second.created).toHaveLength(1);
      expect(second.organizerIds).not.toEqual(first.organizerIds);
      expect(await PivotOrganizer.countDocuments()).toBe(2);
    });

    it('records & / and name variants as aliases with the same normalized form', async () => {
      const first = await resolve({
        identities: [
          {
            provider: 'luma',
            name: 'Rhythm & Blues',
            profileUrl: 'https://luma.com/user/rnb',
          },
        ],
      });
      const second = await resolve({
        identities: [
          {
            provider: 'luma',
            name: 'Rhythm and Blues',
            profileUrl: 'https://luma.com/user/rnb',
          },
        ],
      });

      expect(second.organizerIds).toEqual(first.organizerIds);
      const doc = await PivotOrganizer.findById(first.organizerIds[0]).lean();
      expect(doc.normalizedName).toBe('rhythm and blues');
      expect(doc.aliases.map((row) => row.name)).toEqual([
        'Rhythm & Blues',
        'Rhythm and Blues',
      ]);
      expect(doc.aliases.map((row) => row.normalized)).toEqual([
        'rhythm and blues',
        'rhythm and blues',
      ]);
    });

    it('ignores a merged tombstone when matching a unique name', async () => {
      await PivotOrganizer.create({
        tenantKey,
        canonicalName: 'Chapel',
        normalizedName: 'chapel',
        status: 'merged',
        mergedInto: new mongoose.Types.ObjectId(),
      });

      const result = await resolve({ displayName: 'The Chapel' });
      expect(result.created).toHaveLength(1);
      expect(result.ambiguous).toHaveLength(0);
      expect(await PivotOrganizer.countDocuments({ status: { $ne: 'merged' } })).toBe(1);
    });

    it('does not stamp when the normalized name is ambiguous', async () => {
      await PivotOrganizer.create([
        { tenantKey, canonicalName: 'Alice', normalizedName: 'alice' },
        { tenantKey, canonicalName: 'alice', normalizedName: 'alice' },
      ]);

      const result = await resolve({
        identities: [{ provider: 'generic-site', name: 'Alice' }],
      });

      expect(result.organizerIds).toEqual([]);
      expect(result.created).toEqual([]);
      expect(result.attached).toEqual([]);
      expect(result.ambiguous).toHaveLength(1);
      expect(result.ambiguous[0].normalizedName).toBe('alice');
      expect(result.ambiguous[0].candidateIds).toHaveLength(2);
      expect(await PivotOrganizer.countDocuments()).toBe(2);
    });

    it('leaves joined multi-host display names unlinked (tier 4 leftover)', async () => {
      const result = await resolve({ displayName: 'Alice & Bob' });

      expect(result).toEqual({
        organizerIds: [],
        created: [],
        attached: [],
        ambiguous: [],
      });
      expect(await PivotOrganizer.countDocuments()).toBe(0);
      expect(identitiesToResolve([], 'Alice and Bob').leftover.reason).toBe('joined-multi-host');
    });
  });

  describe('multi-host', () => {
    it('resolves co-hosts to two organizers and does not merge them', async () => {
      const result = await resolve({
        displayName: 'Alice & Bob',
        identities: [
          { provider: 'partiful', name: 'Alice', profileUrl: 'https://partiful.com/u/alice' },
          { provider: 'partiful', name: 'Bob', profileUrl: 'https://partiful.com/u/bob' },
        ],
      });

      expect(result.organizerIds).toHaveLength(2);
      expect(result.created).toHaveLength(2);
      expect(result.ambiguous).toHaveLength(0);

      const docs = await PivotOrganizer.find({ _id: { $in: result.organizerIds } })
        .sort({ canonicalName: 1 })
        .lean();
      expect(docs.map((row) => row.canonicalName)).toEqual(['Alice', 'Bob']);
      expect(docs.every((row) => !row.aliases.some((alias) => /&/.test(alias.name)))).toBe(true);
    });

    it('dedupes a hard-ID identity and a same-name identity on one organizer', async () => {
      const result = await resolve({
        identities: [
          { provider: 'luma', name: 'Alice', profileUrl: 'https://luma.com/user/alice' },
          { provider: 'luma', name: 'Alice' },
        ],
      });

      expect(result.organizerIds).toHaveLength(1);
      expect(result.created).toHaveLength(1);
      expect(result.attached).toHaveLength(1);
      const doc = await PivotOrganizer.findById(result.organizerIds[0]).lean();
      expect(doc.identities).toHaveLength(2);
    });
  });
});

describe('attachOrganizerIdsToDrafts (Task 2.3)', () => {
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

  it('resolves a shared Partiful profileUrl once and stamps both drafts', async () => {
    const shared = {
      provider: 'partiful',
      name: 'Alice',
      profileUrl: 'https://partiful.com/u/alice',
    };
    const drafts = [
      {
        sourceUrl: 'https://partiful.com/e/one',
        draft: {
          name: 'Alice Night',
          hostName: 'Alice',
          hostIdentities: [shared],
        },
      },
      {
        sourceUrl: 'https://partiful.com/e/two',
        draft: {
          name: 'Alice Again',
          hostName: 'Alice',
          hostIdentities: [shared],
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

    expect(result.cacheSize).toBe(1);
    expect(result.resolved).toBe(2);
    expect(drafts[0].draft.organizerIds).toHaveLength(1);
    expect(drafts[1].draft.organizerIds).toEqual(drafts[0].draft.organizerIds);
    expect(await PivotOrganizer.countDocuments()).toBe(1);
    expect(stats.organizerUniqueIdentities).toBe(1);
    expect(stats.organizerResolved).toBe(2);
  });

  it('leaves ambiguous name-only drafts unlinked without creating a third organizer', async () => {
    await PivotOrganizer.create([
      { tenantKey, canonicalName: 'Alice', normalizedName: 'alice' },
      { tenantKey, canonicalName: 'alice', normalizedName: 'alice' },
    ]);

    const drafts = [
      {
        draft: {
          hostName: 'Alice',
          hostIdentities: [{ provider: 'generic-site', name: 'Alice' }],
        },
      },
    ];

    const result = await attachOrganizerIdsToDrafts({ db, tenantKey, drafts, stats: {} });

    expect(result.ambiguous).toBe(1);
    expect(drafts[0].draft.organizerIds).toEqual([]);
    expect(await PivotOrganizer.countDocuments()).toBe(2);
  });
});
