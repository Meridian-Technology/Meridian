const mongoose = require('mongoose');
const { createMongoMemoryConnection } = require('../helpers/mongoMemory');

jest.mock('../../services/tenantConfigService', () => ({
  getTenantByKey: jest.fn(async (_req, key) => {
    const tenantKey = String(key || '').toLowerCase();
    const cities = {
      sf: { tenantKey: 'sf', name: 'SF', location: 'San Francisco', pivotPilot: true },
      nyc: { tenantKey: 'nyc', name: 'NYC', location: 'New York', pivotPilot: true },
    };
    return cities[tenantKey] || null;
  }),
}));

jest.mock('../../connectionsManager', () => ({
  connectToDatabase: jest.fn(),
}));

const { connectToDatabase } = require('../../connectionsManager');
const getModels = require('../../services/getModelService');
const { createCarouselAccount } = require('../../services/pivotCarouselIssueService');
const {
  applyCurationToDocument,
  diffSelection,
  generateIssueDocument,
  slideEstimate,
} = require('../../services/pivotCarouselCurationDraft');
const {
  createCurationDraft,
  updateCurationDraft,
  createIssueFromCurationDraft,
  applyCurationDraftToIssue,
} = require('../../services/pivotCarouselCurationDraftService');

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
    customFields: {
      pivot: {
        ingestStatus: 'published',
        batchWeek: '2026-W36',
        sourceUrl: 'https://partiful.com/e/basement',
        host: { name: 'nadine' },
        tags: ['live-music'],
        ...pivot,
      },
    },
    ...rest,
  };
}

function item(tenant, event, extras = {}) {
  return {
    ref: { sourceTenantKey: tenant, eventId: String(event._id) },
    snapshot: {
      name: event.name,
      startTime: event.start_time,
      image: event.image,
      city: { tenantKey: tenant, name: tenant },
      publication: 'published',
      happenedConfirmed: false,
    },
    provenance: { publication: 'published', sourceTenantKey: tenant, eventId: String(event._id) },
    ...extras,
  };
}

describe('curation document seeding', () => {
  test('a cover plus event slides has no back slide', () => {
    const document = generateIssueDocument({
      selected: [item('sf', { _id: 'aaa', name: 'Lanterns', start_time: new Date(), image: 'x' })],
      theme: 'Lantern week',
      coverPreset: 'loose-letters',
      eventPreset: 'photo-note',
    });
    expect(document.slides.map((slide) => slide.role)).toEqual(['cover', 'event']);
    expect(document.slides[0].elements[0].text).toBe('Lantern week');
    expect(slideEstimate(1).slideCount).toBe(2);
  });

  test('revising curation keeps edited slides for retained events and detaches removed ones', () => {
    const first = generateIssueDocument({
      selected: [
        item('sf', { _id: 'aaa', name: 'Keep', start_time: new Date(), image: 'x' }),
        item('nyc', { _id: 'bbb', name: 'Drop', start_time: new Date(), image: 'y' }),
      ],
      theme: '',
      coverPreset: 'open-invitation',
      eventPreset: 'in-the-room',
    });
    first.slides[1].elements.find((element) => element.role === 'event-name').text = 'Edited title';
    const applied = applyCurationToDocument(first, {
      previousRefs: [{ sourceTenantKey: 'sf', eventId: 'aaa' }, { sourceTenantKey: 'nyc', eventId: 'bbb' }],
      selected: [
        item('sf', { _id: 'aaa', name: 'Keep', start_time: new Date(), image: 'x' }),
        item('sf', { _id: 'ccc', name: 'New', start_time: new Date(), image: 'z' }),
      ],
      theme: '',
      coverPreset: 'open-invitation',
      eventPreset: 'in-the-room',
    });
    const kept = applied.document.slides.find((slide) => slide.source?.eventId === 'aaa');
    const detached = applied.document.slides.find((slide) => slide.source?.eventId === 'bbb');
    const added = applied.document.slides.find((slide) => slide.source?.eventId === 'ccc');
    expect(kept.elements.find((element) => element.role === 'event-name').text).toBe('Edited title');
    expect(detached.detached).toBe(true);
    expect(added.role).toBe('event');
    expect(applied.diff.added.map((ref) => ref.eventId)).toEqual(['ccc']);
    expect(applied.diff.removed.map((ref) => ref.eventId)).toEqual(['bbb']);
    expect(diffSelection([{ sourceTenantKey: 'sf', eventId: 'aaa' }], [{ sourceTenantKey: 'sf', eventId: 'aaa' }]).reordered).toBe(false);
  });
});

describe('draft persistence and issue creation', () => {
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

  async function account() {
    return createCarouselAccount(req, {
      displayName: 'Just Go magazine',
      ownerTenantKey: 'sf',
      sourceTenantKeys: ['sf', 'nyc'],
    });
  }

  test('city collection and multi-city recap create one named issue each', async () => {
    const created = await account();
    const [sfEvent] = await EventSf.create([eventDoc({ name: 'Lantern walk' })]);
    const [nycEvent] = await EventNyc.create([eventDoc({ name: 'Brooklyn recap' })]);

    const cityDraft = await createCurationDraft(req, created.data.account.id, {
      format: 'city-picks',
      selected: [item('sf', sfEvent)],
    });
    const city = await createIssueFromCurationDraft(req, created.data.account.id, cityDraft.data.draft.id, {
      name: 'Lanterns',
      idempotencyKey: 'idem-city-1',
    });
    expect(city.data.issue.format).toBe('city-picks');
    expect(city.data.issue.document.slides).toHaveLength(2);
    expect(city.data.issue.document.slides.some((slide) => slide.role === 'back')).toBe(false);
    expect(city.data.issue.sources).toEqual([{ sourceTenantKey: 'sf', eventId: String(sfEvent._id) }]);

    const recapDraft = await createCurationDraft(req, created.data.account.id, {
      format: 'sorry-you-missed-it',
      selected: [item('sf', sfEvent), item('nyc', nycEvent)],
    });
    const recap = await createIssueFromCurationDraft(req, created.data.account.id, recapDraft.data.draft.id, {
      name: 'Missed it',
      idempotencyKey: 'idem-recap-1',
    });
    expect(recap.data.issue.format).toBe('sorry-you-missed-it');
    expect(recap.data.issue.document.slides).toHaveLength(3);
    expect(recap.data.issue.sources.map((ref) => ref.sourceTenantKey).sort()).toEqual(['nyc', 'sf']);
  });

  test('reload, failed create, duplicate submit, unavailable events, and slide cap preserve work', async () => {
    const created = await account();
    const [live] = await EventSf.create([eventDoc({ name: 'Live set' })]);
    const [gone] = await EventSf.create([eventDoc({ name: 'Gone' })]);
    const draft = await createCurationDraft(req, created.data.account.id, {
      selected: [item('sf', live), item('sf', gone)],
    });
    const saved = await updateCurationDraft(req, created.data.account.id, draft.data.draft.id, {
      theme: 'Night walk',
      selected: [item('sf', live), item('sf', gone)],
    });
    expect(saved.data.draft.theme).toBe('Night walk');
    expect(saved.data.draft.selected).toHaveLength(2);

    await EventSf.deleteOne({ _id: gone._id });
    const stale = await createIssueFromCurationDraft(req, created.data.account.id, draft.data.draft.id, {
      name: 'Too soon',
      idempotencyKey: 'idem-stale',
    });
    expect(stale.code).toBe('SELECTION_STALE');
    expect(stale.details.missing[0].eventId).toBe(String(gone._id));

    const createdIssue = await createIssueFromCurationDraft(req, created.data.account.id, draft.data.draft.id, {
      name: 'Night walk',
      idempotencyKey: 'idem-ok',
      acceptChanges: true,
    });
    expect(createdIssue.data.issue.name).toBe('Night walk');
    expect(createdIssue.data.issue.document.slides).toHaveLength(2);

    const again = await createIssueFromCurationDraft(req, created.data.account.id, draft.data.draft.id, {
      name: 'Night walk again',
      idempotencyKey: 'idem-ok',
    });
    expect(again.data.reused).toBe(true);
    expect(again.data.issue.id).toBe(createdIssue.data.issue.id);

    const overflow = await createCurationDraft(req, created.data.account.id, {
      selected: Array.from({ length: 20 }, (_, index) => item('sf', { _id: `${'a'.repeat(23)}${index}`, name: 'n', start_time: new Date(), image: 'x' })),
    });
    expect(overflow.code).toBe('SLIDE_CAP');
  });

  test('updating a selection does not overwrite a retained slide edit', async () => {
    const created = await account();
    const [first] = await EventSf.create([eventDoc({ name: 'Keep me' })]);
    const [second] = await EventSf.create([eventDoc({ name: 'Replace me', start_time: new Date('2026-09-08T20:00:00Z') })]);
    const [third] = await EventNyc.create([eventDoc({ name: 'New city' })]);
    const draft = await createCurationDraft(req, created.data.account.id, {
      selected: [item('sf', first), item('sf', second)],
    });
    const issue = await createIssueFromCurationDraft(req, created.data.account.id, draft.data.draft.id, {
      name: 'Original',
      idempotencyKey: 'idem-edit',
    });
    const keptSlide = issue.data.issue.document.slides.find((slide) => slide.source?.eventId === String(first._id));
    keptSlide.elements.find((element) => element.role === 'event-name').text = 'Custom card copy';

    const { PivotCarouselDeck } = require('../../services/getGlobalModelService')(req, 'PivotCarouselDeck');
    await PivotCarouselDeck.updateOne(
      { _id: issue.data.issue.id },
      { $set: { document: issue.data.issue.document } },
    );

    const revise = await createCurationDraft(req, created.data.account.id, {
      issueId: issue.data.issue.id,
      selected: [item('sf', first), item('nyc', third)],
    });
    const applied = await applyCurationDraftToIssue(req, created.data.account.id, revise.data.draft.id, {
      issueId: issue.data.issue.id,
      revision: issue.data.issue.revision,
    });
    const retained = applied.data.issue.document.slides.find((slide) => slide.source?.eventId === String(first._id));
    const detached = applied.data.issue.document.slides.find((slide) => slide.source?.eventId === String(second._id));
    expect(retained.elements.find((element) => element.role === 'event-name').text).toBe('Custom card copy');
    expect(detached.detached).toBe(true);
    expect(applied.data.diff.added[0].eventId).toBe(String(third._id));
  });
});
