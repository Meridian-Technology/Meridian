const mongoose = require('mongoose');
const { createMongoMemoryConnection } = require('../helpers/mongoMemory');

jest.mock('../../services/tenantConfigService', () => ({
  getTenantByKey: jest.fn(async (_req, key) => {
    const tenantKey = String(key || '').toLowerCase();
    const cities = {
      sf: { tenantKey: 'sf', name: 'SF', location: 'San Francisco', pivotPilot: true },
      nyc: { tenantKey: 'nyc', name: 'NYC', location: 'New York', pivotPilot: true },
      chicago: { tenantKey: 'chicago', name: 'Chicago', location: 'Chicago', pivotPilot: true },
    };
    if (cities[tenantKey]) return cities[tenantKey];
    if (tenantKey === 'campus') return { tenantKey, tenantType: 'school' };
    return null;
  }),
}));

jest.mock('../../connectionsManager', () => ({
  connectToDatabase: jest.fn(),
}));

const { connectToDatabase } = require('../../connectionsManager');
const {
  parseCurationQuery,
  buildCurationMongoQuery,
  encodeCursor,
  compareCandidates,
  mergeSourcePages,
  chipsFromQuery,
} = require('../../services/pivotCarouselCurationQuery');
const {
  createCarouselAccount,
  createCarouselIssue,
} = require('../../services/pivotCarouselIssueService');
const {
  searchCurationCandidates,
  saveCurationSearch,
  listSavedCurationSearches,
} = require('../../services/pivotCarouselCurationQueryService');
const getModels = require('../../services/getModelService');

const HOSTING_ID = new mongoose.Types.ObjectId();

function eventDoc(overrides = {}) {
  const { pivot = {}, ...rest } = overrides;
  return {
    name: 'basement set',
    type: 'social',
    location: 'warehouse off 14th',
    start_time: new Date('2026-09-05T23:00:00.000Z'),
    end_time: new Date('2026-09-06T02:00:00.000Z'),
    status: 'not-applicable',
    visibility: 'public',
    expectedAttendance: 40,
    hostingType: 'Org',
    hostingId: HOSTING_ID,
    image: 'https://s3/flier.jpg',
    description: 'late jazz',
    externalLink: 'https://partiful.com/e/basement',
    customFields: {
      pivot: {
        ingestStatus: 'published',
        batchWeek: '2026-W36',
        sourceUrl: 'https://partiful.com/e/basement',
        host: { name: 'nadine + the 14th st crew' },
        tags: ['live-music', 'jazz'],
        ...pivot,
      },
    },
    ...rest,
  };
}

describe('curation query spec', () => {
  test('rejects unknown filters and malformed dates instead of ignoring them', () => {
    expect(parseCurationQuery({ vibe: 'chill' }).code).toBe('UNSUPPORTED_FILTER');
    expect(parseCurationQuery({ dateFrom: 'next friday' }).code).toBe('MALFORMED_DATE');
    expect(parseCurationQuery({ dateFrom: '2026-13-40' }).code).toBe('MALFORMED_DATE');
    expect(parseCurationQuery({ timezone: 'Mars/Olympus' }).code).toBe('INVALID_TIMEZONE');
    expect(parseCurationQuery({ price: 'free' }).code).toBe('UNSUPPORTED_FILTER');
    expect(parseCurationQuery({ sort: 'relevance' }).code).toBe('UNSUPPORTED_FILTER');
    expect(parseCurationQuery({ provider: 'vector' }).spec.provider).toBe('vector');
  });

  test('date-only bounds use the timezone and an exclusive end', () => {
    const parsed = parseCurationQuery({
      timezone: 'America/Los_Angeles',
      dateFrom: '2026-09-01',
      dateTo: '2026-09-01',
    });
    expect(parsed.spec.dateFrom).toBe('2026-09-01T07:00:00.000Z');
    expect(parsed.spec.dateTo).toBe('2026-09-02T07:00:00.000Z');
    expect(parsed.spec.dateToExclusive).toBe(true);
    const query = buildCurationMongoQuery(parsed.spec, { now: new Date('2026-09-01T12:00:00Z') });
    expect(query.start_time).toEqual({
      $gte: new Date('2026-09-01T07:00:00.000Z'),
      $lt: new Date('2026-09-02T07:00:00.000Z'),
    });
  });

  test('filters compose: any/all tags, exclusion, unknown image, and past mode', () => {
    const parsed = parseCurationQuery({
      keyword: 'jazz',
      includeTerms: ['live'],
      excludeTerms: ['club'],
      tags: { values: ['live-music', 'jazz'], match: 'all' },
      categories: { values: ['comedy'], match: 'any' },
      image: 'missing',
      temporalMode: 'past',
      host: 'nadine',
      venue: 'warehouse',
    });
    const now = new Date('2026-09-10T00:00:00Z');
    const query = buildCurationMongoQuery(parsed.spec, { now });
    expect(query['customFields.pivot.ingestStatus']).toBe('published');
    expect(query.isDeleted).toEqual({ $ne: true });
    expect(query.start_time.$lt).toEqual(now);
    expect(query['customFields.pivot.host.name'].test('Nadine')).toBe(true);
    expect(query.$nor).toHaveLength(1);
    const tagAll = query.$and.find((clause) => clause['customFields.pivot.tags']?.$all);
    const tagAny = query.$and.find((clause) => clause['customFields.pivot.tags']?.$in);
    expect(tagAll['customFields.pivot.tags'].$all).toEqual(['live-music', 'jazz']);
    expect(tagAny['customFields.pivot.tags'].$in).toEqual(['comedy']);
    expect(query.$and.some((clause) => clause.$or?.some((row) => row.image === ''))).toBe(true);
  });

  test('draft inspection is explicit and default search stays published', () => {
    expect(buildCurationMongoQuery(parseCurationQuery({}).spec)['customFields.pivot.ingestStatus']).toBe('published');
    const inspect = buildCurationMongoQuery(parseCurationQuery({
      publication: 'inspect-unreleased',
    }).spec);
    expect(inspect['customFields.pivot.ingestStatus']).toEqual({ $in: ['draft', 'staged', 'published'] });
  });

  test('chips and reset describe the active filters', () => {
    const parsed = parseCurationQuery({
      keyword: 'jazz',
      excludeTerms: ['club'],
      image: 'present',
    });
    expect(chipsFromQuery(parsed.spec).map((chip) => chip.id)).toEqual([
      'keyword',
      'exclude:0',
      'image',
    ]);
    expect(chipsFromQuery(parsed.spec).find((chip) => chip.id === 'image').label).toBe('has image');
  });
});

describe('merged pagination', () => {
  function candidate(tenant, id, start, extras = {}) {
    return {
      ref: { sourceTenantKey: tenant, eventId: id },
      snapshot: { startTime: new Date(start), city: { tenantKey: tenant, name: tenant } },
      provenance: { ingestedAt: extras.ingestedAt || start, sourceTenantKey: tenant, eventId: id },
      score: extras.score || null,
      group: null,
    };
  }

  test('stable sort has no duplicates and keeps city identity', () => {
    const spec = parseCurationQuery({ limit: 2 }).spec;
    const page = mergeSourcePages([
      {
        tenantKey: 'sf',
        status: 'ok',
        fetched: 2,
        candidates: [
          candidate('sf', 'aaa', '2026-09-05T20:00:00Z'),
          candidate('sf', 'aaa', '2026-09-05T20:00:00Z'),
        ],
      },
      {
        tenantKey: 'nyc',
        status: 'ok',
        fetched: 1,
        candidates: [candidate('nyc', 'bbb', '2026-09-06T20:00:00Z')],
      },
    ], spec);
    expect(page.candidates.map((row) => `${row.ref.sourceTenantKey}:${row.ref.eventId}`)).toEqual([
      'nyc:bbb',
      'sf:aaa',
    ]);
    expect(page.candidates[0].snapshot.city.tenantKey).toBe('nyc');
    expect(page.continuation.complete).toBe(true);
  });

  test('a failed source is visible, retryable, and not presented as complete', () => {
    const spec = parseCurationQuery({ limit: 24 }).spec;
    const page = mergeSourcePages([
      { tenantKey: 'sf', status: 'ok', fetched: 1, candidates: [candidate('sf', 'aaa', '2026-09-05T20:00:00Z')] },
      {
        tenantKey: 'nyc',
        status: 'failed',
        error: 'timed out',
        retryable: true,
        fetched: 0,
        candidates: [],
      },
    ], spec);
    expect(page.continuation.complete).toBe(false);
    expect(page.sources[1]).toMatchObject({
      tenantKey: 'nyc',
      status: 'failed',
      retryable: true,
      error: 'timed out',
    });
    expect(page.candidates).toHaveLength(1);
  });

  test('cursor encoding is deterministic for the same last row', () => {
    const first = encodeCursor({
      sort: 'date',
      value: '2026-09-05T20:00:00.000Z',
      tenantKey: 'sf',
      eventId: 'aaa',
    });
    const second = encodeCursor({
      sort: 'date',
      value: '2026-09-05T20:00:00.000Z',
      tenantKey: 'sf',
      eventId: 'aaa',
    });
    expect(first).toBe(second);
    expect(compareCandidates(
      candidate('nyc', 'bbb', '2026-09-05T20:00:00Z'),
      candidate('sf', 'aaa', '2026-09-05T20:00:00Z'),
      'date',
    )).toBeLessThan(0);
  });
});

describe('account-scoped catalog search', () => {
  let mongo;
  let sfDb;
  let nycDb;
  let req;
  let EventSf;
  let EventNyc;

  beforeAll(async () => {
    mongo = await createMongoMemoryConnection({ withGlobalDb: true });
    sfDb = await mongoose.createConnection(mongo.mongoServer.getUri('sf')).asPromise();
    nycDb = await mongoose.createConnection(mongo.mongoServer.getUri('nyc')).asPromise();
    EventSf = getModels({ db: sfDb }, 'Event').Event;
    EventNyc = getModels({ db: nycDb }, 'Event').Event;
    connectToDatabase.mockImplementation(async (key) => {
      if (key === 'sf') return sfDb;
      if (key === 'nyc') return nycDb;
      throw new Error(`city ${key} unavailable`);
    });
    req = { globalDb: mongo.globalConnection, user: { globalUserId: 'admin-1' } };
  });

  beforeEach(async () => {
    await mongo.reset();
    await sfDb.dropDatabase();
    await nycDb.dropDatabase();
  });

  afterAll(async () => {
    if (sfDb) await sfDb.close();
    if (nycDb) await nycDb.close();
    await mongo.cleanup();
  });

  async function account(overrides = {}) {
    return createCarouselAccount(req, {
      displayName: 'Just Go magazine',
      ownerTenantKey: 'sf',
      sourceTenantKeys: ['sf', 'nyc'],
      ...overrides,
    });
  }

  test('global search keeps city identity and rejects a source outside the account', async () => {
    const created = await account();
    const [sfEvent] = await EventSf.create([eventDoc({ name: 'Lantern walk' })]);
    const [nycEvent] = await EventNyc.create([eventDoc({
      name: 'Brooklyn recap',
      location: 'Elsewhere',
      start_time: new Date('2026-09-06T23:00:00.000Z'),
    })]);

    const found = await searchCurationCandidates(req, created.data.account.id, {
      sort: 'date',
      limit: 24,
    });
    expect(found.data.continuation.complete).toBe(true);
    expect(found.data.candidates.map((row) => row.ref)).toEqual([
      { sourceTenantKey: 'nyc', eventId: String(nycEvent._id) },
      { sourceTenantKey: 'sf', eventId: String(sfEvent._id) },
    ]);
    expect(found.data.candidates[0].snapshot.city).toEqual({
      tenantKey: 'nyc',
      name: 'New York',
    });
    expect(found.data.candidates[0].snapshot.sourceUrl).toBe('https://partiful.com/e/basement');
    expect(found.data.candidates[0].snapshot.happenedConfirmed).toBe(false);

    const blocked = await searchCurationCandidates(req, created.data.account.id, {
      sourceTenantKeys: ['chicago'],
    });
    expect(blocked.code).toBe('SOURCE_NOT_ALLOWED');
  });

  test('pagination is stable across cities and a failed city stays retryable', async () => {
    const created = await account();
    await EventSf.create([
      eventDoc({ name: 'One', start_time: new Date('2026-09-01T20:00:00Z') }),
      eventDoc({ name: 'Two', start_time: new Date('2026-09-02T20:00:00Z') }),
    ]);
    await EventNyc.create([
      eventDoc({ name: 'Three', start_time: new Date('2026-09-03T20:00:00Z') }),
      eventDoc({ name: 'Four', start_time: new Date('2026-09-04T20:00:00Z') }),
    ]);

    const first = await searchCurationCandidates(req, created.data.account.id, { limit: 2 });
    expect(first.data.candidates.map((row) => row.snapshot.name)).toEqual(['Four', 'Three']);
    expect(first.data.continuation.hasMore).toBe(true);
    const keys = first.data.candidates.map((row) => `${row.ref.sourceTenantKey}:${row.ref.eventId}`);
    expect(new Set(keys).size).toBe(2);

    const second = await searchCurationCandidates(req, created.data.account.id, {
      limit: 2,
      cursor: first.data.continuation.cursor,
    });
    const all = [...first.data.candidates, ...second.data.candidates];
    const seen = all.map((row) => `${row.ref.sourceTenantKey}:${row.ref.eventId}`);
    expect(new Set(seen).size).toBe(4);
    expect(second.data.candidates.map((row) => row.snapshot.name)).toEqual(['Two', 'One']);
    expect(second.data.continuation.hasMore).toBe(false);
    expect(second.data.continuation.complete).toBe(true);

    connectToDatabase.mockImplementation(async (key) => {
      if (key === 'nyc') throw new Error('nyc down');
      if (key === 'sf') return sfDb;
      throw new Error(`city ${key} unavailable`);
    });
    const partial = await searchCurationCandidates(req, created.data.account.id, { limit: 24 });
    connectToDatabase.mockImplementation(async (key) => {
      if (key === 'sf') return sfDb;
      if (key === 'nyc') return nycDb;
      throw new Error(`city ${key} unavailable`);
    });
    expect(partial.data.continuation.complete).toBe(false);
    expect(partial.data.sources.find((row) => row.tenantKey === 'nyc')).toMatchObject({
      status: 'failed',
      retryable: true,
    });
  });

  test('previously used, drafts, and saved searches stay account scoped', async () => {
    const created = await account();
    const [used] = await EventSf.create([eventDoc({ name: 'Already on a slide' })]);
    const [fresh] = await EventSf.create([eventDoc({
      name: 'Fresh listing',
      start_time: new Date('2026-09-08T20:00:00Z'),
    })]);
    await EventSf.create([eventDoc({
      name: 'Hidden draft',
      pivot: { ingestStatus: 'draft' },
    })]);
    await createCarouselIssue(req, created.data.account.id, {
      name: 'Lanterns',
      sources: [{ sourceTenantKey: 'sf', eventId: String(used._id) }],
    });

    const published = await searchCurationCandidates(req, created.data.account.id, {
      sourceTenantKeys: ['sf'],
    });
    expect(published.data.candidates.map((row) => row.snapshot.name).sort()).toEqual([
      'Already on a slide',
      'Fresh listing',
    ]);

    const unused = await searchCurationCandidates(req, created.data.account.id, {
      sourceTenantKeys: ['sf'],
      previouslyUsedInAccount: 'exclude',
    });
    expect(unused.data.candidates.map((row) => row.ref.eventId)).toEqual([String(fresh._id)]);

    const drafts = await searchCurationCandidates(req, created.data.account.id, {
      sourceTenantKeys: ['sf'],
      publication: 'inspect-unreleased',
      keyword: 'Hidden',
    });
    expect(drafts.data.candidates).toHaveLength(1);
    expect(drafts.data.candidates[0].inspectUnreleased).toBe(true);
    expect(drafts.data.candidates[0].provenance.publication).toBe('draft');

    const saved = await saveCurationSearch(req, created.data.account.id, {
      name: 'Fresh jazz',
      query: { keyword: 'Fresh', sourceTenantKeys: ['sf'] },
    });
    expect(saved.data.savedSearch.chips[0].id).toBe('keyword');
    const listed = await listSavedCurationSearches(req, created.data.account.id);
    expect(listed.data.savedSearches).toHaveLength(1);

    const vector = await searchCurationCandidates(req, created.data.account.id, { provider: 'vector' });
    expect(vector.code).toBe('PROVIDER_UNAVAILABLE');
  });
});
