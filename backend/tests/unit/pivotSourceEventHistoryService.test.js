jest.mock('../../connectionsManager', () => ({ connectToDatabase: jest.fn() }));
jest.mock('../../services/getGlobalModelService', () => jest.fn());
jest.mock('../../services/getModelService', () => jest.fn());
jest.mock('../../services/pivotIngestPublishService', () => ({ resolvePivotTenant: jest.fn() }));
jest.mock('../../services/pivotLabEventsService', () => ({ serializeLabEvent: jest.fn((row) => ({
  _id: String(row._id), name: row.name, batchWeek: row.customFields.pivot.batchWeek,
})) }));

const { connectToDatabase } = require('../../connectionsManager');
const getGlobalModels = require('../../services/getGlobalModelService');
const getModels = require('../../services/getModelService');
const { resolvePivotTenant } = require('../../services/pivotIngestPublishService');
const { listSourceEventHistory, PAGE_SIZE } = require('../../services/pivotSourceEventHistoryService');

const SOURCE_ID = '665a1b2c3d4e5f6789012345';
const JOB_ID = '665a1b2c3d4e5f6789012346';

describe('listSourceEventHistory', () => {
  let Event;
  let PivotCitySource;
  let PivotCurationJob;

  beforeEach(() => {
    resolvePivotTenant.mockResolvedValue({ tenant: { tenantKey: 'nyc' } });
    PivotCitySource = { findOne: jest.fn().mockReturnValue({ select: () => ({ lean: async () => ({
      _id: SOURCE_ID, label: 'Venue calendar',
    }) }) }) };
    PivotCurationJob = { find: jest.fn().mockReturnValue({ select: () => ({ lean: async () => [{ _id: JOB_ID }] }) }) };
    getGlobalModels.mockReturnValue({ PivotCitySource, PivotCurationJob });
    Event = { countDocuments: jest.fn().mockResolvedValue(25), find: jest.fn() };
    const rows = [
      { _id: 'one', name: 'Primary', customFields: { pivot: { sourceId: SOURCE_ID, batchWeek: '2026-W35' } } },
      { _id: 'two', name: 'Observed', customFields: { pivot: { sourceId: 'other', batchWeek: '2026-W34' } } },
    ];
    Event.find.mockReturnValue({ select: () => ({ sort: () => ({ skip: (skip) => ({
      limit: (limit) => ({ lean: async () => { expect(skip).toBe(PAGE_SIZE); expect(limit).toBe(PAGE_SIZE); return rows; } }),
    }) }) }) });
    getModels.mockReturnValue({ Event });
    connectToDatabase.mockResolvedValue({});
  });

  it('lists attributed and observed events across weeks with pagination', async () => {
    const result = await listSourceEventHistory({}, { tenantKey: 'nyc', sourceId: SOURCE_ID, page: 2, status: 'published' });
    expect(result.data.total).toBe(25);
    expect(result.data.events.map((event) => event.attribution)).toEqual(['primary', 'observed']);
    const query = Event.countDocuments.mock.calls[0][0];
    expect(query['customFields.pivot.batchWeek']).toBeUndefined();
    expect(query['customFields.pivot.ingestStatus']).toBe('published');
    expect(query.$or).toContainEqual({ 'customFields.pivot.entrypointId': { $in: [JOB_ID] } });
  });

  it('rejects invalid input before querying events', async () => {
    expect((await listSourceEventHistory({}, { tenantKey: 'nyc', sourceId: 'bad' })).status).toBe(400);
    expect((await listSourceEventHistory({}, { tenantKey: 'nyc', sourceId: SOURCE_ID, page: '-1' })).status).toBe(400);
    expect(Event.find).not.toHaveBeenCalled();
  });

  it('limits an entrypoint filter to jobs linked to this source', async () => {
    const result = await listSourceEventHistory({}, { tenantKey: 'nyc', sourceId: SOURCE_ID, page: 2,
      entrypointId: JOB_ID });
    expect(result.error).toBeUndefined();
    expect(Event.countDocuments.mock.calls[0][0].$or).toEqual([
      { 'customFields.pivot.entrypointId': JOB_ID },
      { 'customFields.pivot.observedEntrypointIds': JOB_ID },
    ]);
    const invalid = await listSourceEventHistory({}, { tenantKey: 'nyc', sourceId: SOURCE_ID,
      entrypointId: '665a1b2c3d4e5f6789012349' });
    expect(invalid.code).toBe('INVALID_ENTRYPOINT');
  });
});
