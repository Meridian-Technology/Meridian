jest.mock('../../connectionsManager', () => ({ connectToDatabase: jest.fn(async () => ({ id: 'sf-db' })) }));
jest.mock('../../services/getModelService', () => jest.fn());
jest.mock('../../services/tenantConfigService', () => ({ getTenantByKey: jest.fn(async () => ({ name: 'San Francisco', timezone: 'America/Los_Angeles' })) }));
jest.mock('../../services/pivotCarouselIssueService', () => ({ loadAccount: jest.fn() }));

const getModels = require('../../services/getModelService');
const { loadAccount } = require('../../services/pivotCarouselIssueService');
const { relatedPipeline, chooseNeighbors, findRelatedCurationEvents } = require('../../services/pivotCarouselRelatedService');
const { setJustGoSemanticText } = require('../../utilities/justGoSemanticText');

const id = (n) => n.toString(16).padStart(24, '0');
const now = new Date('2026-09-28T12:00:00Z');
const event = (n, name, tags = []) => ({
  _id: id(n), name, description: 'Live jazz in a small venue', type: 'social',
  start_time: new Date('2026-10-01T19:00:00Z'), end_time: new Date('2026-10-01T21:00:00Z'),
  customFields: { pivot: { ingestStatus: 'published', host: { name: 'Local host' }, tags } },
});

beforeEach(() => {
  jest.clearAllMocks();
  loadAccount.mockResolvedValue({ account: { sourceTenantKeys: ['sf'] } });
});

test('materializes only published public event text', () => {
  const published = event(1, 'Jazz Night', ['jazz']);
  setJustGoSemanticText(published);
  expect(published.customFields.pivot.semanticText).toContain('Title: Jazz Night');
  expect(published.customFields.pivot.semanticText).toContain('Tags: jazz');
  expect(published.customFields.pivot.semanticText).not.toContain(String(published._id));
  published.customFields.pivot.ingestStatus = 'draft';
  setJustGoSemanticText(published);
  expect(published.customFields.pivot.semanticText).toBeUndefined();
});

test('uses Atlas text query, one indexed publication filter, and bounded ANN', () => {
  expect(relatedPipeline('jazz')[0].$vectorSearch).toEqual({
    index: 'just_go_event_autoembed_v1',
    path: 'customFields.pivot.semanticText',
    query: { text: 'jazz' },
    filter: { 'customFields.pivot.ingestStatus': 'published' },
    numCandidates: 1200,
    limit: 60,
  });
});

test('excludes the seed, missing rows, and duplicate title/date rows', () => {
  const seed = event(1, 'Jazz Night');
  const duplicate = event(2, '  jazz night  ');
  const neighbor = event(3, 'Basement Trio');
  expect(chooseNeighbors([
    { _id: seed._id, score: 1 },
    { _id: duplicate._id, score: 0.9 },
    { _id: id(4), score: 0.8 },
    { _id: neighbor._id, score: 0.7 },
  ], [duplicate, neighbor], seed)).toEqual([{ event: neighbor, score: 0.7 }]);
});

test('checks source authorization before opening a tenant database', async () => {
  const result = await findRelatedCurationEvents({}, 'account', { sourceTenantKey: 'nyc', eventId: id(1) }, { enabled: true, now });
  expect(result.code).toBe('SOURCE_NOT_ALLOWED');
  expect(getModels).not.toHaveBeenCalled();
});

test('revalidates ANN IDs against published upcoming catalog before proposing', async () => {
  const seed = event(1, 'Jazz Night', ['jazz']);
  const neighbor = event(2, 'Basement Trio', ['jazz']);
  const Event = {
    findOne: jest.fn(() => ({ lean: async () => seed })),
    aggregate: jest.fn(async () => [
      { _id: seed._id, score: 0.99 },
      { _id: neighbor._id, score: 0.86 },
      { _id: id(3), score: 0.84 },
    ]),
    find: jest.fn(() => ({ lean: async () => [neighbor] })),
  };
  getModels.mockReturnValue({ Event });
  const result = await findRelatedCurationEvents({}, 'account', { sourceTenantKey: 'sf', eventId: seed._id }, { enabled: true, now });
  expect(Event.findOne.mock.calls[0][0]['customFields.pivot.ingestStatus']).toBe('published');
  expect(Event.findOne.mock.calls[0][0].start_time.$gte).toEqual(now);
  expect(Event.findOne.mock.calls[0][0].visibility).toBe('public');
  expect(Event.findOne.mock.calls[0][0].status.$in).toEqual(['approved', 'not-applicable']);
  expect(Event.find.mock.calls[0][0]._id.$in).toHaveLength(3);
  expect(result.data.candidates).toHaveLength(1);
  expect(result.data.candidates[0].ref).toEqual({ sourceTenantKey: 'sf', eventId: neighbor._id });
  expect(result.data.candidates[0].group.label).toBe('jazz');
  expect(result.data.candidates[0].provenance.provider.id).toBe('vector');
  expect(result.data.candidates[0].provenance.relatedProposal.seed.eventId).toBe(seed._id);
});

test('fails closed when Atlas index is absent', async () => {
  const seed = event(1, 'Jazz Night');
  getModels.mockReturnValue({ Event: {
    findOne: () => ({ lean: async () => seed }),
    aggregate: async () => { throw new Error('missing index'); },
  } });
  const result = await findRelatedCurationEvents({}, 'account', { sourceTenantKey: 'sf', eventId: seed._id }, { enabled: true, now });
  expect(result.code).toBe('VECTOR_INDEX_UNAVAILABLE');
});
