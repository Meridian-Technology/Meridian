jest.mock('../../services/getModelService', () => jest.fn());
jest.mock('../../connectionsManager', () => ({
  connectToDatabase: jest.fn(),
}));
jest.mock('../../services/pivotIngestPublishService', () => ({
  resolvePivotTenant: jest.fn(),
}));
jest.mock('../../services/pivotCatalogPurgeService', () => ({
  deletePivotCatalogEventsWithModels: jest.fn(),
}));

const getModels = require('../../services/getModelService');
const { connectToDatabase } = require('../../connectionsManager');
const { resolvePivotTenant } = require('../../services/pivotIngestPublishService');
const { deletePivotCatalogEventsWithModels } = require('../../services/pivotCatalogPurgeService');
const {
  collapseCatalogEventsToShowtimes,
  pickSurvivorEvent,
  slotsFromCatalogEvent,
} = require('../../services/pivotCatalogShowtimeCollapseService');

const TENANT = { tenantKey: 'nyc', location: 'New York City' };
const ID_A = '665a1b2c3d4e5f6789012345';
const ID_B = '665a1b2c3d4e5f6789012346';
const ID_C = '665a1b2c3d4e5f6789012347';

function catalogEvent(id, overrides = {}) {
  const start = overrides.start_time || '2026-08-28T02:30:00.000Z';
  return {
    _id: id,
    name: overrides.name || 'Derrick Stroup',
    description: overrides.description || 'A night of stand-up.',
    location: overrides.location || "Cobb's Comedy Club",
    image: overrides.image || null,
    start_time: start,
    end_time: overrides.end_time || null,
    customFields: {
      pivot: {
        batchWeek: overrides.batchWeek || '2026-W35',
        ingestStatus: overrides.ingestStatus || 'staged',
        source: 'generic-site',
        host: { name: "Cobb's Comedy Club" },
        tags: overrides.tags || ['comedy'],
        timeSlots: overrides.timeSlots || [],
        ...overrides.pivot,
      },
    },
  };
}

describe('slotsFromCatalogEvent', () => {
  it('turns a single start time into a slot', () => {
    const slots = slotsFromCatalogEvent(catalogEvent(ID_A));
    expect(slots).toHaveLength(1);
    expect(slots[0].id).toBe('202608280230');
  });
});

describe('pickSurvivorEvent', () => {
  it('prefers published, then the earliest start', () => {
    const published = catalogEvent(ID_B, {
      ingestStatus: 'published',
      start_time: '2026-08-29T02:00:00.000Z',
    });
    const staged = catalogEvent(ID_A, { start_time: '2026-08-27T03:00:00.000Z' });
    expect(pickSurvivorEvent([staged, published])._id).toBe(ID_B);
  });

  it('honors keepEventId', () => {
    const first = catalogEvent(ID_A);
    const second = catalogEvent(ID_B, { ingestStatus: 'published' });
    expect(pickSurvivorEvent([first, second], ID_A)._id).toBe(ID_A);
  });
});

describe('collapseCatalogEventsToShowtimes', () => {
  let Event;
  let PivotEventIntent;

  beforeEach(() => {
    Event = {
      find: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    };
    PivotEventIntent = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
    };
    getModels.mockReturnValue({ Event, PivotEventIntent });
    connectToDatabase.mockResolvedValue({});
    resolvePivotTenant.mockResolvedValue({ tenant: TENANT });
    deletePivotCatalogEventsWithModels.mockResolvedValue({ events: 2 });
  });

  it('rejects a single id', async () => {
    const result = await collapseCatalogEventsToShowtimes({}, { tenantKey: 'nyc', eventIds: [ID_A] });
    expect(result.code).toBe('EVENT_IDS_REQUIRED');
  });

  it('unions distinct nights onto the survivor and deletes the rest', async () => {
    const a = catalogEvent(ID_A, { start_time: '2026-08-28T02:30:00.000Z' });
    const b = catalogEvent(ID_B, { start_time: '2026-08-29T02:00:00.000Z' });
    const c = catalogEvent(ID_C, { start_time: '2026-08-27T03:00:00.000Z', ingestStatus: 'published' });
    Event.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([a, b, c]),
    });
    Event.findByIdAndUpdate.mockImplementation((_id, update) => ({
      lean: async () => ({
        ...c,
        start_time: update.$set.start_time,
        end_time: update.$set.end_time,
        customFields: { pivot: update.$set['customFields.pivot'] },
      }),
    }));

    const result = await collapseCatalogEventsToShowtimes(
      {},
      { tenantKey: 'nyc', eventIds: [ID_A, ID_B, ID_C] },
    );

    expect(result.error).toBeUndefined();
    expect(result.data.showtimeCount).toBe(3);
    expect(result.data.collapsedCount).toBe(2);
    expect(result.data.event.timeSlots).toHaveLength(3);
    expect(Event.findByIdAndUpdate).toHaveBeenCalledWith(
      ID_C,
      expect.objectContaining({
        $set: expect.objectContaining({
          'customFields.pivot': expect.objectContaining({
            timeSlots: expect.arrayContaining([
              expect.objectContaining({ id: '202608270300' }),
              expect.objectContaining({ id: '202608280230' }),
              expect.objectContaining({ id: '202608290200' }),
            ]),
          }),
        }),
      }),
      expect.anything(),
    );
    expect(deletePivotCatalogEventsWithModels).toHaveBeenCalledWith(
      { Event, PivotEventIntent },
      [expect.anything(), expect.anything()],
    );
  });

  it('rolls selected showtimes across catalog weeks and anchors them to the earliest week', async () => {
    const earlier = catalogEvent(ID_A, {
      batchWeek: '2026-W35',
      start_time: '2026-08-30T02:00:00.000Z',
    });
    const later = catalogEvent(ID_B, {
      batchWeek: '2026-W36',
      start_time: '2026-09-02T02:00:00.000Z',
      ingestStatus: 'published',
    });
    Event.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([earlier, later]),
    });
    Event.findByIdAndUpdate.mockImplementation((_id, update) => ({
      lean: async () => ({
        ...later,
        start_time: update.$set.start_time,
        end_time: update.$set.end_time,
        customFields: { pivot: update.$set['customFields.pivot'] },
      }),
    }));

    const result = await collapseCatalogEventsToShowtimes(
      {},
      { tenantKey: 'nyc', eventIds: [ID_A, ID_B] },
    );

    expect(result.error).toBeUndefined();
    expect(result.data.showtimeCount).toBe(2);
    expect(result.data.event.batchWeek).toBe('2026-W35');
  });
});
