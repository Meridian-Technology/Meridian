const mongoose = require('mongoose');
const { createMongoMemoryConnection } = require('../helpers/mongoMemory');
const pivotOrganizerSchema = require('../../schemas/pivotOrganizer');
const {
  PIVOT_ORGANIZER_KINDS,
  PIVOT_ORGANIZER_CLAIM_STATUSES,
  PIVOT_ORGANIZER_STATUSES,
  PIVOT_ORGANIZER_IDENTITY_PROVIDERS,
} = pivotOrganizerSchema;
const getModels = require('../../services/getModelService');

describe('PivotOrganizer schema (Task 2.1)', () => {
  let mongo;
  let req;
  let PivotOrganizer;
  let Org;

  const tenantKey = 'nyc';

  function baseOrganizer(overrides = {}) {
    return {
      tenantKey,
      canonicalName: 'Roof Records',
      normalizedName: 'roof records',
      ...overrides,
    };
  }

  beforeAll(async () => {
    mongo = await createMongoMemoryConnection();
    req = { db: mongo.connection, school: tenantKey };
    ({ PivotOrganizer, Org } = getModels(req, 'PivotOrganizer', 'Org'));
    await PivotOrganizer.syncIndexes();
  });

  afterEach(async () => {
    await mongo.reset();
    await PivotOrganizer.syncIndexes();
  });

  afterAll(async () => {
    await mongo.cleanup();
  });

  describe('getModels registration', () => {
    it('registers PivotOrganizer on a pivot city connection', () => {
      const models = getModels(req, 'PivotOrganizer');

      expect(models.PivotOrganizer).toBeDefined();
      expect(models.PivotOrganizer.modelName).toBe('PivotOrganizer');
      expect(models.PivotOrganizer.collection.name).toBe('pivotOrganizers');
    });
  });

  describe('schema indexes', () => {
    it('declares the specified indexes and does not unique-index normalizedName', () => {
      const indexes = pivotOrganizerSchema.indexes();
      const byKeys = indexes.map(([keys, options]) => ({ keys, options }));

      const profileUrl = byKeys.find(
        (row) =>
          row.keys.tenantKey === 1 &&
          row.keys['identities.profileUrl'] === 1 &&
          Object.keys(row.keys).length === 2,
      );
      expect(profileUrl).toBeDefined();
      expect(profileUrl.options.unique).toBe(true);
      expect(profileUrl.options.partialFilterExpression).toEqual({
        'identities.profileUrl': { $gt: '' },
      });

      const providerExternal = byKeys.find(
        (row) =>
          row.keys.tenantKey === 1 &&
          row.keys['identities.provider'] === 1 &&
          row.keys['identities.externalId'] === 1,
      );
      expect(providerExternal).toBeDefined();
      expect(providerExternal.options.unique).not.toBe(true);

      const normalized = byKeys.find(
        (row) =>
          row.keys.tenantKey === 1 &&
          row.keys.normalizedName === 1 &&
          Object.keys(row.keys).length === 2,
      );
      expect(normalized).toBeDefined();
      expect(normalized.options.unique).not.toBe(true);

      const claim = byKeys.find(
        (row) =>
          row.keys.tenantKey === 1 &&
          row.keys.claimStatus === 1 &&
          Object.keys(row.keys).length === 2,
      );
      expect(claim).toBeDefined();
    });
  });

  describe('validators + defaults', () => {
    it('persists a city organizer with contract defaults', async () => {
      const doc = await PivotOrganizer.create(
        baseOrganizer({
          aliases: [{ name: 'Roof Records', normalized: 'roof records', source: 'crawl' }],
          identities: [
            {
              provider: 'luma',
              externalId: 'usr-1',
              profileUrl: 'https://luma.com/user/roof',
              name: 'Roof Records',
              imageUrl: 'https://img.example/roof.png',
              confidence: 1,
            },
          ],
        }),
      );

      expect(doc.tenantKey).toBe('nyc');
      expect(doc.canonicalName).toBe('Roof Records');
      expect(doc.normalizedName).toBe('roof records');
      expect(doc.kind).toBe('unclear');
      expect(doc.claimStatus).toBe('unclaimed');
      expect(doc.status).toBe('active');
      expect(doc.mergedInto).toBeNull();
      expect(doc.claimedByUserId).toBeNull();
      expect(doc.lastResolvedAt).toBeNull();
      expect(doc.createdAt).toBeInstanceOf(Date);
      expect(doc.identities[0].provider).toBe('luma');
      expect(doc.aliases[0].source).toBe('crawl');
    });

    it('requires tenantKey, canonicalName, and normalizedName', async () => {
      await expect(PivotOrganizer.create({})).rejects.toThrow(/tenantKey|canonicalName|normalizedName/);
      await expect(
        PivotOrganizer.create({ canonicalName: 'A', normalizedName: 'a' }),
      ).rejects.toThrow(/tenantKey/);
    });

    it('rejects invalid kind, claimStatus, and identity provider', async () => {
      await expect(PivotOrganizer.create(baseOrganizer({ kind: 'club' }))).rejects.toThrow(
        /kind/,
      );
      await expect(
        PivotOrganizer.create(baseOrganizer({ claimStatus: 'merged' })),
      ).rejects.toThrow(/claimStatus/);
      await expect(
        PivotOrganizer.create(
          baseOrganizer({
            identities: [{ provider: 'eventbrite', name: 'Nope' }],
          }),
        ),
      ).rejects.toThrow(/provider/);
    });

    it('persists a merge tombstone with status and mergedInto', async () => {
      const target = await PivotOrganizer.create(baseOrganizer());
      const source = await PivotOrganizer.create(
        baseOrganizer({
          canonicalName: 'Roof Recs',
          normalizedName: 'roof recs',
          status: 'merged',
          mergedInto: target._id,
        }),
      );

      expect(source.status).toBe('merged');
      expect(String(source.mergedInto)).toBe(String(target._id));
    });

    it('omits blank identity profileUrl so name-only rows stay unindexed', async () => {
      const doc = await PivotOrganizer.create(
        baseOrganizer({
          identities: [{ provider: 'generic-site', name: 'NYC Parks', profileUrl: '   ' }],
        }),
      );

      expect(doc.identities[0].profileUrl).toBeUndefined();
    });

    it('exports locked enums shared with host.identities providers', () => {
      expect(PIVOT_ORGANIZER_KINDS).toEqual(['person', 'brand', 'venue', 'unclear']);
      expect(PIVOT_ORGANIZER_CLAIM_STATUSES).toEqual(['unclaimed', 'pending', 'claimed']);
      expect(PIVOT_ORGANIZER_STATUSES).toEqual(['active', 'merged']);
      expect(PIVOT_ORGANIZER_IDENTITY_PROVIDERS).toEqual([
        'luma',
        'partiful',
        'generic-site',
        'justgo',
        'manual',
      ]);
    });
  });

  describe('soft uniqueness', () => {
    it('allows two organizers with the same normalizedName in one city', async () => {
      await PivotOrganizer.create(baseOrganizer());
      const second = await PivotOrganizer.create(
        baseOrganizer({
          canonicalName: 'Roof Records NYC',
          identities: [{ provider: 'generic-site', name: 'Roof Records' }],
        }),
      );

      expect(second.normalizedName).toBe('roof records');
      expect(await PivotOrganizer.countDocuments({ tenantKey, normalizedName: 'roof records' })).toBe(
        2,
      );
    });

    it('rejects a second organizer with the same tenantKey + profileUrl', async () => {
      const profileUrl = 'https://partiful.com/u/alice';
      await PivotOrganizer.create(
        baseOrganizer({
          canonicalName: 'Alice',
          normalizedName: 'alice',
          identities: [{ provider: 'partiful', profileUrl, name: 'Alice' }],
        }),
      );

      await expect(
        PivotOrganizer.create(
          baseOrganizer({
            canonicalName: 'Alice B',
            normalizedName: 'alice b',
            identities: [{ provider: 'partiful', profileUrl, name: 'Alice B' }],
          }),
        ),
      ).rejects.toThrow(/duplicate key/i);
    });

    it('allows the same profileUrl in a different city', async () => {
      const profileUrl = 'https://luma.com/user/shared';
      await PivotOrganizer.create(
        baseOrganizer({
          identities: [{ provider: 'luma', profileUrl, name: 'Shared' }],
        }),
      );

      const otherCity = await PivotOrganizer.create(
        baseOrganizer({
          tenantKey: 'la',
          identities: [{ provider: 'luma', profileUrl, name: 'Shared' }],
        }),
      );

      expect(otherCity.tenantKey).toBe('la');
    });
  });

  describe('no campus Org writes', () => {
    it('does not create Org documents when inserting a PivotOrganizer', async () => {
      expect(await Org.countDocuments()).toBe(0);

      await PivotOrganizer.create(baseOrganizer());

      expect(await Org.countDocuments()).toBe(0);
      expect(await PivotOrganizer.countDocuments()).toBe(1);
    });
  });
});
